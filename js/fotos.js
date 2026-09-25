/* ══════════════════════════════════════════════════════════════════════════
   FOTOS ZUM WECHSELRICHTER
   Kamera-Knopf je WR in der Matrix. Das Foto wird am Geraet verkleinert
   (~300 KB), in den privaten Storage-Bucket "pv-fotos" unter
   <projekt>/wr<n>/... geladen und in pv_photos mit Projekt + WR verknuepft.
   Ohne Netz landet es in einer Warteschlange (IndexedDB) und wird
   nachgeschickt, sobald wieder Verbindung da ist.
   Rechte regelt die Datenbank: wer das Projekt sieht, darf Fotos sehen,
   hinzufuegen und loeschen; bei unterschriebenen Projekten nur noch der Admin.
   ══════════════════════════════════════════════════════════════════════════ */
const FOTO_BUCKET = 'pv-fotos';
const FOTO_MAX_PX = 1600;
const FOTO_QUALITAET = 0.82;
let fotoListe = {};          // projektId -> [{id, ziel, pfad, erstellt_am, erstellt_von_name}]
let fotoLaedt = {};          // projektId -> Promise
let fotoUrls = {};           // pfad -> { url, bis }
let fotoWartend = [];        // Eintraege der Warteschlange (fuer die Anzeige)
let fotoSendetGerade = false;
let fotoViewer = null;       // { pid, wr, liste, index }

function fotoZiel(wr){ return 'wr:' + wr; }
function fotoDarfAendern(){ return darf('fotos') && (currentUserRole === 'admin' || !nurAdminAenderbar()); }
function fotoCloudBereit(){ return !!(supabaseClient && currentUser && supabaseClient.storage); }

/* ---------- Warteschlange (IndexedDB) ---------- */
function fotoDb(){
  return new Promise((ok, fehler) => {
    if(!('indexedDB' in window)) return fehler(new Error('kein IndexedDB'));
    const req = indexedDB.open('pv-fotos', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('warteschlange', { keyPath: 'pfad' });
    req.onsuccess = () => ok(req.result);
    req.onerror = () => fehler(req.error);
  });
}
async function fotoQueue(modus, fn){
  const db = await fotoDb();
  return new Promise((ok, fehler) => {
    const tx = db.transaction('warteschlange', modus);
    const r = fn(tx.objectStore('warteschlange'));
    tx.oncomplete = () => { db.close(); ok(r && 'result' in r ? r.result : undefined); };
    tx.onerror = () => { db.close(); fehler(tx.error); };
  });
}
async function fotoWartendLaden(){
  try { fotoWartend = (await fotoQueue('readonly', s => s.getAll())) || []; } catch(e){ fotoWartend = []; }
}

/* ---------- Bild verkleinern ---------- */
async function fotoVerkleinern(datei){
  let bild;
  try { bild = await createImageBitmap(datei, { imageOrientation: 'from-image' }); }
  catch(e){
    bild = await new Promise((ok, fehler) => {
      const img = new Image(); img.onload = () => ok(img); img.onerror = () => fehler(new Error('Bild nicht lesbar'));
      img.src = URL.createObjectURL(datei);
    });
  }
  const w = bild.width, h = bild.height;
  const f = Math.min(1, FOTO_MAX_PX / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.round(w * f); c.height = Math.round(h * f);
  c.getContext('2d').drawImage(bild, 0, 0, c.width, c.height);
  if(bild.close) bild.close();
  return await new Promise((ok, fehler) => c.toBlob(b => b ? ok(b) : fehler(new Error('Umwandeln fehlgeschlagen')), 'image/jpeg', FOTO_QUALITAET));
}

/* ---------- Aufnehmen ---------- */
function fotoAufnehmen(wr){
  if(!CURRENT_PROJECT_ID) return;
  if(!fotoDarfAendern()){ toast('Protokoll ist abgeschlossen – Fotos kann nur der Admin ändern'); return; }
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*'; inp.multiple = true;
  inp.setAttribute('capture', 'environment');       // Handy: direkt die Rueckkamera
  inp.style.display = 'none';
  const pid = CURRENT_PROJECT_ID;
  inp.onchange = async () => {
    const dateien = [...(inp.files || [])];
    inp.remove();
    for(const d of dateien) await fotoHinzufuegen(pid, wr, d);
  };
  document.body.appendChild(inp);
  inp.click();
}

async function fotoHinzufuegen(pid, wr, datei){
  let blob;
  try { blob = await fotoVerkleinern(datei); }
  catch(e){ toast('Foto konnte nicht gelesen werden'); return; }
  const zufall = Math.random().toString(36).slice(2, 8);
  const eintrag = {
    pfad: `${pid}/wr${wr}/${Date.now()}-${zufall}.jpg`,
    pid, ziel: fotoZiel(wr), blob, zeit: new Date().toISOString(),
    von: currentUser ? currentUser.id : null, vonName: currentUser ? currentUser.email : ''
  };
  try { await fotoQueue('readwrite', s => s.put(eintrag)); }
  catch(e){ /* ohne IndexedDB direkt senden */ }
  fotoWartend.push(eintrag);
  fotoAnzeigen(pid);
  const ok = await fotoSenden(eintrag);
  toast(ok ? 'Foto gespeichert' : 'Foto gemerkt – wird hochgeladen, sobald wieder Netz da ist');
}

/* Ein Eintrag der Warteschlange hochladen. true = fertig (oder endgueltig verworfen). */
async function fotoSenden(e){
  if(!fotoCloudBereit() || navigator.onLine === false) return false;
  try {
    const up = await supabaseClient.storage.from(FOTO_BUCKET).upload(e.pfad, e.blob, { contentType: 'image/jpeg', upsert: false });
    // Schon hochgeladen (z. B. Verbindung brach nach dem Upload ab) – dann nur noch verknuepfen
    if(up.error && !/exist|duplicate/i.test(up.error.message || '')) throw up.error;
    const ins = await supabaseClient.from('pv_photos').insert({
      project_id: e.pid, ziel: e.ziel, pfad: e.pfad, erstellt_von: currentUser.id, erstellt_von_name: e.vonName || currentUser.email
    });
    if(ins.error && !/duplicate|unique/i.test(ins.error.message || '')) {
      if(/row-level security|permission|violates/i.test(ins.error.message || '')){
        // Keine Berechtigung (z. B. Protokoll inzwischen abgeschlossen) – nicht endlos wiederholen
        try { await supabaseClient.storage.from(FOTO_BUCKET).remove([e.pfad]); } catch(x){}
        await fotoAusWarteschlange(e.pfad);
        toast('Foto nicht gespeichert – keine Berechtigung für dieses Projekt');
        return true;
      }
      throw ins.error;
    }
    await fotoAusWarteschlange(e.pfad);
    delete fotoListe[e.pid];          // beim naechsten Anzeigen neu laden
    await fotoAnzeigen(e.pid);
    return true;
  } catch(err){
    if(/row-level security|permission|not authorized|unauthorized|403/i.test((err && (err.message || err.statusCode)) + '')){
      await fotoAusWarteschlange(e.pfad);
      toast('Foto nicht gespeichert – keine Berechtigung für dieses Projekt');
      fotoAnzeigen(e.pid);
      return true;
    }
    console.warn('Foto-Upload später erneut:', err);
    return false;
  }
}
async function fotoAusWarteschlange(pfad){
  fotoWartend = fotoWartend.filter(x => x.pfad !== pfad);
  try { await fotoQueue('readwrite', s => s.delete(pfad)); } catch(e){}
}
async function fotoWarteschlangeSenden(){
  if(fotoSendetGerade || !fotoCloudBereit()) return;
  fotoSendetGerade = true;
  try {
    await fotoWartendLaden();
    for(const e of fotoWartend.slice()){
      // nur eigene Fotos nachschicken (geteiltes Geraet)
      if(e.von && currentUser && e.von !== currentUser.id) continue;
      if(!(await fotoSenden(e))) break;
    }
  } finally { fotoSendetGerade = false; }
}
window.addEventListener('online', () => fotoWarteschlangeSenden());
setInterval(() => { if(fotoWartend.length) fotoWarteschlangeSenden(); }, 60000);

/* ---------- Laden & Anzeigen ---------- */
async function fotoListeLaden(pid){
  if(fotoListe[pid]) return fotoListe[pid];
  if(!fotoCloudBereit()) return [];
  if(!fotoLaedt[pid]){
    fotoLaedt[pid] = (async () => {
      try {
        const { data, error } = await supabaseClient.from('pv_photos')
          .select('id, ziel, pfad, erstellt_am, erstellt_von_name').eq('project_id', pid).order('erstellt_am', { ascending: true });
        if(error) throw error;
        fotoListe[pid] = data || [];
      } catch(e){ console.warn('Fotos laden:', e); }
      delete fotoLaedt[pid];
      return fotoListe[pid] || [];
    })();
  }
  return fotoLaedt[pid];
}
async function fotoUrlsHolen(pfade){
  const jetzt = Date.now();
  const fehlen = pfade.filter(p => !(fotoUrls[p] && fotoUrls[p].bis > jetzt + 60000));
  if(fehlen.length && fotoCloudBereit()){
    try {
      const { data, error } = await supabaseClient.storage.from(FOTO_BUCKET).createSignedUrls(fehlen, 3600);
      if(error) throw error;
      (data || []).forEach(d => { if(d && d.signedUrl) fotoUrls[d.path] = { url: d.signedUrl, bis: jetzt + 3600000 }; });
    } catch(e){ console.warn('Foto-Links:', e); }
  }
}
let fotoLokaleUrls = {};
function fotoLokaleUrl(e){
  if(!fotoLokaleUrls[e.pfad]) fotoLokaleUrls[e.pfad] = URL.createObjectURL(e.blob);
  return fotoLokaleUrls[e.pfad];
}
// Alle Fotos eines WR: hochgeladene + noch wartende
function fotoFuerWr(pid, wr){
  const ziel = fotoZiel(wr);
  const fertig = (fotoListe[pid] || []).filter(f => f.ziel === ziel)
    .map(f => ({ ...f, url: fotoUrls[f.pfad] && fotoUrls[f.pfad].url, wartet: false }));
  const offen = fotoWartend.filter(e => e.pid === pid && e.ziel === ziel && !fertig.some(f => f.pfad === e.pfad))
    .map(e => ({ pfad: e.pfad, ziel, erstellt_am: e.zeit, erstellt_von_name: e.vonName, url: fotoLokaleUrl(e), wartet: true }));
  return fertig.concat(offen);
}

async function fotoAnzeigen(pid){
  pid = pid || CURRENT_PROJECT_ID;
  if(!pid) return;
  const liste = await fotoListeLaden(pid);
  await fotoUrlsHolen(liste.map(f => f.pfad));
  if(pid !== CURRENT_PROJECT_ID) return;
  document.querySelectorAll('.wr-fotos[data-wr]').forEach(el => {
    const wr = el.dataset.wr;
    const fotos = fotoFuerWr(pid, wr);
    const zeigen = fotos.slice(-3);
    el.innerHTML = zeigen.map((f, i) => `<button type="button" class="wr-foto-mini${f.wartet ? ' wartet' : ''}" onclick="fotoOeffnen(${Number(wr)}, ${fotos.length - zeigen.length + i})" title="${f.wartet ? 'Wartet auf Netz' : 'Foto ansehen'}">${f.url ? `<img src="${esc(f.url)}" alt="" loading="lazy">` : ''}${f.wartet ? '<span class="wr-foto-uhr"></span>' : ''}</button>`).join('')
      + (fotos.length > 3 ? `<button type="button" class="wr-foto-mehr" onclick="fotoOeffnen(${Number(wr)}, 0)">+${fotos.length - 3}</button>` : '');
    const btn = el.parentElement && el.parentElement.querySelector('.wr-foto-btn');
    if(btn) btn.hidden = !fotoDarfAendern();
  });
}
// Aufruf nach jedem Neuaufbau der Matrix
function fotoMatrixGerendert(){ if(CURRENT_PROJECT_ID) fotoAnzeigen(CURRENT_PROJECT_ID); }

/* ---------- Grossansicht ---------- */
function fotoOeffnen(wr, index){
  const pid = CURRENT_PROJECT_ID;
  const liste = fotoFuerWr(pid, wr);
  if(!liste.length) return;
  fotoViewer = { pid, wr, index: Math.max(0, Math.min(index, liste.length - 1)) };
  let ov = g('foto-viewer');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'foto-viewer'; ov.className = 'foto-viewer no-print';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = `
      <div class="fv-kopf"><span class="fv-titel" id="fv-titel"></span><button type="button" class="fv-x" onclick="fotoSchliessen()" aria-label="Schließen"><svg class="ico" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>
      <div class="fv-bild"><button type="button" class="fv-nav fv-zurueck" onclick="fotoBlaettern(-1)" aria-label="Vorheriges Foto">‹</button><img id="fv-img" alt=""><button type="button" class="fv-nav fv-weiter" onclick="fotoBlaettern(1)" aria-label="Nächstes Foto">›</button></div>
      <div class="fv-fuss"><span class="fv-info" id="fv-info"></span><button type="button" class="fv-loeschen" id="fv-loeschen" onclick="fotoLoeschen()">Löschen</button></div>`;
    ov.addEventListener('click', e => { if(e.target === ov) fotoSchliessen(); });
    document.body.appendChild(ov);
    document.addEventListener('keydown', e => {
      if(!fotoViewer) return;
      if(e.key === 'Escape') fotoSchliessen();
      else if(e.key === 'ArrowLeft') fotoBlaettern(-1);
      else if(e.key === 'ArrowRight') fotoBlaettern(1);
    });
  }
  ov.classList.add('show');
  fotoViewerZeigen();
}
function fotoViewerZeigen(){
  if(!fotoViewer) return;
  const liste = fotoFuerWr(fotoViewer.pid, fotoViewer.wr);
  if(!liste.length){ fotoSchliessen(); return; }
  fotoViewer.index = Math.min(fotoViewer.index, liste.length - 1);
  const f = liste[fotoViewer.index];
  const plan = getCurrentPlan();
  const wrName = (plan[fotoViewer.wr] && plan[fotoViewer.wr].name) || ('WR ' + fotoViewer.wr);
  g('fv-img').src = f.url || '';
  g('fv-titel').textContent = `${wrName} · Foto ${fotoViewer.index + 1} von ${liste.length}`;
  const zeit = f.erstellt_am ? new Date(f.erstellt_am).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' }) : '';
  g('fv-info').textContent = [zeit, f.erstellt_von_name, f.wartet ? 'wartet auf Netz' : ''].filter(Boolean).join(' · ');
  g('fv-loeschen').hidden = !fotoDarfAendern();
  g('foto-viewer').querySelectorAll('.fv-nav').forEach(b => b.hidden = liste.length < 2);
}
function fotoBlaettern(r){
  if(!fotoViewer) return;
  const n = fotoFuerWr(fotoViewer.pid, fotoViewer.wr).length;
  fotoViewer.index = (fotoViewer.index + r + n) % n;
  fotoViewerZeigen();
}
function fotoSchliessen(){
  fotoViewer = null;
  const ov = g('foto-viewer'); if(ov) ov.classList.remove('show');
}
async function fotoLoeschen(){
  if(!fotoViewer) return;
  const { pid, wr } = fotoViewer;
  const f = fotoFuerWr(pid, wr)[fotoViewer.index];
  if(!f || !await appFrage('Dieses Foto wirklich löschen?')) return;
  if(f.wartet){
    await fotoAusWarteschlange(f.pfad);
  } else {
    if(!fotoCloudBereit() || navigator.onLine === false){ toast('Löschen geht nur mit Internetverbindung'); return; }
    const { data, error } = await supabaseClient.from('pv_photos').delete().eq('id', f.id).select('id');
    if(error || !data || !data.length){ toast('Foto konnte nicht gelöscht werden – keine Berechtigung'); return; }
    try { await supabaseClient.storage.from(FOTO_BUCKET).remove([f.pfad]); } catch(e){}
    fotoListe[pid] = (fotoListe[pid] || []).filter(x => x.id !== f.id);
  }
  toast('Foto gelöscht');
  fotoViewerZeigen();
  fotoAnzeigen(pid);
}

fotoWartendLaden();
