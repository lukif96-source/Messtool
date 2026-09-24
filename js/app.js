// Zugangsdaten kommen aus config.js (liegt neben index.html und wird nur einmal
// eingetragen). Direkt hier eintragen geht zur Not auch noch.
const SB_URL = (window.PV_CONFIG && window.PV_CONFIG.url) || "";
const SB_KEY = (window.PV_CONFIG && window.PV_CONFIG.key) || "";
// createClient() wirft SOFORT einen Fehler, wenn SB_URL/SB_KEY leer sind
// ("supabaseUrl is required") — ungefangen wuerde das den kompletten Rest
// dieses <script>-Blocks abbrechen (alle Funktionen/Konstanten, die WEITER
// UNTEN im selben Block stehen, blieben dann undefiniert -> z.B. "Cannot
// access 'g' before initialization"). Deshalb erst pruefen/versuchen, sonst
// bleibt supabaseClient einfach null (wie urspruenglich beabsichtigt).
let supabaseClient = null;
if(window.supabase && SB_URL && SB_KEY){
  try { supabaseClient = window.supabase.createClient(SB_URL, SB_KEY); }
  catch(e){ console.error('Supabase-Client konnte nicht erstellt werden:', e); }
}

let currentUser = null;
let currentUserRole = null;
let currentUserDisplayName = '';
let authMode = 'login';
let hideInactive = false;
let pendingPVSOLData = null;

const g = id => document.getElementById(id);

// Schlichte Linien-Icons (ersetzen die frueheren Emojis in Icon-Knoepfen)
const ICON = (() => {
  const svg = d => `<svg class="ico" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  return {
    gear:    svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
    pencil:  svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
    tag:     svg('<path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L2 12V2h10l8.6 8.6a2 2 0 0 1 0 2.8z"/><circle cx="7" cy="7" r="1.5"/>'),
    camera:  svg('<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>'),
    lock:    svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
    refresh: svg('<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>'),
    home:    svg('<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/>'),
    factory: svg('<path d="M2 20V9l6 4V9l6 4V5h8v15z"/>'),
    sun:     svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>')
  };
})();

// ══════════════════════════════════════════════════════════════════════════
//   BENUTZERRECHTE
//   Jede Funktion hat ein eigenes Recht. Die Rolle (Admin/Planer/Bauleitung)
//   gibt die Voreinstellung vor – genau so, wie die App sich bisher verhielt.
//   Der Admin kann pro Person einzelne Rechte ein- oder ausschalten
//   (gespeichert in profiles.rechte, nur Abweichungen vom Standard).
//   Admin hat immer alle Rechte. Anlagenbuch und Katalog prueft zusaetzlich
//   die Datenbank (pv_hat_recht).
// ══════════════════════════════════════════════════════════════════════════
const RECHTE = [
  { k: 'reiter_uebersicht', g: 'Reiter',            l: 'Reiter Übersicht',                                  std: ['admin', 'planner', 'site'] },
  { k: 'reiter_matrix',     g: 'Reiter',            l: 'Reiter Matrix (DC-Messungen ansehen)',              std: ['admin', 'planner', 'site', 'elektriker'] },
  { k: 'reiter_projekte',   g: 'Reiter',            l: 'Reiter Projekte',                                   std: ['admin', 'planner', 'site'] },
  { k: 'ppk',               g: 'Reiter',            l: 'Reiter PPK – AC-Prüfprotokoll (Förderung)',         std: ['admin', 'planner', 'elektriker'] },
  { k: 'projekt_anlegen',   g: 'Projekte',          l: 'Projekte anlegen und PVSOL-Import',                 std: ['admin', 'planner'] },
  { k: 'projekt_verwalten', g: 'Projekte',          l: 'Projekte umbenennen, Gruppe/Bereich, Personen zuweisen', std: ['admin', 'planner'] },
  { k: 'projekt_loeschen',  g: 'Projekte',          l: 'Projekte löschen',                                  std: ['admin', 'planner'] },
  { k: 'messwerte',         g: 'Matrix',            l: 'DC-Messwerte eintragen',                            std: ['admin', 'planner', 'site'] },
  { k: 'hardware',          g: 'Matrix',            l: 'Wechselrichter, MPPTs und Module bearbeiten',       std: ['admin', 'planner'] },
  { k: 'wr_loeschen',       g: 'Matrix',            l: 'Wechselrichter löschen',                            std: ['admin'] },
  { k: 'fotos',             g: 'Matrix',            l: 'Fotos aufnehmen und löschen',                       std: ['admin', 'planner', 'site', 'elektriker'] },
  { k: 'matrix_reset',      g: 'Matrix',            l: 'Matrix zurücksetzen',                               std: ['admin', 'planner'] },
  { k: 'unterschreiben',    g: 'Protokoll',         l: 'DC-Protokoll unterschreiben',                       std: ['admin', 'planner', 'site'] },
  { k: 'sperren',           g: 'Protokoll',         l: 'Protokoll sperren und entsperren',                  std: ['admin'] },
  { k: 'versionen',         g: 'Protokoll',         l: 'Versionen ansehen und wiederherstellen',            std: ['admin', 'planner', 'site'] },
  { k: 'export',            g: 'Export & Werkzeuge', l: 'Prüfprotokoll und Exporte (PDF, Excel, CSV)',       std: ['admin', 'planner', 'site', 'elektriker'] },
  { k: 'querschnitt',       g: 'Export & Werkzeuge', l: 'Querschnittberechnung (Menü)',                      std: ['admin', 'planner', 'elektriker'] },
  { k: 'vorlagen',          g: 'Export & Werkzeuge', l: 'Projekt-Vorlagen',                                  std: ['admin', 'planner'] },
  { k: 'anlagenbuch',       g: 'Anlagenbuch',       l: 'Reiter Anlagenbuch sehen und erstellen',            std: ['admin'] },
  { k: 'katalog',           g: 'Anlagenbuch',       l: 'Reiter Komponenten: Katalog und Firmendaten pflegen', std: ['admin'] }
];
const ROLLEN = { admin: 'Admin', planner: 'Planer', site: 'Bauleitung', elektriker: 'Elektriker' };

// Welcher Reiter braucht welches Recht? Gesperrte Reiter leiten auf den
// ersten erlaubten weiter (z. B. Elektriker landen direkt in der Matrix).
const TAB_RECHT = { home: 'reiter_uebersicht', matrix: 'reiter_matrix', projects: 'reiter_projekte', ppk: 'ppk',
  anlagenbuch: 'anlagenbuch', komponenten: 'katalog', querschnitt: 'querschnitt' };
const TAB_REIHE = ['home', 'matrix', 'projects', 'ppk', 'anlagenbuch', 'komponenten', 'querschnitt', 'anleitung'];
function tabErlaubt(t){ const r = TAB_RECHT[t]; return !r || darf(r); }
let currentUserRechte = {};

function darf(k){
  if(currentUserRole === 'admin') return true;
  if(currentUserRechte && Object.prototype.hasOwnProperty.call(currentUserRechte, k)) return !!currentUserRechte[k];
  const r = RECHTE.find(x => x.k === k);
  return !!(r && currentUserRole && r.std.includes(currentUserRole));
}

// Knoepfe/Bereiche mit data-recht ein- oder ausblenden
function rechteAnwenden(){
  document.querySelectorAll('[data-recht]').forEach(el => el.classList.toggle('hidden-role', !darf(el.dataset.recht)));
}

// ── Benutzerverwaltung: Rechte je Person ──────────────────────────────────
const _benutzerRechte = {};

function rechteZellenHtml(u){
  if(u.role === 'admin') return '<div class="rechte-box"><span class="rechte-admin">Admin – hat immer alle Rechte</span></div>';
  const eig = (u.rechte && typeof u.rechte === 'object') ? u.rechte : {};
  _benutzerRechte[u.id] = { role: u.role, rechte: { ...eig } };
  const angepasst = RECHTE.filter(r => Object.prototype.hasOwnProperty.call(eig, r.k) && !!eig[r.k] !== r.std.includes(u.role)).length;
  const gruppen = [...new Set(RECHTE.map(r => r.g))];
  return `<details class="rechte-box">
    <summary>Rechte <span class="rechte-status">${angepasst ? angepasst + ' angepasst' : 'Standard der Rolle'}</span></summary>
    ${gruppen.map(gr => `<div class="rechte-gruppe"><div class="rechte-titel">${esc(gr)}</div>${RECHTE.filter(r => r.g === gr).map(r => {
        const std = r.std.includes(u.role);
        const an = Object.prototype.hasOwnProperty.call(eig, r.k) ? !!eig[r.k] : std;
        return `<label class="recht${an !== std ? ' abweichend' : ''}"><input type="checkbox" ${an ? 'checked' : ''}
          onchange="rechtSetzen('${u.id}', '${r.k}', this.checked, this)"> <span>${esc(r.l)}</span></label>`;
      }).join('')}</div>`).join('')}
    <button type="button" class="btn btn-ghost rechte-reset" onclick="rechteZuruecksetzen('${u.id}')">Auf Standard der Rolle zurücksetzen</button>
  </details>`;
}

async function rechtSetzen(uid, k, wert, el){
  if(currentUserRole !== 'admin') return toast('Nur für Admins');
  const b = _benutzerRechte[uid];
  const r = RECHTE.find(x => x.k === k);
  if(!b || !r) return;
  const std = r.std.includes(b.role);
  const neu = { ...b.rechte };
  if(wert === std) delete neu[k]; else neu[k] = wert;
  try {
    const { error } = await supabaseClient.from('profiles').update({ rechte: neu }).eq('id', uid);
    if(error) throw error;
    b.rechte = neu;
    if(el){
      const lbl = el.closest('.recht');
      if(lbl) lbl.classList.toggle('abweichend', wert !== std);
      const box = el.closest('.rechte-box');
      const st = box && box.querySelector('.rechte-status');
      const n = RECHTE.filter(x => Object.prototype.hasOwnProperty.call(neu, x.k)).length;
      if(st) st.textContent = n ? n + ' angepasst' : 'Standard der Rolle';
    }
    toast('Recht gespeichert – gilt beim nächsten Öffnen der App');
  } catch(e){
    if(el) el.checked = !wert;
    toastError('Recht konnte nicht gespeichert werden', e);
  }
}

async function rechteZuruecksetzen(uid){
  if(currentUserRole !== 'admin') return toast('Nur für Admins');
  if(!(await appFrage('Rechte zurücksetzen?\n\nAlle individuellen Anpassungen dieser Person werden entfernt. Es gilt wieder der Standard der Rolle.', { gefahr: false }))) return;
  try {
    const { error } = await supabaseClient.from('profiles').update({ rechte: {} }).eq('id', uid);
    if(error) throw error;
    toast('Auf Standard zurückgesetzt');
    loadAllUsers();
  } catch(e){ toastError('Zurücksetzen fehlgeschlagen', e); }
}

function esc(value){
  return String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[char]);
}

function normaliseNumber(field, value){
  const raw = String(value ?? '').trim();
  if(raw === '') return '';
  const normalized = raw.replace(',', '.');
  const rules = {
    mod:  { min: 0, max: 100, integer: true, label: 'Module' },
    uoc:  { min: 0, max: 2000, label: 'Uoc' },
    isc:  { min: 0, max: 100, label: 'Isc' },
    riso: { min: 0, max: 10000, label: 'Riso' }
  };
  const rule = rules[field];
  if(!rule || !/^\d+(\.\d+)?$/.test(normalized)) return null;
  const number = Number(normalized);
  if(!Number.isFinite(number) || number < rule.min || number > rule.max || (rule.integer && !Number.isInteger(number))) return null;
  return rule.integer ? String(number) : normalized.replace('.', ',');
}

function validationMessage(field){
  const messages = {
    mod: 'Module: ganze Zahl von 0 bis 100 eingeben.',
    uoc: 'Uoc: Wert von 0 bis 2.000 V eingeben.',
    isc: 'Isc: Wert von 0 bis 100 A eingeben.',
    riso: 'Riso: Wert von 0 bis 10.000 MΩ eingeben.'
  };
  return messages[field] || 'Ungültiger Wert.';
}

let toast_t = null;
function toast(msg, ms=3000){
  const t = g('toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast_t); toast_t = setTimeout(() => t.classList.remove('show'), ms);
}
// Einheitliche Fehlermeldung: kurzer, verständlicher Text für die Baustelle,
// technische Details (z.B. Supabase-Fehlertext) landen nur in der Konsole.
function toastError(msg, err, ms=4000){
  if(err) console.error(msg, err);
  toast('' + msg, ms);
}

// Theme: 'sun' = Baustelle (hell, harter Kontrast), 'dark' = Cockpit.
// Auswahl wird gemerkt, damit man sie nicht jeden Morgen neu setzen muss.
function setTheme(mode, silent = false){
  const isSun = mode !== 'dark';
  document.body.classList.toggle('sun-mode', isSun);

  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if(!meta){ meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta); }
  meta.setAttribute('content', isSun ? '#eef1ef' : '#060807');

  const sunBtn = g('theme-btn-sun'), darkBtn = g('theme-btn-dark');
  if(sunBtn) sunBtn.classList.toggle('active', isSun);
  if(darkBtn) darkBtn.classList.toggle('active', !isSun);

  const label = document.querySelector('#btn-sun .label');
  if(label) label.textContent = isSun ? 'Dunkelmodus' : 'Hell-Modus';

  try { localStorage.setItem('pv_theme', isSun ? 'sun' : 'dark'); } catch(_){}
  if(!silent) toast(isSun ? 'Baustellen-Modus' : 'Cockpit-Modus');
}

// Bestehender Aufruf aus der Sidebar bleibt funktionsfaehig
function toggleSunMode(){
  setTheme(document.body.classList.contains('sun-mode') ? 'dark' : 'sun');
}

// Gemerkte Auswahl so frueh wie moeglich anwenden (vermeidet Aufblitzen)
(function restoreTheme(){
  let saved = null;
  try { saved = localStorage.getItem('pv_theme'); } catch(_){}
  if(saved === 'dark') document.body.classList.remove('sun-mode');
  document.addEventListener('DOMContentLoaded', () => {
    setTheme(saved === 'dark' ? 'dark' : 'sun', true);
    if(typeof updateNavToggleLabel === 'function') updateNavToggleLabel();
  });
})();

function toggleMatrixActions(){
  const box = g('matrix-actions');
  const txt = g('actions-toggle-text');
  if(!box) return;
  const open = box.classList.toggle('open');
  if(txt) txt.textContent = open ? 'Aktionen ausblenden' : 'Aktionen anzeigen';
}

function toggleHighContrast(){
  const on = document.body.classList.toggle('high-contrast');
  if(on) {
    document.body.classList.add('high-contrast-mode');
    toast('High Contrast aktiviert');
  } else {
    document.body.classList.remove('high-contrast-mode');
    toast('High Contrast deaktiviert');
  }
}
function toggleSidebar(){ g('sidebar').classList.toggle('open'); g('sidebar-overlay').classList.toggle('open'); document.body.style.overflow = g('sidebar').classList.contains('open') ? 'hidden' : ''; }
function closeSidebar(){ g('sidebar').classList.remove('open'); g('sidebar-overlay').classList.remove('open'); document.body.style.overflow = ''; }

function toggleHideInactive(forceState = null){
  hideInactive = forceState !== null ? forceState : !hideInactive;
  document.body.classList.toggle('hide-inactive', hideInactive);
  const btn = g('btn-hide-nein');
  if(btn) btn.classList.toggle('active', hideInactive);
  g('hide-nein-text').textContent = hideInactive ? 'Alle Strings anzeigen' : 'Nur aktive Strings';
  if(forceState === null) toast(hideInactive ? 'Inaktive Strings ausgeblendet' : 'Alle Strings eingeblendet');
}

function filterInverter(n, btn){
  document.querySelectorAll('.wr-tab').forEach(b => b.classList.remove('active'));
  if(btn) btn.classList.add('active');
  document.querySelectorAll('.wr-block').forEach((d) => {
    const wrId = parseInt(d.dataset.wrId);
    d.style.display = (n === 0 || wrId === n) ? 'block' : 'none';
  });
  if(btn && btn.scrollIntoView) btn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
}

function buildFilterBar(){
  const bar = g('wr-filter-bar');
  if(!bar) return;
  const plan = getCurrentPlan();
  const wrKeys = Object.keys(plan).map(k => parseInt(k)).filter(n => !isNaN(n)).sort((a,b) => a-b);
  if(wrKeys.length === 0){ bar.innerHTML = ''; return; }
  let html = `<button class="wr-tab active" data-wr="0" onclick="filterInverter(0, this)">Alle WRs (1–${wrKeys.length})</button>`;
  wrKeys.forEach(wr => { 
    const name = getCurrentPlan()[wr].name || `WR ${wr}`;
    html += `<button class="wr-tab" data-wr="${wr}" onclick="filterInverter(${wr}, this)">${esc(name)}</button>`; 
  });
  bar.innerHTML = html;
}

function switchMainTab(tab){
  // Querschnittberechnung nur fuer Planer und Admin – Bauleitung und
  // Monteure sehen den Reiter nicht und landen sonst auf der Uebersicht.
  if(!tabErlaubt(tab)) tab = TAB_REIHE.find(tabErlaubt) || 'anleitung';
  document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.matrix-view, .projects-view, .home-view, .anleitung-view, .querschnitt-view, .anlagenbuch-view, .komponenten-view, .ppk-view').forEach(v => v.classList.remove('active'));
  const tabEl = g(`tab-${tab}`);
  if(tabEl) tabEl.classList.add('active');
  // Am Handy ist die Reiterleiste wischbar: aktiven Reiter ins Bild holen
  if(tabEl && tabEl.scrollIntoView) tabEl.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  const viewEl = g(`${tab}-view`);
  if(viewEl) viewEl.classList.add('active');
  document.body.classList.remove('tab-home','tab-matrix','tab-projects','tab-anleitung','tab-querschnitt','tab-anlagenbuch','tab-komponenten','tab-ppk');
  document.body.classList.add('tab-' + tab);
  if(tab === 'projects') renderProjectGrid();
  if(tab === 'home') renderHomeView();
  if(tab === 'querschnitt') qsInit();
  if(tab === 'anlagenbuch') anlagenbuchRendern();
  if(tab === 'komponenten') komponentenRendern();
  if(tab === 'ppk') ppkRendern();
  const context = g('scroll-context');
  if(context) context.hidden = tab !== 'matrix';
  if(tab === 'matrix') requestAnimationFrame(updateScrollContext);
  closeSidebar();
}

/* ══════════════════════════════════════════════════════════════════════════
   QUERSCHNITTBERECHNUNG
   Mindestquerschnitt einer Leitung nach dem zulaessigen Spannungsfall
   (Naeherung ohne induktiven Anteil). Reines Rechenwerkzeug: schreibt nichts
   ins Projekt und nichts in die Cloud, merkt sich nur die letzten Eingaben
   (getrennt fuer DC und AC) auf diesem Geraet.
   ══════════════════════════════════════════════════════════════════════════ */
const QS_KAPPA = { cu: 56, al: 35 };   // Leitfaehigkeit in m/(Ohm*mm2)
const QS_NORM = {
  cu: [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300],
  al: [16, 25, 35, 50, 70, 95, 120, 150, 185, 240, 300]     // Alu erst ab 16 mm2 ueblich
};
// AC: Spannung wird ausgewaehlt; 230 V einphasig, 400/800 V dreiphasig (Leiter-Leiter)
const QS_AC = {
  '230': { k: 2,            leiter: 2, name: 'AC 230 V',  hint: 'Einphasig, Leiter gegen Neutralleiter' },
  '400': { k: Math.sqrt(3), leiter: 3, name: 'AC 400 V', hint: 'Dreiphasig, Leiter gegen Leiter' },
  '800': { k: Math.sqrt(3), leiter: 3, name: 'AC 800 V', hint: 'Dreiphasig, Leiter gegen Leiter – große Wechselrichter' }
};
const QS_HINT_I = {
  dc: 'Betriebsstrom, z. B. Impp des Strangs oder Summe am GAK',
  ac: 'Nennleistung (Scheinleistung) des Wechselrichters laut Datenblatt'
};
// DC wird mit dem Strom gerechnet, AC mit der Leistung des Wechselrichters in kVA
const QS_EINGABE = {
  dc: { lbl: 'Strom I',     einheit: 'A',   ph: 'z. B. 13,5' },
  ac: { lbl: 'Leistung S',  einheit: 'kVA', ph: 'z. B. 110' }
};
const QS_HINT_U_DC = 'MPP-Spannung des Strangs (Module × Vmpp)';
const QS_FELDER = ['strom', 'spannung', 'laenge', 'du', 'cosphi'];
const QS_SPEICHER = 'pv_querschnitt_v3';   // v3: AC-Feld ist kVA statt A
let qsArt = 'dc', qsMat = 'cu', qsUac = '400', qsBereit = false;
// DC-Strang (13 A, 780 V) und AC-Anschluss (160 A) sind verschiedene
// Leitungen – jede Art behaelt ihre eigenen Werte.
let qsWerte = {
  dc: { strom: '', spannung: '', laenge: '', du: '1', cosphi: '1' },
  ac: { strom: '', spannung: '', laenge: '', du: '1', cosphi: '1' }
};

function qsZahl(v, stellen){
  return Number(v).toLocaleString('de-AT', { minimumFractionDigits: stellen, maximumFractionDigits: stellen });
}
function qsQuer(a){ return Number(a).toLocaleString('de-AT', { maximumFractionDigits: 1 }); }

function qsFelderLesen(){
  const w = {};
  QS_FELDER.forEach(f => { const el = g('qs-' + f); w[f] = el ? el.value : ''; });
  return w;
}
function qsFelderSchreiben(w){
  QS_FELDER.forEach(f => { const el = g('qs-' + f); if(el) el.value = (w && typeof w[f] === 'string') ? w[f] : ''; });
}
function qsSpeichern(){
  try { localStorage.setItem(QS_SPEICHER, JSON.stringify({ art: qsArt, mat: qsMat, uac: qsUac, werte: qsWerte })); } catch(e){}
}

function qsInit(){
  if(qsBereit) return;
  qsBereit = true;
  try {
    let s = JSON.parse(localStorage.getItem(QS_SPEICHER) || 'null');
    if(!s){
      s = JSON.parse(localStorage.getItem('pv_querschnitt_v2') || 'null');
      if(s && s.werte && s.werte.ac) s.werte.ac.strom = '';
    }
    if(s && typeof s === 'object'){
      if(s.art === 'dc' || s.art === 'ac') qsArt = s.art;
      if(QS_KAPPA[s.mat]) qsMat = s.mat;
      if(QS_AC[s.uac]) qsUac = s.uac;
      if(s.werte && typeof s.werte === 'object'){
        ['dc', 'ac'].forEach(a => {
          if(s.werte[a] && typeof s.werte[a] === 'object') qsWerte[a] = { ...qsWerte[a], ...s.werte[a] };
        });
      }
    }
  } catch(e){}
  qsFelderSchreiben(qsWerte[qsArt]);
  qsAnzeigen();
  qsBerechnen();
}

function qsAnzeigen(){
  const istAc = qsArt === 'ac';
  const setzeGruppe = (attr, wert) => document.querySelectorAll(`[${attr}]`).forEach(b => {
    const an = b.getAttribute(attr) === wert;
    b.classList.toggle('active', an);
    b.setAttribute('aria-checked', an ? 'true' : 'false');
  });
  setzeGruppe('data-qs-art', qsArt);
  setzeGruppe('data-qs-u', qsUac);
  setzeGruppe('data-qs-mat', qsMat);
  const udc = g('qs-u-dc'); if(udc) udc.hidden = istAc;
  const uac = g('qs-u-ac'); if(uac) uac.hidden = !istAc;
  const cos = g('qs-feld-cosphi'); if(cos) cos.hidden = !istAc;
  const hi = g('qs-hint-strom');    if(hi) hi.textContent = QS_HINT_I[qsArt];
  const ein = QS_EINGABE[qsArt];
  const li = g('qs-lbl-strom');     if(li) li.textContent = ein.lbl;
  const ei = g('qs-einheit-strom'); if(ei) ei.textContent = ein.einheit;
  const ii = g('qs-strom');         if(ii) ii.placeholder = ein.ph;
  const hu = g('qs-hint-spannung'); if(hu) hu.textContent = istAc ? QS_AC[qsUac].hint : QS_HINT_U_DC;
}

function qsSetArt(art){
  if(art !== 'dc' && art !== 'ac') return;
  if(!qsBereit) qsInit();
  if(art === qsArt) return;
  qsWerte[qsArt] = qsFelderLesen();
  qsArt = art;
  qsFelderSchreiben(qsWerte[qsArt]);
  qsAnzeigen();
  qsBerechnen();
}
function qsSetUac(u){
  if(!QS_AC[u]) return;
  if(!qsBereit) qsInit();
  qsUac = u;
  qsAnzeigen();
  qsBerechnen();
}
function qsSetMaterial(mat){
  if(!QS_KAPPA[mat]) return;
  if(!qsBereit) qsInit();
  qsMat = mat;
  qsAnzeigen();
  qsBerechnen();
}

function qsBerechnen(){
  const out = g('qs-ergebnis-inhalt');
  if(!out) return;
  qsWerte[qsArt] = qsFelderLesen();
  qsSpeichern();
  const w = qsWerte[qsArt];
  const istAc = qsArt === 'ac';
  const ac = QS_AC[qsUac];
  const L = toNum(w.laenge), du = toNum(w.du);
  const U = istAc ? Number(qsUac) : toNum(w.spannung);
  const cos = istAc ? toNum(w.cosphi) : 1;
  // AC: Strom je Aussenleiter aus der Scheinleistung – einphasig I = S ÷ U, dreiphasig I = S ÷ (√3 · U)
  const S = istAc ? toNum(w.strom) : 0;
  const I = istAc ? (S > 0 ? S * 1000 / ((qsUac === '230' ? 1 : Math.sqrt(3)) * U) : NaN) : toNum(w.strom);

  const fehlt = [];
  if(!(I > 0)) fehlt.push(istAc ? 'Leistung' : 'Strom');
  if(!(U > 0)) fehlt.push('Spannung');
  if(!(L > 0)) fehlt.push('Länge');
  if(fehlt.length){
    out.innerHTML = `<p class="qs-leer">${fehlt.join(', ').replace(/, ([^,]*)$/, ' und $1')} eingeben – das Ergebnis erscheint sofort.</p>`;
    return;
  }
  if(!(du > 0 && du <= 20)){
    out.innerHTML = '<p class="qs-leer">Zulässigen Spannungsfall zwischen 0 und 20 % eingeben.</p>';
    return;
  }
  if(!(cos > 0 && cos <= 1)){
    out.innerHTML = '<p class="qs-leer">cos φ zwischen 0 und 1 eingeben.</p>';
    return;
  }

  const kappa = QS_KAPPA[qsMat];
  const k = istAc ? ac.k : 2;
  const leiter = istAc ? ac.leiter : 2;
  const faktor = k * cos;                      // DC: 2 · AC 230 V: 2·cos φ · AC 400/800 V: √3·cos φ
  const duV = U * du / 100;                    // zulaessiger Spannungsfall in V
  const aMin = faktor * L * I / (kappa * duV);
  const reihe = QS_NORM[qsMat];
  const iEmpf = reihe.findIndex(a => a >= aMin - 1e-9);
  const spannungsfall = a => faktor * L * I / (kappa * a);
  const verlust = a => leiter * I * I * L / (kappa * a);
  const matName = qsMat === 'cu' ? 'Kupfer' : 'Aluminium';
  const artName = istAc ? ac.name : 'DC';
  const kTxt = !istAc ? '2' : `${qsUac === '230' ? '2' : '√3'} · ${qsZahl(cos, 2)}`;
  const stromweg = istAc ? `I = ${qsZahl(S, 1)} kVA ÷ (${qsUac === '230' ? '' : '√3 · '}${qsUac} V) = ${qsZahl(I, 1)} A\n` : '';
  const rechenweg = stromweg + `A = ${kTxt} · ${qsZahl(L, 1)} m · ${qsZahl(I, 2)} A ÷ (${kappa} · ${qsZahl(duV, 2)} V) = ${qsZahl(aMin, 2)} mm²`;

  if(iEmpf < 0){
    out.innerHTML = `
      <div class="qs-haupt"><span class="qs-haupt-wert">&gt; ${qsQuer(reihe[reihe.length - 1])}</span><span class="qs-haupt-einheit">mm²</span></div>
      <div class="qs-haupt-lbl">Rechnerisch ${qsZahl(aMin, 1)} mm² – mehr als der größte Normquerschnitt (${matName}, ${artName})</div>
      <div class="qs-rechenweg">${esc(rechenweg)}</div>
      <p class="qs-warnung">Parallele Leitungen, eine höhere Spannung oder einen größeren zulässigen Spannungsfall prüfen.</p>`;
    return;
  }

  const aEmpf = reihe[iEmpf];
  const anderes = qsMat === 'cu' ? 'al' : 'cu';
  const andersName = anderes === 'cu' ? 'Kupfer' : 'Aluminium';
  const reiheAnders = QS_NORM[anderes];
  const aMinAnders = faktor * L * I / (QS_KAPPA[anderes] * duV);
  const iAnders = reiheAnders.findIndex(a => a >= aMinAnders - 1e-9);
  const andersTxt = iAnders < 0 ? `mehr als ${qsQuer(reiheAnders[reiheAnders.length - 1])} mm²` : `${qsQuer(reiheAnders[iAnders])} mm²`;
  // Ein Querschnitt darunter (zu klein) und bis zu fuenf darueber – jeweils mit
  // dem Spannungsfall, damit man sieht, was ein groesserer Querschnitt bringt.
  const zeilen = [];
  for(let i = Math.max(0, iEmpf - 1); i <= Math.min(reihe.length - 1, iEmpf + 5); i++){
    const a = reihe[i], dv = spannungsfall(a), dp = dv / U * 100;
    const passt = dp <= du + 1e-9;
    const marke = i === iEmpf ? '<span class="qs-marke qs-marke-empf">empfohlen</span>' : (passt ? '' : '<span class="qs-marke qs-marke-klein">zu klein</span>');
    zeilen.push(`<tr${i === iEmpf ? ' class="qs-empf"' : ''}><td>${qsQuer(a)} mm²${marke}</td><td class="qs-spalte-v">${qsZahl(dv, 2)} V</td><td class="${passt ? 'qs-ok' : 'qs-zu-hoch'}">${qsZahl(dp, 2)} %</td><td>${qsZahl(verlust(a), 0)} W</td></tr>`);
  }
  out.innerHTML = `
    <div class="qs-haupt"><span class="qs-haupt-wert">${qsQuer(aEmpf)}</span><span class="qs-haupt-einheit">mm²</span></div>
    <div class="qs-haupt-lbl">Empfohlener Normquerschnitt · ${matName} · ${artName}</div>
    <div class="qs-vergleich">Mit ${andersName}: <strong>${andersTxt}</strong> <button type="button" class="qs-link" onclick="qsSetMaterial('${anderes}')">anzeigen</button></div>
    <div class="qs-kennzahlen">
      ${istAc ? `<div class="qs-kz"><span class="qs-kz-lbl">Strom</span><span class="qs-kz-wert">${qsZahl(I, 1)} A</span></div>` : `<div class="qs-kz"><span class="qs-kz-lbl">Rechnerisch</span><span class="qs-kz-wert">${qsZahl(aMin, 2)} mm²</span></div>`}
      <div class="qs-kz"><span class="qs-kz-lbl">Spannungsfall</span><span class="qs-kz-wert">${qsZahl(spannungsfall(aEmpf) / U * 100, 2)} %</span></div>
      <div class="qs-kz"><span class="qs-kz-lbl">Verlust</span><span class="qs-kz-wert">${qsZahl(verlust(aEmpf), 0)} W</span></div>
    </div>
    <div class="qs-rechenweg">${esc(rechenweg)}</div>
    <table class="qs-tabelle">
      <thead><tr><th>Querschnitt</th><th class="qs-spalte-v">ΔU</th><th>ΔU % <span class="qs-th-max">(max. ${qsZahl(du, 1)})</span></th><th>Verlust</th></tr></thead>
      <tbody>${zeilen.join('')}</tbody>
    </table>`;
}

function renderProjectGrid(){
  const grid = g('project-grid');
  const ids = bereichProjektIds();
  
  if(ids.length === 0){
    if(g('project-group-bar')) g('project-group-bar').innerHTML = '';
    grid.innerHTML = `
      <div style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--muted);">
        <div style="font-size:3rem; margin-bottom:16px;"></div>
        <div style="font-size:1.1rem; font-weight:700; margin-bottom:8px;">Keine Projekte</div>
        ${darf('projekt_anlegen') ? '<button class="btn btn-primary" onclick="openNewProjectModal()">+ Neues Projekt</button>' : ''}
      </div>
    `;
    return;
  }

  const groupBar = g('project-group-bar');
  if(groupBar){
    const groupCounts = {};
    let ungrouped = 0, archiviert = 0;
    ids.forEach(id => {
      // Gesperrte (unterschriebene) Protokolle wandern ins Archiv und
      // tauchen in den Arbeitsgruppen nicht mehr auf. Ihre Gruppe bleibt
      // dabei erhalten — sie wird nur nicht mehr als Filter benutzt.
      if(istArchiviert(PROJECTS[id])){ archiviert++; return; }
      const gr = PROJECTS[id].group;
      if(gr) groupCounts[gr] = (groupCounts[gr]||0) + 1; else ungrouped++;
    });
    const groupNames = Object.keys(groupCounts).sort();
    if(groupNames.length === 0 && archiviert === 0){
      groupBar.innerHTML = '';
      currentProjectGroupFilter = '__all__';
    } else {
      if(currentProjectGroupFilter !== '__all__' && currentProjectGroupFilter !== '__none__'
         && currentProjectGroupFilter !== '__archiv__' && !groupNames.includes(currentProjectGroupFilter)){
        currentProjectGroupFilter = '__all__';
      }
      const offeneAnzahl = ids.length - archiviert;
      let chips = `<button class="wr-tab ${currentProjectGroupFilter==='__all__'?'active':''}" onclick="selectProjectGroupFilter('__all__')">Alle <span style="opacity:0.6;">(${offeneAnzahl})</span></button>`;
      chips += groupNames.map(gr => `<button class="wr-tab ${currentProjectGroupFilter===gr?'active':''}" onclick="selectProjectGroupFilter('${esc(gr).replace(/'/g,"\\'")}')">${esc(gr)} <span style="opacity:0.6;">(${groupCounts[gr]})</span></button>`).join('');
      if(ungrouped > 0){
        chips += `<button class="wr-tab ${currentProjectGroupFilter==='__none__'?'active':''}" onclick="selectProjectGroupFilter('__none__')">Ohne Gruppe <span style="opacity:0.6;">(${ungrouped})</span></button>`;
      }
      if(archiviert > 0){
        chips += `<button class="wr-tab archiv-chip ${currentProjectGroupFilter==='__archiv__'?'active':''}" onclick="selectProjectGroupFilter('__archiv__')" title="Unterschriebene Protokolle — schreibgeschützt und vor Löschen gesichert">Archiv <span style="opacity:0.6;">(${archiviert})</span></button>`;
      }
      groupBar.innerHTML = chips;
    }
  }

  const visibleIds = ids.filter(id => {
    const p = PROJECTS[id];
    // Suchbegriff schlaegt den Gruppenfilter: wer sucht, will alles durchsuchen
    if(projectSearchTerm){
      const hay = `${p.name || ''} ${p.group || ''}`.toLowerCase();
      return hay.includes(projectSearchTerm);
    }
    if(currentProjectGroupFilter === '__archiv__') return istArchiviert(p);
    if(istArchiviert(p)) return false;   // Archiv bleibt aus den Arbeitslisten raus
    if(currentProjectGroupFilter === '__all__') return true;
    if(currentProjectGroupFilter === '__none__') return !p.group;
    return p.group === currentProjectGroupFilter;
  });

  if(visibleIds.length === 0){
    grid.innerHTML = `<div style="grid-column: 1/-1; text-align:center; padding:40px; color:var(--muted);">${
      projectSearchTerm ? `Kein Projekt passt zu „${esc(projectSearchTerm)}“.`
        : (currentProjectGroupFilter === '__archiv__' ? 'Noch kein Protokoll unterschrieben.' : 'Keine Projekte in dieser Gruppe.')
    }</div>`;
    return;
  }
  
  grid.innerHTML = visibleIds.map(id => {
    const proj = PROJECTS[id];
    const isActive = id === CURRENT_PROJECT_ID;
    const wrCount = Object.keys(proj.plan || {}).filter(k => !isNaN(parseInt(k))).length;
    const wp = proj.model_wp || 465;
    const lockedIcon = proj.locked ? ICON.lock + ' ' : '';
    
    const prog = getProjectProgress(proj);
    const pct = prog.total ? Math.round(prog.done / prog.total * 100) : 0;
    const canManage = darf('projekt_verwalten');
    const canDelete = darf('projekt_loeschen');

    return `
      <div class="project-card ${isActive ? 'active' : ''}" role="button" tabindex="0" aria-label="Projekt ${esc(proj.name)} öffnen" onclick="selectProject('${id}'); switchMainTab('matrix');" onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}">
        <div class="project-card-header">
          <div class="project-card-title">${lockedIcon}${isActive ? '✓ ' : ''}${esc(proj.name)}</div>
          <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
            <div class="sync-status ${cloudProjectIds.has(id) ? 'synced' : 'pending'}" title="${cloudProjectIds.has(id) ? 'In der Cloud gespeichert' : 'Nur auf diesem Gerät – wird nach Anmeldung übertragen'}">${cloudProjectIds.has(id) ? '' : ''}</div>
            ${canManage ? `
            <div class="pc-menu-wrap">
              <button class="pc-menu-btn" title="Projekt-Aktionen" aria-haspopup="true" onclick="toggleProjectMenu('${id}', event)">⋯</button>
              <div class="pc-menu" id="pc-menu-${id}" onclick="event.stopPropagation()">
                <button onclick="renameProject('${id}', event); closeProjectMenus();"><span></span> Umbenennen</button>
                <button onclick="setProjectGroup('${id}', event); closeProjectMenus();"><span></span> Gruppe zuweisen</button>
                <button onclick="openBereichModal('${id}', event); closeProjectMenus();"><span></span> Bereich ändern</button>
                <button onclick="openAssignModal('${id}', event); closeProjectMenus();"><span></span> Bauleitung zuweisen</button>
                <button onclick="openHistoryModal('${id}', event); closeProjectMenus();"><span></span> Versionen &amp; Wiederherstellen</button>
                ${canDelete ? `<button class="danger" onclick="deleteProject('${id}', event); closeProjectMenus();"><span></span> Projekt löschen</button>` : ''}
              </div>
            </div>` : ''}
          </div>
        </div>
        <div class="project-card-meta">
          ${proj.group ? `<span style="color:var(--accent); font-weight:700;">${esc(proj.group)}</span> &middot; ` : ''}${wrCount} Wechselrichter &middot; ${wp} Wp${proj.locked ? ' &middot; <span style="color:#ef4444;font-weight:700;">gesperrt</span>' : ''}
        </div>
        <div class="pc-prog">
          <div class="pc-prog-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100" aria-label="Messfortschritt">
            <div class="pc-prog-fill ${prog.crit ? 'crit' : ''}" style="width:${pct}%;"></div>
          </div>
          <div class="pc-prog-txt">
            <span>${prog.total ? `<span class="done">${prog.done}</span> von ${prog.total} gemessen` : 'Noch keine Strings angelegt'}</span>
            <span>${prog.crit ? `<span class="flags">${prog.crit}</span>` : `${pct}%`}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// Ein Projekt gilt als archiviert, sobald es gesperrt (unterschrieben) ist.
// Die Datenbank schuetzt es dann zusaetzlich: nur Admins duerfen es aendern,
// geloescht werden kann es gar nicht, und sein Verlauf bleibt verschont.
function istArchiviert(p){ return !!(p && p.locked); }

// Ein Protokoll, das jemals unterschrieben oder gesperrt war, bleibt
// dauerhaft geschuetzt — auch wenn es zur Endbearbeitung wieder
// entsperrt wird. Es kann dann nicht geloescht werden und die
// automatische History-Bereinigung laesst es in Ruhe.
function istGeschuetzt(p){ return !!(p && (p.geschuetzt || p.locked || p.signature || p.abnahme)); }

// Diese Schluessel gehoeren nicht zum Anlagenplan, sondern sind Metadaten
// im selben config-Feld. Sie stehen an EINER Stelle, damit beim Speichern
// nie wieder einer vergessen wird.
const CONFIG_META_KEYS = ['_lock', '_group', '_signature', '_abnahme', '_freigabe', '_geschuetzt', '_beschreibung', '_anlagenbuch'];

function buildProjectConfig(proj, fallbackEmail){
  const cfg = {};
  Object.keys(proj.plan || {}).forEach(k => { if(CONFIG_META_KEYS.indexOf(k) < 0) cfg[k] = proj.plan[k]; });
  cfg._lock = proj.locked
    ? { locked: true, by: proj.locked_by || fallbackEmail || null, at: proj.locked_at || new Date().toISOString() }
    : { locked: false };
  if(proj.group) cfg._group = proj.group;
  if(proj.beschreibung) cfg._beschreibung = proj.beschreibung;
  if(proj.anlagenbuch) cfg._anlagenbuch = proj.anlagenbuch;
  // Unterschriften werden NIE weggeschrieben, auch nicht im entsperrten
  // Zustand. Das war die Stelle, an der beim Entsperren alles verschwand.
  if(proj.signature) cfg._signature = proj.signature;
  if(proj.abnahme)   cfg._abnahme   = proj.abnahme;
  if(proj.freigabe)  cfg._freigabe  = proj.freigabe;
  if(istGeschuetzt(proj)) cfg._geschuetzt = true;
  return cfg;
}

// Fortschritt eines Projekts aus dem mitgeladenen Messstand.
// Fuer das gerade geoeffnete Projekt wird der Live-Zustand genommen,
// damit die Karte nicht hinterherhinkt.
function getProjectProgress(proj){
  const out = { done: 0, total: 0, crit: 0 };
  if(!proj) return out;
  const state = (proj.id === CURRENT_PROJECT_ID && APP_STATE && Object.keys(APP_STATE).length)
    ? APP_STATE : proj.measurements;
  if(!state || typeof state !== 'object') return out;

  Object.keys(state).forEach(sid => {
    const it = state[sid];
    if(!it || it.stat !== 'JA') return;
    out.total++;
    const u = toNum(it.uoc), i = toNum(it.isc), r = toNum(it.riso);
    if(u !== null && u > 0 && i !== null && i > 0 && r !== null && r > 0){
      out.done++;
      if(r < LIMIT_RISO_MIN) out.crit++;
    }
  });
  return out;
}

function toggleProjectMenu(id, event){
  if(event){ event.stopPropagation(); event.preventDefault(); }
  const menu = g(`pc-menu-${id}`);
  if(!menu) return;
  const wasOpen = menu.classList.contains('show');
  closeProjectMenus();
  if(!wasOpen){
    menu.classList.remove('flip-up');
    menu.classList.add('show');
    // Ragt das Menu unten ueber die eigene Karte ODER den sichtbaren Bereich
    // hinaus, deckt es sonst die naechste Projektkarte darunter zu (v.a. bei
    // schmalen Fenstern mit nur einer Spalte) — dann stattdessen nach oben
    // aufklappen, wo in der Regel mehr Platz ist.
    const rect = menu.getBoundingClientRect();
    const card = menu.closest('.project-card');
    const cardBottom = card ? card.getBoundingClientRect().bottom : Infinity;
    if(rect.bottom > Math.min(cardBottom, window.innerHeight - 8)) menu.classList.add('flip-up');
  }
}
function closeProjectMenus(){
  document.querySelectorAll('.pc-menu.show').forEach(m => m.classList.remove('show'));
}
document.addEventListener('click', e => {
  if(!e.target.closest('.pc-menu-wrap')) closeProjectMenus();
});

// Projekt-Suche: filtert Name und Gruppe
let projectSearchTerm = '';
function onProjectSearch(value){
  projectSearchTerm = String(value || '').trim().toLowerCase();
  renderProjectGrid();
}

let PROJECTS = {};
let CURRENT_PROJECT_ID = null;

/* ══════════════════════════════════════════════════════════════════════════
   BEREICHE (Privatanlage / Gewerbe / Freiflaeche) + STARTBILDSCHIRM
   Jedes Projekt gehoert zu genau einem Bereich. Welche Bereiche jemand sehen
   darf, legt der Admin in der Benutzerverwaltung fest – die Datenbank setzt
   das durch. Nach dem Anmelden startet man immer auf dem Startbildschirm,
   waehlt den Bereich und landet ohne offenes Projekt auf der Uebersicht.
   ══════════════════════════════════════════════════════════════════════════ */
const BEREICHE = {
  privat:      { name: 'Privatanlage', icon: ICON.home, info: 'Einfamilienhäuser und kleine Dachanlagen' },
  gewerbe:     { name: 'Gewerbe',      icon: ICON.factory, info: 'Hallen, Betriebe und öffentliche Gebäude' },
  freiflaeche: { name: 'Freifläche',   icon: ICON.sun, info: 'Solarparks und Freiflächenanlagen' }
};
const BEREICH_REIHE = ['privat', 'gewerbe', 'freiflaeche'];
let CURRENT_BEREICH = null;
let currentUserBereiche = [];

function projektBereich(p){ return (p && BEREICHE[p.bereich]) ? p.bereich : 'gewerbe'; }
function imAktuellenBereich(id){ return !CURRENT_BEREICH || projektBereich(PROJECTS[id]) === CURRENT_BEREICH; }
function bereichProjektIds(){ return Object.keys(PROJECTS).filter(imAktuellenBereich); }
function erlaubteBereiche(){
  if(currentUserRole === 'admin') return BEREICH_REIHE.slice();
  return BEREICH_REIHE.filter(b => (currentUserBereiche || []).indexOf(b) >= 0);
}

function zeigeBereichsWahl(){
  const gate = g('bereich-gate');
  if(!gate) return;
  const logo = g('bg-logo');
  const authLogo = document.querySelector('#auth-gate .auth-logo');
  if(logo && authLogo && !logo.childElementCount) logo.innerHTML = authLogo.innerHTML;
  const erlaubt = erlaubteBereiche();
  const name = anzeigeName();
  const sub = g('bg-sub');
  if(sub) sub.textContent = erlaubt.length ? `${name ? 'Hallo ' + name + ' – ' : ''}in welchem Bereich arbeitest du?` : '';
  const karten = g('bg-karten');
  if(karten){
    if(!erlaubt.length){
      karten.innerHTML = '<div class="bg-leer">Dir ist noch kein Bereich freigeschaltet.<br>Bitte melde dich beim Admin.</div>';
    } else {
      const anzahl = b => Object.keys(PROJECTS).filter(id => projektBereich(PROJECTS[id]) === b).length;
      karten.innerHTML = erlaubt.map(b => {
        const x = BEREICHE[b], n = anzahl(b);
        return `<button type="button" class="bg-karte" data-bereich="${b}" onclick="waehleBereich('${b}')">
          <span class="bg-icon" aria-hidden="true">${x.icon}</span>
          <span class="bg-name">${x.name}</span>
          <span class="bg-info">${x.info}</span>
          <span class="bg-zahl">${n === 1 ? '1 Projekt' : n + ' Projekte'}</span>
        </button>`;
      }).join('');
    }
  }
  const nutzer = g('bg-nutzer');
  if(nutzer) nutzer.textContent = currentUser && currentUser.email ? currentUser.email : '';
  gate.hidden = false;
  document.body.classList.add('bereich-offen');
  if(typeof closeSidebar === 'function') closeSidebar();
}

async function waehleBereich(b){
  if(erlaubteBereiche().indexOf(b) < 0) return;
  // Ein offenes Projekt vorher sichern, dann ohne Projekt im Bereich starten
  if(CURRENT_PROJECT_ID){
    try {
      await flushPendingProjectEdits();
      // Lock freigeben
      if (currentProjectLock) {
        await unlockProject(CURRENT_PROJECT_ID);
      }
    } catch(e){}
  }
  CURRENT_BEREICH = b;
  CURRENT_PROJECT_ID = null;
  APP_STATE = {};
  currentProjectGroupFilter = '__all__';
  const gate = g('bereich-gate');
  if(gate) gate.hidden = true;
  document.body.classList.remove('bereich-offen');
  aktualisiereBereichsAnzeige();
  renderMatrix();
  if(typeof updateKPIs === 'function') updateKPIs();
  renderProjectUI();
  if(g('project-grid')) renderProjectGrid();
  switchMainTab('home');
}

function aktualisiereBereichsAnzeige(){
  const chip = g('bereich-chip');
  if(chip){
    chip.hidden = !CURRENT_BEREICH;
    if(CURRENT_BEREICH){
      g('bereich-chip-icon').innerHTML = BEREICHE[CURRENT_BEREICH].icon;
      g('bereich-chip-name').textContent = BEREICHE[CURRENT_BEREICH].name;
    }
  }
  document.body.dataset.bereich = CURRENT_BEREICH || '';
}

// Uebersicht ohne offenes Projekt: die zuletzt bearbeiteten Projekte des Bereichs
function renderHomeProjektwahl(ids){
  const box = g('home-projektwahl');
  const btn = g('home-active-open-btn');
  const offen = !!getCurrentProject();
  if(btn) btn.style.display = offen ? '' : 'none';
  if(!box) return;
  if(offen || !ids.length){ box.hidden = true; box.innerHTML = ''; return; }
  const zeit = p => Date.parse(p.updated_at || 0) || 0;
  const liste = ids.map(id => PROJECTS[id]).sort((a, b) => zeit(b) - zeit(a)).slice(0, 6);
  box.innerHTML = `
    <div class="hpw-kopf"><span class="hpw-titel">Projekt öffnen</span>${ids.length > liste.length ? `<button type="button" class="hpw-alle" onclick="switchMainTab('projects')">Alle ${ids.length} Projekte →</button>` : ''}</div>
    <div class="hpw-liste">${liste.map(p => {
      const prog = getProjectProgress(p);
      const meta = [p.group, prog.total ? `${prog.done} von ${prog.total} gemessen` : null, p.locked ? 'gesperrt' : null].filter(Boolean).join(' · ');
      return `<button type="button" class="hpw-karte" onclick="selectSbProject('${esc(p.id).replace(/'/g, "\\&#39;")}')"><span class="hpw-name">${esc(p.name || 'Unbenannt')}</span><span class="hpw-meta">${esc(meta || 'Noch keine Messwerte')}</span></button>`;
    }).join('')}</div>`;
  box.hidden = false;
}

// Bereich eines Projekts aendern (Planer/Admin; die Datenbank prueft mit)
let bereichModalProjektId = null;
function openBereichModal(id, event){
  if(event){ event.stopPropagation(); event.preventDefault(); }
  if(!darf('projekt_verwalten')) return toast('Keine Berechtigung');
  const proj = PROJECTS[id];
  if(!proj) return;
  bereichModalProjektId = id;
  const aktuell = projektBereich(proj);
  g('bm-projekt').textContent = proj.name || id;
  g('bm-liste').innerHTML = erlaubteBereiche().map(b => `
    <button type="button" class="bm-btn ${b === aktuell ? 'active' : ''}" onclick="setProjectBereich('${b}')"${b === aktuell ? ' aria-current="true"' : ''}>
      <span class="bm-icon" aria-hidden="true">${BEREICHE[b].icon}</span>
      <span class="bm-name">${BEREICHE[b].name}</span>${b === aktuell ? '<span class="bm-aktuell">aktuell</span>' : ''}
    </button>`).join('');
  g('bereich-modal').classList.add('show');
}
function closeBereichModal(evt){
  if(!evt || evt.target === g('bereich-modal')){
    g('bereich-modal').classList.remove('show');
    bereichModalProjektId = null;
  }
}
async function setProjectBereich(b){
  const id = bereichModalProjektId;
  const proj = PROJECTS[id];
  if(!proj || !BEREICHE[b]) return;
  const vorher = projektBereich(proj);
  closeBereichModal();
  if(b === vorher) return;
  proj.bereich = b;
  if(supabaseClient && currentUser){
    try {
      const { data, error } = await supabaseClient.from('pv_projects').update({ bereich: b }).eq('id', id).select('id');
      if(error) throw error;
      if(!data || !data.length) throw new Error('Keine Berechtigung – ist das Protokoll gesperrt?');
    } catch(e){
      proj.bereich = vorher;
      toastError('Bereich konnte nicht geändert werden', e);
      return;
    }
  } else {
    saveProjectsLocal();
  }
  if(id === CURRENT_PROJECT_ID && b !== CURRENT_BEREICH){
    CURRENT_PROJECT_ID = null;
    APP_STATE = {};
    renderMatrix();
  }
  renderProjectUI();
  if(g('project-grid')) renderProjectGrid();
  toast(`„${proj.name}“ ist jetzt im Bereich ${BEREICHE[b].name}`);
}

// Benutzerverwaltung: Bereiche je Nutzer
function bereicheZellenHtml(u){
  if(u.role === 'admin') return '<span class="ub-alle">Admin – sieht alle Bereiche</span>';
  const hat = Array.isArray(u.bereiche) ? u.bereiche : [];
  const chips = BEREICH_REIHE.map(b => {
    const an = hat.indexOf(b) >= 0;
    return `<button type="button" class="ub-chip ${an ? 'an' : ''}" aria-pressed="${an}" onclick="changeUserBereich('${u.id}', '${b}', ${!an})">${BEREICHE[b].icon} ${BEREICHE[b].name}</button>`;
  }).join('');
  return `<div class="ub-bereiche" role="group" aria-label="Bereiche von ${esc(u.email || '')}">${chips}${hat.length ? '' : '<span class="ub-hinweis">Noch kein Bereich – sieht nichts</span>'}</div>`;
}
async function changeUserBereich(userId, bereich, an){
  if(currentUserRole !== 'admin') return toast('Nur für Admins');
  try {
    const { data: row, error: e1 } = await supabaseClient.from('profiles').select('bereiche').eq('id', userId).single();
    if(e1) throw e1;
    const menge = new Set(row && Array.isArray(row.bereiche) ? row.bereiche : []);
    if(an) menge.add(bereich); else menge.delete(bereich);
    const neu = BEREICH_REIHE.filter(b => menge.has(b));
    const { error } = await supabaseClient.from('profiles').update({ bereiche: neu }).eq('id', userId);
    if(error) throw error;
    toast(`Bereiche: ${neu.length ? neu.map(b => BEREICHE[b].name).join(', ') : 'keine'}`);
  } catch(e){ toastError('Bereiche konnten nicht geändert werden', e); }
  loadAllUsers();
}
let APP_STATE = {};
let cloudProjectIds = new Set();
let cloudFetchSucceeded = false;
let currentProjectGroupFilter = '__all__';
let sbExpandedGroups = new Set();

// Template System
let PROJECT_TEMPLATES = {};

function saveProjectAsTemplate(name){
  if(!CURRENT_PROJECT_ID || !PROJECTS[CURRENT_PROJECT_ID]) return toast('Kein Projekt geöffnet');
  
  const project = PROJECTS[CURRENT_PROJECT_ID];
  const template = {
    name: name,
    description: `Vorlage basierend auf ${project.name}`,
    createdAt: new Date().toISOString(),
    config: {
      model_wp: project.model_wp || 465,
      // WR-Konfiguration speichern
      wrConfig: {}
    }
  };
  
  // WR-Konfiguration extrahieren
  Object.keys(project.plan || {}).forEach(wrId => {
    const wrData = project.plan[wrId];
    if(!Array.isArray(wrData)) { // Nur moderne Konfiguration
      template.config.wrConfig[wrId] = {
        name: wrData.name,
        mppts: wrData.mppts || 12,
        inputs: wrData.inputs || 2,
        defaultMods: wrData.defaultMods || 0
      };
    }
  });
  
  PROJECT_TEMPLATES[name] = template;
  localStorage.setItem('pv_matrix_templates', JSON.stringify(PROJECT_TEMPLATES));
  
  toast(`Vorlage "${name}" gespeichert`);
  renderTemplateOptions();
}

function loadTemplatesFromStorage(){
  try {
    const stored = localStorage.getItem('pv_matrix_templates');
    if(stored) {
      PROJECT_TEMPLATES = JSON.parse(stored);
    }
  } catch(e) {
    console.warn('Templates konnten nicht geladen werden', e);
  }
}

function showTemplateModal(){
  if(!darf('vorlagen')) return toast('Keine Berechtigung');
  renderTemplateOptions();
  g('template-modal').classList.add('show');
}

function closeTemplateModal(e){
  if(!e || e.target === e.currentTarget) g('template-modal').classList.remove('show');
  hideSaveTemplateForm();
}

function updateTemplatePreview(){
  const select = g('template-select');
  const preview = g('template-preview');
  const previewContent = g('template-preview-content');
  const applyBtn = g('apply-template-btn');
  const deleteBtn = g('template-actions');
  
  const selectedTemplate = select.value;
  
  if(!selectedTemplate || !PROJECT_TEMPLATES[selectedTemplate]) {
    preview.style.display = 'none';
    applyBtn.disabled = true;
    deleteBtn.style.display = 'none';
    return;
  }
  
  const template = PROJECT_TEMPLATES[selectedTemplate];
  preview.style.display = 'block';
  applyBtn.disabled = false;
  deleteBtn.style.display = 'block';
  
  let html = `<strong>${template.name}</strong><br>`;
  html += `<em>${template.description}</em><br><br>`;
  html += `Modul-Wp: ${template.config.model_wp}<br>`;
  html += `Wechselrichter: ${Object.keys(template.config.wrConfig).length}<br>`;
  html += `Erstellt: ${new Date(template.createdAt).toLocaleDateString('de-DE')}`;
  
  previewContent.innerHTML = html;
}

async function applySelectedTemplate(){
  const select = g('template-select');
  const selectedTemplate = select.value;
  if(!selectedTemplate) return;
  
  await applyTemplate(selectedTemplate);
  closeTemplateModal();
}

function showSaveTemplateForm(){
  g('save-template-form').style.display = 'block';
  g('new-template-name').focus();
}

function hideSaveTemplateForm(){
  g('save-template-form').style.display = 'none';
  g('new-template-name').value = '';
}

function saveCurrentAsTemplate(){
  const nameInput = g('new-template-name');
  const name = nameInput.value.trim();
  
  if(!name) return toast('Bitte einen Namen eingeben');
  
  saveProjectAsTemplate(name);
  hideSaveTemplateForm();
  renderTemplateOptions();
}

async function deleteSelectedTemplate(){
  const select = g('template-select');
  const selectedTemplate = select.value;
  if(!selectedTemplate) return;
  
  await deleteTemplate(selectedTemplate);
  renderTemplateOptions();
  updateTemplatePreview();
}

// Export-Funktionen erweitern
function exportCSV(){
  if(!darf('export')) return toast('Keine Berechtigung für Exporte');
  const project = getCurrentProject();
  if(!project) return toast('Kein Projekt geöffnet');
  
  const plan = getCurrentPlan();
  const csvData = [];
  
  // Header
  csvData.push(['WR', 'MPPT', 'String', 'GAK', 'Module', 'kWp', 'Uoc(V)', 'Isc(A)', 'Riso(MΩ)', 'Status', 'Bemerkung']);
  
  // Daten
  Object.keys(plan).forEach(wrId => {
    const wrData = plan[wrId];
    const mppts = Array.isArray(wrData) ? 12 : (wrData.mppts || 12);
    const inputs = Array.isArray(wrData) ? 2 : (wrData.inputs || 2);
    
    for(let m = 1; m <= mppts; m++){
      for(let s = 1; s <= inputs; s++){
        const id = `${wrId}.${m}.${s}`;
        const item = APP_STATE[id];
        if(!item) continue;
        
        const wp = getCurrentWp();
        const pwr = (item.stat === 'JA' && item.mod > 0) ? ((item.mod * wp)/1000).toFixed(2) : '0';
        
        csvData.push([
          wrId,
          m,
          s,
          item.gak || '',
          item.mod || 0,
          pwr,
          item.uoc || '',
          item.isc || '',
          item.riso || '',
          item.stat || '',
          item.note || ''
        ]);
      }
    }
  });
  
  // CSV String erstellen
  const csvString = csvData.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  
  // Download
  const blob = new Blob(['\ufeff' + csvString], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `${project.name.replace(/[^a-zA-Z0-9]/g, '_')}_export.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  toast('CSV exportiert');
}

// HINWEIS (Review 09/2026): Diese Funktion druckte bisher direkt die Matrix-Ansicht
// per window.print(). Das Druck-Stylesheet blendet dabei aber die Spalten Uoc/Isc/Riso
// aus (.col-hide-print), wodurch das erzeugte "PDF" ohne die eigentlichen Messwerte
// herauskam. Der zugehörige Sidebar-Button wurde entfernt; diese Funktion leitet nur
// noch defensiv (falls sie doch irgendwo aufgerufen wird) auf das korrekte, geprüfte
// Messblatt weiter.
function exportPDFWithLogo(){
  printBlankMeasurementSheet();
}

async function applyTemplate(templateName){
  const template = PROJECT_TEMPLATES[templateName];
  if(!template) return toast('Vorlage nicht gefunden');
  
  if(!await appFrage(`Vorlage "${templateName}" anwenden?\n\nDies wird die aktuelle Hardware-Konfiguration ersetzen.`)) return;
  
  saveStateToHistory('Vorlage angewendet');
  
  const project = getCurrentProject();
  if(!project) return;
  
  // Projekt-Konfiguration aktualisieren
  project.model_wp = template.config.model_wp;
  
  // WR-Konfiguration anwenden
  Object.keys(template.config.wrConfig).forEach(wrId => {
    if(project.plan[wrId]) {
      project.plan[wrId] = {
        ...project.plan[wrId],
        name: template.config.wrConfig[wrId].name,
        mppts: template.config.wrConfig[wrId].mppts,
        inputs: template.config.wrConfig[wrId].inputs,
        defaultMods: template.config.wrConfig[wrId].defaultMods
      };
    }
  });
  
  // Matrix neu generieren
  loadCurrentProjectData(false);
  renderMatrix();
  buildFilterBar();
  
  toast(`Vorlage "${templateName}" angewendet`);
}

async function deleteTemplate(templateName){
  if(!await appFrage(`Vorlage "${templateName}" wirklich löschen?`)) return;
  
  delete PROJECT_TEMPLATES[templateName];
  localStorage.setItem('pv_matrix_templates', JSON.stringify(PROJECT_TEMPLATES));
  
  renderTemplateOptions();
  toast(`Vorlage "${templateName}" gelöscht`);
}

function renderTemplateOptions(){
  const select = g('template-select');
  if(!select) return;
  
  select.innerHTML = '<option value="">-- Vorlage wählen --</option>';
  
  Object.keys(PROJECT_TEMPLATES).sort().forEach(name => {
    const template = PROJECT_TEMPLATES[name];
    const option = document.createElement('option');
    option.value = name;
    option.textContent = `${name} (${template.description})`;
    select.appendChild(option);
  });
}

// Undo/Redo System
let undoStack = [];
let redoStack = [];
const MAX_HISTORY = 50; // Max 50 Schritte im Memory

function saveStateToHistory(description = 'Änderung'){
  if(!CURRENT_PROJECT_ID) return;
  
  // Deep Copy des aktuellen States
  const stateCopy = JSON.parse(JSON.stringify(APP_STATE));
  const projectCopy = JSON.parse(JSON.stringify(PROJECTS[CURRENT_PROJECT_ID]));
  
  undoStack.push({
    state: stateCopy,
    project: projectCopy,
    description: description,
    timestamp: new Date().toISOString()
  });
  
  // Redo-Stack leeren bei neuer Änderung
  redoStack = [];
  
  // Stack limitieren
  if(undoStack.length > MAX_HISTORY) {
    undoStack.shift();
  }
  
  updateUndoRedoUI();
}

function performUndo(){
  if(undoStack.length === 0) {
    toast('Nichts zum Rückgängig machen');
    return;
  }
  
  const currentState = {
    state: JSON.parse(JSON.stringify(APP_STATE)),
    project: JSON.parse(JSON.stringify(PROJECTS[CURRENT_PROJECT_ID])),
    description: 'Vorheriger Zustand',
    timestamp: new Date().toISOString()
  };
  
  const previousState = undoStack.pop();
  redoStack.push(currentState);
  
  // State wiederherstellen
  APP_STATE = previousState.state;
  PROJECTS[CURRENT_PROJECT_ID] = previousState.project;
  
  renderMatrix();
  updateKPIs();
  updateUndoRedoUI();
  
  toast(`${previousState.description} rückgängig gemacht`);
}

function performRedo(){
  if(redoStack.length === 0) {
    toast('Nichts zum Wiederherstellen');
    return;
  }
  
  const currentState = {
    state: JSON.parse(JSON.stringify(APP_STATE)),
    project: JSON.parse(JSON.stringify(PROJECTS[CURRENT_PROJECT_ID])),
    description: 'Aktueller Zustand',
    timestamp: new Date().toISOString()
  };
  
  const nextState = redoStack.pop();
  undoStack.push(currentState);
  
  // State wiederherstellen
  APP_STATE = nextState.state;
  PROJECTS[CURRENT_PROJECT_ID] = nextState.project;
  
  renderMatrix();
  updateKPIs();
  updateUndoRedoUI();
  
  toast(`${nextState.description} wiederhergestellt`);
}

function updateUndoRedoUI(){
  // Hier könnten wir UI-Buttons updaten, falls wir welche hinzufügen
  // Für jetzt nur Keyboard-Shortcuts aktiv
}

// Automatisches Speichern in History bei wichtigen Änderungen
const originalSaveData = saveData;
saveData = function(id, field, val) {
  originalSaveData(id, field, val);
  
  // Nur bei Hardware-Änderungen oder Messwerten in History speichern
  const importantFields = ['mod', 'stat', 'gak', 'uoc', 'isc', 'riso'];
  if(importantFields.includes(field)) {
    saveStateToHistory(`${field} geändert`);
  }
};

function renderSidebarProjects(){
  const tree = g('sb-proj-tree');
  if(!tree) return;
  const countEl = g('sb-proj-count');
  const ids = bereichProjektIds();
  if(countEl) countEl.textContent = String(ids.length);

  if(ids.length === 0){
    tree.innerHTML = `<div class="sb-proj-empty">${CURRENT_BEREICH ? 'Noch keine Projekte im Bereich ' + esc(BEREICHE[CURRENT_BEREICH].name) + '.' : 'Noch keine Projekte.'}<br>Lege dein erstes an.</div>`;
    return;
  }

  const groups = {};
  const ungrouped = [];
  ids.forEach(id => {
    const gr = PROJECTS[id].group;
    if(gr){ if(!groups[gr]) groups[gr] = []; groups[gr].push(id); }
    else ungrouped.push(id);
  });
  const sortedGroupNames = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'de'));

  if(CURRENT_PROJECT_ID && PROJECTS[CURRENT_PROJECT_ID]){
    const ag = PROJECTS[CURRENT_PROJECT_ID].group;
    if(ag) sbExpandedGroups.add(ag);
  }

  const safeAttr = s => String(s ?? '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const sortByName = (a, b) => (PROJECTS[a].name || '').localeCompare(PROJECTS[b].name || '', 'de');

  const renderGroup = (key, label, items) => {
    if(items.length === 0) return '';
    const open = sbExpandedGroups.has(key);
    const children = items.sort(sortByName).map(id => renderSbProjectItem(id)).join('');
    const showGroupActions = currentUserRole && darf('projekt_verwalten') && key !== '__none__';
    
    return `<div class="sb-proj-group ${open ? 'open' : ''}" data-group="${safeAttr(key)}">
      <div style="display:flex; align-items:center;">
        <button class="sb-proj-group-head" style="flex:1;" type="button" onclick="toggleSbGroup('${safeAttr(key)}', event)" aria-expanded="${open}">
          <span class="sb-chevron">▶</span>
          <span class="sb-group-name">${esc(label)}</span>
          <span class="sb-group-count">${items.length}</span>
        </button>
        ${showGroupActions ? `<button class="sb-proj-mini-btn" style="margin-right:8px;" onclick="editGroup('${safeAttr(key)}', event)" title="Gruppe umbenennen/löschen">${ICON.gear}</button>` : ''}
      </div>
      <div class="sb-proj-group-children">${children}</div>
    </div>`;
  };

  let html = '';
  sortedGroupNames.forEach(gr => { html += renderGroup(gr, gr, groups[gr]); });
  if(ungrouped.length > 0) html += renderGroup('__none__', 'Ohne Gruppe', ungrouped);

  tree.innerHTML = html;
}

function renderSbProjectItem(id){
  const proj = PROJECTS[id];
  if(!proj) return '';
  const isActive = id === CURRENT_PROJECT_ID;
  const showActions = currentUserRole && darf('projekt_verwalten');
  return `<div class="sb-proj-item ${isActive ? 'active' : ''}"
    role="button" tabindex="0"
    onclick="selectSbProject('${esc(id).replace(/'/g, "\\&#39;")}')"
    onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();this.click();}"
    title="${esc(proj.name)}${proj.locked ? ' (Protokoll gesperrt)' : ''}">
    ${proj.locked ? '<span class="sb-proj-lock" aria-label="gesperrt">' + ICON.lock + '</span>' : ''}
    <span class="sb-proj-name">${isActive ? '✓ ' : ''}${esc(proj.name)}</span>
    ${showActions ? `<span class="sb-proj-actions">
      <button class="sb-proj-mini-btn" type="button" onclick="renameProject('${esc(id).replace(/'/g, "\\&#39;")}', event)" title="Umbenennen" aria-label="Umbenennen">${ICON.pencil}</button>
      <button class="sb-proj-mini-btn" type="button" onclick="setProjectGroup('${esc(id).replace(/'/g, "\\&#39;")}', event)" title="Gruppe" aria-label="Gruppe">${ICON.tag}</button>
    </span>` : ''}
  </div>`;
}

function toggleSbGroup(key, event){
  if(event){ event.stopPropagation(); event.preventDefault(); }
  if(sbExpandedGroups.has(key)) sbExpandedGroups.delete(key);
  else sbExpandedGroups.add(key);
  const grp = document.querySelector(`.sb-proj-group[data-group="${String(key).replace(/"/g, '\\"')}"]`);
  if(grp){
    const isOpen = grp.classList.toggle('open');
    const head = grp.querySelector('.sb-proj-group-head');
    if(head) head.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
  }
}

async function selectSbProject(id){
  if(id === CURRENT_PROJECT_ID){
    closeSidebar();
    return;
  }
  closeSidebar();
  await selectProject(id);
  switchMainTab('matrix');
}

function renderHomeView(){
  const empty = g('home-empty');
  const active = g('home-active');
  const activeName = g('home-active-name');
  const activeMeta = g('home-active-meta');
  const userName = g('home-user-name');
  const subtitle = g('home-subtitle');

  if(userName){
    userName.textContent = anzeigeName() || 'Anwender';
  }
  if(subtitle){
    const datum = new Date().toLocaleDateString('de-AT', { weekday: 'long', day: 'numeric', month: 'long' });
    subtitle.textContent = CURRENT_BEREICH ? `Bereich ${BEREICHE[CURRENT_BEREICH].name} · ${datum}` : datum;
  }

  const ids = bereichProjektIds();
  const hasProjects = ids.length > 0;
  if(empty) empty.style.display = hasProjects ? 'none' : 'block';
  if(active) active.style.display = hasProjects ? 'block' : 'none';

  // Live-Kennzahlen für das Dashboard berechnen (aus dem aktuell geladenen Projekt)
  let done = 0, open = 0, kwp = 0;
  const wp = getCurrentWp();
  Object.keys(APP_STATE).forEach(id => {
    const st = getStringStatus(id);
    if(st === 'COMPLETE'){ done++; const it = APP_STATE[id]; if(it && it.mod>0) kwp += (it.mod*wp)/1000; }
    else if(st === 'INCOMPLETE'){ open++; const it = APP_STATE[id]; if(it && it.mod>0) kwp += (it.mod*wp)/1000; }
  });
  const setTxt = (elId, val) => { const el = g(elId); if(el) el.textContent = val; };
  setTxt('home-stat-projects', ids.length);
  const kwpEl = g('home-stat-kwp');
  if(kwpEl) kwpEl.innerHTML = `${kwp.toFixed(1)}<span class="home-stat-unit">kWp</span>`;
  setTxt('home-stat-done', done);
  setTxt('home-stat-open', open);

  // Hero-Status-Badge
  const badge = g('home-hero-badge');
  const badgeText = g('home-hero-badge-text');
  if(badge && badgeText){
    if(!hasProjects){ badge.dataset.state='idle'; badgeText.textContent='Kein Projekt'; }
    else if(open === 0 && done > 0){ badge.dataset.state='done'; badgeText.textContent='Alles gemessen'; }
    else if(open > 0){ badge.dataset.state='progress'; badgeText.textContent=`${open} offen`; }
    else { badge.dataset.state='ready'; badgeText.textContent='Bereit'; }
  }

  if(hasProjects){
    const current = getCurrentProject();
    if(current){
      if(activeName) activeName.textContent = current.name || '—';
      if(activeMeta){
        const wrCount = Object.keys(current.plan || {}).filter(k => !isNaN(parseInt(k))).length;
        const meta = [];
        if(current.group) meta.push(current.group);
        meta.push(`${wrCount} WR`);
        meta.push(`${current.model_wp || 465} Wp`);
        if(current.locked) meta.push('gesperrt');
        activeMeta.textContent = meta.join(' · ');
      }
      // Fortschrittsbalken im "Aktuell geöffnet"-Kärtchen
      const total = done + open;
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      const fill = g('home-active-progress-fill');
      const ptext = g('home-active-progress-text');
      const pwrap = g('home-active-progress');
      if(pwrap) pwrap.style.display = total > 0 ? 'block' : 'none';
      if(fill) fill.style.width = pct + '%';
      if(ptext) ptext.textContent = total > 0 ? `${done} von ${total} Strings fertig · ${pct}%` : '';
    } else if(activeName){
      activeName.textContent = 'Kein Projekt geöffnet';
      if(activeMeta) activeMeta.textContent = 'Wähle unten ein Projekt oder lege ein neues an.';
      const pwrap = g('home-active-progress'); if(pwrap) pwrap.style.display = 'none';
    }
  }
  renderHomeProjektwahl(ids);
}

function renderProjectUI(){
  renderSidebarProjects();
  renderHomeView();
}

async function initProjects(){
  PROJECTS = {};
  CURRENT_PROJECT_ID = null;
  APP_STATE = {};
  cloudFetchSucceeded = false;
  
  // Templates laden
  loadTemplatesFromStorage();

  if(supabaseClient && currentUser){
    try { await fetchProjectsFromCloud(); } catch(e){ console.warn('Cloud-Fetch fehlgeschlagen', e); }
  }

  if(cloudFetchSucceeded) clearLegacyBrowserCache();
  // Immer ohne offenes Projekt starten – gewaehlt wird nach dem Startbildschirm
  CURRENT_PROJECT_ID = null;
  APP_STATE = {};
  renderMatrix();
  if(CURRENT_PROJECT_ID && cloudFetchSucceeded){
    await fetchCloudDataManually(true);
  }
  renderProjectUI();
}

function saveProjectsLocal(){ }
function clearLegacyBrowserCache(){
  try {
    ['solpro_projects_v2', 'solpro_data_v2', 'solpro_curr_v2', 'solpro_sun_mode']
      .forEach(key => localStorage.removeItem(key));
  } catch(e){}
}

function getCurrentProject(){ return PROJECTS[CURRENT_PROJECT_ID] || null; }
function getCurrentPlan(){
  const p = getCurrentProject();
  if(!p || !p.plan) return {};
  const plan = {};
  Object.keys(p.plan).forEach(k => { if(!isNaN(parseInt(k))) plan[k] = p.plan[k]; });
  return plan;
}
function getCurrentWp(){ return getCurrentProject() ? (getCurrentProject().model_wp || 465) : 465; }

async function editModuleWp(){
  if(!canEditHardware()) return toast('Keine Berechtigung — nur Planer/Admin');
  const proj = getCurrentProject();
  if(!proj) return toast('Kein Projekt geöffnet');
  const input = await appEingabe('Modulleistung in Wp:', proj.model_wp || 465);
  if(input === null) return;
  const wp = parseInt(input, 10);
  if(!wp || wp <= 0 || wp > 1000) return toast('Bitte eine gültige Wp-Zahl zwischen 1 und 1000 eingeben');
  proj.model_wp = wp;
  proj.updated_at = new Date().toISOString();
  saveProjectsLocal();
  g('d-wp').textContent = wp;
  renderMatrix();
  if(supabaseClient && currentUser){
    toast('Speichere...');
    const synced = await saveProjectToCloud(CURRENT_PROJECT_ID);
    toast(synced ? 'Wp aktualisiert' : 'Nur lokal gespeichert — Sync fehlgeschlagen');
  } else {
    toast('Wp aktualisiert (nur lokal)');
  }
}

function generateState(plan, allActiveByDefault = true){
  const result = {};
  if(!plan) return result;
  Object.keys(plan).forEach(wr => {
    if(isNaN(parseInt(wr))) return;
    const wrData = plan[wr];
    const isLegacy = Array.isArray(wrData);
    if(isLegacy) {
      const list = wrData;
      const totalStrings = list.length;
      const doubleCount = Math.max(0, totalStrings - 12);
      let ptr = 0;
      for(let m = 1; m <= 12; m++){
        if(m <= doubleCount){
          const s1 = list[ptr++]; const s2 = list[ptr++];
          result[`${wr}.${m}.1`] = { planName: `STR ${s1.p}`, gak: `GAK ${wr}.${s1.g}`, mod: s1.m, stat: "JA", note: s1.n || "", uoc:"", isc:"", riso:"" };
          result[`${wr}.${m}.2`] = { planName: `STR ${s2.p}`, gak: `GAK ${wr}.${s2.g}`, mod: s2.m, stat: "JA", note: s2.n || "", uoc:"", isc:"", riso:"" };
        } else {
          if(ptr < totalStrings){
            const s1 = list[ptr++];
            result[`${wr}.${m}.1`] = { planName: `STR ${s1.p}`, gak: `GAK ${wr}.${s1.g}`, mod: s1.m, stat: "JA", note: s1.n || "", uoc:"", isc:"", riso:"" };
            result[`${wr}.${m}.2`] = { planName: "", gak: `GAK ${wr}.${s1.g}`, mod: 0, stat: allActiveByDefault ? "JA" : "NEIN", note: "", uoc:"", isc:"", riso:"" };
          } else {
            result[`${wr}.${m}.1`] = { planName: "", gak: `GAK ${wr}.2`, mod: 0, stat: allActiveByDefault ? "JA" : "NEIN", note: "", uoc:"", isc:"", riso:"" };
            result[`${wr}.${m}.2`] = { planName: "", gak: `GAK ${wr}.2`, mod: 0, stat: allActiveByDefault ? "JA" : "NEIN", note: "", uoc:"", isc:"", riso:"" };
          }
        }
      }
    } else {
      const mppts = wrData.mppts || 12;
      const inputs = wrData.inputs || 2;
      const defMods = wrData.defaultMods || 0;
      for(let m=1; m<=mppts; m++){
        for(let s=1; s<=inputs; s++){
          const imported = wrData.strings?.[m]?.[s];
          const hasImportedStrings = !!wrData.strings;
          const isAct = imported ? true : (hasImportedStrings ? false : (defMods > 0 || allActiveByDefault));
          result[`${wr}.${m}.${s}`] = {
            planName: imported?.planName || "",
            gak: imported?.gak || `GAK ${wr}`,
            mod: imported?.mod ?? defMods ?? 0,
            stat: imported ? "JA" : (isAct ? "JA" : "NEIN"),
            note: imported?.note || "", uoc:"", isc:"", riso:""
          };
        }
      }
    }
  });
  return result;
}

function loadCurrentProjectData(allActiveByDefault = true){
  if(!CURRENT_PROJECT_ID || !PROJECTS[CURRENT_PROJECT_ID]) return;
  APP_STATE = generateState(getCurrentPlan(), allActiveByDefault);
  updateUI();
  updateLockUI();
  updateRoleHint();
}

function updateUI() {
  g('d-wp').textContent = getCurrentWp();
  renderMatrix();
}

function isProtocolLocked(){
  const p = getCurrentProject();
  return !!(p && p.locked);
}

function canEditMeasurement(){
  if(currentUserRole === 'admin') return true;
  if(!darf('messwerte')) return false;
  if(isProtocolLocked()) return false;
  return true; 
}
function canEditHardware(){
  if(currentUserRole === 'admin') return true;
  if(darf('hardware')) return !isProtocolLocked();
  return false;
}
// Umbenennen ist risikoärmer als volle Hardware-Änderungen (MPPTs/Eingänge/Löschen),
// deshalb darf die Bauleitung (site) das auch — nur eben nicht den Rest des Editors.
function canRenameInverter(){
  if(canEditHardware()) return true;
  if(currentUserRole === 'site') return !isProtocolLocked();
  return false;
}

async function toggleProtocolLock(){
  if(!darf('sperren')){
    toast('Keine Berechtigung zum Sperren/Entsperren');
    return;
  }
  const p = getCurrentProject();
  if(!p) return;
  const willLock = !p.locked;
  if(willLock && !await appFrage('Messprotokoll wirklich sperren?\n\nDanach können Bauleitung & Planer KEINE Änderungen mehr vornehmen.')) return;
  // Entsperren gibt das Protokoll nur wieder zur Bearbeitung frei.
  // Es loescht NICHTS mehr: die Prueferunterschrift bleibt stehen, eine
  // bereits geleistete Abnahme ebenso, und das Protokoll bleibt vor dem
  // Loeschen geschuetzt. Frueher wurde hier p.signature genullt — damit
  // war ein wieder entsperrtes altes Protokoll tatsaechlich "weg".
  if(!willLock && (p.signature || p.abnahme)){
    const wer = (p.signature && p.signature.name) ? p.signature.name : 'dem Prüfer';
    if(!await appFrage('Protokoll zur Endbearbeitung entsperren?\n\n'
      + 'Die Unterschrift von ' + wer + ' bleibt erhalten und steht weiter auf dem Ausdruck.\n'
      + 'Das Protokoll bleibt vor dem Löschen geschützt.')) return;
  }
   p.locked = willLock;
  if(willLock){
    p.locked_by = currentUser ? currentUser.email : 'admin';
    p.locked_at = new Date().toISOString();
    p.geschuetzt = true;
  } else {
    p.locked_by = null;
    p.locked_at = null;
    p.geschuetzt = true;   // bleibt bestehen — siehe oben
  }
   p.updated_at = new Date().toISOString();
   saveProjectsLocal();
  let synced = true;
  if(supabaseClient && currentUser){
    synced = await saveProjectToCloud(CURRENT_PROJECT_ID);
  }
  if(willLock){
    toast(synced ? 'Messprotokoll gesperrt' : 'Gesperrt — nur lokal gespeichert, Sync steht noch aus');
  } else {
    const behalten = (p.signature || p.abnahme) ? ' — Unterschriften bleiben erhalten' : '';
    toast(synced ? ('Zur Endbearbeitung entsperrt' + behalten) : 'Entsperrt — nur lokal gespeichert, Sync steht noch aus');
  }
  renderMatrix();
  updateLockUI();
  updateRoleHint();
}

function updateLockUI(){
  const p = getCurrentProject();
  const locked = !!(p && p.locked);
  
  // Ein entsperrtes, aber bereits unterschriebenes Protokoll braucht einen
  // eigenen Hinweis — sonst sieht es aus wie ein ganz normales offenes.
  const endBanner = g('endbearbeitung-banner');
  if(endBanner){
    const inEndbearbeitung = !locked && p && (p.signature || p.abnahme);
    endBanner.style.display = inEndbearbeitung ? 'flex' : 'none';
    if(inEndbearbeitung){
      const pruefer = esc((p.signature && p.signature.name) || '—');
      g('endbearbeitung-text').innerHTML = `<strong>Endbearbeitung</strong> &middot; Prüfer <strong>${pruefer}</strong> `
        + `bleibt auf dem Protokoll &middot; Unterschrift und Löschschutz bleiben erhalten`;
    }
  }

  const banner = g('lock-banner');
  if(banner){
    banner.classList.toggle('active', locked);
    if(locked){
      const lockedBy = p.locked_by || 'Admin';
      const lockedAt = p.locked_at ? new Date(p.locked_at).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
      const thumb = sig => sig && sig.dataUrl ? `<img src="${sig.dataUrl}" alt="Unterschrift" style="height:28px;vertical-align:middle;margin-left:8px;background:#fff;border-radius:4px;padding:2px 6px;">` : '';
      const teile = [];
      if(p.signature) teile.push(`Prüfer <strong>${esc(p.signature.name)}</strong>${thumb(p.signature)}`);
      if(p.abnahme)   teile.push(`Abnahme <strong>${esc(p.abnahme.name)}</strong>${thumb(p.abnahme)}`);
      const kopf = p.abnahme ? 'Protokoll abgeschlossen'
                 : (p.signature ? 'Freigegeben zur Endbearbeitung' : 'Messprotokoll gesperrt');
      g('lock-banner-text').innerHTML = teile.length
        ? `<strong>${kopf}</strong> &middot; ${teile.join(' &middot; ')}`
        : `<strong>${kopf}</strong> &middot; gesperrt durch <strong>${esc(lockedBy)}</strong> am <strong>${esc(lockedAt)}</strong>`;
      const unlockBtn = g('lock-banner-unlock');
      if(unlockBtn) unlockBtn.style.display = darf('sperren') ? 'inline-flex' : 'none';
    }
  }
  
  const lockBtn = g('btn-protocol-lock');
  const lockIcon = g('protocol-lock-icon');
  const lockText = g('protocol-lock-text');
  if(lockBtn && lockIcon && lockText){
    if(locked){
      lockIcon.textContent = '';
      lockText.textContent = 'Protokoll gesperrt';
      lockBtn.classList.add('locked');
    } else {
      lockIcon.textContent = '';
      lockText.textContent = 'Protokoll sperren';
      lockBtn.classList.remove('locked');
    }
  }

  const signBtn = g('btn-sign');
  if(signBtn){
    const abnahmeMoeglich = istAbnahmeSchritt(p);
    const zeigen = canEditMeasurement() && !(p && p.abnahme) && (!locked || abnahmeMoeglich);
    signBtn.style.display = zeigen ? 'inline-flex' : 'none';
    const lbl = signBtn.querySelector('span:last-child');
    if(lbl) lbl.textContent = abnahmeMoeglich ? 'Abnahme unterschreiben' : 'Unterschreiben';
  }

  // + WR Button: nur wenn Hardware bearbeitet werden darf
  const addWrBtn = g('btn-add-wr');
  if(addWrBtn) addWrBtn.style.display = canEditHardware() ? 'inline-flex' : 'none';

  const sbLock = g('sb-proj-lock');
  if(sbLock) sbLock.style.display = locked ? 'inline' : 'none';
  
  // Auf dem Ausdruck stehen beide Unterschriften — und zwar auch dann,
  // wenn das Protokoll gerade zur Endbearbeitung entsperrt ist. Wer
  // gemessen hat, bleibt als Pruefer sichtbar.
  const printStamp = g('print-lock-stamp');
  if(printStamp){
    const feld = (sig, rolle) => sig
      ? `<div style="display:inline-block;margin:0 18px;text-align:center;vertical-align:top;">`
        + (sig.dataUrl ? `<img src="${sig.dataUrl}" alt="Unterschrift" style="height:36px;background:#fff;border-radius:4px;padding:2px 8px;display:block;margin:0 auto 4px;">` : '')
        + `<div><strong>${esc(sig.name)}</strong> &middot; ${esc(rolle)}<br>`
        + `digital unterschrieben am ${esc(new Date(sig.at).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' }))}</div></div>`
      : '';
    if(p && (p.signature || p.abnahme)){
      const kopf = p.abnahme ? 'MESSPROTOKOLL ABGESCHLOSSEN'
                 : (locked ? 'MESSPROTOKOLL FREIGEGEBEN' : 'IN ENDBEARBEITUNG');
      printStamp.innerHTML = `${kopf}<div style="margin-top:8px;">${feld(p.signature, 'Prüfer')}${feld(p.abnahme, 'Abnahme')}</div>`;
    } else if(locked){
      const lockedBy = p.locked_by || 'Admin';
      const lockedAt = p.locked_at ? new Date(p.locked_at).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
      printStamp.innerHTML = `MESSPROTOKOLL GESPERRT &middot; Freigegeben durch <strong>${esc(lockedBy)}</strong> am <strong>${esc(lockedAt)}</strong>`;
    } else {
      printStamp.innerHTML = '';
    }
  }
  
  document.body.classList.toggle('protocol-locked', locked && !canEditMeasurement());
}

let sigCtx = null;
let sigDrawing = false;
let sigHasContent = false;

function initSignatureCanvas(){
  const canvas = g('sig-canvas');
  if(!canvas) return;
  sigCtx = canvas.getContext('2d');
  sigCtx.clearRect(0, 0, canvas.width, canvas.height);
  sigCtx.lineWidth = 2.5;
  sigCtx.lineCap = 'round';
  sigCtx.lineJoin = 'round';
  sigCtx.strokeStyle = '#111111';
  sigHasContent = false;

  const getPos = (evt) => {
    const rect = canvas.getBoundingClientRect();
    const clientX = evt.touches ? evt.touches[0].clientX : evt.clientX;
    const clientY = evt.touches ? evt.touches[0].clientY : evt.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  };

  const start = (evt) => {
    evt.preventDefault();
    sigDrawing = true;
    const p = getPos(evt);
    sigCtx.beginPath();
    sigCtx.moveTo(p.x, p.y);
  };
  const move = (evt) => {
    if(!sigDrawing) return;
    evt.preventDefault();
    const p = getPos(evt);
    sigCtx.lineTo(p.x, p.y);
    sigCtx.stroke();
    sigHasContent = true;
  };
  const end = (evt) => { if(evt) evt.preventDefault(); sigDrawing = false; };

  canvas.onmousedown = start;
  canvas.onmousemove = move;
  canvas.onmouseup = end;
  canvas.onmouseleave = end;
  canvas.ontouchstart = start;
  canvas.ontouchmove = move;
  canvas.ontouchend = end;
  canvas.ontouchcancel = end;
}

function clearSignatureCanvas(){
  if(!sigCtx) return;
  const canvas = g('sig-canvas');
  sigCtx.clearRect(0, 0, canvas.width, canvas.height);
  sigHasContent = false;
}

// Zwei Stufen: der Pruefer misst und unterschreibt zuerst — seine
// Unterschrift bleibt danach unveraendert stehen. Der Admin bearbeitet
// anschliessend final und leistet die Abnahme als ZWEITE Unterschrift.
function istAbnahmeSchritt(proj){
  return !!(proj && proj.signature && !proj.abnahme && currentUserRole === 'admin');
}

function openSignatureModal(){
  if(!darf('unterschreiben')) return toast('Keine Berechtigung zum Unterschreiben');
  if(!canEditMeasurement()) return toast('Keine Berechtigung zum Unterschreiben');
  const proj = getCurrentProject();
  if(!proj) return;
  const abnahme = istAbnahmeSchritt(proj);
  if(proj.abnahme) return toast('Protokoll ist bereits abgenommen');
  if(isProtocolLocked() && !abnahme) return toast('Protokoll ist bereits gesperrt');

  const setTxt = (id, html) => { const el = g(id); if(el) el.innerHTML = html; };
  if(abnahme){
    const pruefer = esc((proj.signature && proj.signature.name) || 'Prüfer');
    setTxt('sig-title', 'Abnahme unterschreiben');
    setTxt('sig-intro', 'Geprüft und gemessen hat <strong>' + pruefer + '</strong> — '
      + 'diese Unterschrift bleibt unverändert auf dem Protokoll stehen. '
      + 'Du unterzeichnest hier die <strong>Abnahme</strong>. Danach ist das Protokoll abgeschlossen.');
    setTxt('sig-name-label', 'Name (Abnahme)');
    setTxt('sig-confirm-btn', 'Abnahme unterschreiben');
  } else {
    setTxt('sig-title', 'Digital unterschreiben');
    setTxt('sig-intro', 'Mit der Unterschrift bestätigst du die Richtigkeit der eingetragenen Messwerte '
      + 'und gibst das Protokoll zur Endbearbeitung frei. Du bleibst als <strong>Prüfer</strong> auf dem '
      + 'Protokoll stehen — auch wenn danach noch etwas geändert wird.');
    setTxt('sig-name-label', 'Name (Prüfer)');
    setTxt('sig-confirm-btn', 'Signieren & freigeben');
  }
  const nameField = g('sig-name');
  if(nameField) nameField.value = anzeigeName();
  g('signature-modal').classList.add('show');
  requestAnimationFrame(initSignatureCanvas);
}
function closeSignatureModal(e){ if(!e || e.target === e.currentTarget) g('signature-modal').classList.remove('show'); }

async function confirmSignature(){
  const canvas = g('sig-canvas');
  const name = (g('sig-name').value || '').trim();
  if(!name) return toast('Bitte Namen eingeben');
  if(!sigHasContent) return toast('Bitte im Feld unterschreiben');
  const proj = getCurrentProject();
  if(!proj) return;
  const nowIso = new Date().toISOString();
  const eintrag = {
    dataUrl: canvas.toDataURL('image/png'),
    name,
    email: currentUser ? currentUser.email : null,
    at: nowIso
  };
  const abnahme = istAbnahmeSchritt(proj);
  if(abnahme){
    // Die Prueferunterschrift wird bewusst NICHT angefasst.
    proj.abnahme = eintrag;
  } else {
    proj.signature = eintrag;
    proj.freigabe = { name, email: currentUser ? currentUser.email : null, at: nowIso };
  }
  proj.locked = true;
  proj.geschuetzt = true;
  proj.locked_by = `${name} (digital unterschrieben)`;
  proj.locked_at = nowIso;
  proj.updated_at = nowIso;
  saveProjectsLocal();
  closeSignatureModal();
  let synced = true;
  if(supabaseClient && currentUser){
    synced = await saveProjectToCloud(CURRENT_PROJECT_ID);
  }
  renderMatrix();
  updateLockUI();
  updateRoleHint();
  toast(synced
    ? (abnahme ? 'Abnahme unterschrieben — Protokoll abgeschlossen'
               : 'Unterschrieben & freigegeben — Messprotokoll ist gesperrt')
    : 'Unterschrieben (nur lokal gespeichert) — bitte Verbindung prüfen und erneut synchronisieren');
}

function updateRoleHint(){
  const banner = g('role-hint-banner');
  if(!banner) return;
  if(currentUserRole === 'site'){
    banner.style.display = 'flex';
    g('role-hint-text').textContent = isProtocolLocked()
      ? 'Protokoll gesperrt — keine Änderungen möglich.'
      : 'Bauleitungs-Modus: Du kannst nur Messwerte (Uoc/Isc/Riso) und Bemerkungen eintragen. Hardware ist read-only.';
  } else {
    banner.style.display = 'none';
  }
}

// Performance: Debounced Rendering
let renderMatrixTimeout = null;
function renderMatrixDebounced(remoteOverride = null, delay = 100){
  clearTimeout(renderMatrixTimeout);
  renderMatrixTimeout = setTimeout(() => {
    const active = document.activeElement;
    const tables = g('tables');
    // Auf dem Handy: NICHT neu aufbauen, während gerade ein Feld fokussiert ist —
    // das zerstört das Eingabefeld, wodurch die Bildschirmtastatur zuklappt und
    // die Seite sichtbar "springt", selbst wenn wir die Scrollposition restaurieren.
    // Stattdessen einmalig warten, bis das Feld tatsächlich verlassen wird.
    if(active && tables && tables.contains(active) && (active.tagName === 'INPUT' || active.tagName === 'SELECT')){
      active.addEventListener('blur', () => renderMatrix(remoteOverride), { once: true });
      return;
    }
    renderMatrix(remoteOverride);
  }, delay);
}

function renderMatrix(remoteOverride = null){
  const wp = getCurrentWp();
  const plan = getCurrentPlan();
  const canHardware = canEditHardware();
  const canRename = canRenameInverter();
  const canMeasure = canEditMeasurement();
  const protocolLocked = isProtocolLocked();
  
  if(remoteOverride){
    Object.keys(remoteOverride).forEach(k => { if(APP_STATE[k]) APP_STATE[k] = { ...APP_STATE[k], ...remoteOverride[k] }; });
  }

  const container = g('tables');
  const _savedScrollY = window.scrollY;
  container.innerHTML = '';
  
  let totMods = 0, totPwr = 0, totActive = 0, totSlots = 0;
  const wrKeys = Object.keys(plan).map(Number).filter(n => !isNaN(n)).sort((a,b)=>a-b);

  if(wrKeys.length === 0){
    container.innerHTML = `<div style="text-align:center; padding:40px; color:var(--muted);">Kein Projekt geöffnet.<div style="margin-top:14px;"><button class="btn btn-primary" onclick="switchMainTab(${CURRENT_BEREICH ? "'home'" : "'projects'"})">Projekt wählen</button></div></div>`;
    window.scrollTo(0, _savedScrollY);
    return;
  }

  wrKeys.forEach(wr => {
    const wrData = plan[wr];
    const isLegacy = Array.isArray(wrData);
    const mppts = isLegacy ? 12 : (wrData.mppts || 12);
    const inputs = isLegacy ? 2 : (wrData.inputs || 2);
    
    const bl = document.createElement('div');
    bl.className = 'wr-block' + (protocolLocked ? ' protocol-locked-block' : '');
    bl.dataset.wrId = wr;
    
    let rowsHtml = '';
    let wrMods = 0, wrPwr = 0, activeStrings = 0;

    for(let m = 1; m <= mppts; m++){
      // Der Wechselrichter steht bewusst mit drin: diese Zeile klebt beim
      // Scrollen oben fest und ist damit die einzige Standanzeige, die man
      // braucht — ohne dass etwas ueber dem Inhalt schwebt.
      // Eigener <tbody> je MPPT: nur so schiebt die naechste klebende
      // Ueberschrift die vorherige heraus, statt sich darueberzulegen.
      rowsHtml += `<tbody class="matrix-tbody mppt-gruppe">`;
      rowsHtml += `<tr class="mppt-header"><td colspan="9"><span class="mh-wr">${esc(wrData.name || ('WR ' + wr))}</span><span class="mh-sep">·</span>MPPT ${m}</td></tr>`;

      for(let s = 1; s <= inputs; s++){
        const id = `${wr}.${m}.${s}`;
        if(!APP_STATE[id]) continue;
        totSlots++;
        const item = APP_STATE[id];
        const isJa = item.stat === 'JA';
        const stringStatus = getStringStatus(id);
        const rowStatusCls = stringStatus === 'NEIN' ? 'row-nein' : (stringStatus === 'INCOMPLETE' ? 'row-incomplete' : (stringStatus === 'ERROR' ? 'row-error' : 'row-complete'));
        const pwr = (isJa && item.mod > 0) ? ((item.mod * wp)/1000).toFixed(2) : '—';
        const strLabel = item.planName ? `<span class="str-label">${esc(item.planName)}</span>` : `<span class="str-label" style="opacity:0.3;">—</span>`;
        
        if(isJa && item.mod > 0) {
           wrMods += item.mod; totMods += item.mod;
           wrPwr += (item.mod * wp)/1000; totPwr += (item.mod * wp)/1000;
           activeStrings++; totActive++;
        }

        const gakRO = !canHardware;
        const modRO = !canHardware;
        const togDis = !canHardware;
        const uocRO = !canMeasure;
        const iscRO = !canMeasure;
        const risoRO = !canMeasure;
        const noteRO = !canMeasure;

        const roAttr = f => f ? 'readonly' : '';
        const disAttr = f => f ? 'disabled' : '';

        rowsHtml += `
          <tr id="row-${id}" class="${rowStatusCls} matrix-virtual-row" data-wr="${wr}" data-mppt="${m}" data-string="${s}" data-string-id="${id}" role="row" aria-label="String ${id} - Status: ${stringStatus}">
            <td data-label="Klemme" style="text-align:left; padding-left:6px; width:12%;">
               <div style="display:flex;flex-direction:column;gap:1px;">
                 <span><span class="string-id" style="font-size:0.85rem;" aria-label="String-ID: ${id}">${id}</span><span class="flag-slot no-print" id="flag-${id}"></span></span>
                 ${strLabel}
               </div>
            </td>
            <td data-label="GAK" style="width:12%;">
               <input type="text" id="gak-${id}" value="${esc(item.gak)}" class="sp-inp sp-inp-center sp-inp-gak" style="padding:3px;" list="gak-suggestions-${wr}" onchange="saveData('${id}', 'gak', this.value)" onkeydown="handleMeasureKeydown(event, '${id}', 'gak')" ${roAttr(gakRO)} placeholder="GAK eingeben...">
               <datalist id="gak-suggestions-${wr}">
                 ${generateGakSuggestions(wr, mppts, inputs)}
               </datalist>
                <span class="print-cell">${esc(item.gak)}</span>
            </td>
            <td data-label="Aktiv" class="no-print" style="width:12%;">
              <div class="tog-wrap" style="transform:scale(0.85);">
                <button id="tja-${id}" class="tog ${isJa?'on-ja':''}" onclick="setStat('${id}','JA')" ${disAttr(togDis)}>JA</button>
                <button id="tnei-${id}" class="tog ${!isJa?'on-nei':''}" onclick="setStat('${id}','NEIN')" ${disAttr(togDis)}>NEIN</button>
              </div>
            </td>
            <td data-label="Module" style="width:8%;">
               <input type="number" min="0" max="100" step="1" id="mod-${id}" value="${esc(item.mod||'')}" class="sp-inp sp-inp-center" style="padding:3px;" onchange="saveData('${id}', 'mod', this.value); updateKPIs();" onkeydown="handleMeasureKeydown(event, '${id}', 'mod')" ${roAttr(modRO)}>
               <span class="print-cell" id="pm-${id}">${item.mod > 0 ? item.mod : '—'}</span>
            </td>
            <td data-label="kWp" class="pwr-cell" style="width:8%;" id="pw-${id}">${pwr}</td>
            <td data-label="Uoc(V)" class="col-hide-print" style="width:10%;">
               <input type="text" inputmode="decimal" id="uoc-${id}" placeholder="–" enterkeyhint="next" autocomplete="off" value="${esc(item.uoc||'')}" class="sp-inp sp-inp-center" style="padding:3px;" onchange="saveData('${id}', 'uoc', this.value)" onkeydown="handleMeasureKeydown(event, '${id}', 'uoc')" ${roAttr(uocRO)}>
                <span class="print-cell" id="puoc-${id}">${esc(item.uoc||'')}</span>
            </td>
            <td data-label="Isc(A)" class="col-hide-print" style="width:10%;">
               <input type="text" inputmode="decimal" id="isc-${id}" placeholder="–" enterkeyhint="next" autocomplete="off" value="${esc(item.isc||'')}" class="sp-inp sp-inp-center" style="padding:3px;" onchange="saveData('${id}', 'isc', this.value)" onkeydown="handleMeasureKeydown(event, '${id}', 'isc')" ${roAttr(iscRO)}>
                <span class="print-cell" id="pisc-${id}">${esc(item.isc||'')}</span>
            </td>
            <td data-label="Riso(MΩ)" class="col-hide-print" style="width:10%;">
               <input type="text" inputmode="decimal" id="riso-${id}" placeholder="–" enterkeyhint="next" autocomplete="off" value="${esc(item.riso||'')}" class="sp-inp sp-inp-center" style="padding:3px;" onchange="saveData('${id}', 'riso', this.value)" onkeydown="handleMeasureKeydown(event, '${id}', 'riso')" ${roAttr(risoRO)}>
                <span class="print-cell" id="priso-${id}">${esc(item.riso||'')}</span>
            </td>
            <td data-label="Info" class="col-note" style="text-align:left; width:18%;">
               <input type="text" id="note-${id}" value="${esc(item.note||'')}" class="sp-inp" style="text-align:left;padding:3px;" oninput="saveData('${id}', 'note', this.value)" onkeydown="handleMeasureKeydown(event, '${id}', 'note')" ${roAttr(noteRO)}>
               <span class="print-cell" id="pnote-${id}" style="font-size:7pt;color:#71717a;">${esc(item.note||'')}</span>
            </td>
          </tr>`;
      }
      rowsHtml += `</tbody>`;
    }

    bl.innerHTML = `
      <div class="wr-head">
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="wr-num" style="cursor:${canHardware ? 'pointer' : (canRename ? 'pointer' : 'default')};" onclick="${canHardware ? `openInverterEditor(${wr})` : (canRename ? `renameInverterQuick(${wr})` : 'void(0)')}" title="${canHardware ? 'Wechselrichter bearbeiten' : (canRename ? 'Namen ändern' : '')}">${esc(wrData.name || 'WR ' + wr)}</span>
          ${canHardware ? `<button class="wr-edit-btn" onclick="openInverterEditor(${wr})" title="Wechselrichter bearbeiten (MPPTs, Eingänge, löschen)">${ICON.gear}</button>` : (canRename ? `<button class="wr-edit-btn" onclick="renameInverterQuick(${wr})" title="Wechselrichter-Namen ändern">${ICON.pencil}</button>` : '')}
          <span class="wr-kpis">${activeStrings} Strings &middot; ${mppts} MPPTs</span>
          <span class="wr-foto-leiste no-print"><button type="button" class="wr-foto-btn" onclick="fotoAufnehmen(${wr})" title="Foto zum Wechselrichter aufnehmen" aria-label="Foto zu ${esc(wrData.name || 'WR ' + wr)} aufnehmen">${ICON.camera}</button><span class="wr-fotos" data-wr="${wr}"></span></span>
        </div>
        <div class="wr-kpis"><strong id="wr-pwr-${wr}" style="color:var(--accent);">${wrPwr.toFixed(2)} kWp</strong></div>
      </div>
      <div id="wr-progress-wrap-${wr}">${generateWrProgress(wr, mppts, inputs)}</div>
      ${canHardware ? `
      <div class="wr-bulk-bar no-print">
        <span class="bulk-label">Bulk:</span>
        <div class="bulk-dropdown">
          <button class="bulk-dropdown-btn" onclick="toggleBulkDropdown(${wr})">
            <span>Aktionen</span>
            <span>▼</span>
          </button>
          <div class="bulk-dropdown-menu" id="bulk-dropdown-${wr}">
            <button class="bulk-dropdown-item" onclick="bulkSetStat(${wr}, 'JA'); toggleBulkDropdown(${wr});">
              <span></span> <span>Alle auf JA</span>
            </button>
            <button class="bulk-dropdown-item" onclick="bulkSetStat(${wr}, 'NEIN'); toggleBulkDropdown(${wr});">
              <span></span> <span>Alle auf NEIN</span>
            </button>
            <div class="bulk-dropdown-divider"></div>
            <button class="bulk-dropdown-item" onclick="bulkSetModules(${wr}); toggleBulkDropdown(${wr});">
              <span></span> <span>Module setzen...</span>
            </button>
            <button class="bulk-dropdown-item" onclick="bulkApplyGakSchema(${wr}); toggleBulkDropdown(${wr});">
              <span></span> <span>GAK-Schema anwenden</span>
            </button>
            <div class="bulk-dropdown-divider"></div>
            <button class="bulk-dropdown-item danger" onclick="bulkClearMeasurements(${wr}); toggleBulkDropdown(${wr});">
              <span></span> <span>Messwerte löschen (WR ${wr})</span>
            </button>
            <button class="bulk-dropdown-item danger" onclick="bulkClearAllNotes(); toggleBulkDropdown(${wr});">
              <span></span> <span>Alle Bemerkungen löschen</span>
            </button>
          </div>
        </div>
      </div>` : ''}
      <div style="overflow-x:auto;" class="matrix-virtual-scroll">
        <table class="mt">
          <thead><tr>
            <th style="text-align:left;padding-left:8px;width:15%;">Klemme</th><th style="width:12%;">GAK</th>
            <th class="no-print" style="width:12%;">Aktiv</th>
            <th style="width:8%;">Mods</th><th style="width:8%;">kWp</th>
            <th class="col-hide-print" style="width:10%;">Uoc(V)</th><th class="col-hide-print" style="width:10%;">Isc(A)</th>
            <th class="col-hide-print" style="width:10%;">Riso(MΩ)</th><th style="text-align:left;width:15%;">Bemerkung</th>
          </tr></thead>
          ${rowsHtml}
        </table>
      </div>`;
    container.appendChild(bl);
  });
  
  g('d-pwr').textContent = totPwr.toFixed(2);
  g('d-mods').textContent = totMods;
  g('d-act').textContent = totActive;
  g('d-tot').textContent = totSlots;

  buildFilterBar();
  setupScrollContext();
  // updateKPIs() statt nur der vier Zahlen oben: nur dort werden auch die
  // kompakte Sticky-Leiste (Handy) und die Fortschrittsbalken mitgezogen.
  updateKPIs();
  applyMeasurementFlags(); // Grenzwert-Alarm nach jedem Tabellen-Neuaufbau setzen
  if(typeof fotoMatrixGerendert === 'function') fotoMatrixGerendert();
  // Scrollposition wiederherstellen — sonst springt die Ansicht bei jedem
  // erfolgreichen Auto-Save (nur mit Internetverbindung möglich) nach oben,
  // weil die Seite beim Neuaufbau kurz sehr klein wird und der Browser den
  // Scroll-Stand dabei zurücksetzt. Auf dem iPhone klappt beim Neuaufbau oft
  // gerade die Bildschirmtastatur zu — Safari verschiebt die Ansicht dabei noch
  // eine Weile lang selbst nach, daher hier mehrfach nachkorrigieren statt nur
  // einmal.
  const _restoreScroll = () => window.scrollTo(0, _savedScrollY);
  requestAnimationFrame(_restoreScroll);
  setTimeout(_restoreScroll, 60);
  setTimeout(_restoreScroll, 180);
  setTimeout(_restoreScroll, 350);
}

let scrollContextFrame = null;
function updateScrollContext(){
  const context = g('scroll-context');
  const label = g('scroll-context-text');
  if(!context || !label || !g('matrix-view').classList.contains('active')) return;
  // Fester Bezugspunkt statt der eigenen Position der Anzeige: vorher las die
  // Funktion ihr eigenes Rechteck aus, was ein Zirkelschluss ist — sobald die
  // Anzeige verrutscht, zeigt sie den falschen String an.
  const anchor = Math.min(window.innerHeight * 0.32, 220);
  const rows = [...document.querySelectorAll('tr[data-string-id]')]
    .filter(row => row.offsetParent !== null)
    .map(row => ({ row, rect: row.getBoundingClientRect() }));
  // Ganz unten angekommen erreichen die letzten Strings den Bezugspunkt nie –
  // dann gilt der letzte String, der noch vollstaendig im Bild ist.
  const amEnde = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
  const imBild = rows.filter(({ rect }) => rect.bottom <= window.innerHeight);
  const active = (amEnde && imBild.length ? imBild[imBild.length - 1] : null)
    || rows.find(({ rect }) => rect.bottom >= anchor) || rows[rows.length - 1];
  if(!active){ context.hidden = true; return; }
  const { wr, mppt, string, stringId } = active.row.dataset;
  label.textContent = `WR ${wr} · MPPT ${mppt} · String ${string} (${stringId})`;
  context.hidden = false;
}

// Nach-oben-Knopf: erscheint erst, wenn es sich lohnt, und bringt einen
// in einem Rutsch an den Anfang der Matrix zurueck.
function scrollToTop(){
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
}

function updateToTopButton(){
  const b = g('to-top');
  if(!b) return;
  b.classList.toggle('show', window.scrollY > 500);
}

function scheduleScrollContext(){
  if(scrollContextFrame) return;
  scrollContextFrame = requestAnimationFrame(() => {
    scrollContextFrame = null;
    updateScrollContext();
    updateToTopButton();
  });
}

function setupScrollContext(){
  window.removeEventListener('scroll', scheduleScrollContext);
  window.addEventListener('scroll', scheduleScrollContext, { passive: true });
  window.removeEventListener('resize', scheduleScrollContext);
  window.addEventListener('resize', scheduleScrollContext);
  requestAnimationFrame(updateScrollContext);
}

function generateGakSuggestions(wr, mppts, inputs){
  let options = '';
  for(let m = 1; m <= mppts; m++){
    for(let s = 1; s <= inputs; s++){
      const gakValue = `GAK ${wr}.${m}.${s}`;
      options += `<option value="${gakValue}">${gakValue}</option>`;
    }
  }
  return options;
}

function generateWrProgress(wrId, mppts, inputs){
  let complete = 0, incomplete = 0, inactive = 0;
  for(let m = 1; m <= mppts; m++){
    for(let s = 1; s <= inputs; s++){
      const status = getStringStatus(`${wrId}.${m}.${s}`);
      if(status === 'COMPLETE') complete++;
      else if(status === 'INCOMPLETE') incomplete++;
      else inactive++;
    }
  }
  const total = Math.max(mppts * inputs, 1);
  const pc = (complete / total * 100).toFixed(2);
  const pi = (incomplete / total * 100).toFixed(2);
  const pn = (inactive / total * 100).toFixed(2);
  return `
    <div class="wr-progress-bar">
      <div class="wr-progress-complete" style="width:${pc}%"></div>
      <div class="wr-progress-incomplete" style="width:${pi}%"></div>
      <div class="wr-progress-inactive" style="width:${pn}%"></div>
    </div>
    <div class="wr-progress-legend">
      <span>${complete} fertig</span>
      <span>${incomplete} offen</span>
      <span>${inactive} inaktiv</span>
    </div>`;
}

function generateMiniMap(wrId, mppts, inputs){ return generateWrProgress(wrId, mppts, inputs); }

// String-Status: 'NEIN' = inaktiv, 'INCOMPLETE' = aktiv aber Messwerte fehlen,
// 'COMPLETE' = aktiv + Mod > 0 + Uoc/Isc/Riso alle gefüllt, 'ERROR' = ungültige Werte
function getStringStatus(id){
  const it = APP_STATE[id];
  if(!it) return 'NEIN';
  if(it.stat !== 'JA') return 'NEIN';
  if(!it.mod || it.mod <= 0) return 'INCOMPLETE';
  
  // Validierung der Messwerte
  const uocValid = it.uoc && !isNaN(parseFloat(it.uoc.replace(',', '.'))) && parseFloat(it.uoc.replace(',', '.')) > 0;
  const iscValid = it.isc && !isNaN(parseFloat(it.isc.replace(',', '.'))) && parseFloat(it.isc.replace(',', '.')) > 0;
  const risoValid = it.riso && !isNaN(parseFloat(it.riso.replace(',', '.'))) && parseFloat(it.riso.replace(',', '.')) > 0;
  
  if(!uocValid || !iscValid || !risoValid) return 'INCOMPLETE';
  
  // Zusätzliche Validierung für ungültige Werte
  if(uocValid && (parseFloat(it.uoc.replace(',', '.')) > 2000)) return 'ERROR';
  if(iscValid && (parseFloat(it.isc.replace(',', '.')) > 100)) return 'ERROR';
  if(risoValid && (parseFloat(it.riso.replace(',', '.')) > 10000)) return 'ERROR';
  
  return 'COMPLETE';
}

/* ══════════════════════════════════════════════════════════════════════════
   GROBPRÜFUNG (Review 09/2026, überarbeitet)

   Absichtlich sparsam: Es wird nur angeschlagen, wenn ein Wert gar nicht
   sein KANN — nicht, wenn er vom Durchschnitt abweicht. Eine Prüfung, die
   ständig bei gesunden Strings blinkt, wird nach zwei Tagen ignoriert.

   1) RISO — echter Normgrenzwert.
      IEC 62446-1 verlangt bei Strings über 120 V mindestens 1,0 MΩ.
      Darunter ist es ein Isolationsfehler. Darüber ist alles in Ordnung,
      egal ob 5 oder 500 MΩ — hier wird nichts mehr gemeldet.

   2) UOC — reine Plausibilität gegen die Modulanzahl.
      Ein Modul liefert je nach Typ und Temperatur grob 25 bis 60 V
      Leerlaufspannung. Aus der Modulanzahl ergibt sich damit ein weiter,
      aber endlicher Rahmen. Der Sinn ist NICHT, knappe Abweichungen zu
      finden, sondern grobe Fehler: 800 V bei 7 Modulen sind rechnerisch
      114 V je Modul — das gibt es nicht, da stimmt die Modulanzahl oder
      der abgelesene Wert nicht.

   3) ISC — wird bewusst NICHT geprüft.
      Der Kurzschlussstrom hängt direkt von der Einstrahlung ab. Eine
      Wolke halbiert ihn. Jede Grenze wäre entweder wirkungslos oder
      würde bei jedem Wetterwechsel Fehlalarm schlagen.
   ══════════════════════════════════════════════════════════════════════════ */
const LIMIT_RISO_MIN = 1.0;       // MΩ — IEC 62446-1, harte Untergrenze
const UOC_PRO_MODUL_MIN = 25;     // V — großzügig untere Plausibilitätsgrenze
const UOC_PRO_MODUL_MAX = 60;     // V — großzügig obere Plausibilitätsgrenze

function toNum(v){
  const n = parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

// Bewertet einen String. Rueckgabe: { level:'ok'|'crit', fields:{}, msgs:[] }
function evaluateString(id){
  const res = { level: 'ok', fields: {}, msgs: [] };
  const it = APP_STATE[id];
  if(!it || it.stat !== 'JA') return res;

  const melde = (feld, text) => {
    res.fields[feld] = 'crit';
    res.msgs.push(text);
    res.level = 'crit';
  };

  // 1) Isolationswiderstand gegen die Normgrenze
  // 0 gilt — wie überall im Tool — als "noch nicht gemessen".
  const riso = toNum(it.riso);
  if(riso !== null && riso > 0 && riso < LIMIT_RISO_MIN){
    melde('riso', `Riso ${it.riso} MΩ liegt unter 1 MΩ — Isolationsfehler nach IEC 62446-1. Nicht freigeben.`);
  }

  // 2) Uoc nur grob gegen die Modulanzahl
  const mods = Number(it.mod) || 0;
  const u = toNum(it.uoc);
  if(u !== null && u > 0 && mods > 0){
    const jeModul = u / mods;
    if(jeModul < UOC_PRO_MODUL_MIN || jeModul > UOC_PRO_MODUL_MAX){
      melde('uoc', `${it.uoc} V bei ${mods} Modulen sind ${jeModul.toFixed(0)} V je Modul. `
        + `Plausibel sind rund ${UOC_PRO_MODUL_MIN}–${UOC_PRO_MODUL_MAX} V je Modul — `
        + `Modulanzahl oder abgelesener Wert prüfen.`);
    }
  }

  return res;
}

// Faerbt Zellen, setzt Badges, aktualisiert Auffaelligkeiten-Leiste.
let _flaggedIds = [];
function applyMeasurementFlags(){
  if(!APP_STATE || !Object.keys(APP_STATE).length) return;
  let nCrit = 0;
  _flaggedIds = [];

  Object.keys(APP_STATE).forEach(id => {
    const res = evaluateString(id);

    ['uoc', 'isc', 'riso'].forEach(f => {
      const el = g(`${f}-${id}`);
      if(!el) return;
      el.classList.remove('val-warn', 'val-crit');
      const lvl = res.fields[f];
      if(lvl) el.classList.add(lvl === 'crit' ? 'val-crit' : 'val-warn');
      el.title = lvl ? res.msgs.join('\n') : '';
    });

    const slot = g(`flag-${id}`);
    if(slot){
      if(res.level === 'ok'){
        slot.innerHTML = '';
      } else {
        const cls = res.level === 'crit' ? 'crit' : 'warn';
        const sym = res.level === 'crit' ? '!' : '?';
        slot.innerHTML = `<span class="flag-badge ${cls}" title="${esc(res.msgs.join(' \n'))}" aria-label="${esc(res.msgs.join(' '))}">${sym}</span>`;
      }
    }

    if(res.level === 'crit'){ nCrit++; _flaggedIds.push(id); }
  });

  _flaggedIds.sort((a, b) => {
    const pa = a.split('.').map(Number), pb = b.split('.').map(Number);
    return pa[0]-pb[0] || pa[1]-pb[1] || pa[2]-pb[2];
  });

  const bar = g('alarm-bar');
  if(bar){
    if(nCrit === 0){
      bar.style.display = 'none';
    } else {
      bar.style.display = 'flex';
      bar.classList.add('has-crit');
      bar.classList.remove('has-warn');
      bar.innerHTML = `<span></span><span><strong>${nCrit}</strong> ${nCrit === 1 ? 'Wert' : 'Werte'} unplausibel</span>`
        + `<button type="button" class="ab-jump" onclick="jumpToNextFlag()">Zum nächsten →</button>`;
    }
  }

  const ksFlags = g('ks-flags'), ksItem = g('ks-flag-item');
  if(ksFlags) ksFlags.textContent = String(nCrit);
  if(ksItem) ksItem.classList.toggle('is-crit', nCrit > 0);
}

// Springt der Reihe nach durch alle auffaelligen Strings
let _flagCursor = -1;
function jumpToNextFlag(){
  if(!_flaggedIds.length) return toast('Keine Auffälligkeiten');
  _flagCursor = (_flagCursor + 1) % _flaggedIds.length;
  const id = _flaggedIds[_flagCursor];
  const row = g(`row-${id}`);
  if(!row) return;
  // Falls der String hinter einem WR-Filter versteckt ist: Filter aufheben
  const block = row.closest('.wr-block');
  if(block && block.style.display === 'none'){
    const allBtn = document.querySelector('.wr-tab[data-wr="0"]');
    if(allBtn) filterInverter(0, allBtn);
  }
  row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.querySelectorAll('tr.row-focus').forEach(r => r.classList.remove('row-focus'));
  row.classList.add('row-focus');
  const target = g(`riso-${id}`) || g(`uoc-${id}`);
  if(target && !target.readOnly){ try { target.focus({ preventScroll: true }); target.select(); } catch(_){} }
  toast(`${_flagCursor + 1} von ${_flaggedIds.length}: String ${id}`);
}

let _inverterEditorWrId = null;
let _inverterEditorState = null;

function hasSlotData(wrId, m, s){
  const it = APP_STATE[`${wrId}.${m}.${s}`];
  if(!it) return false;
  return it.stat === 'JA' || !!(it.gak || it.mod || it.uoc || it.isc || it.riso || it.note);
}

function getMaxUsedMppt(wrId){
  const plan = getCurrentPlan();
  const data = plan[wrId];
  if(!data) return 0;
  const mppts = data.mppts || 12;
  const inputs = data.inputs || 2;
  let max = 0;
  for(let m = 1; m <= mppts; m++){
    for(let s = 1; s <= inputs; s++){
      if(hasSlotData(wrId, m, s)){ max = m; break; }
    }
  }
  return max;
}

function getMaxUsedInput(wrId, m){
  const plan = getCurrentPlan();
  const data = plan[wrId];
  if(!data) return 0;
  const inputs = data.inputs || 2;
  let max = 0;
  for(let s = 1; s <= inputs; s++){
    if(hasSlotData(wrId, m, s)) max = s;
  }
  return max;
}

// Sinnvolle Vorgaben für einen neu hinzugefügten Wechselrichter: gleiche Werte
// wie der zuletzt angelegte WR im Projekt, sonst die üblichen 12 MPPT / 2 Eingänge.
function getWrDefaultMppts(){
  const plan = getCurrentPlan();
  const wrKeys = Object.keys(plan).map(k => parseInt(k, 10)).filter(n => !isNaN(n));
  if(wrKeys.length){ const last = Math.max(...wrKeys); return (plan[last] && plan[last].mppts) || 12; }
  return 12;
}
function getWrDefaultInputs(){
  const plan = getCurrentPlan();
  const wrKeys = Object.keys(plan).map(k => parseInt(k, 10)).filter(n => !isNaN(n));
  if(wrKeys.length){ const last = Math.max(...wrKeys); return (plan[last] && plan[last].inputs) || 2; }
  return 2;
}

async function renameInverterQuick(wrId){
  if(!canRenameInverter()) return toast('Keine Berechtigung');
  const plan = getCurrentPlan();
  const data = plan[wrId];
  if(!data) return toast('Wechselrichter nicht gefunden');
  const current = data.name || `WR ${wrId}`;
  const input = await appEingabe(`Name für WR ${wrId}:`, current);
  if(input === null) return; // abgebrochen
  const newName = input.trim() || `WR ${wrId}`;
  if(newName === current) return;

  data.name = newName;
  const proj = getCurrentProject();
  if(proj) proj.updated_at = new Date().toISOString();
  saveProjectsLocal();
  renderMatrix();

  if(supabaseClient && currentUser){
    toast('Speichere...');
    const synced = await saveProjectToCloud(CURRENT_PROJECT_ID);
    toast(synced ? 'Name geändert' : 'Nur lokal gespeichert — Sync fehlgeschlagen, bitte Verbindung prüfen');
  } else {
    toast('Name geändert (nur lokal)');
  }
}

function openInverterEditor(wrId){
  if(!canEditHardware()) return toast('Keine Berechtigung');
  const plan = getCurrentPlan();
  const data = plan[wrId];
  if(!data) return toast('Wechselrichter nicht gefunden');
  if(Array.isArray(data)) return toast('Legacy-WR: bitte PVSOL-Import erneut ausführen');

  _inverterEditorWrId = wrId;
  _inverterEditorState = {
    name: data.name || `WR ${wrId}`,
    mppts: data.mppts || 12,
    inputs: data.inputs || 2
  };

  g('inverter-editor-title').textContent = `WR ${wrId} bearbeiten`;
  g('inv-edit-name').value = _inverterEditorState.name;
  g('inv-edit-mppts').value = _inverterEditorState.mppts;
  g('inv-edit-inputs').value = _inverterEditorState.inputs;

  refreshInverterEditorInfo();

  // Buttons je nach Rolle
  const admin = darf('wr_loeschen');
  g('inv-editor-delete-section').style.display = admin ? 'block' : 'none';

  refreshInverterEditorWarnings();
  g('inverter-editor-modal').classList.add('show');
}

function refreshInverterEditorInfo(){
  if(!_inverterEditorWrId) return;
  const wrId = _inverterEditorWrId;
  const plan = getCurrentPlan();
  const data = plan[wrId];
  if(!data) return;
  const usedMods = countActiveModulesForWr(wrId);
  const usedStr  = countActiveStringsForWr(wrId);
  g('inverter-editor-info').innerHTML = `
    <div class="inv-editor-info-cell">
      <span class="inv-editor-info-label">WR-Nr.</span>
      <span class="inv-editor-info-value">${wrId}</span>
    </div>
    <div class="inv-editor-info-cell">
      <span class="inv-editor-info-label">Aktive Strings</span>
      <span class="inv-editor-info-value">${usedStr}</span>
    </div>
    <div class="inv-editor-info-cell">
      <span class="inv-editor-info-label">Aktive Module</span>
      <span class="inv-editor-info-value">${usedMods}</span>
    </div>
    <div class="inv-editor-info-cell">
      <span class="inv-editor-info-label">Aktuelle Slots</span>
      <span class="inv-editor-info-value">${(data.mppts||12) * (data.inputs||2)}</span>
    </div>`;
}

function toggleEditorSlot(mppt, input){
  if(!_inverterEditorWrId) return;
  if(!canEditHardware()) return toast('Keine Berechtigung');
  const wrId = _inverterEditorWrId;
  const id = `${wrId}.${mppt}.${input}`;
  if(!APP_STATE[id]) return;
  const it = APP_STATE[id];
  const wasJa = it.stat === 'JA';
  it.stat = wasJa ? 'NEIN' : 'JA';
  refreshInverterEditorWarnings(); // refresht Slot-Grid + Info-Box
  // Mini-Feedback-Toast
  toast(wasJa ? `MPPT ${mppt}.${input} deaktiviert` : `MPPT ${mppt}.${input} aktiviert`);
}

function countActiveStringsForWr(wrId){
  let n = 0;
  Object.keys(APP_STATE).forEach(id => {
    if(id.startsWith(`${wrId}.`) && APP_STATE[id]?.stat === 'JA') n++;
  });
  return n;
}
function countActiveModulesForWr(wrId){
  let n = 0;
  Object.keys(APP_STATE).forEach(id => {
    if(id.startsWith(`${wrId}.`) && APP_STATE[id]?.mod > 0) n += APP_STATE[id].mod;
  });
  return n;
}

function closeInverterEditor(event){
  if(event && event.target !== event.currentTarget) return;
  _inverterEditorWrId = null;
  _inverterEditorState = null;
  g('inverter-editor-modal').classList.remove('show');
}

function stepperInverterValue(inputId, delta, min, max){
  const inp = g(inputId);
  if(!inp) return;
  const cur = parseInt(inp.value, 10) || 0;
  const next = Math.max(min, Math.min(max, cur + delta));
  inp.value = next;
  refreshInverterEditorWarnings();
}

function refreshInverterEditorWarnings(){
  if(!_inverterEditorState) return;
  refreshInverterEditorInfo();
  const wrId = _inverterEditorWrId;
  const newMppts = parseInt(g('inv-edit-mppts').value, 10) || 0;
  const newInputs = parseInt(g('inv-edit-inputs').value, 10) || 0;
  _inverterEditorState.mppts = newMppts;
  _inverterEditorState.inputs = newInputs;

  // Slot-Grid Vorschau: zeigt an welche Slots Daten hätten, ist klickbar
  const grid = g('inv-editor-slot-info');
  const limit = Math.min(newMppts * newInputs, 240); // hard cap Anzeige
  let html = '';
  for(let m = 1; m <= newMppts; m++){
    for(let s = 1; s <= newInputs; s++){
      if((m-1) * newInputs + s > limit) break;
      const has = hasSlotData(wrId, m, s);
      const stat = APP_STATE[`${wrId}.${m}.${s}`]?.stat || 'NEIN';
      const label = stat === 'JA' ? 'aktiv' : 'inaktiv';
      html += `<div class="inv-editor-slot ${has ? 'has-data' : ''}" onclick="toggleEditorSlot(${m}, ${s})" title="MPPT ${m} · Eingang ${s} — aktuell ${label}\nKlicken zum Umschalten">${m}.${s}</div>`;
    }
  }
  grid.innerHTML = html;

  // Warnungen
  const warnEl = g('inv-editor-warn');
  const plan = getCurrentPlan();
  const oldMppts = plan[wrId]?.mppts || 12;
  const oldInputs = plan[wrId]?.inputs || 2;
  const warnings = [];
  if(newMppts < oldMppts){
    const maxUsed = getMaxUsedMppt(wrId);
    if(newMppts < maxUsed){
      warnings.push(`Reduzierung von MPPT ${oldMppts} → ${newMppts} entfernt MPPT ${maxUsed}, das aktive Daten enthält. Diese Daten gehen verloren.`);
    } else {
      warnings.push(`MPPTs werden von ${oldMppts} auf ${newMppts} reduziert.`);
    }
  } else if(newMppts > oldMppts){
    warnings.push(`MPPTs werden von ${oldMppts} auf ${newMppts} erweitert (neue Slots sind zunächst leer).`);
  }
  if(newInputs < oldInputs){
    let lostMppts = [];
    for(let m = 1; m <= newMppts; m++){
      const maxUsedIn = getMaxUsedInput(wrId, m);
      if(maxUsedIn > newInputs) lostMppts.push(m);
    }
    if(lostMppts.length){
      warnings.push(`Reduzierung von ${oldInputs} → ${newInputs} Eingängen entfernt Eingang ${oldInputs} bei ${lostMppts.length} MPPT(s) (${lostMppts.slice(0,5).join(', ')}${lostMppts.length>5?'…':''}). Daten in diesen Slots gehen verloren.`);
    } else {
      warnings.push(`Eingänge werden von ${oldInputs} auf ${newInputs} reduziert.`);
    }
  } else if(newInputs > oldInputs){
    warnings.push(`Eingänge werden von ${oldInputs} auf ${newInputs} erweitert (neue Slots sind zunächst leer).`);
  }
  if(warnings.length){
    warnEl.innerHTML = `<div class="inv-editor-warn"><span class="inv-editor-warn-icon"></span><div>${warnings.map(w => `<div style="margin-top:2px;">${esc(w)}</div>`).join('')}</div></div>`;
    warnEl.hidden = false;
  } else {
    warnEl.hidden = true;
    warnEl.innerHTML = '';
  }
}

async function saveInverterEditor(){
  if(!_inverterEditorWrId) return;
  const wrId = _inverterEditorWrId;
  const plan = getCurrentPlan();
  const data = plan[wrId];
  if(!data) return;

  const newName   = (g('inv-edit-name').value || '').trim() || `WR ${wrId}`;
  const newMppts  = Math.max(1, Math.min(24, parseInt(g('inv-edit-mppts').value, 10) || 0));
  const newInputs = Math.max(1, Math.min(4,  parseInt(g('inv-edit-inputs').value, 10) || 0));

  const oldMppts  = data.mppts || 12;
  const oldInputs = data.inputs || 2;
  const shrinking = (newMppts < oldMppts) || (newInputs < oldInputs);

  if(shrinking){
    const maxUsedM = getMaxUsedMppt(wrId);
    if(newMppts < maxUsedM){
      if(!await appFrage(`Reduzierung entfernt MPPT ${maxUsedM}, das aktive Daten enthält.\n\nDiese Daten gehen UNWIDERRUFLICH verloren.\n\nTrotzdem fortfahren?`)) return;
    } else {
      if(!await appFrage(`MPPTs/Inputs reduzieren?\n\nSlots außerhalb der neuen Grenze werden entfernt.`)) return;
    }
  }

  data.name = newName;
  data.mppts = newMppts;
  data.inputs = newInputs;

  // Strings-Map bereinigen (überzählige Einträge entfernen)
  if(data.strings){
    Object.keys(data.strings).forEach(mKey => {
      const m = parseInt(mKey, 10);
      if(isNaN(m) || m > newMppts) { delete data.strings[mKey]; return; }
      const inp = data.strings[mKey];
      if(inp && typeof inp === 'object'){
        Object.keys(inp).forEach(sKey => {
          const s = parseInt(sKey, 10);
          if(isNaN(s) || s > newInputs) delete inp[sKey];
        });
      }
    });
  }

  // APP_STATE neu generieren (vorhandene Messwerte bleiben erhalten)
  regenerateAppStatePreservingMeasurements();

  // Persist
  const proj = getCurrentProject();
  if(proj){
    proj.plan = plan;
    proj.updated_at = new Date().toISOString();
    PROJECTS[CURRENT_PROJECT_ID] = proj;
    saveProjectsLocal();
    if(supabaseClient && currentUser) saveProjectToCloud(CURRENT_PROJECT_ID);
  }

  renderMatrix();
  toast(shrinking ? 'Wechselrichter angepasst (Daten in entfernten Slots gelöscht)' : 'Wechselrichter aktualisiert');
  closeInverterEditor();
}

function regenerateAppStatePreservingMeasurements(){
  // Erzeugt APP_STATE neu aus dem aktuellen Plan, behält aber
  // uoc/isc/riso/note aus den bereits existierenden Slots.
  const plan = getCurrentPlan();
  const oldState = { ...APP_STATE };
  const fresh = generateState(plan, true);
  Object.keys(fresh).forEach(id => {
    const prev = oldState[id];
    if(prev){
      // Messwerte + Bemerkung beibehalten
      if(prev.uoc)  fresh[id].uoc  = prev.uoc;
      if(prev.isc)  fresh[id].isc  = prev.isc;
      if(prev.riso) fresh[id].riso = prev.riso;
      if(prev.note) fresh[id].note = prev.note;
      // planName + gak beibehalten, wenn schon gefüllt
      if(prev.planName) fresh[id].planName = prev.planName;
      if(prev.gak && !/^GAK\s+\d+(\.\d+)?$/.test(prev.gak) && prev.gak !== `GAK ${id.split('.')[0]}`) fresh[id].gak = prev.gak;
    }
  });
  // Slots die nicht mehr im Plan vorkommen, gehen verloren (gewollt)
  APP_STATE = fresh;
}

async function confirmDeleteInverterFromEditor(){
  if(!_inverterEditorWrId) return;
  if(!darf('wr_loeschen')) return toast('Keine Berechtigung zum Löschen von Wechselrichtern');
  const wrId = _inverterEditorWrId;
  const plan = getCurrentPlan();
  const data = plan[wrId];
  if(!data) return;
  const activeStr = countActiveStringsForWr(wrId);
  const activeMod = countActiveModulesForWr(wrId);
  const msg = activeStr > 0
    ? `WR ${wrId} (${data.name || ''}) wirklich löschen?\n\n${activeStr} aktive Strings / ${activeMod} Module gehen verloren.\n\nDieser Schritt kann nicht rückgängig gemacht werden.`
    : `WR ${wrId} (${data.name || ''}) wirklich löschen?`;
  if(!await appFrage(msg)) return;
  deleteInverter(wrId, true);
  closeInverterEditor();
}

async function deleteInverter(wrId, skipConfirm){
  if(!darf('wr_loeschen')) return toast('Keine Berechtigung zum Löschen von Wechselrichtern');
  const plan = getCurrentPlan();
  if(!plan[wrId]) return;
  if(!skipConfirm){
    if(!await appFrage(`WR ${wrId} wirklich löschen? Alle Strings & Messwerte dieses WR gehen verloren.`)) return;
  }
  delete plan[wrId];
  // APP_STATE Slots dieses WR entfernen
  Object.keys(APP_STATE).forEach(id => {
    if(id.startsWith(`${wrId}.`)) delete APP_STATE[id];
  });
  const proj = getCurrentProject();
  if(proj){
    proj.plan = plan;
    proj.updated_at = new Date().toISOString();
    PROJECTS[CURRENT_PROJECT_ID] = proj;
    saveProjectsLocal();
    if(supabaseClient && currentUser) saveProjectToCloud(CURRENT_PROJECT_ID);
  }
  renderMatrix();
  toast(`WR ${wrId} gelöscht`);
}

function addNewInverter(){
  if(!canEditHardware()) return toast('Keine Berechtigung');
  const plan = getCurrentPlan();
  const wrKeys = Object.keys(plan).map(k => parseInt(k, 10)).filter(n => !isNaN(n)).sort((a,b) => a-b);
  const nextId = wrKeys.length ? (wrKeys[wrKeys.length - 1] + 1) : 1;
  if(nextId > 99) return toast('Maximum 99 Wechselrichter pro Projekt');

  // Default-Slots: alle inaktiv (damit nicht plötzlich 24 Phantom-Strings aktiv sind)
  const defMods = 0;
  plan[nextId] = {
    name: `WR ${nextId}`,
    mppts: getWrDefaultMppts(),
    inputs: getWrDefaultInputs(),
    defaultMods: defMods,
    strings: {}
  };
  // APP_STATE sofort initialisieren mit NEIN-Status
  APP_STATE = generateState(plan, true);

  const proj = getCurrentProject();
  if(proj){
    proj.plan = plan;
    proj.updated_at = new Date().toISOString();
    PROJECTS[CURRENT_PROJECT_ID] = proj;
    saveProjectsLocal();
    if(supabaseClient && currentUser) saveProjectToCloud(CURRENT_PROJECT_ID);
  }
  renderMatrix();
  buildFilterBar();
  toast(`WR ${nextId} hinzugefügt`);
  // Direkt Editor öffnen, damit der User Name/MPPTs anpassen kann
  openInverterEditor(nextId);
}

// Live-Update der Warnung, wenn der User tippt oder Stepper benutzt
document.addEventListener('input', (e) => {
  if(!_inverterEditorWrId) return;
  if(e.target && (e.target.id === 'inv-edit-mppts' || e.target.id === 'inv-edit-inputs')){
    refreshInverterEditorWarnings();
  }
});
document.addEventListener('change', (e) => {
  if(!_inverterEditorWrId) return;
  if(e.target && (e.target.id === 'inv-edit-mppts' || e.target.id === 'inv-edit-inputs')){
    refreshInverterEditorWarnings();
  }
});
// ESC schließt die Inverter-Editor-Modal
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape' && g('inverter-editor-modal')?.classList.contains('show')){
    closeInverterEditor();
  }
});

let cloudSyncTimeout = null;
const cloudSaveQueues = new Map();
const CLOUD_SYNC_DELAY = 600;

let _saveIndicatorTimer = null;
function showSaveIndicator(state){
  const el = g('save-indicator');
  const elD = g('save-indicator-desktop');
  const text = el ? el.querySelector('#save-text') || el.querySelector('.save-text') : null;
  const textD = elD ? elD.querySelector('.save-text') : null;
  const setText = (t) => { if(text) text.textContent = t; if(textD) textD.textContent = t; };
  if(!el && !elD) return;
  clearTimeout(_saveIndicatorTimer);

  if(state === 'saving' || state === 'syncing'){
    if(el) { el.classList.add('show','syncing'); el.classList.remove('saved'); }
    if(elD) { elD.classList.add('show','syncing'); elD.classList.remove('saved'); elD.style.display='inline-flex'; }
    setText('Speichere...');
  } else if(state === 'saved'){
    if(el) { el.classList.add('show','saved'); el.classList.remove('syncing'); }
    if(elD) { elD.classList.add('show','saved'); elD.classList.remove('syncing'); elD.style.display='inline-flex'; }
    setText('Gespeichert');
    _saveIndicatorTimer = setTimeout(() => {
      if(el){ el.classList.remove('show','saved'); }
      if(elD){ elD.classList.remove('show','saved'); }
    }, 2000);
  } else if(state === 'error'){
    if(el) { el.classList.add('show'); el.classList.remove('syncing','saved'); el.style.color='#ef4444'; el.style.background='rgba(239,68,68,0.15)'; }
    if(elD) { elD.classList.add('show'); elD.classList.remove('syncing','saved'); elD.style.color='#ef4444'; elD.style.background='rgba(239,68,68,0.15)'; elD.style.display='inline-flex'; }
    setText('Speicherfehler');
  } else if(state === 'pending'){
    if(el) { el.classList.add('show'); el.classList.remove('syncing','saved'); el.style.color='#eab308'; el.style.background='rgba(234,179,8,0.15)'; }
    if(elD) { elD.classList.add('show'); elD.classList.remove('syncing','saved'); elD.style.color='#eab308'; elD.style.background='rgba(234,179,8,0.15)'; elD.style.display='inline-flex'; }
    setText('Warte auf Sync...');
  }
}

// Tab-Reihenfolge durch alle Felder einer Zeile: gak → mod → uoc → isc → riso → note
const TAB_ORDER = ['gak', 'mod', 'uoc', 'isc', 'riso', 'note'];
function focusCellAtIndex(wrId, mppt, input, fieldIdx, selectAll = true){
  const field = TAB_ORDER[fieldIdx];
  const el = g(`${field}-${wrId}.${mppt}.${input}`);
  if(!el) return false;
  // readonly Inputs sind visuell deaktiviert: nicht hineintabben
  if(el.readOnly) return false;
  el.focus();
  if(selectAll && (el.type === 'text' || el.type === 'number')){
    try { el.select(); } catch(_) {}
  }
  // Aktive Zeile sichtbar markieren und in den Blick holen. Ohne das
  // verschwindet die fokussierte Zelle beim Enter-Durchlauf hinter dem
  // klebenden Tabellenkopf bzw. unter der Bildschirmtastatur.
  highlightActiveRow(`${wrId}.${mppt}.${input}`);
  return true;
}

function highlightActiveRow(id){
  document.querySelectorAll('tr.row-focus').forEach(r => r.classList.remove('row-focus'));
  const row = g(`row-${id}`);
  if(!row) return;
  row.classList.add('row-focus');
  const r = row.getBoundingClientRect();
  const topGuard = 185;                       // Kopfzeile + KPI-Leiste + MPPT-Zeile
  const bottomGuard = window.innerHeight - 120; // Platz fuer Tastatur/FAB
  if(r.top < topGuard || r.bottom > bottomGuard){
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}
function nextCellInMatrix(wrId, mppt, input, currentField, direction = 1){
  // Springt zum nächsten editierbaren Feld in Tab-Reihenfolge.
  // Springt über WR-/MPPT-/Eingang-Grenzen hinweg.
  const plan = getCurrentPlan();
  const wrKeys = Object.keys(plan).map(Number).filter(n => !isNaN(n) && !Array.isArray(plan[n])).sort((a,b)=>a-b);
  if(wrKeys.length === 0) return false;

  // Flat-Index über alle Zellen: row = (wr * 1e6 + mppt * 100 + input)
  const idxOf = (w, m, s) => wrKeys.indexOf(Number(w)) * 1e6 + Number(m) * 100 + Number(s);
  const curIdx = idxOf(wrId, mppt, input);

  // Versuche erst das nächste Feld in derselben Zeile
  const fIdx = TAB_ORDER.indexOf(currentField);
  if(direction === 1 && fIdx >= 0 && fIdx < TAB_ORDER.length - 1){
    if(focusCellAtIndex(wrId, mppt, input, fIdx + 1)) return true;
  }
  if(direction === -1 && fIdx > 0){
    if(focusCellAtIndex(wrId, mppt, input, fIdx - 1)) return true;
  }

  // Sonst: nächste/vorige Zeile (über WR + MPPT + Eingang iterieren)
  // Bestimme aktuelle Zeilen-Position
  const totalInputs = (plan[wrId]?.inputs) || 2;
  let nextWr = wrId, nextMppt = mppt, nextInput = input + direction;
  while(true){
    if(direction === 1){
      if(nextInput > totalInputs){ nextInput = 1; nextMppt += 1; }
      const wrData = plan[nextWr];
      if(!wrData || Array.isArray(wrData)) break;
      if(nextMppt > (wrData.mppts || 12)){
        nextMppt = 1;
        const wIdx = wrKeys.indexOf(Number(nextWr));
        if(wIdx < 0 || wIdx >= wrKeys.length - 1) return false;
        nextWr = wrKeys[wIdx + 1];
      }
    } else {
      if(nextInput < 1){
        const wrData = plan[nextWr];
        if(!wrData || Array.isArray(wrData)) break;
        nextInput = wrData.inputs || 2;
        nextMppt -= 1;
        if(nextMppt < 1){
          const wIdx = wrKeys.indexOf(Number(nextWr));
          if(wIdx <= 0) return false;
          nextWr = wrKeys[wIdx - 1];
          const prevData = plan[nextWr];
          if(!prevData || Array.isArray(prevData)) return false;
          nextMppt = prevData.mppts || 12;
          nextInput = prevData.inputs || 2;
        }
      }
    }
    // Versuche die aktuelle Zeile zu fokussieren (bevorzugt erstes Feld)
    const startField = direction === 1 ? 0 : TAB_ORDER.length - 1;
    if(focusCellAtIndex(nextWr, nextMppt, nextInput, startField)) return true;
    // Wenn das nicht klappt (z.B. readOnly), probiere andere Felder
    let found = false;
    for(let delta = 0; delta < TAB_ORDER.length; delta++){
      const tryIdx = direction === 1 ? delta : (TAB_ORDER.length - 1 - delta);
      if(focusCellAtIndex(nextWr, nextMppt, nextInput, tryIdx)){ found = true; break; }
    }
    if(found) return true;
    // Wenn gar nichts klappt, gehe zur nächsten Zeile
    if(direction === 1){
      nextInput += 1;
    } else {
      nextInput -= 1;
    }
  }
}

function handleMeasureKeydown(event, id, field){
  // Enter und Tab: vorwärts; Shift+Tab: rückwärts
  const isForward = (event.key === 'Enter') || (event.key === 'Tab' && !event.shiftKey);
  const isBackward = event.key === 'Tab' && event.shiftKey;
  if(!isForward && !isBackward) return;

  // Beim JA/NEIN-Toggle: Enter springt zum Mod-Feld
  if(field === 'tja' || field === 'tnei'){
    if(event.key === 'Enter'){
      event.preventDefault();
      const parts = id.split('.').map(Number);
      const target = g(`mod-${id}`);
      if(target){ target.focus(); try{target.select();}catch(_){} }
      return;
    }
    return;
  }

  // Bei Note: Shift+Tab geht zurück zu Riso, Enter springt zum nächsten String
  if(field === 'note'){
    if(isForward){
      event.preventDefault();
      const parts = id.split('.').map(Number);
      nextCellInMatrix(parts[0], parts[1], parts[2], field, 1);
      return;
    }
    if(isBackward){
      event.preventDefault();
      const parts = id.split('.').map(Number);
      nextCellInMatrix(parts[0], parts[1], parts[2], field, -1);
      return;
    }
  }

  // Bei allen anderen Feldern: Enter / Tab triggern nächsten Schritt
  event.preventDefault();

  // Standard ist jetzt "nach unten": gleiches Feld, nächster String.
  // Am PC tippt man so eine ganze Spalte (z.B. alle Uoc) in einem Rutsch
  // durch, statt bei jedem String quer durch die Zeile zu springen.
  if(matrixNavMode === 'down'){
    if(focusSameFieldInNextSlot(id, field, isBackward ? -1 : 1)) return;
  }

  const parts = id.split('.').map(Number);
  nextCellInMatrix(parts[0], parts[1], parts[2], field, isBackward ? -1 : 1);
}

/* ── Navigationsrichtung in der Matrix ─────────────────────────────────────
   'down'   = Tab/Enter springt zum gleichen Feld des nächsten Strings
   'across' = klassisch quer durch die Zeile (altes Verhalten)          */
let matrixNavMode = 'down';
try {
  const savedNav = localStorage.getItem('pv_nav_mode');
  if(savedNav === 'across' || savedNav === 'down') matrixNavMode = savedNav;
} catch(_){}

function toggleMatrixNav(){
  matrixNavMode = matrixNavMode === 'down' ? 'across' : 'down';
  try { localStorage.setItem('pv_nav_mode', matrixNavMode); } catch(_){}
  updateNavToggleLabel();
  toast(matrixNavMode === 'down' ? 'Tab springt nach unten' : 'Tab springt quer durch die Zeile');
}

function updateNavToggleLabel(){
  const el = g('nav-toggle-text');
  if(el) el.textContent = matrixNavMode === 'down' ? 'Weiter: ↓ nächster String' : 'Weiter: → nächstes Feld';
  const btn = g('btn-nav-mode');
  if(btn) btn.title = matrixNavMode === 'down'
    ? 'Tab/Enter springt zum gleichen Feld des nächsten Strings — zum Umschalten klicken'
    : 'Tab/Enter springt quer durch die Zeile — zum Umschalten klicken';
}

// Alle String-Plaetze des Projekts in Reihenfolge WR -> MPPT -> Eingang
function getSlotSequence(){
  const plan = getCurrentPlan();
  const out = [];
  Object.keys(plan).map(Number)
    .filter(n => !isNaN(n) && !Array.isArray(plan[n]))
    .sort((a,b) => a-b)
    .forEach(w => {
      const wd = plan[w];
      const mppts = wd.mppts || 12, inputs = wd.inputs || 2;
      for(let m = 1; m <= mppts; m++){
        for(let s = 1; s <= inputs; s++) out.push(`${w}.${m}.${s}`);
      }
    });
  return out;
}

// Gleiches Feld, naechster/voriger String. Ueberspringt gesperrte und
// ausgeblendete Zeilen (WR-Filter, "Nur aktive Strings").
function focusSameFieldInNextSlot(id, field, dir){
  const seq = getSlotSequence();
  const i = seq.indexOf(id);
  if(i < 0) return false;
  for(let k = i + dir; k >= 0 && k < seq.length; k += dir){
    const el = g(`${field}-${seq[k]}`);
    if(el && !el.readOnly && !el.disabled && el.offsetParent !== null){
      el.focus();
      try { el.select(); } catch(_){}
      highlightActiveRow(seq[k]);
      return true;
    }
  }
  return false;
}

// Bulk-Aktionen ============================================
function showBulkProgress(title, current, total){
  const overlay = g('bulk-progress-overlay');
  const progress = g('bulk-progress');
  const titleEl = g('bulk-progress-title');
  const fill = g('bulk-progress-fill');
  const text = g('bulk-progress-text');
  
  if(overlay) overlay.classList.add('show');
  if(progress) progress.classList.add('show');
  if(titleEl) titleEl.textContent = title;
  if(fill) fill.style.width = `${(current / total) * 100}%`;
  if(text) text.textContent = `${current} / ${total}`;
}

function hideBulkProgress(){
  const overlay = g('bulk-progress-overlay');
  const progress = g('bulk-progress');
  if(overlay) overlay.classList.remove('show');
  if(progress) progress.classList.remove('show');
}

function toggleBulkDropdown(wrId){
  const dropdown = g(`bulk-dropdown-${wrId}`);
  if(!dropdown) return;
  
  // Alle anderen Dropdowns schließen
  document.querySelectorAll('.bulk-dropdown-menu').forEach(menu => {
    if(menu.id !== `bulk-dropdown-${wrId}`) menu.classList.remove('show');
  });
  
  dropdown.classList.toggle('show');
}

// Dropdown schließen wenn man außerhalb klickt
document.addEventListener('click', (e) => {
  if(!e.target.closest('.bulk-dropdown')) {
    document.querySelectorAll('.bulk-dropdown-menu').forEach(menu => {
      menu.classList.remove('show');
    });
  }
});

// Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
  // Strg+S = Speichern
  if((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    if(CURRENT_PROJECT_ID) {
      toast('Manuelles Speichern...');
      if(supabaseClient && currentUser) {
        saveProjectToCloud(CURRENT_PROJECT_ID);
      } else {
        showSaveIndicator('pending');
      }
    } else {
      toast('Kein Projekt zum Speichern');
    }
  }
  
  // Strg+N = Neues Projekt
  if((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    if(darf('projekt_anlegen')) {
      openNewProjectModal();
    } else {
      toast('Keine Berechtigung für neue Projekte');
    }
  }
  
  // Strg+F = Suche
  if((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    // Fokus auf erstes Eingabefeld oder Such-Dialog
    const firstInput = document.querySelector('input[type="text"]:not([readonly])');
    if(firstInput) {
      firstInput.focus();
      firstInput.select();
    } else {
      toast('Kein Suchfeld verfügbar');
    }
  }
  
  // Esc = Modals schließen
  if(e.key === 'Escape') {
    // Alle offenen Modals schließen
    document.querySelectorAll('.modal-overlay.show').forEach(modal => {
      modal.classList.remove('show');
    });
    
    // Dropdowns schließen
    document.querySelectorAll('.bulk-dropdown-menu').forEach(menu => {
      menu.classList.remove('show');
    });
    
    // Sidebar schließen auf Mobile
    if(window.innerWidth <= 900) {
      closeSidebar();
    }
  }
  
  // Strg+Z = Undo
  if((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    e.preventDefault();
    performUndo();
  }
  
  // Strg+Y oder Strg+Shift+Z = Redo
  if((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    e.preventDefault();
    performRedo();
  }
});

function bulkSetStat(wrId, st){
  if(!canEditHardware()) return toast('Keine Berechtigung');
  const plan = getCurrentPlan();
  const data = plan[wrId];
  if(!data) return;
  const mppts = data.mppts || 12;
  const inputs = data.inputs || 2;
  const total = mppts * inputs;
  let changed = 0;
  
  showBulkProgress(`Alle Strings auf ${st} setzen...`, 0, total);
  
  // Verzögerte Ausführung für UI-Update
  setTimeout(() => {
    let current = 0;
    for(let m = 1; m <= mppts; m++){
      for(let s = 1; s <= inputs; s++){
        const id = `${wrId}.${m}.${s}`;
        if(!APP_STATE[id]) continue;
        if(APP_STATE[id].stat !== st){
          APP_STATE[id].stat = st;
          changed++;
        }
        current++;
        if(current % 5 === 0) { // Update alle 5 Items für Performance
          showBulkProgress(`Alle Strings auf ${st} setzen...`, current, total);
        }
      }
    }
    
    hideBulkProgress();
    if(changed === 0) return toast(`Bereits alles auf ${st}`);
    saveStateToHistory(`Alle Strings auf ${st} gesetzt`);
    bulkPersistAndRender();
    toast(`${changed} Strings auf ${st} gesetzt`);
  }, 100);
}

async function bulkSetModules(wrId){
  if(!canEditHardware()) return toast('Keine Berechtigung');
  const plan = getCurrentPlan();
  const data = plan[wrId];
  if(!data) return;
  // Vorschlag: häufigster Mod-Wert oder 14
  const count = {};
  for(let m = 1; m <= (data.mppts||12); m++){
    for(let s = 1; s <= (data.inputs||2); s++){
      const it = APP_STATE[`${wrId}.${m}.${s}`];
      if(it && it.stat === 'JA' && it.mod > 0){
        count[it.mod] = (count[it.mod] || 0) + 1;
      }
    }
  }
  const defaultN = Object.keys(count).length ? Number(Object.entries(count).sort((a,b)=>b[1]-a[1])[0][0]) : 14;
  const raw = await appEingabe(`Modulzahl für alle aktiven Strings dieses WR setzen:\n\n(Vorschlag: ${defaultN} — am häufigsten verwendet)`, defaultN);
  if(raw === null) return;
  const n = parseInt(raw, 10);
  if(isNaN(n) || n < 0 || n > 100) return toast('Ungültige Zahl (0–100)');
  
  let changed = 0, total = 0;
  for(let m = 1; m <= (data.mppts||12); m++){
    for(let s = 1; s <= (data.inputs||2); s++){
      const it = APP_STATE[`${wrId}.${m}.${s}`];
      if(it && it.stat === 'JA'){
        total++;
      }
    }
  }
  
  showBulkProgress(`Module auf ${n} setzen...`, 0, total);
  
  setTimeout(() => {
    let current = 0;
    for(let m = 1; m <= (data.mppts||12); m++){
      for(let s = 1; s <= (data.inputs||2); s++){
        const it = APP_STATE[`${wrId}.${m}.${s}`];
        if(it && it.stat === 'JA'){
          if(it.mod !== n){
            it.mod = n;
            changed++;
          }
          current++;
          if(current % 5 === 0) {
            showBulkProgress(`Module auf ${n} setzen...`, current, total);
          }
        }
      }
    }
    
    hideBulkProgress();
    if(changed === 0) return toast(`Bereits alle ${total} aktiven Strings auf ${n}`);
    saveStateToHistory(`Module auf ${n} gesetzt`);
    bulkPersistAndRender();
    toast(`${changed} aktive Strings → ${n} Module`);
  }, 100);
}

function bulkApplyGakSchema(wrId){
  if(!canEditHardware()) return toast('Keine Berechtigung');
  const plan = getCurrentPlan();
  const data = plan[wrId];
  if(!data) return;
  const mppts = data.mppts || 12;
  const inputs = data.inputs || 2;
  const total = mppts * inputs;
  let changed = 0;
  
  showBulkProgress('GAK-Schema anwenden...', 0, total);
  
  setTimeout(() => {
    let current = 0;
    for(let m = 1; m <= mppts; m++){
      for(let s = 1; s <= inputs; s++){
        const it = APP_STATE[`${wrId}.${m}.${s}`];
        if(!it) continue;
        const newGak = `GAK ${wrId}.${m}.${s}`;
        if((it.gak || '').trim() === ''){
          it.gak = newGak;
          changed++;
        }
        current++;
        if(current % 5 === 0) {
          showBulkProgress('GAK-Schema anwenden...', current, total);
        }
      }
    }
    
    hideBulkProgress();
    if(changed === 0) return toast('Alle GAK bereits gesetzt');
    saveStateToHistory('GAK-Schema angewendet');
    bulkPersistAndRender();
    toast(`${changed} GAK nach Schema gesetzt`);
  }, 100);
}

async function bulkClearMeasurements(wrId){
  if(!canEditHardware()) return toast('Keine Berechtigung');
  const plan = getCurrentPlan();
  const data = plan[wrId];
  if(!data) return;
  if(!await appFrage(`Messwerte (Uoc, Isc, Riso, Bemerkung) für alle Strings dieses WR löschen?`)) return;
  
  const mppts = data.mppts || 12;
  const inputs = data.inputs || 2;
  const total = mppts * inputs;
  let changed = 0;
  
  showBulkProgress('Messwerte löschen...', 0, total);
  
  setTimeout(() => {
    let current = 0;
    for(let m = 1; m <= mppts; m++){
      for(let s = 1; s <= inputs; s++){
        const it = APP_STATE[`${wrId}.${m}.${s}`];
        if(!it) continue;
        if(it.uoc || it.isc || it.riso || it.note){
          it.uoc = ''; it.isc = ''; it.riso = ''; it.note = '';
          changed++;
        }
        current++;
        if(current % 5 === 0) {
          showBulkProgress('Messwerte löschen...', current, total);
        }
      }
    }
    
    hideBulkProgress();
    if(changed === 0) return toast('Keine Messwerte zum Löschen');
    saveStateToHistory('Messwerte gelöscht');
    bulkPersistAndRender();
    toast(`${changed} Messwerte gelöscht`);
  }, 100);
}

async function bulkClearAllNotes(){
  if(!canEditMeasurement()) return toast('Keine Berechtigung — Protokoll ist gesperrt');
  const plan = getCurrentPlan();
  if(!plan) return;
  if(!await appFrage('Bemerkungen bei ALLEN Strings im gesamten Projekt löschen?')) return;
  
  // 1) Erst zählen, ohne etwas zu verändern
  const ids = [];
  let total = 0;
  Object.keys(plan).forEach(wrId => {
    const data = plan[wrId];
    const mppts = data.mppts || 12;
    const inputs = data.inputs || 2;
    for(let m = 1; m <= mppts; m++){
      for(let s = 1; s <= inputs; s++){
        const id = `${wrId}.${m}.${s}`;
        const it = APP_STATE[id];
        if(it && it.note && it.note.trim() !== ''){
          ids.push(id);
          total++;
        }
      }
    }
  });
  if(total === 0) return toast('Keine Bemerkungen zum Löschen');
  
  showBulkProgress('Bemerkungen löschen...', 0, total);
  
  // Verzögerte Ausführung für UI-Update
  setTimeout(() => {
    let current = 0;
    ids.forEach(id => {
      if(APP_STATE[id]){
        APP_STATE[id].note = '';
      }
      current++;
      if(current % 5 === 0) {
        showBulkProgress('Bemerkungen löschen...', current, total);
      }
    });
    
    hideBulkProgress();
    saveStateToHistory('Alle Bemerkungen gelöscht');
    bulkPersistAndRender();
    toast(`${total} Bemerkungen gelöscht`);
  }, 100);
}

function bulkPersistAndRender(){
  const proj = getCurrentProject();
  let synced = true;
  if(proj){
    proj.updated_at = new Date().toISOString();
    PROJECTS[CURRENT_PROJECT_ID] = proj;
    saveProjectsLocal();
    if(supabaseClient && currentUser) {
      saveProjectToCloud(CURRENT_PROJECT_ID);
    }
  }
  renderMatrix();
  return synced;
}

function setInputValidity(input, isValid){
  if(!input) return;
  input.classList.remove('invalid','valid');
  if(input.value === '' || input.value === null) return;
  if(isValid) input.classList.add('valid');
  else input.classList.add('invalid');
}

function updateWrHeaderLive(wrId){
  const plan = getCurrentPlan();
  const data = plan[wrId];
  if(!data) return;
  const mppts = data.mppts || 12;
  const inputs = data.inputs || 2;
  const wp = getCurrentWp();
  let wrPwr = 0;
  for(let m = 1; m <= mppts; m++){
    for(let s = 1; s <= inputs; s++){
      const it = APP_STATE[`${wrId}.${m}.${s}`];
      if(it && it.stat === 'JA' && it.mod > 0) wrPwr += (it.mod * wp) / 1000;
    }
  }
  const pwrEl = g(`wr-pwr-${wrId}`);
  if(pwrEl) pwrEl.textContent = wrPwr.toFixed(2) + ' kWp';
  const progressWrap = g(`wr-progress-wrap-${wrId}`);
  if(progressWrap) progressWrap.innerHTML = generateWrProgress(wrId, mppts, inputs);
}

function saveData(id, field, val) {
  if(!APP_STATE[id]) return;
  
  const hardwareFields = ['gak', 'mod', 'stat', 'planName'];
  const isHardware = hardwareFields.includes(field);
  
  if(isHardware && !canEditHardware()){
    toast('Hardware-Felder kannst du nicht ändern');
    revertInput(id, field);
    return;
  }
  if(!isHardware && !canEditMeasurement()){
    toast('Protokoll gesperrt - Änderung nicht möglich');
    revertInput(id, field);
    return;
  }

  if(['mod', 'uoc', 'isc', 'riso'].includes(field)){
    const normalized = normaliseNumber(field, val);
    if(normalized === null){
      toast(validationMessage(field));
      const inp = g(`${field}-${id}`);
      setInputValidity(inp, false);
      revertInput(id, field);
      return;
    }
    val = normalized;
  }
  
  if(field==='mod') APP_STATE[id][field] = val === '' ? 0 : Number(val);
  else APP_STATE[id][field] = val;
  
  // Markierung für manuelle Änderungen
  APP_STATE[id]._manualChange = true;
  
  if(['uoc', 'isc', 'riso', 'mod'].includes(field)){
    const inp = g(`${field}-${id}`);
    if(inp) setInputValidity(inp, true);
  }
  
  // Visuelles Feedback für geänderte Felder
  const inp = g(`${field}-${id}`);
  if(inp) {
    inp.classList.add('changed');
    setTimeout(() => inp.classList.remove('changed'), 2000);
  }
  
  if(['mod', 'stat', 'uoc', 'isc', 'riso'].includes(field)) {
    const isJa = APP_STATE[id].stat === 'JA';
    const row = g(`row-${id}`);
    const pw = g(`pw-${id}`);
    const pm = g(`pm-${id}`);
    if(row){
      // Zeilen-Highlight (komplett/unvollständig/Fehler/inaktiv) live neu bewerten,
      // statt dafür einen kompletten Tabellen-Neuaufbau zu brauchen — der hat bisher
      // nur nach erfolgreichem Cloud-Save gefeuert und damit nur "wenn Internet da
      // ist" zum Hochspringen der Seite geführt (Tastatur klappt beim Neuaufbau zu).
      row.classList.remove('row-nein', 'row-incomplete', 'row-error', 'row-complete');
      const status = getStringStatus(id);
      const cls = status === 'NEIN' ? 'row-nein' : (status === 'INCOMPLETE' ? 'row-incomplete' : (status === 'ERROR' ? 'row-error' : 'row-complete'));
      row.classList.add(cls);
    }
    if(pw) pw.textContent = (isJa && APP_STATE[id].mod>0) ? ((APP_STATE[id].mod * getCurrentWp())/1000).toFixed(2) : '—';
    if(pm) pm.textContent = (isJa && APP_STATE[id].mod>0) ? APP_STATE[id].mod : '—';
    updateKPIs(); // KPIs immer aktualisieren bei Modul- oder Statusänderungen
    updateWrHeaderLive(id.split('.')[0]); // Nur das eigene WR-Köpfchen aktualisieren — kein Tabellen-Neuaufbau nötig
    // Grenzwerte neu bewerten: ein neuer Messwert verschiebt auch den
    // Projekt-Median, daher wird die ganze Matrix neu geprüft — kein
    // Neuaufbau der Tabelle, nur Klassen/Badges werden gesetzt.
    applyMeasurementFlags();
  }
  const printMap = { uoc: 'puoc', isc: 'pisc', riso: 'priso', note: 'pnote' };
  if(printMap[field]) {
    const pc = g(`${printMap[field]}-${id}`);
    if(pc) pc.textContent = val || '';
  }
  const localProject = getCurrentProject();
  if(localProject){
    localProject.updated_at = new Date().toISOString();
    saveProjectsLocal();
  }
  
  // Sofort auf dem Geraet sichern – falls das Hochladen scheitert oder die
  // App geschlossen wird, bevor der verzoegerte Upload laeuft.
  offlineSichern();
  updateSyncStatus();
  if(supabaseClient && currentUser) {
    showSaveIndicator('syncing');
    clearTimeout(cloudSyncTimeout);
    cloudSyncTimeout = setTimeout(() => saveProjectToCloud(CURRENT_PROJECT_ID, true), CLOUD_SYNC_DELAY);
  } else {
    showSaveIndicator('pending');
  }
}

function revertInput(id, field){
  const inputMap = { gak:'gak', mod:'mod', uoc:'uoc', isc:'isc', riso:'riso', note:'note' };
  const el = g(`${inputMap[field]}-${id}`);
  if(el && APP_STATE[id]) el.value = APP_STATE[id][field] || '';
}

function setStat(id, st) {
  if(!canEditHardware()) return toast('Hardware-Felder kannst du nicht ändern');
  saveData(id, 'stat', st);
  const ja = g(`tja-${id}`); const nei = g(`tnei-${id}`);
  if(st==='JA'){ ja.className='tog on-ja'; nei.className='tog'; }
  else { nei.className='tog on-nei'; ja.className='tog'; }
  updateKPIs();
}

function updateKPIs(){
  const wp = getCurrentWp();
  let totMods = 0, totPwr = 0, totActive = 0, totComplete = 0, totIncomplete = 0, totInactive = 0, totSlots = 0;
  Object.keys(APP_STATE).forEach(id => {
    const it = APP_STATE[id];
    if(!it) return;
    totSlots++;
    const status = getStringStatus(id);
    if(status === 'COMPLETE') {
      totComplete++;
      totActive++;
      if(it.mod > 0) { totMods += it.mod; totPwr += (it.mod * wp) / 1000; }
    } else if(status === 'INCOMPLETE') {
      totIncomplete++;
      totActive++;
      if(it.mod > 0) { totMods += it.mod; totPwr += (it.mod * wp) / 1000; }
    } else {
      totInactive++;
    }
  });
  const dPwr = g('d-pwr'), dMods = g('d-mods'), dAct = g('d-act'), dTot = g('d-tot'), dWp = g('d-wp');
  if(dPwr)  dPwr.textContent  = totPwr.toFixed(2);
  if(dMods) dMods.textContent = totMods;
  if(dAct)  dAct.textContent  = totActive;
  if(dTot)  dTot.textContent  = totSlots;
  if(dWp)   dWp.textContent   = wp;

  // Kompakte Sticky-Leiste (Handy): nur das, was beim Messen zaehlt
  const ksPwr = g('ks-pwr'), ksDone = g('ks-done'), ksOpen = g('ks-open');
  if(ksPwr)  ksPwr.textContent  = totPwr.toFixed(1);
  if(ksDone) ksDone.textContent = totComplete;
  if(ksOpen) ksOpen.textContent = totIncomplete;
  // Progress-Bar kWp vs Ziel (PVSOL-Plan, falls vorhanden)
  const proj = getCurrentProject();
  const planPwr = (proj && proj.plan_pwr) ? proj.plan_pwr : 0;
  const pwrBar = g('d-pwr-bar');
  if(pwrBar){
    if(planPwr > 0){
      const pct = Math.min(100, (totPwr / planPwr) * 100);
      pwrBar.style.width = pct + '%';
    } else {
      pwrBar.style.width = totActive > 0 ? '100%' : '0%';
    }
  }
  const pwrMeta = g('d-pwr-meta');
  if(pwrMeta){
    pwrMeta.textContent = planPwr > 0
      ? `${totPwr.toFixed(2)} / ${planPwr} kWp Soll`
      : `${totActive} von ${totSlots} Strings aktiv`;
  }
  const modsMeta = g('d-mods-meta');
  if(modsMeta){
    modsMeta.textContent = totActive > 0 ? `≈ ${totMods} Module` : '—';
  }
  // Mini-Bars im Strings-KPI
  const totalForBars = Math.max(totSlots, 1);
  const cBar = g('d-act-bar-complete');
  const iBar = g('d-act-bar-incomplete');
  const nBar = g('d-act-bar-inactive');
  if(cBar) cBar.style.width = (totComplete / totalForBars * 100) + '%';
  if(iBar) iBar.style.width = (totIncomplete / totalForBars * 100) + '%';
  if(nBar) nBar.style.width = (totInactive / totalForBars * 100) + '%';
  const cCount = g('d-act-complete'), iCount = g('d-act-incomplete'), nCount = g('d-act-inactive');
  if(cCount) cCount.textContent = totComplete;
  if(iCount) iCount.textContent = totIncomplete;
  if(nCount) nCount.textContent = totInactive;
  // Warn-Counter
  const warnCount = g('d-warn-count');
  const warnMeta = g('d-warn-meta');
  if(warnCount) warnCount.textContent = totIncomplete;
  if(warnMeta) warnMeta.style.display = totIncomplete > 0 ? 'flex' : 'none';
}

function openPVSOLModal(){
  if(!darf('projekt_anlegen')) return toast('Keine Berechtigung');
  pendingPVSOLData = null;
  g('pvsol-file-input').value = '';
  g('pvsol-file-label').textContent = 'JSON-Datei auswählen';
  g('pvsol-preview').style.display = 'none';
  g('pvsol-confirm-btn').disabled = true;
  g('pvsol-modal').classList.add('show');
}
function closePVSOLModal(e){ if(!e || e.target===e.currentTarget) g('pvsol-modal').classList.remove('show'); }

function handlePVSOLFile(input){
  const file = input.files[0];
  if(!file) return;
  g('pvsol-file-label').textContent = file.name;
  const reader = new FileReader();
  reader.onload = function(e){
    try {
      const rawText = e.target.result.replace(/^\uFEFF/, '').trim();
      const json = JSON.parse(rawText);
      let configRoot = null;
      if (json.Configuration) configRoot = json.Configuration;
      else if (json.Project && json.Project.Configuration) configRoot = json.Project.Configuration;
      else if (json.ProjectOverview && json.ProjectOverview.Configuration) configRoot = json.ProjectOverview.Configuration;
      if(!configRoot || !configRoot.ModuleAreas){ toast('Ungültiges PVSOL-Format'); pendingPVSOLData = null; return; }
      const parsed = parsePVSOLData(json);
      if(parsed.stringCount === 0){
        toast('Keine belegten PV*SOL-Strings im Export gefunden');
        pendingPVSOLData = null;
        return;
      }
      pendingPVSOLData = json;
      showPVSOLPreview(parsed);
      g('pvsol-confirm-btn').disabled = false;
    } catch(err){ toastError('PVSOL-Datei konnte nicht gelesen werden', err); pendingPVSOLData = null; }
  };
  reader.readAsText(file);
}

function parsePVSOLData(json){
  const plan = {}; let projectName = 'PVSOL Import'; let moduleWp = 460;
  let stringCount = 0, moduleCount = 0;
  const root = json.Project ? json.Project : json;
  const config = root.Configuration || (root.ProjectOverview ? root.ProjectOverview.Configuration : null);
  const projectData = root.ProjectOverview?.ProjectData;
  if(projectData && projectData.ProjectName) projectName = projectData.ProjectName;
  const designAreas = root.ProjectOverview?.ThreeDDesign?.ModuleAreas || [];
  const moduleDescription = designAreas.find(area => area?.ModuleData)?.ModuleData || '';
  const wpMatch = moduleDescription.match(/(\d{3})W/i) || moduleDescription.match(/-(\d{3})\//);
  if(wpMatch) moduleWp = parseInt(wpMatch[1], 10);

  const RE_MPPT_LABEL = /MPP\s*T?\s*(\d+)\s*:/i;
  const RE_STRING = /(\d+)\s*[x×*]\s*(\d+)/i;
  // Optionaler GAK-Tag pro Segment, z.B. "2x12 @GAK 1.1" — nur unsere eigenen,
  // handaufbereiteten Importe nutzen das; ein echter PVSOL-Export enthaelt nie
  // "@GAK", faellt also unveraendert auf "GAK {WR}" zurueck wie bisher.
  const RE_GAK_TAG = /@GAK\s*(.+)$/i;

  if(config?.ModuleAreas){
    config.ModuleAreas.forEach(area => {
      if(!area.Inverters) return;
      area.Inverters.forEach(inv => {
        const wrNum = Number(inv.Number);
        if(!Number.isInteger(wrNum) || wrNum < 1) return;
        const configs = inv.Configuration || [];
        const entry = plan[wrNum] || {
          name: `WR ${wrNum}${inv.Description ? ` · ${inv.Description}` : ''}`,
          mppts: 0, inputs: 1, defaultMods: 0, strings: {}
        };

        const combined = [];
        for(let i = 0; i < configs.length; i++){
          const cs = (configs[i] || '').toString();
          const labelM = cs.match(RE_MPPT_LABEL);
          if(labelM && (configs[i+1] !== undefined)){
            const next = (configs[i+1] || '').toString();
            if(!RE_MPPT_LABEL.test(next) && next.trim() !== ''){
              combined.push(`${cs} ${next}`.trim());
              i++; 
              continue;
            }
          }
          combined.push(cs);
        }

        const invMpptFields = ['NumberOfMppts','Mppts','NumberMPPTs','MpptCount','MPPTCount','MpptNumber','NumberOfMPPTs'];
        let actualMppts = 0;
        for(const f of invMpptFields){
          if(Number.isInteger(inv[f]) && inv[f] > 0){ actualMppts = Math.max(actualMppts, inv[f]); break; }
        }
        combined.forEach(cs => {
          const m = cs.match(RE_MPPT_LABEL);
          if(m) actualMppts = Math.max(actualMppts, Number(m[1]));
        });
        if(actualMppts === 0) actualMppts = 12;
        entry.mppts = actualMppts;

        combined.forEach(configStr => {
          if(!configStr || typeof configStr !== 'string') return;
          if(configStr.toLowerCase().includes('nicht belegt')) return;
          const mpptM = configStr.match(RE_MPPT_LABEL);
          if(!mpptM) return;
          const mppt = Number(mpptM[1]);
          if(!Number.isInteger(mppt)) return;

          const afterColon = configStr.substring(configStr.indexOf(':') + 1);
          const segments = afterColon.split('||').map(s => s.trim()).filter(Boolean);

          if(segments.length === 0) return;

          entry.strings[mppt] ||= {};
          const stringDefinitions = [];
          segments.forEach(seg => {
            const gakM = seg.match(RE_GAK_TAG);
            const gakLabel = gakM ? gakM[1].trim() : null;
            const cleanSeg = gakM ? seg.replace(RE_GAK_TAG, '').trim() : seg;
            const sm = cleanSeg.match(RE_STRING);
            if(!sm) return;
            const parallelStrings = Number(sm[1]);
            const modulesPerString = Number(sm[2]);
            if(!Number.isInteger(parallelStrings) || parallelStrings <= 0) return;
            if(!Number.isInteger(modulesPerString) || modulesPerString <= 0) return;
            stringDefinitions.push({ parallelStrings, modulesPerString, gakLabel });
          });

          const physicalStringCount = stringDefinitions.reduce((total, def) => total + def.parallelStrings, 0);
          if(physicalStringCount === 0) return;
          entry.inputs = Math.max(entry.inputs, physicalStringCount);

          let stringNum = Object.keys(entry.strings[mppt]).length + 1;
          stringDefinitions.forEach(({ parallelStrings, modulesPerString, gakLabel }) => {
            for(let parallel = 0; parallel < parallelStrings; parallel++){
              entry.strings[mppt][stringNum] = {
                planName: `PVSOL WR ${wrNum} · MPP ${mppt} · String ${stringNum}`,
                gak: gakLabel ? `GAK ${gakLabel}` : `GAK ${wrNum}`,
                mod: modulesPerString,
                note: ''
              };
              stringNum++;
              stringCount++;
              moduleCount += modulesPerString;
            }
          });
        });
        plan[wrNum] = entry;
      });
    });
  }
  return { plan, projectName, moduleWp, stringCount, moduleCount };
}

function showPVSOLPreview(parsed){
  const preview = g('pvsol-preview-content');
  const wrCount = Object.keys(parsed.plan).length;
  let html = `<div style="margin-bottom:8px;"><strong>${wrCount} Wechselrichter</strong></div>`;
  if(parsed.projectName) html += `<div style="margin-bottom:8px;"><strong>Projektname:</strong> ${esc(parsed.projectName)}</div>`;
  if(parsed.moduleWp) html += `<div style="margin-bottom:8px;"><strong>Modul:</strong> ${parsed.moduleWp} Wp</div>`;
  html += `<div style="margin-bottom:8px;"><strong>Strings:</strong> ${parsed.stringCount || 0} &middot; <strong>Module:</strong> ${parsed.moduleCount || 0}</div>`;
  if(parsed.moduleCount && parsed.moduleWp) html += `<div><strong>DC-Leistung:</strong> ${((parsed.moduleCount * parsed.moduleWp) / 1000).toFixed(2)} kWp</div>`;
  preview.innerHTML = html;
  g('pvsol-preview').style.display = 'block';
}

async function confirmPVSOLImport(){
  if(!pendingPVSOLData) return;
  const parsed = parsePVSOLData(pendingPVSOLData);
  let id = parsed.projectName.replace(/[^a-zA-Z0-9]/g, '_');
  if(PROJECTS[id]) id += '_' + Date.now();
  PROJECTS[id] = { id, name: parsed.projectName, bereich: CURRENT_BEREICH || 'gewerbe', model_wp: parsed.moduleWp || 460, locked: false, plan: parsed.plan, updated_at: new Date().toISOString() };
  saveProjectsLocal();
  if(supabaseClient && currentUser) await saveProjectToCloud(id);
  closePVSOLModal();
  await selectProject(id);
  toast(`Import erfolgreich: ${parsed.stringCount} Strings / ${parsed.moduleCount} Module`);
}

async function openProjectsModal(){
  if(supabaseClient && currentUser) await fetchProjectsFromCloud();
  const list = g('proj-list');
  const ids = bereichProjektIds();
  list.innerHTML = ids.map(id => {
    const proj = PROJECTS[id];
    const lockedIcon = proj.locked ? ICON.lock + ' ' : '';
    const wrCount = Object.keys(proj.plan || {}).filter(k => !isNaN(parseInt(k))).length;
    return `
    <div style="display:flex; justify-content:space-between; align-items:center; padding:12px; background:var(--bg); border:1px solid var(--border); border-radius:12px; flex-wrap:wrap; gap:8px;">
      <div style="min-width:0; flex:1 1 140px; overflow:hidden;">
        <div style="font-weight:700; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${lockedIcon}${id === CURRENT_PROJECT_ID ? '✓ ' : ''}${esc(proj.name)}</div>
        <div style="font-size:0.7rem;color:var(--muted);">${wrCount} WR &middot; ${proj.model_wp} Wp${proj.locked ? ' &middot; <span style="color:#ef4444;">gesperrt</span>' : ''}</div>
      </div>
      <div style="display:flex; gap:6px; flex-wrap:wrap;">
        <button class="btn btn-ghost" onclick="selectProject('${id}')" style="padding:6px 10px;">Öffnen</button>
        ${darf('projekt_verwalten') ? `<button class="btn btn-ghost" onclick="renameProject('${id}', event)" style="padding:6px 10px;" title="Projekt umbenennen">Umbenennen</button>` : ''}
        ${darf('projekt_loeschen') ? `<button class="btn btn-ghost" onclick="deleteProject('${id}', event)" style="padding:6px 10px; color:#ef4444; border-color:#ef4444;">Löschen</button>` : ''}
      </div>
    </div>
  `;
  }).join('');
  g('projects-modal').classList.add('show');
}
function closeProjectsModal(e){ if(!e || e.target===e.currentTarget) g('projects-modal').classList.remove('show'); }

async function refreshProjects(){
  const btn = document.querySelector('button[onclick="refreshProjects()"]');
  if(btn) { btn.disabled = true; btn.textContent = 'Lade...'; }
  try {
    if(!supabaseClient || !currentUser) { toast('Keine Cloud-Verbindung'); return; }
    toast('Aktualisiere...');
    await fetchProjectsFromCloud();
    renderProjectGrid();
    updateLockUI();
    toast('Projekte aktualisiert');
  } catch(e){
    toastError('Projekte konnten nicht aktualisiert werden', e);
  } finally {
    if(btn) { btn.disabled = false; btn.textContent = 'Aktualisieren'; }
  }
}

async function debugCloudProjects(){
  if(!supabaseClient || !currentUser) return;
  try {
    const { data, error } = await supabaseClient.from('pv_projects').select('*');
    if(error) console.error('Debug:', error);
    else console.log('Alle Projekte:', data);
  } catch(e){}
}

// KRITISCH: Beim Wechsel des offenen Projekts wird APP_STATE gleich mit dem neuen
// Projekt überschrieben. Der debounced Auto-Save (CLOUD_SYNC_DELAY) liest aber erst
// beim Feuern nach, welches Projekt gerade aktuell ist — wechselt man vorher, geht
// die letzte Änderung am ALTEN Projekt sonst lautlos verloren. Deshalb hier zuerst
// sichern, bevor CURRENT_PROJECT_ID sich ändert.
async function flushPendingProjectEdits(){
  clearTimeout(cloudSyncTimeout);
  if(CURRENT_PROJECT_ID && supabaseClient && currentUser){
    try { await saveProjectToCloud(CURRENT_PROJECT_ID); } catch(e){}
  }
}

async function selectProject(id){
  await flushPendingProjectEdits();

  // Vorheriges Lock freigeben
  if (CURRENT_PROJECT_ID && currentProjectLock) {
    await unlockProject(CURRENT_PROJECT_ID);
  }

  CURRENT_PROJECT_ID = id;
  syncStandZuruecksetzen();

  // Neues Lock versuchen
  console.log('Lock-Test: Versuche Lock für Projekt', id);
  const lockSuccess = await lockProject(id);
  console.log('Lock-Test: Lock-Ergebnis', lockSuccess);

  if (!lockSuccess) {
    toast('Projekt ist gesperrt - nur lesender Zugriff');
  }

  loadCurrentProjectData();
  if(supabaseClient && currentUser) await fetchCloudDataManually();
  if(g('projects-view').classList.contains('active')) switchMainTab('matrix');
  renderProjectUI();
  if(document.body.classList.contains('tab-anlagenbuch')) anlagenbuchRendern();
  if(document.body.classList.contains('tab-ppk')) ppkRendern();
  toast('Projekt geladen');
}

function openNewProjectModal(){
  if(!darf('projekt_anlegen')) return toast('Keine Berechtigung');
  g('np-name').value = '';
  g('np-group').value = currentProjectGroupFilter && currentProjectGroupFilter !== '__all__' && currentProjectGroupFilter !== '__none__' ? currentProjectGroupFilter : '';
  const groupList = g('np-group-suggestions');
  if(groupList){
    const groups = [...new Set(bereichProjektIds().map(id => PROJECTS[id].group).filter(Boolean))].sort();
    groupList.innerHTML = groups.map(gr => `<option value="${esc(gr)}"></option>`).join('');
  }
  const sel = g('np-clone-from');
  sel.innerHTML = '';
  bereichProjektIds().map(id => PROJECTS[id]).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id; opt.textContent = p.name;
    sel.appendChild(opt);
  });
  document.querySelectorAll('input[name="np-template"]').forEach(r => r.checked = (r.value === 'plan'));
  updateNewProjectForm();
  renderNPWRPlan();
  closeProjectsModal();
  g('newproj-modal').classList.add('show');
}
function closeNewProjectModal(e){ if(!e || e.target===e.currentTarget) g('newproj-modal').classList.remove('show'); }

function updateNewProjectForm(){
  const selected = document.querySelector('input[name="np-template"]:checked');
  if(!selected) return;
  document.querySelectorAll('input[name="np-template"]').forEach(r => r.closest('.field-radio').classList.toggle('selected', r.checked));
  g('np-clone-from-field').style.display = selected.value === 'clone' ? 'block' : 'none';
  g('np-plan-field').style.display = selected.value === 'plan' ? 'block' : 'none';
}

function renderNPWRPlan(){
  const count = parseInt(g('np-wr-count').value)||1;
  let html = '';
  for(let wr=1; wr<=count; wr++){
    html += `
      <div class="np-wr-row">
        <div style="font-weight:800; font-size:0.8rem; margin-bottom:10px; color:var(--accent);">Wechselrichter ${wr}</div>
        <div style="display:flex; gap:12px; flex-wrap:wrap;">
          <div style="flex:2; min-width:200px;"><label>Name/Bezeichnung</label><input type="text" id="np-name-${wr}" placeholder="z.B. WR 1 - Dach Ost" class="sp-inp"></div>
          <div style="flex:1;"><label>MPPTs</label><input type="number" id="np-mppts-${wr}" value="12" class="sp-inp sp-inp-center"></div>
          <div style="flex:1;"><label>Eingänge/MPPT</label><input type="number" id="np-inputs-${wr}" value="2" class="sp-inp sp-inp-center"></div>
          <div style="flex:1;"><label>Mods/String (Opt.)</label><input type="number" id="np-mods-${wr}" placeholder="Leer" class="sp-inp sp-inp-center"></div>
        </div>
      </div>`;
  }
  g('np-wr-plan-list').innerHTML = html;
}

async function doCreateNewProject(){
  await flushPendingProjectEdits();
  const name = g('np-name').value.trim();
  const group = g('np-group').value.trim();
  const wp = parseInt(g('np-wp').value)||465;
  const count = parseInt(g('np-wr-count').value)||1;
  const template = document.querySelector('input[name="np-template"]:checked').value;
  if(!name) return toast('Bitte Namen eingeben');
  let id = name.replace(/[^a-zA-Z0-9]/g, '_');
  if(PROJECTS[id]) id += '_' + Date.now();
  let plan = {};
  if(template === 'clone'){
    const cloneId = g('np-clone-from').value;
    if(!PROJECTS[cloneId]) return toast('Quellprojekt ungültig');
    plan = JSON.parse(JSON.stringify(PROJECTS[cloneId].plan));
  } else if(template === 'empty') {
    for(let wr=1; wr<=count; wr++) plan[wr] = { mppts: 12, inputs: 2, defaultMods: 0 };
  } else {
    for(let wr=1; wr<=count; wr++){
      plan[wr] = {
        name: g(`np-name-${wr}`).value || `WR ${wr}`,
        mppts: parseInt(g(`np-mppts-${wr}`).value)||12,
        inputs: parseInt(g(`np-inputs-${wr}`).value)||2,
        defaultMods: parseInt(g(`np-mods-${wr}`).value)||0
      };
    }
  }
   PROJECTS[id] = { id, name, group: group || null, bereich: CURRENT_BEREICH || 'gewerbe', model_wp: wp, locked: false, plan, updated_at: new Date().toISOString() };
  saveProjectsLocal();
  CURRENT_PROJECT_ID = id;
  closeNewProjectModal();
  loadCurrentProjectData(true);
  if(supabaseClient && currentUser) await saveProjectToCloud(id);
  renderProjectUI();
  toast('Projekt erstellt');
}

async function updateProjectConfigInCloud(id) {
  if (!supabaseClient || !currentUser) return;
  const proj = PROJECTS[id];
  if (!proj) return;
  
  const configToSave = buildProjectConfig(proj, currentUser.email);

  try {
    await supabaseClient.from('pv_projects')
      .update({ config: configToSave, updated_at: proj.updated_at })
      .eq('id', id);
  } catch(e) {
    console.error("Fehler beim Cloud-Update der Konfiguration", e);
    throw e;
  }
}

async function deleteProject(id, event){
  if(!darf('projekt_loeschen')){ if(event) event.stopPropagation(); return toast('Keine Berechtigung zum Löschen'); }
  // Gesperrte Protokolle sind auch serverseitig vor dem Loeschen geschuetzt.
  // Der Hinweis hier erspart den Fehlschlag und erklaert den Weg.
  if(PROJECTS[id] && istGeschuetzt(PROJECTS[id])){
    if(event) event.stopPropagation();
    return toast(PROJECTS[id].locked
      ? 'Unterschriebenes Protokoll — geschützt, kann nicht gelöscht werden'
      : 'Dieses Protokoll war unterschrieben — es bleibt dauerhaft vor dem Löschen geschützt');
  }
  if(event) event.stopPropagation();
  if(id === CURRENT_PROJECT_ID) return toast('Aktives Projekt kann nicht gelöscht werden');
  if(!await appFrage('Projekt wirklich löschen?')) return;
  delete PROJECTS[id];
  saveProjectsLocal();
  let cloudOk = true;
  if(supabaseClient && currentUser){
    try {
      const { error } = await supabaseClient.from('pv_projects').delete().eq('id', id);
      if(error) throw error;
    } catch(e){
      cloudOk = false;
      toastError('Lokal entfernt, aber Löschen in der Cloud fehlgeschlagen — Projekt taucht beim nächsten Laden eventuell wieder auf', e);
    }
  }
  if(g('projects-modal') && g('projects-modal').classList.contains('show')) openProjectsModal();
  renderProjectUI();
  if(g('project-grid')) renderProjectGrid();
  if(cloudOk) toast('Projekt gelöscht');
}

async function renameProject(id, event){
  if(event) event.stopPropagation();
  const proj = PROJECTS[id];
  if(!proj) return;
  if(!darf('projekt_verwalten')) return toast('Keine Berechtigung');
  const newName = await appEingabe('Projekt umbenennen:', proj.name || '');
  if(newName === null) return;
  const trimmed = newName.trim();
  if(!trimmed) return toast('Name darf nicht leer sein');
  if(trimmed === proj.name) return;

  const previousName = proj.name;
  proj.name = trimmed;
  proj.updated_at = new Date().toISOString();
  saveProjectsLocal();

  if(g('project-grid')) renderProjectGrid();
  if(g('projects-modal') && g('projects-modal').classList.contains('show')) openProjectsModal();
  renderProjectUI();

  if(supabaseClient && currentUser){
    try {
      const { error } = await supabaseClient.from('pv_projects')
        .update({ name: trimmed, updated_at: proj.updated_at })
        .eq('id', id);
      if(error) throw error;
      toast('Projekt umbenannt');
    } catch(e){
      proj.name = previousName;
      if(g('project-grid')) renderProjectGrid();
      if(g('projects-modal') && g('projects-modal').classList.contains('show')) openProjectsModal();
      renderProjectUI();
      toastError('Umbenennen fehlgeschlagen — bitte erneut versuchen', e);
    }
  } else {
    toast('Projekt umbenannt (nur lokal)');
  }
}

async function setProjectGroup(id, event){
  if(event) event.stopPropagation();
  const proj = PROJECTS[id];
  if(!proj) return;
  if(!darf('projekt_verwalten')) return toast('Keine Berechtigung');
  const existingGroups = [...new Set(bereichProjektIds().map(pid => PROJECTS[pid].group).filter(Boolean))].sort();
  const hint = existingGroups.length ? `\n\nVorhandene Gruppen: ${existingGroups.join(', ')}` : '';
  const input = await appEingabe('Gruppe für dieses Projekt (leer lassen zum Entfernen):' + hint, proj.group || '');
  if(input === null) return;
  const trimmed = input.trim();
  if(trimmed === (proj.group || '')) return;

  const previousGroup = proj.group || null;
  proj.group = trimmed || null;
  proj.updated_at = new Date().toISOString();
  saveProjectsLocal();

  if(g('project-grid')) renderProjectGrid();
  if(g('projects-modal') && g('projects-modal').classList.contains('show')) openProjectsModal();
  renderProjectUI();

  if(supabaseClient && currentUser){
    try {
      await updateProjectConfigInCloud(id);
      toast('Gruppe gespeichert');
    } catch(e){
      proj.group = previousGroup;
      if(g('project-grid')) renderProjectGrid();
      if(g('projects-modal') && g('projects-modal').classList.contains('show')) openProjectsModal();
      renderProjectUI();
      toastError('Gruppe konnte nicht gespeichert werden', e);
    }
  } else {
    toast('Gruppe gesetzt (nur lokal)');
  }
}

async function editGroup(oldName, event) {
  if(event) { event.stopPropagation(); event.preventDefault(); }
  if(!darf('projekt_verwalten')) return toast('Keine Berechtigung');
  const action = await appEingabe(`Gruppe "${oldName}" bearbeiten:\n\n- Neuen Namen eingeben zum Umbenennen.\n- ODER "LÖSCHEN" eintippen, um die Gruppe komplett aufzulösen (Die Projekte bleiben dabei erhalten).`, oldName);
  
  if(action === null) return;
  const trimmed = action.trim();
  if(trimmed === oldName || trimmed === '') return;

  let projectsUpdated = 0;
  let failedIds = [];
  if(trimmed.toUpperCase() === 'LÖSCHEN') {
    if(!await appFrage(`Möchtest du die Gruppe "${oldName}" wirklich auflösen?`)) return;
    for(let id in PROJECTS) {
      if(PROJECTS[id].group === oldName && imAktuellenBereich(id)) {
        PROJECTS[id].group = null;
        PROJECTS[id].updated_at = new Date().toISOString();
        try { await updateProjectConfigInCloud(id); projectsUpdated++; }
        catch(e){ failedIds.push(id); console.error('Gruppe auflösen fehlgeschlagen für', id, e); }
      }
    }
    if(failedIds.length) toastError(`Gruppe teilweise aufgelöst (${projectsUpdated} ok, ${failedIds.length} fehlgeschlagen — bitte erneut versuchen)`);
    else toast(`Gruppe aufgelöst (${projectsUpdated} Projekte aktualisiert)`);
  } else {
    for(let id in PROJECTS) {
      if(PROJECTS[id].group === oldName && imAktuellenBereich(id)) {
        PROJECTS[id].group = trimmed;
        PROJECTS[id].updated_at = new Date().toISOString();
        try { await updateProjectConfigInCloud(id); projectsUpdated++; }
        catch(e){ failedIds.push(id); console.error('Gruppe umbenennen fehlgeschlagen für', id, e); }
      }
    }
    if(failedIds.length) toastError(`Gruppe teilweise umbenannt (${projectsUpdated} ok, ${failedIds.length} fehlgeschlagen — bitte erneut versuchen)`);
    else toast(`Gruppe umbenannt (${projectsUpdated} Projekte aktualisiert)`);
  }

  saveProjectsLocal();
  renderProjectUI();
  if(g('project-grid')) renderProjectGrid();
  
  if(currentProjectGroupFilter === oldName) {
    selectProjectGroupFilter(trimmed.toUpperCase() === 'LÖSCHEN' ? '__all__' : trimmed);
  }
}

function selectProjectGroupFilter(groupKey){
  currentProjectGroupFilter = groupKey;
  renderProjectGrid();
}

function getAllFullIds(){
  return Object.keys(APP_STATE).sort((a,b) => {
    let pA = a.split('.').map(Number), pB = b.split('.').map(Number);
    if(pA[0] !== pB[0]) return pA[0] - pB[0];
    if(pA[1] !== pB[1]) return pA[1] - pB[1];
    return pA[2] - pB[2];
  });
}

function exportSmartScriptExcel(){
  if(!darf('export')) return toast('Keine Berechtigung für Exporte');
  const proj = getCurrentProject();
  const rows = [['Etikett']]; let cnt = 0;
  getAllFullIds().forEach(fullId => {
    const item = APP_STATE[fullId];
    if(item.stat !== 'JA' || item.mod <= 0) return;
    const pwr = ((item.mod * getCurrentWp())/1000).toFixed(2).replace('.', ',');
    const labelText = [`BVH ${proj.name}`, fullId, item.gak, `${item.mod} Module`, `${pwr} kWp`, item.note].filter(Boolean).join('\r\n');
    rows.push([{ t: 's', v: labelText }]);
    cnt++;
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 35 }];
  XLSX.utils.book_append_sheet(wb, ws, 'Etiketten');
  XLSX.writeFile(wb, `SmartScript_GAK_${proj.name}.xlsx`);
  toast(`${cnt} Etiketten exportiert`);
}

function exportStringNumbersExcel(){
  if(!darf('export')) return toast('Keine Berechtigung für Exporte');
  const proj = getCurrentProject();
  const rows = [['String']]; let cnt = 0;
  getAllFullIds().forEach(fullId => {
    const item = APP_STATE[fullId];
    if(item.stat !== 'JA' || item.mod <= 0) return;
    rows.push([{ t: 's', v: fullId }]);
    cnt++;
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 15 }];
  XLSX.utils.book_append_sheet(wb, ws, 'String-Nummern');
  XLSX.writeFile(wb, `String-Nummern_${proj.name}.xlsx`);
  toast(`${cnt} Nummern exportiert`);
}

function doExcel(){
  if(!darf('export')) return toast('Keine Berechtigung für Exporte');
  const proj = getCurrentProject();
  const rows = [[ 'Klemme', 'Plan-String', 'GAK', 'Status', 'Module', 'Leistung (kWp)', 'Uoc (V)', 'Isc (A)', 'Riso (MOhm)', 'Bemerkung' ]];
  getAllFullIds().forEach(fullId => {
    const item = APP_STATE[fullId];
    const pwr = (item.stat === 'JA' && item.mod > 0) ? ((item.mod * getCurrentWp())/1000).toFixed(2) : '0';
    rows.push([ { t: 's', v: fullId }, item.planName || '—', item.gak, item.stat, item.mod, parseFloat(pwr.replace(',','.')) || 0, item.uoc, item.isc, item.riso, item.note ]);
  });
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{wch:12},{wch:16},{wch:12},{wch:10},{wch:10},{wch:14},{wch:10},{wch:10},{wch:12},{wch:26}];
  XLSX.utils.book_append_sheet(wb, ws, 'Prüfprotokoll');
  XLSX.writeFile(wb, `Protokoll_${proj.name}.xlsx`);
  toast('Prüfprotokoll exportiert');
}

function printBlankMeasurementSheet(){
  if(!darf('export')) return toast('Keine Berechtigung für Exporte');
  const proj = getCurrentProject();
  if(!proj) return;
  const dateStr = new Date().toLocaleDateString('de-AT');
  const isLocked = isProtocolLocked();
  const lockedBy = proj.locked_by || 'Admin';
  const lockedAt = proj.locked_at ? new Date(proj.locked_at).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const lockStampHtml = isLocked ? 
    `<div style="margin-top:24px;padding:14px 16px;border:3px solid #b91c1c;border-radius:8px;text-align:center;color:#b91c1c;font-weight:800;font-size:11pt;background:#fef2f2;">MESSPROTOKOLL GESPERRT &middot; Freigegeben durch <strong>${esc(lockedBy)}</strong> am <strong>${esc(lockedAt)}</strong></div>` : '';
  
  const valOrLine = (val, width) => {
    const v = (val ?? '').toString().trim();
    return v ? `<strong>${esc(v)}</strong>` : `<div class="write-line" style="width:${width};"></div>`;
  };

  // Der Pruefer ist der, der gemessen hat. Sein Name und seine Unterschrift
  // bleiben auf dem Ausdruck stehen, auch wenn spaeter noch einmal
  // entsperrt und nachbearbeitet wurde.
  const sigBox = (sig, beschriftung) => (sig && sig.dataUrl)
    ? `<div class="sig-box"><img src="${sig.dataUrl}" alt="Unterschrift" style="height:46px;max-width:100%;display:block;margin:0 auto 6px;"><div>${esc(sig.name)}<br>${esc(beschriftung)} &middot; digital unterschrieben &middot; ${esc(new Date(sig.at).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' }))}</div></div>`
    : `<div class="sig-box"><div class="sig-line"></div><div>Ort, Datum, Unterschrift ${esc(beschriftung)}</div></div>`;
  const pruferSigBoxHtml  = sigBox(proj.signature, 'Prüfer');
  const abnahmeSigBoxHtml = sigBox(proj.abnahme, 'Abnahme');
  const prueferName = (proj.signature && proj.signature.name) ? esc(proj.signature.name) : '_______________________';

  let win = window.open('', '_blank');
  if(!win){
    toast('Popup wurde vom Browser blockiert — bitte Popups für diese Seite erlauben und erneut versuchen');
    return;
  }
  const wrKeys = Object.keys(proj.plan || {}).map(Number).filter(n => !isNaN(n)).sort((a,b)=>a-b);

  // Erst alle Seiten mit Inhalt sammeln, damit wir "Seite X von Y" kennen bevor wir rendern.
  const pageEntries = [];
  wrKeys.forEach(wr => {
    let rowsHtml = '';
    const itemsForWR = getAllFullIds().filter(k => k.startsWith(`${wr}.`));
    itemsForWR.forEach(id => {
      const item = APP_STATE[id];
      if(item.stat !== 'JA') return;
      rowsHtml += `<tr>
        <td style="font-weight:700; font-family:'JetBrains Mono', monospace; font-size:12pt; color:#16a34a;">${id}</td>
        <td style="font-size:10pt;">${esc(item.gak || '')}</td>
        <td style="font-weight:700;">${esc(item.mod || '')}</td>
        <td>${valOrLine(item.uoc, '85%')}</td>
        <td>${valOrLine(item.isc, '85%')}</td>
        <td>${valOrLine(item.riso, '85%')}</td>
        <td>${valOrLine(item.note, '90%')}</td>
      </tr>`;
    });
    if(rowsHtml !== '') pageEntries.push({ wr, rowsHtml });
  });

  let pagesHtml = '';
  pageEntries.forEach((entry, idx) => {
    const { wr, rowsHtml } = entry;
    const pageNumHtml = pageEntries.length > 1
      ? `<div style="text-align:right;font-size:8pt;color:#a1a1aa;margin-top:4px;">Seite ${idx + 1} von ${pageEntries.length}</div>`
      : '';
    pagesHtml += `<div class="sheet"><div class="header"><div><div class="brand">SOLPRO</div><div class="title">DC-Strangmessung / Inbetriebnahme</div></div><div class="meta"><div class="meta-row"><span>Projekt:</span> <strong>${proj.name}</strong></div><div class="meta-row"><span>Datum:</span> <strong>${dateStr}</strong></div><div class="meta-row"><span>Wechselrichter:</span> <strong>WR ${wr}</strong></div><div class="meta-row"><span>Prüfer:</span> <strong>${prueferName}</strong></div></div></div><div class="env-zone"><div class="env-box"><div class="env-label">Einstrahlung (W/m²)</div></div><div class="env-box"><div class="env-label">Modultemperatur (°C)</div></div><div class="env-box" style="flex: 1.5;"><div class="env-label">Eingesetztes Messgerät (Typ / S/N)</div></div></div><table><thead><tr><th style="width:10%;">Klemme</th><th style="width:14%;">GAK</th><th style="width:7%;">Mods</th><th style="width:12%;">Uoc (V)</th><th style="width:12%;">Isc (A)</th><th style="width:13%;">Riso (MΩ)</th><th style="width:32%;">Bemerkung</th></tr></thead><tbody>${rowsHtml}</tbody></table>${lockStampHtml}<div class="footer">${pruferSigBoxHtml}${abnahmeSigBoxHtml}</div>${pageNumHtml}</div>`;
  });
  if(pagesHtml === '') { toast('Keine aktiven Strings!'); win.close(); return; }
  
  win.document.write(`<!DOCTYPE html><html><head><title>Messblatt ${proj.name}</title><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&family=JetBrains+Mono:wght@700&display=swap" rel="stylesheet"><style>@page { size: A4 landscape; margin: 12mm; } body { font-family: 'Inter', sans-serif; color: #18181b; background: #fff; margin:0; padding:0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } .sheet { page-break-after: always; display: flex; flex-direction: column; min-height: calc(100vh - 24mm); } .header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #18181b; padding-bottom: 12px; margin-bottom: 24px; } .brand { font-size: 20pt; font-weight: 900; color: #16a34a; letter-spacing: -0.05em; margin-bottom: 4px; text-transform: uppercase; } .title { font-size: 14pt; font-weight: 700; color: #3f3f46; text-transform: uppercase; } .meta { display: grid; grid-template-columns: 1fr 1fr; column-gap: 30px; row-gap: 6px; font-size: 10pt; color: #3f3f46; } .meta-row { display: flex; justify-content: space-between; gap: 10px; border-bottom: 1px dotted #e4e4e7; } .meta-row span { color: #71717a; } .env-zone { display: flex; gap: 20px; margin-bottom: 24px; } .env-box { flex: 1; border: 2px solid #e4e4e7; border-radius: 8px; position: relative; height: 50px; background: #fafafa; } .env-label { position: absolute; top: -8px; left: 12px; background: #fff; padding: 0 6px; font-size: 8pt; font-weight: 700; color: #a1a1aa; text-transform: uppercase; } table { width: 100%; border-collapse: collapse; margin-bottom: auto; } th { background: #f4f4f5; border: 1px solid #d4d4d8; padding: 10px 8px; font-size: 9pt; font-weight: 700; text-transform: uppercase; color: #52525b; } td { border: 1px solid #d4d4d8; padding: 12px 8px; text-align: center; font-size: 11pt; color: #18181b; } tr:nth-child(even) td { background-color: #fafafa; } .write-line { height: 20px; border-bottom: 2px solid #a1a1aa; width: 70%; margin: 0 auto; } .footer { display: flex; justify-content: space-between; margin-top: 40px; padding-top: 10px; } .sig-box { width: 260px; text-align: center; font-size: 9pt; color: #71717a; text-transform: uppercase;} .sig-line { border-bottom: 1px solid #18181b; height: 30px; margin-bottom: 6px; }</style></head><body onload="setTimeout(()=>{window.print();}, 500)" onafterprint="setTimeout(()=>{window.close();}, 100)">${pagesHtml}</body></html>`);
  win.document.close();
}

async function fetchProjectsFromCloud(){
  if(!supabaseClient || !currentUser) return;
  // KRITISCH: Erst noch ausstehende lokale Änderungen wirklich in die Cloud
  // schreiben (der debounced Auto-Save wartet sonst noch bis zu CLOUD_SYNC_DELAY
  // ms), und einen bereits laufenden Speichervorgang abwarten. Sonst überschreibt
  // dieser Fetch frische, noch nicht synchronisierte Eingaben mit dem alten
  // Cloud-Stand — z.B. wenn man kurz nach dem Ändern der Modulzahl auf
  // "Aktualisieren" klickt.
  clearTimeout(cloudSyncTimeout);
  if(CURRENT_PROJECT_ID){
    try { await saveProjectToCloud(CURRENT_PROJECT_ID); } catch(e){}
  }
  try {
    const query = supabaseClient.from('pv_projects').select('id, name, config, data, updated_at, user_id, pruefer, modul_wp, bereich');
    const { data, error } = await query;
    if(error) { toastError('Projekte konnten nicht geladen werden', error); return; }
    cloudFetchSucceeded = true;
    cloudProjectIds = new Set((data || []).map(cloudProj => cloudProj.id));
    PROJECTS = {};
    (data || []).forEach(cloudProj => {
        const cloudConfig = cloudProj.config || {};
        const planOnly = {};
        Object.keys(cloudConfig).forEach(k => { if(CONFIG_META_KEYS.indexOf(k) < 0) planOnly[k] = cloudConfig[k]; });
        const lockMeta = cloudConfig._lock || {};
        const cloudProject = {
          id: cloudProj.id, 
          name: cloudProj.name || 'Unbenannt', 
          group: cloudConfig._group || null,
          beschreibung: cloudConfig._beschreibung || '',
          anlagenbuch: cloudConfig._anlagenbuch || null,
          model_wp: cloudProj.modul_wp || 465, 
          plan: planOnly, 
          locked: !!lockMeta.locked,
          locked_by: lockMeta.by || null,
          locked_at: lockMeta.at || null,
          signature: cloudConfig._signature || null,
          abnahme: cloudConfig._abnahme || null,
          freigabe: cloudConfig._freigabe || null,
          geschuetzt: !!(cloudConfig._geschuetzt || cloudConfig._signature || cloudConfig._abnahme || lockMeta.locked),
          updated_at: cloudProj.updated_at,
          cloud_updated_at: cloudProj.updated_at,
          user_id: cloudProj.user_id,
          bereich: cloudProj.bereich || 'gewerbe',
          // Messstand mitnehmen statt wegwerfen: die Spalte wird oben ohnehin
          // schon mitgeladen. Damit kann die Projektkarte den Fortschritt
          // anzeigen, ohne dass ein zweiter Cloud-Abruf noetig waere.
          measurements: cloudProj.data || null
        };
        PROJECTS[cloudProj.id] = cloudProject;
      });
  } catch(e){ toastError('Keine Verbindung zur Cloud', e); }
  renderProjectUI();
}

async function saveProjectToCloudNow(projectId, skipRender){
  if(!supabaseClient || !currentUser) return false;
  const proj = PROJECTS[projectId];
  if(!proj) return false;
  
  const syncIndicator = g('cloud-sync-indicator');
  if(syncIndicator) syncIndicator.classList.add('syncing');
  
  try {
    const stateData = projectId === CURRENT_PROJECT_ID ? APP_STATE : generateState(proj.plan);

    const configToSave = buildProjectConfig(proj, currentUser ? currentUser.email : null);
    const updatedAt = new Date().toISOString();
    proj.updated_at = updatedAt;
    const payload = { 
      id: projectId, name: proj.name, pruefer: currentUser.email, 
      user_id: currentUser.id, modul_wp: proj.model_wp || 465, 
      mppts: "dynamic", data: stateData, config: configToSave, 
      updated_at: updatedAt,
      bereich: projektBereich(proj)
    };
    // Genau diesen Stand merken: nur wenn er ankommt, gilt er als gesichert
    const _gesendet = projectId === CURRENT_PROJECT_ID ? JSON.stringify(stateData) : null;
    const _abVersion = abVersion;
    const { error } = await supabaseClient.from('pv_projects').upsert(payload);
    if(syncIndicator) syncIndicator.classList.remove('syncing');
    if(error) {
      const off = g('offline-indicator'); if(off) off.classList.add('offline');
      showSaveIndicator('error');
      syncFehlschlag(projectId);
      return false;
    } else {
      proj.cloud_updated_at = updatedAt;
      saveProjectsLocal();
      const off = g('offline-indicator'); if(off) off.classList.remove('offline');
      showSaveIndicator('saved');
      if(_gesendet !== null) syncErfolg(projectId, _gesendet);
      abNachUpload(projectId, _abVersion);
      if(!skipRender) renderMatrixDebounced(); // Debounced nach Cloud-Save
      return true;
    }
  } catch(e){ 
    if(syncIndicator) syncIndicator.classList.remove('syncing');
    const off = g('offline-indicator'); if(off) off.classList.add('offline');
    showSaveIndicator('error');
    syncFehlschlag(projectId);
    return false;
  }
}

function saveProjectToCloud(projectId, skipRender){
  if(!supabaseClient || !currentUser || !projectId) return Promise.resolve(false);
  const previous = cloudSaveQueues.get(projectId) || Promise.resolve();
  const next = previous.catch(() => {}).then(() => saveProjectToCloudNow(projectId, skipRender));
  cloudSaveQueues.set(projectId, next);
  next.finally(() => {
    if(cloudSaveQueues.get(projectId) === next) cloudSaveQueues.delete(projectId);
    updateSyncStatus();
  });
  updateSyncStatus();
  return next;
}

async function pushCloudDataManually(){
  if(!supabaseClient || !CURRENT_PROJECT_ID || !currentUser) return toast('Cloud/Projekt nicht bereit');
  const proj = getCurrentProject();
  toast('Lade hoch...');
  try {
    const stateData = APP_STATE;
    const configToSave = buildProjectConfig(proj, currentUser.email);
    const { error } = await supabaseClient.from('pv_projects').upsert({ 
      id: CURRENT_PROJECT_ID, name: proj.name, pruefer: currentUser.email, 
      modul_wp: proj.model_wp || 465, mppts: "dynamic", 
      data: stateData, config: configToSave, updated_at: new Date().toISOString(),
      bereich: projektBereich(proj)
    });
    if(!error) toast('Cloud gespeichert!'); else toastError('Cloud-Speichern fehlgeschlagen', error);
  } catch(e) { toastError('Keine Verbindung zur Cloud', e); }
}

async function fetchCloudDataManually(silent = false){
  if(!supabaseClient || !CURRENT_PROJECT_ID || !currentUser) return toast('Cloud/Projekt nicht bereit');
  // Wichtig: Erst einen evtl. noch laufenden Speichervorgang für dieses Projekt
  // abwarten. Sonst kann ein "alter" Cloud-Stand gerade erst gemachte Änderungen
  // (z.B. "Alle Bemerkungen löschen") wieder überschreiben, weil lokal nichts
  // dauerhaft zwischengespeichert wird — die Cloud ist die einzige Quelle.
  if(cloudSaveQueues.has(CURRENT_PROJECT_ID)){
    try { await cloudSaveQueues.get(CURRENT_PROJECT_ID); } catch(e){}
  }
  if(!silent) toast('Lade...');
  try {
    const { data, error } = await supabaseClient.from('pv_projects').select('*').eq('id', CURRENT_PROJECT_ID).single();
    if(data && data.data){
      APP_STATE = { ...generateState(getCurrentPlan(), false), ...data.data };
      renderMatrix();
      syncStandMerken();
      // Gibt es auf diesem Geraet noch nicht hochgeladene Werte? Dann fragen.
      await offlineWiederherstellenPruefen(CURRENT_PROJECT_ID);
      if(!silent) toast('Stand geladen');
    } else if(error) {
      if(!silent) toastError('Stand konnte nicht geladen werden', error);
    } else if(!silent) {
      toast('Keine Daten gefunden');
    }
  } catch(e) {
    if(!silent) toastError('Keine Verbindung zur Cloud', e);
  }
}

async function factoryResetCloud(){
  if(!darf('matrix_reset')) return toast('Keine Berechtigung');
  if(!await appFrage("Matrix komplett zurücksetzen?")) return;
  APP_STATE = generateState(getCurrentPlan());
  renderMatrix(null);
  await pushCloudDataManually();
  toast('Matrix zurückgesetzt');
}

function toggleAuthMode(){
  authMode = authMode === 'login' ? 'register' : 'login';
  g('auth-title').textContent = authMode === 'login' ? 'Anmelden' : 'Konto erstellen';
  g('auth-submit-btn').textContent = authMode === 'login' ? 'Anmelden' : 'Registrieren';
  g('auth-switch-text').textContent = authMode === 'login' ? 'Noch kein Konto?' : 'Bereits registriert?';
  g('auth-switch-btn').textContent = authMode === 'login' ? 'Registrieren' : 'Anmelden';
  g('auth-error').textContent = '';
}

async function handleAuthSubmit(){
  const email = (g('auth-email').value || '').trim();
  const password = g('auth-password').value || '';
  const errEl = g('auth-error'); errEl.textContent = '';
  if(!email || !password){ errEl.textContent = 'Bitte E-Mail und Passwort eingeben.'; return; }
  if(!supabaseClient){ errEl.textContent = (!SB_URL || !SB_KEY) ? 'Zugangsdaten fehlen – bitte URL und Key in config.js eintragen.' : 'Keine Verbindung zu Supabase – Internetverbindung prüfen.'; return; }
  if(authMode === 'login'){
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if(error){ errEl.textContent = 'Login fehlgeschlagen: ' + error.message; return; }
    await onAuthenticated(data.user);
  } else {
    const { data, error } = await supabaseClient.auth.signUp({ email, password });
    if(error){ errEl.textContent = 'Registrierung fehlgeschlagen: ' + error.message; return; }
    if(data.session) await onAuthenticated(data.user); 
    else { errEl.style.color = 'var(--accent)'; errEl.textContent = 'Konto erstellt! Bestätige E-Mail.'; toggleAuthMode(); }
  }
}

async function doLogout(){
  if(!await appFrage('Wirklich abmelden?')) return;

  // Alle Locks freigeben
  if (CURRENT_PROJECT_ID && currentProjectLock) {
    await unlockProject(CURRENT_PROJECT_ID);
  }

  if(supabaseClient) await supabaseClient.auth.signOut();
  currentUser = null; currentUserRole = null;
  CURRENT_BEREICH = null; currentUserBereiche = [];
  aktualisiereBereichsAnzeige();
  { const bg = g('bereich-gate'); if(bg) bg.hidden = true; document.body.classList.remove('bereich-offen'); }
  g('user-badge').style.display = 'none'; g('auth-gate').style.display = 'flex';
}

function flushCloudSync(){
  clearTimeout(cloudSyncTimeout);
  if(supabaseClient && currentUser && CURRENT_PROJECT_ID){
    return saveProjectToCloud(CURRENT_PROJECT_ID);
  }
  return Promise.resolve(false);
}

window.addEventListener('online', () => {
  const off = g('offline-indicator');
  if(off) off.classList.remove('offline');
  flushCloudSync();
});
window.addEventListener('offline', () => {
  const off = g('offline-indicator');
  if(off) off.classList.add('offline');
});
document.addEventListener('visibilitychange', () => {
  if(document.visibilityState === 'hidden') flushCloudSync();
});
window.addEventListener('pagehide', () => {
  flushCloudSync();
});

async function checkSession(){
  // Ladezustand (body.app-laedt, schon im HTML gesetzt) endet hier in jedem
  // Fall – auch ohne Verbindung oder bei einem Fehler, sonst haengt die App.
  try {
    if(!supabaseClient) return;
    const { data } = await supabaseClient.auth.getSession();
    if(data && data.session && data.session.user) await onAuthenticated(data.session.user);
  } finally {
    document.body.classList.remove('app-laedt');
  }
}

async function onAuthenticated(user){
  currentUser = user;
  // Waehrend Profil und Projekte laden, nicht die leere App zeigen,
  // sondern den Ladezustand – danach direkt die Bereichswahl.
  document.body.classList.add('app-laedt');
  g('auth-gate').style.display = 'none';
  try {
    await loadMyProfile();
    const isAdmin = currentUserRole === 'admin';
    const isPlannerUp = currentUserRole === 'admin' || currentUserRole === 'planner';
    document.querySelectorAll('.role-gate-admin').forEach(el => el.classList.toggle('hidden-role', !isAdmin));
    document.querySelectorAll('.role-gate-planner').forEach(el => el.classList.toggle('hidden-role', !isPlannerUp));
    rechteAnwenden();
    { const akt = (document.body.className.match(/\btab-(\w+)/) || [])[1] || 'home'; if(!tabErlaubt(akt)) switchMainTab(akt); }
    if(!isPlannerUp && document.body.classList.contains('tab-querschnitt')) switchMainTab('home');
    g('user-badge').style.display = 'flex';
    aktualisiereNamensAnzeige();
    g('user-badge-role').textContent = ROLLEN[currentUserRole] || '—';
    await initProjects();
    if(typeof fotoWarteschlangeSenden === 'function') fotoWarteschlangeSenden();
    updateLockUI();
    updateRoleHint();
    if(currentUserRole === 'site') toggleHideInactive(true);
    zeigeBereichsWahl();
  } finally {
    document.body.classList.remove('app-laedt');
  }
}

async function loadMyProfile(){
  try {
    const { data, error } = await supabaseClient.from('profiles').select('*').eq('id', currentUser.id).single();
    if(error || !data){
      await supabaseClient.from('profiles').insert({ id: currentUser.id, email: currentUser.email, role: 'site' });
      currentUserRole = 'site';
      currentUserBereiche = [];
      currentUserDisplayName = '';
      currentUserRechte = {};
    } else {
      currentUserRole = data.role || 'site';
      currentUserDisplayName = (data.display_name || '').trim();
      currentUserRechte = (data.rechte && typeof data.rechte === 'object') ? data.rechte : {};
      currentUserBereiche = Array.isArray(data.bereiche) ? data.bereiche : [];
    }
  } catch(e){ currentUserRole = 'site'; currentUserBereiche = []; currentUserRechte = {}; }
  // Ab hier steht fest, WER angemeldet ist — jetzt gilt dessen eigene
  // Darstellung und nicht mehr die zuletzt am Geraet verwendete.
  if(window.PV_DESIGN) PV_DESIGN.neuLaden();
}

// ── Anzeigename ───────────────────────────────────────────────────────────
// Jeder legt selbst fest, wie er in der App heisst ("Hallo Lukas").
// Ohne eigenen Namen gilt wie bisher der Teil der E-Mail vor dem @.
function anzeigeName(){
  if(currentUserDisplayName) return currentUserDisplayName;
  return (currentUser && currentUser.email) ? currentUser.email.split('@')[0] : '';
}

function aktualisiereNamensAnzeige(){
  const badge = g('user-badge-email');
  if(badge){
    badge.textContent = anzeigeName() || '—';
    if(currentUser && currentUser.email) g('user-badge').title = currentUser.email + ' – klicken, um den Anzeigenamen zu ändern';
  }
  const home = g('home-user-name');
  if(home) home.textContent = anzeigeName() || 'Anwender';
}

function openNameModal(){
  if(!currentUser) return;
  const inp = g('name-input');
  if(inp) inp.value = currentUserDisplayName;
  g('name-modal').classList.add('show');
  closeSidebar();
  setTimeout(() => { if(inp) inp.focus(); }, 50);
}

function closeNameModal(evt){
  if(!evt || evt.target === g('name-modal')) g('name-modal').classList.remove('show');
}

async function saveDisplayName(){
  const inp = g('name-input');
  const name = String(inp ? inp.value : '').trim().replace(/\s+/g, ' ');
  if(name.length < 2 || name.length > 40) return toast('Bitte 2 bis 40 Zeichen eingeben');
  if(!supabaseClient || !currentUser) return toast('Keine Verbindung – bitte später erneut versuchen');
  const btn = g('name-save-btn');
  if(btn) btn.disabled = true;
  try {
    // Eigene Datenbank-Funktion: darf ausschliesslich den eigenen Namen setzen
    const { error } = await supabaseClient.rpc('set_display_name', { neuer_name: name });
    if(error) throw error;
    currentUserDisplayName = name;
    aktualisiereNamensAnzeige();
    closeNameModal();
    toast('Name gespeichert');
  } catch(e){
    toastError('Name konnte nicht gespeichert werden', e);
  } finally {
    if(btn) btn.disabled = false;
  }
}

function openUsersModal(){
  if(currentUserRole !== 'admin') return toast('Nur für Admins');
  g('users-modal').classList.add('show');
  loadAllUsers();
}
function closeUsersModal(evt){ if(!evt || evt.target === g('users-modal')) g('users-modal').classList.remove('show'); }

async function loadAllUsers(){
  const listEl = g('users-list'); listEl.innerHTML = 'Lade...';
  try {
    const { data, error } = await supabaseClient.from('profiles').select('id, email, role, bereiche, display_name, rechte').order('created_at', { ascending: true });
    if(error){ listEl.innerHTML = `Fehler: ${error.message}`; return; }
    listEl.innerHTML = data.map(u => `
      <div class="user-row" data-suche="${esc(((u.display_name || '') + ' ' + (u.email || '')).toLowerCase())}">
        <span class="email"><span class="user-name">${esc(u.display_name || (u.email || '').split('@')[0])}${u.id === currentUser.id ? ' (du)' : ''}</span><span class="user-mail">${esc(u.email)}</span></span>
        <select onchange="changeUserRole('${u.id}', this.value)" ${u.id === currentUser.id ? 'disabled' : ''}>
          <option value="site" ${u.role === 'site' ? 'selected' : ''}>Bauleitung</option>
          <option value="elektriker" ${u.role === 'elektriker' ? 'selected' : ''}>Elektriker</option>
          <option value="planner" ${u.role === 'planner' ? 'selected' : ''}>Planer</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
        ${bereicheZellenHtml(u)}
        ${rechteZellenHtml(u)}
      </div>`).join('');
  } catch(e){ listEl.innerHTML = `Fehler: ${e.message}`; }
}

async function changeUserRole(userId, newRole){
  try {
    const { error } = await supabaseClient.from('profiles').update({ role: newRole }).eq('id', userId);
    if(error) toastError('Rolle konnte nicht geändert werden', error); else { toast('Rolle geändert'); loadAllUsers(); }
  } catch(e){ toastError('Rolle konnte nicht geändert werden', e); }
}

// Zuweisung von Bauleitung-Accounts zu einzelnen Projekten (pv_project_members).
// Nur Admin/Planer sehen alle Projekte automatisch — Bauleitung sieht per RLS
// nur noch Projekte, denen sie hier explizit zugewiesen wurde.
let assignModalProjectId = null;

function openAssignModal(id, event){
  if(event) event.stopPropagation();
  if(!darf('projekt_verwalten')) return toast('Keine Berechtigung');
  if(!supabaseClient || !currentUser) return toast('Nur mit Cloud-Anmeldung verfügbar');
  const proj = PROJECTS[id];
  if(!proj) return;
  assignModalProjectId = id;
  g('assign-project-name').textContent = proj.name || id;
  g('assign-modal').classList.add('show');
  loadAssignments(id);
}
function closeAssignModal(evt){
  if(!evt || evt.target === g('assign-modal')){
    g('assign-modal').classList.remove('show');
    assignModalProjectId = null;
  }
}

async function loadAssignments(projectId){
  const listEl = g('assign-list'); listEl.innerHTML = 'Lade...';
  try {
    const [{ data: siteUsers, error: uErr }, { data: members, error: mErr }] = await Promise.all([
      supabaseClient.from('profiles').select('id, email, role, bereiche').in('role', ['site', 'elektriker']).order('email', { ascending: true }),
      supabaseClient.from('pv_project_members').select('user_id').eq('project_id', projectId)
    ]);
    if(uErr) throw uErr;
    if(mErr) throw mErr;
    if(projectId !== assignModalProjectId) return; // Modal wurde inzwischen gewechselt/geschlossen
    const assignedIds = new Set((members || []).map(m => m.user_id));
    if(!siteUsers || siteUsers.length === 0){
      listEl.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;">Keine Bauleitung-Accounts vorhanden. Lege Benutzer in der Benutzerverwaltung an.</div>';
      return;
    }
    listEl.innerHTML = siteUsers.map(u => `
      <div class="user-row">
        <span class="email">${esc(u.email)}${(Array.isArray(u.bereiche) && PROJECTS[projectId] && u.bereiche.indexOf(projektBereich(PROJECTS[projectId])) < 0) ? ` <span class="ub-hinweis">· Bereich ${esc(BEREICHE[projektBereich(PROJECTS[projectId])].name)} fehlt – sieht das Projekt nicht</span>` : ''}</span>
        <label style="display:flex;align-items:center;gap:6px;font-size:0.8rem;cursor:pointer;white-space:nowrap;">
          <input type="checkbox" ${assignedIds.has(u.id) ? 'checked' : ''} onchange="toggleAssignment('${projectId}', '${u.id}', this.checked)">
          zugewiesen
        </label>
      </div>`).join('');
  } catch(e){ listEl.innerHTML = `Fehler: ${esc(e.message || String(e))}`; }
}

async function toggleAssignment(projectId, userId, assign){
  try {
    if(assign){
      const { error } = await supabaseClient.from('pv_project_members').insert({
        project_id: projectId, user_id: userId, assigned_by: currentUser ? currentUser.id : null
      });
      if(error) throw error;
      toast('Zugewiesen');
    } else {
      const { error } = await supabaseClient.from('pv_project_members').delete().eq('project_id', projectId).eq('user_id', userId);
      if(error) throw error;
      toast('Zuweisung entfernt');
    }
  } catch(e){
    toastError('Zuweisung konnte nicht geändert werden', e);
    loadAssignments(projectId); // Checkbox-Zustand nach Fehler zurücksetzen
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   VERSIONEN & WIEDERHERSTELLEN
   Ein Trigger in der Datenbank sichert bei JEDER Aenderung an einem Projekt
   den vorherigen Stand nach pv_projects_history (mit Zeitstempel). Das ist
   das Sicherheitsnetz fuer den Fall, dass zwei Geraete dasselbe Projekt
   offen haben: wer zuletzt speichert, ueberschreibt den ganzen Datensatz —
   der ueberschriebene Stand liegt dann aber noch in der History.
   ══════════════════════════════════════════════════════════════════════════ */
let historyModalProjectId = null;

function openHistoryModal(id, event){
  if(event) event.stopPropagation();
  if(!darf('versionen')) return toast('Keine Berechtigung');
  if(!supabaseClient || !currentUser) return toast('Nur mit Cloud-Anmeldung verfügbar');
  const target = id || CURRENT_PROJECT_ID;
  const proj = PROJECTS[target];
  if(!proj) return toast('Kein Projekt geöffnet');
  historyModalProjectId = target;
  g('history-project-name').textContent = proj.name || target;
  g('history-modal').classList.add('show');
  loadProjectHistory(target);
}

function closeHistoryModal(evt){
  if(!evt || evt.target === g('history-modal')){
    g('history-modal').classList.remove('show');
    historyModalProjectId = null;
  }
}

// Wie weit war ein gesicherter Stand? Gleiche Zaehlweise wie auf der Projektkarte.
function countMeasuredInState(state){
  const out = { done: 0, active: 0 };
  if(!state || typeof state !== 'object') return out;
  Object.keys(state).forEach(k => {
    const it = state[k];
    if(!it || it.stat !== 'JA') return;
    out.active++;
    const u = toNum(it.uoc), i = toNum(it.isc), r = toNum(it.riso);
    if(u !== null && u > 0 && i !== null && i > 0 && r !== null && r > 0) out.done++;
  });
  return out;
}

async function loadProjectHistory(projectId){
  const el = g('history-list');
  el.innerHTML = 'Lade...';
  try {
    const { data, error } = await supabaseClient
      .from('pv_projects_history')
      .select('id, changed_at, data')
      .eq('project_id', projectId)
      .order('changed_at', { ascending: false })
      .limit(40);
    if(error) throw error;
    if(projectId !== historyModalProjectId) return; // Modal inzwischen gewechselt

    if(!data || data.length === 0){
      el.innerHTML = '<div style="color:var(--muted);font-size:0.85rem;">Für dieses Projekt ist noch keine Version gesichert. Sobald etwas geändert wird, erscheint hier der jeweils vorherige Stand.</div>';
      return;
    }

    const live = countMeasuredInState(projectId === CURRENT_PROJECT_ID ? APP_STATE : PROJECTS[projectId] && PROJECTS[projectId].measurements);
    el.innerHTML =
      `<div style="font-size:0.78rem;font-weight:700;color:var(--muted);margin-bottom:10px;">
         Aktuell: ${live.done} von ${live.active} Strings gemessen
       </div>` +
      data.map(row => {
        const c = countMeasuredInState(row.data);
        const when = new Date(row.changed_at).toLocaleString('de-AT', {
          day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
        });
        // Ein Stand mit MEHR Messwerten als jetzt ist der interessante Fall:
        // dort wurde vermutlich etwas ueberschrieben.
        const mehr = c.done > live.done;
        return `<div class="user-row">
          <span class="email" style="line-height:1.45;">
            ${esc(when)}${mehr ? ' <span style="color:var(--warn);font-weight:800;">· mehr Messwerte als jetzt</span>' : ''}<br>
            <span style="font-weight:600;color:var(--muted);font-size:0.78rem;">${c.done} von ${c.active} Strings gemessen</span>
          </span>
          <button class="btn btn-ghost" style="padding:6px 12px;font-size:0.76rem;white-space:nowrap;"
                  onclick="restoreHistoryVersion(${row.id}, '${projectId}')">Wiederherstellen</button>
        </div>`;
      }).join('');
  } catch(e){
    el.innerHTML = `<div style="color:var(--crit);font-size:0.85rem;font-weight:700;">Versionen konnten nicht geladen werden.</div>
      <div style="color:var(--muted);font-size:0.78rem;margin-top:6px;">${esc(e.message || String(e))}</div>`;
  }
}

async function restoreHistoryVersion(historyId, projectId){
  if(!darf('versionen')) return toast('Keine Berechtigung');
  const proj = PROJECTS[projectId];
  if(!proj) return;
  if(!canEditMeasurement()) return toast('Protokoll gesperrt — Wiederherstellen nicht möglich');
  if(!await appFrage(
      'Diesen Stand wiederherstellen?\n\n' +
      'Die Messwerte des Projekts werden auf diesen Stand zurückgesetzt.\n' +
      'Der aktuelle Stand wird dabei automatisch gesichert und lässt sich\n' +
      'genauso wieder zurückholen.\n\n' +
      'Die Hardware-Konfiguration (Wechselrichter, MPPTs) bleibt unverändert.'
    )) return;

  // Einen noch ausstehenden Auto-Save abbrechen, sonst landet der alte
  // Stand direkt nach dem Wiederherstellen wieder in der Cloud.
  clearTimeout(cloudSyncTimeout);

  try {
    const { data, error } = await supabaseClient
      .from('pv_projects_history').select('data').eq('id', historyId).single();
    if(error) throw error;
    if(!data || !data.data) throw new Error('Diese Version enthält keine Messdaten.');

    // update() statt upsert(): nur die Messdaten anfassen. Das Schreiben loest
    // den History-Trigger aus, der aktuelle Stand wird also mitgesichert.
    const { error: upErr } = await supabaseClient
      .from('pv_projects')
      .update({ data: data.data, updated_at: new Date().toISOString() })
      .eq('id', projectId);
    if(upErr) throw upErr;

    proj.measurements = data.data;
    if(projectId === CURRENT_PROJECT_ID){
      APP_STATE = { ...generateState(getCurrentPlan(), false), ...data.data };
      renderMatrix();
      syncStandMerken();
      offlineLoeschen(projectId);
    }
    renderProjectUI();
    if(g('project-grid')) renderProjectGrid();
    toast('Stand wiederhergestellt');
    loadProjectHistory(projectId);
  } catch(e){
    toastError('Wiederherstellen fehlgeschlagen', e);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const tryFillPrint = () => {
    const proj = (typeof getCurrentProject === 'function') ? getCurrentProject() : null;
    const pn = document.getElementById('print-project-name');
    const pd = document.getElementById('print-date');
    if(pn && proj) pn.textContent = proj.name || 'Projekt';
    if(pd) pd.textContent = new Date().toLocaleDateString('de-AT', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };
  tryFillPrint();
  setInterval(tryFillPrint, 1500);
});
window.onload = () => {
  checkSession();
};

// ══════════════════════════════════════════════════════════════════════════
// KOLLABORATIVES LOCKING SYSTEM
// Verhindert gleichzeitige Bearbeitung desselben Projekts durch mehrere User
// ══════════════════════════════════════════════════════════════════════════

let currentProjectLock = null;   // Sperre des offenen Projekts (eigene oder fremde)
let lockCheckInterval = null;
const LOCK_EXPIRY_MINUTES = 5;   // ohne Verlaengerung laeuft eine Sperre nach 5 Min ab

function lockGehoertMir(lock){ return !!(lock && currentUser && lock.user_id === currentUser.id); }
function lockGueltig(lock){ return !!(lock && new Date(lock.expires_at) > new Date()); }
function lockAblauf(){ return new Date(Date.now() + LOCK_EXPIRY_MINUTES * 60000).toISOString(); }

async function lockLesen(projectId){
  const { data, error } = await supabaseClient.from('project_locks').select('*').eq('project_id', projectId).maybeSingle();
  if(error) throw error;
  return data;
}
async function lockSetzen(projectId){
  const { data, error } = await supabaseClient.from('project_locks').upsert({
    project_id: projectId, user_id: currentUser.id, user_name: currentUser.email,
    locked_at: new Date().toISOString(), expires_at: lockAblauf()
  }, { onConflict: 'project_id' }).select().single();
  if(error) throw error;
  return data;
}

// Beim Oeffnen sperren. true = ich darf bearbeiten, false = jemand anderes arbeitet gerade daran.
async function lockProject(projectId, uebernehmen = false){
  if(!currentUser || !supabaseClient || !projectId) return true;   // ohne Cloud keine Sperren
  try {
    const lock = await lockLesen(projectId);
    if(lock && lockGueltig(lock) && !lockGehoertMir(lock) && !uebernehmen){
      currentProjectLock = lock;
      showCollabLockBanner(lock);
      startLockCheck();
      return false;
    }
    currentProjectLock = await lockSetzen(projectId);
    hideCollabLockBanner();
    startLockCheck();
    return true;
  } catch(e){
    console.warn('Projekt-Sperre nicht moeglich:', e);
    return true;   // im Zweifel nicht blockieren
  }
}

async function unlockProject(projectId){
  stopLockCheck();
  const lock = currentProjectLock;
  currentProjectLock = null;
  hideCollabLockBanner();
  if(!currentUser || !supabaseClient || !projectId || !lockGehoertMir(lock)) return;
  try {
    await supabaseClient.from('project_locks').delete().eq('project_id', projectId).eq('user_id', currentUser.id);
  } catch(e){ console.warn('Freigeben fehlgeschlagen:', e); }
}

// Alle 30 s: eigene Sperre verlaengern bzw. pruefen, ob das Projekt wieder frei ist
function startLockCheck(){
  stopLockCheck();
  lockCheckInterval = setInterval(async () => {
    if(!CURRENT_PROJECT_ID || !supabaseClient || !currentUser) return;
    const pid = CURRENT_PROJECT_ID;
    try {
      if(lockGehoertMir(currentProjectLock)){
        const { data, error } = await supabaseClient.from('project_locks')
          .update({ expires_at: lockAblauf() }).eq('project_id', pid).eq('user_id', currentUser.id).select();
        if(error) throw error;
        if(data && data.length){ currentProjectLock = data[0]; return; }
        const lock = await lockLesen(pid);
        if(lock && lockGueltig(lock) && !lockGehoertMir(lock)){
          currentProjectLock = lock;
          showCollabLockBanner(lock);
          toast(`${lock.user_name || 'Jemand'} hat das Projekt übernommen`);
        } else {
          currentProjectLock = await lockSetzen(pid);
        }
      } else {
        const lock = await lockLesen(pid);
        if(!lock || !lockGueltig(lock)){
          if(await lockProject(pid)){
            await fetchCloudDataManually(true);   // neuesten Stand des anderen holen
            toast('Projekt ist wieder frei – du kannst bearbeiten');
          }
        } else {
          currentProjectLock = lock;
          showCollabLockBanner(lock);
        }
      }
    } catch(e){ console.warn('Sperr-Pruefung:', e); }
  }, 30000);
}

function stopLockCheck(){
  if(lockCheckInterval){ clearInterval(lockCheckInterval); lockCheckInterval = null; }
}

function showCollabLockBanner(lock){
  const banner = g('collab-lock-banner');
  const userName = g('collab-lock-user-name');
  const timeSpan = g('collab-lock-time');
  if(userName) userName.textContent = lock.user_name || 'Unbekannt';
  if(timeSpan){
    const minuten = Math.max(0, Math.floor((Date.now() - new Date(lock.locked_at).getTime()) / 60000));
    timeSpan.textContent = `seit ${minuten} Min`;
  }
  if(banner) banner.classList.add('active');
  document.body.classList.add('collab-locked');
}

function hideCollabLockBanner(){
  const banner = g('collab-lock-banner');
  if(banner) banner.classList.remove('active');
  document.body.classList.remove('collab-locked');
}

// Trotzdem bearbeiten: Sperre auf mich uebernehmen und den neuesten Stand laden
async function overrideProjectLock(){
  if(!CURRENT_PROJECT_ID) return;
  const wer = (currentProjectLock && currentProjectLock.user_name) || 'Jemand';
  if(!await appFrage(`${wer} bearbeitet dieses Projekt gerade.\n\nWenn ihr gleichzeitig speichert, überschreibt einer die Eingaben des anderen.\n\nTrotzdem übernehmen?`)) return;
  if(await lockProject(CURRENT_PROJECT_ID, true)){
    if(supabaseClient && currentUser) await fetchCloudDataManually(true);
    toast('Du bearbeitest jetzt dieses Projekt');
  }
}

// Seite schliessen: Sperre freigeben (klappt nicht immer – dann laeuft sie nach 5 Min ab)
window.addEventListener('pagehide', () => {
  if(CURRENT_PROJECT_ID && lockGehoertMir(currentProjectLock) && supabaseClient){
    try { supabaseClient.from('project_locks').delete().eq('project_id', CURRENT_PROJECT_ID).eq('user_id', currentUser.id).then(() => {}, () => {}); } catch(e){}
  }
});

// Tab im Hintergrund: nicht verlaengern; zurueck im Tab: Sperre neu pruefen
document.addEventListener('visibilitychange', () => {
  if(document.hidden) stopLockCheck();
  else if(CURRENT_PROJECT_ID) lockProject(CURRENT_PROJECT_ID);
});


// ══════════════════════════════════════════════════════════════════════════
//   ERWEITERUNGEN (Design-/UX-Paket)
// ══════════════════════════════════════════════════════════════════════════

// ── Eigene Dialoge statt confirm()/prompt() des Browsers ──────────────────
// Gleiche Bedienung wie vorher (true/false bzw. Text/null), aber im App-Design.
// Erster Absatz der Meldung = Ueberschrift, der Rest = Erklaerung.
function appDialog({ titel = '', text = '', wert = null, ok = 'OK', abbrechen = 'Abbrechen', gefahr = false } = {}){
  return new Promise(resolve => {
    const vorher = document.activeElement;
    const ov = document.createElement('div');
    ov.className = 'app-dialog-overlay';
    ov.innerHTML = `<div class="app-dialog" role="alertdialog" aria-modal="true" aria-labelledby="app-dialog-titel">
        <h2 id="app-dialog-titel"></h2>
        <p class="app-dialog-text"></p>
        ${wert !== null ? '<input type="text" class="sp-inp app-dialog-eingabe" autocomplete="off">' : ''}
        <div class="app-dialog-knoepfe">
          <button type="button" class="btn btn-ghost" data-antwort="nein"></button>
          <button type="button" class="btn ${gefahr ? 'app-dialog-gefahr' : 'btn-primary'}" data-antwort="ja"></button>
        </div>
      </div>`;
    ov.querySelector('h2').textContent = titel;
    const p = ov.querySelector('.app-dialog-text');
    p.textContent = text; p.hidden = !text;
    ov.querySelector('[data-antwort="nein"]').textContent = abbrechen;
    ov.querySelector('[data-antwort="ja"]').textContent = ok;
    const inp = ov.querySelector('.app-dialog-eingabe');
    if(inp) inp.value = wert;
    function ende(antwort){
      document.removeEventListener('keydown', taste, true);
      ov.remove();
      try { if(vorher && vorher.focus) vorher.focus({ preventScroll: true }); } catch(_){}
      resolve(antwort);
    }
    const ja = () => ende(inp ? inp.value : true);
    const nein = () => ende(inp ? null : false);
    function taste(e){
      if(e.key === 'Escape'){ e.preventDefault(); e.stopPropagation(); nein(); }
      // Enter bestaetigt nur im Eingabefeld – bei Rueckfragen loest Enter den
      // gerade markierten Knopf aus (bei Loeschen ist das "Abbrechen").
      else if(e.key === 'Enter' && inp && document.activeElement === inp){ e.preventDefault(); e.stopPropagation(); ja(); }
    }
    ov.addEventListener('click', e => { if(e.target === ov) nein(); });
    ov.querySelector('[data-antwort="ja"]').addEventListener('click', ja);
    ov.querySelector('[data-antwort="nein"]').addEventListener('click', nein);
    document.addEventListener('keydown', taste, true);
    document.body.appendChild(ov);
    setTimeout(() => {
      const ziel = inp || ov.querySelector(gefahr ? '[data-antwort="nein"]' : '[data-antwort="ja"]');
      if(ziel){ ziel.focus(); if(inp) inp.select(); }
    }, 30);
  });
}
function _dialogTeile(msg){
  const t = String(msg ?? '');
  const i = t.indexOf('\n\n');
  return i > 0 ? [t.slice(0, i), t.slice(i + 2)] : [t, ''];
}
const DIALOG_GEFAHR = /lösch|zurücksetz|verloren|unwiderruflich|auflösen|entfernt|überschreib/i;
function appFrage(msg, opt = {}){
  const [titel, text] = _dialogTeile(msg);
  const gefahr = opt.gefahr !== undefined ? opt.gefahr : DIALOG_GEFAHR.test(String(msg));
  return appDialog({ titel, text, gefahr, ok: opt.ok || (gefahr ? 'Ja, fortfahren' : 'OK'), abbrechen: opt.abbrechen || 'Abbrechen' });
}
function appEingabe(msg, wert = '', opt = {}){
  const [titel, text] = _dialogTeile(msg);
  return appDialog({ titel, text, wert: String(wert ?? ''), ok: opt.ok || 'Übernehmen' });
}

// ── Sicherung auf dem Geraet + Sync-Status ────────────────────────────────
// Bisher lagen Messwerte bis zum erfolgreichen Upload nur im Arbeitsspeicher.
// Jetzt: jede Aenderung wird sofort im Geraet gesichert und erst geloescht,
// wenn genau dieser Stand in der Cloud angekommen ist. Beim Oeffnen eines
// Projekts wird gefragt, falls noch nicht hochgeladene Werte existieren –
// nie still ueberschrieben.
const OFFLINE_SCHLUESSEL = pid => `pv_offline_v1::${currentUser ? currentUser.id : 'anon'}::${pid}`;
let syncStand = null;          // { id: JSON } – zuletzt bestaetigter Cloud-Stand
let syncFehler = false;
let syncLetzterUpload = null;
let syncWiederholung = null;

function offlineSichern(){
  if(!CURRENT_PROJECT_ID || !APP_STATE || !Object.keys(APP_STATE).length) return;
  try {
    localStorage.setItem(OFFLINE_SCHLUESSEL(CURRENT_PROJECT_ID), JSON.stringify({
      state: APP_STATE, at: new Date().toISOString(), name: (getCurrentProject() || {}).name || ''
    }));
  } catch(_){}
}
function offlineLesen(pid){
  try { const roh = localStorage.getItem(OFFLINE_SCHLUESSEL(pid)); return roh ? JSON.parse(roh) : null; } catch(_){ return null; }
}
function offlineLoeschen(pid){ try { localStorage.removeItem(OFFLINE_SCHLUESSEL(pid)); } catch(_){} }

function _standAlsMap(obj){
  const m = {};
  Object.keys(obj || {}).forEach(k => { m[k] = JSON.stringify(obj[k]); });
  return m;
}
function syncStandMerken(){ syncStand = _standAlsMap(APP_STATE); syncFehler = false; updateSyncStatus(); }
function syncStandZuruecksetzen(){ syncStand = null; syncFehler = false; syncLetzterUpload = null; abOffen = false; abDaten = null; updateSyncStatus(); }

function syncAenderungen(){
  const ab = abOffen ? 1 : 0;
  if(!syncStand || !APP_STATE) return ab;
  const ids = new Set([...Object.keys(syncStand), ...Object.keys(APP_STATE)]);
  let n = 0;
  ids.forEach(k => { if(JSON.stringify(APP_STATE[k]) !== syncStand[k]) n++; });
  return n + ab;
}

function syncErfolg(pid, gesendet){
  if(pid !== CURRENT_PROJECT_ID) return;
  syncStand = _standAlsMap(JSON.parse(gesendet));
  syncFehler = false;
  syncLetzterUpload = new Date();
  clearTimeout(syncWiederholung);
  // Nur loeschen, wenn seit dem Absenden nichts mehr geaendert wurde
  if(JSON.stringify(APP_STATE) === gesendet) offlineLoeschen(pid); else offlineSichern();
  updateSyncStatus();
}

function syncFehlschlag(pid){
  if(pid !== CURRENT_PROJECT_ID) return;
  syncFehler = true;
  offlineSichern();
  clearTimeout(syncWiederholung);
  // Automatisch erneut versuchen, solange noch etwas offen ist
  syncWiederholung = setTimeout(() => {
    if(syncAenderungen() > 0 && navigator.onLine !== false) flushCloudSync();
  }, 30000);
  updateSyncStatus();
}

function updateSyncStatus(){
  const el = g('sync-status');
  if(!el) return;
  if(!CURRENT_PROJECT_ID || !currentUser){ el.hidden = true; return; }
  const n = syncAenderungen();
  const laeuft = cloudSaveQueues.has(CURRENT_PROJECT_ID);
  const offline = navigator.onLine === false;
  let art, text, knopf = false;
  if(n > 0 && (syncFehler || offline)){
    art = 'offen'; knopf = true;
    text = `${n} ${n === 1 ? 'Änderung' : 'Änderungen'} noch nicht hochgeladen – auf diesem Gerät gesichert`;
  } else if(n > 0 || laeuft){
    art = 'laeuft'; text = 'Wird gespeichert …';
  } else {
    art = 'ok';
    text = syncLetzterUpload
      ? `Alles gespeichert · ${syncLetzterUpload.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' })}`
      : 'Alles gespeichert';
  }
  el.hidden = false;
  el.className = 'sync-status sync-' + art;
  const t = g('sync-status-text'); if(t) t.textContent = text;
  const b = g('sync-jetzt'); if(b) b.hidden = !knopf;
}

async function syncJetzt(){
  if(navigator.onLine === false) return toast('Kein Netz – der Upload startet automatisch, sobald wieder Verbindung da ist');
  const ok = await flushCloudSync();
  toast(ok ? 'Hochgeladen' : 'Hochladen fehlgeschlagen – neuer Versuch folgt automatisch');
}

async function offlineWiederherstellenPruefen(pid){
  const b = offlineLesen(pid);
  if(!b || !b.state || pid !== CURRENT_PROJECT_ID) return;
  const anders = Object.keys(b.state).filter(k => JSON.stringify(b.state[k]) !== JSON.stringify(APP_STATE[k])).length;
  if(!anders){ offlineLoeschen(pid); return; }
  if(!canEditMeasurement()){
    toast('Auf diesem Gerät liegen noch nicht hochgeladene Werte – das Protokoll ist aber gesperrt');
    return;
  }
  const wann = new Date(b.at).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' });
  const uebernehmen = await appFrage(
    `Nicht hochgeladene Messwerte gefunden\n\nAuf diesem Gerät sind Änderungen an ${anders} ${anders === 1 ? 'String' : 'Strings'} vom ${wann} gesichert, `
    + 'die noch nicht in der Cloud sind. Sollen sie wiederhergestellt und hochgeladen werden?',
    { ok: 'Wiederherstellen', abbrechen: 'Verwerfen', gefahr: false });
  let wiederherstellen = uebernehmen;
  if(!uebernehmen){
    wiederherstellen = !(await appFrage('Änderungen wirklich verwerfen?\n\nDie nicht hochgeladenen Werte auf diesem Gerät werden gelöscht. Es gilt der Stand aus der Cloud.',
      { ok: 'Verwerfen', gefahr: true }));
  }
  if(wiederherstellen){
    APP_STATE = { ...APP_STATE, ...b.state };
    renderMatrix();
    updateSyncStatus();
    saveProjectToCloud(pid);
    toast('Messwerte wiederhergestellt');
  } else {
    offlineLoeschen(pid);
  }
}

window.addEventListener('online', updateSyncStatus);
window.addEventListener('offline', updateSyncStatus);
// Beim Verlassen warnen, wenn noch etwas nicht in der Cloud ist
window.addEventListener('beforeunload', e => {
  if(syncAenderungen() > 0){ e.preventDefault(); e.returnValue = ''; }
});

// ── Naechster offener String ──────────────────────────────────────────────
function springeZuNaechstemOffenen(){
  const offen = [...document.querySelectorAll('tr.row-incomplete[data-string-id]')];
  if(!offen.length) return toast(CURRENT_PROJECT_ID ? 'Alle aktiven Strings sind fertig gemessen' : 'Kein Projekt geöffnet');
  const aktiv = document.activeElement && document.activeElement.closest ? document.activeElement.closest('tr[data-string-id]') : null;
  let ziel = null;
  if(aktiv){
    ziel = offen.find(r => r !== aktiv && (aktiv.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING));
  } else {
    const anker = Math.min(window.innerHeight * 0.32, 220);
    ziel = offen.find(r => r.offsetParent !== null && r.getBoundingClientRect().top > anker);
  }
  if(!ziel) ziel = offen[0];
  const block = ziel.closest('.wr-block');
  if(block && block.style.display === 'none'){
    const alle = document.querySelector('.wr-tab[data-wr="0"]');
    if(alle) filterInverter(0, alle);
  }
  const id = ziel.dataset.stringId;
  ziel.scrollIntoView({ behavior: 'smooth', block: 'center' });
  document.querySelectorAll('tr.row-focus').forEach(r => r.classList.remove('row-focus'));
  ziel.classList.add('row-focus');
  const feld = ['uoc', 'isc', 'riso'].map(f => g(`${f}-${id}`)).find(el => el && !el.readOnly && !el.value) || g(`uoc-${id}`);
  if(feld && !feld.readOnly){ try { feld.focus({ preventScroll: true }); } catch(_){} }
  toast(`String ${id} · noch ${offen.length} offen`);
}

// ── Pruefprotokoll als PDF (Druckansicht -> "Als PDF speichern") ──────────
// optionen: { win, beschreibung, fotoUrl } – win wird vom Dialog schon im
// Klick geoeffnet, damit der Popup-Blocker nicht zuschlaegt.
function druckePruefprotokoll(optionen = {}){
  const proj = getCurrentProject();
  if(!proj) return toast('Bitte zuerst ein Projekt öffnen');
  const win = optionen.win || window.open('', '_blank');
  if(!win) return toast('Popup wurde blockiert – bitte Popups für diese Seite erlauben');
  if(optionen.win) win.document.open();
  const beschreibung = String(optionen.beschreibung ?? proj.beschreibung ?? '').trim();
  const fotoUrl = optionen.fotoUrl || '';
  const wrFotos = optionen.wrFotos || [];
  const plan = getCurrentPlan();
  const wp = getCurrentWp();
  const zeit = iso => iso ? new Date(iso).toLocaleString('de-AT', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const logoEl = document.querySelector('#auth-gate .brand-logo--light');
  const logo = logoEl ? logoEl.getAttribute('src') : '';
  const zahl = v => (v === undefined || v === null || String(v).trim() === '') ? '<span class="leer">—</span>' : esc(String(v));

  let aktiv = 0, fertig = 0, offen = 0, krit = 0, module = 0;
  const auffaellig = [];
  const proWr = {};
  const wrSumme = {};   // je WR: Strings, fertig, offen, auffaellig, Module
  getAllFullIds().forEach(id => {
    const it = APP_STATE[id];
    if(!it || it.stat !== 'JA') return;
    const st = getStringStatus(id);
    const ev = evaluateString(id);
    aktiv++; module += Number(it.mod) || 0;
    if(st === 'COMPLETE') fertig++; else offen++;
    if(ev.level === 'crit' || st === 'ERROR'){ krit++; auffaellig.push({ id, msgs: ev.msgs }); }
    const wr = id.split('.')[0];
    const status = (ev.level === 'crit' || st === 'ERROR') ? ['krit', 'Auffällig'] : (st === 'COMPLETE' ? ['ok', 'OK'] : ['offen', 'Offen']);
    const sw = wrSumme[wr] = wrSumme[wr] || { n: 0, fertig: 0, offen: 0, krit: 0, module: 0 };
    sw.n++; sw.module += Number(it.mod) || 0;
    if(st === 'COMPLETE') sw.fertig++; else sw.offen++;
    if(status[0] === 'krit') sw.krit++;
    const f = k => ev.fields[k] ? ` class="z ${ev.fields[k]}"` : ' class="z"';
    (proWr[wr] = proWr[wr] || []).push(`<tr>
      <td class="id">${esc(id)}</td><td>${esc(it.planName || '—')}</td><td>${esc(it.gak || '—')}</td>
      <td class="z">${zahl(it.mod)}</td><td${f('uoc')}>${zahl(it.uoc)}</td><td${f('isc')}>${zahl(it.isc)}</td><td${f('riso')}>${zahl(it.riso)}</td>
      <td><span class="st ${status[0]}">${status[1]}</span></td><td class="note">${esc(it.note || '')}</td></tr>`);
  });
  const kwp = (module * wp / 1000).toFixed(2);
  const statusText = proj.abnahme ? 'Abgenommen' : (proj.locked ? 'Freigegeben (gesperrt)' : 'In Bearbeitung');
  const bereich = BEREICHE[projektBereich(proj)] ? BEREICHE[projektBereich(proj)].name : '—';
  const pruefer = (proj.signature && proj.signature.name) || anzeigeName() || '—';
  const unterschrift = (sig, rolle) => (sig && sig.dataUrl)
    ? `<div class="sig"><img src="${sig.dataUrl}" alt="Unterschrift ${rolle}"><div class="sig-l"></div><div><strong>${esc(sig.name || '')}</strong> · ${rolle}</div><div class="klein">digital unterschrieben am ${zeit(sig.at)}</div></div>`
    : `<div class="sig"><div class="sig-leer"></div><div class="sig-l"></div><div>${rolle}</div><div class="klein">Ort, Datum, Unterschrift</div></div>`;
  const heuteKurz = new Date().toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  // Jeder Wechselrichter auf einer eigenen Seite – mit eigener Kopfzeile und
  // Zwischensumme, damit jede Seite fuer sich verstaendlich ist.
  const wrHtml = Object.keys(proWr).map(Number).sort((a, b) => a - b).map(wr => {
    const name = (plan[wr] && plan[wr].name) ? plan[wr].name : 'WR ' + wr;
    const s = wrSumme[wr];
    return `<section class="wr">
      <div class="wr-kopf"><span>Prüfprotokoll · ${esc(proj.name || '')}</span><span>${heuteKurz}</span></div>
      <h2>${esc(name)} <span>WR ${wr}</span></h2>
      <div class="wr-summe"><span><b>${s.n}</b> Strings</span><span><b>${s.module}</b> Module</span>
        <span><b>${(s.module * wp / 1000).toFixed(2)}</b> kWp</span><span class="ok"><b>${s.fertig}</b> fertig</span>
        <span class="offen"><b>${s.offen}</b> offen</span><span class="krit"><b>${s.krit}</b> auffällig</span></div>
      <table><thead><tr><th>Klemme</th><th>Plan-String</th><th>GAK</th><th class="z">Module</th><th class="z">Uoc (V)</th>
      <th class="z">Isc (A)</th><th class="z">Riso (MΩ)</th><th>Status</th><th>Bemerkung</th></tr></thead>
      <tbody>${proWr[wr].join('')}</tbody></table></section>`;
  }).join('');
  const auffHtml = auffaellig.length
    ? `<section class="auff"><h2>Auffälligkeiten <span>${auffaellig.length}</span></h2><ul>${auffaellig.map(a =>
        `<li><strong>${esc(a.id)}</strong> – ${esc((a.msgs || []).join(' · ') || 'Wert außerhalb des gültigen Bereichs')}</li>`).join('')}</ul></section>`
    : '';
  const heute = new Date().toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });

  win.document.write(`<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"><title>Prüfprotokoll ${esc(proj.name)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  @page { size: A4 portrait; margin: 14mm 12mm 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Inter, system-ui, sans-serif; color: #18181b; margin: 0; font-size: 9pt; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .seite { max-width: 190mm; margin: 0 auto; padding: 16px; }
  .leiste { position: sticky; top: 0; background: #fff; border-bottom: 1px solid #e4e4e7; padding: 10px 16px; display: flex; gap: 10px; align-items: center; justify-content: space-between; font-size: 10pt; }
  .leiste button { font: inherit; font-weight: 600; background: #93BD14; color: #172300; border: 0; border-radius: 6px; padding: 9px 16px; cursor: pointer; }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; border-bottom: 3px solid #93BD14; padding-bottom: 12px; }
  header img { height: 46px; }
  h1 { font-size: 17pt; margin: 0 0 2px; letter-spacing: -.02em; }
  .unter { color: #6b6b73; font-size: 9.5pt; }
  .meta { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px 16px; margin: 14px 0; }
  .meta div span { display: block; color: #6b6b73; font-size: 7.5pt; }
  .meta div strong { font-weight: 600; }
  .kacheln { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; margin-bottom: 16px; }
  .kachel { border: 1px solid #e4e4e7; border-radius: 6px; padding: 8px 10px; border-top: 3px solid var(--f, #93BD14); }
  .kachel b { display: block; font-size: 14pt; font-variant-numeric: tabular-nums; }
  .kachel span { color: #6b6b73; font-size: 7.5pt; }
  h2 { font-size: 11pt; margin: 18px 0 6px; display: flex; justify-content: space-between; align-items: baseline; }
  h2 span { color: #6b6b73; font-weight: 500; font-size: 8.5pt; }
  /* Projektbeschreibung + Anlagenfoto (Seite 1) */
  .projekt { display: grid; gap: 14px; margin: 0 0 16px; break-inside: avoid; }
  .projekt.mit-foto { grid-template-columns: 1fr 1fr; align-items: start; }
  .projekt-text span { display: block; color: #6b6b73; font-size: 7.5pt; margin-bottom: 3px; }
  .projekt-text p { margin: 0; white-space: pre-line; line-height: 1.5; font-size: 9pt; }
  .projekt-foto { margin: 0; }
  .projekt-foto img { width: 100%; max-height: 80mm; object-fit: cover; border-radius: 6px; border: 1px solid #e4e4e7; display: block; }
  .projekt-foto figcaption { color: #6b6b73; font-size: 7.5pt; margin-top: 3px; }
  .projekt:not(.mit-foto) .projekt-text { max-width: 150mm; }
  .projekt.mit-foto:not(:has(.projekt-text)) { grid-template-columns: 1fr; }
  /* Jeder Wechselrichter beginnt auf einer neuen Seite */
  .wr { break-before: page; page-break-before: always; }
  .wr h2 { margin-top: 6px; font-size: 13pt; }
  .wr-kopf { display: flex; justify-content: space-between; color: #6b6b73; font-size: 7.5pt; border-bottom: 2px solid #93BD14; padding-bottom: 5px; }
  .wr-summe { display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 8.5pt; color: #52525b; margin: 0 0 8px; }
  .wr-summe b { color: #18181b; font-variant-numeric: tabular-nums; }
  .wr-summe .ok b { color: #15803d; } .wr-summe .offen b { color: #b45309; } .wr-summe .krit b { color: #c8261c; }
  thead { display: table-header-group; }
  .fotos { break-before: page; page-break-before: always; }
  .foto-raster { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .foto-raster figure { margin: 0; break-inside: avoid; }
  .foto-raster img { width: 100%; height: 62mm; object-fit: cover; border-radius: 6px; border: 1px solid #e4e4e7; display: block; }
  .foto-raster figcaption { color: #6b6b73; font-size: 7.5pt; margin-top: 3px; }
  @media screen { .fotos { margin-top: 36px; padding-top: 18px; border-top: 1px dashed #d4d4d8; } }
  @media screen { .wr { margin-top: 36px; padding-top: 18px; border-top: 1px dashed #d4d4d8; } }
  table { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  th { text-align: left; font-weight: 600; color: #3f3f46; background: #f4f4f5; border-bottom: 1px solid #d4d4d8; padding: 5px 6px; font-size: 8pt; }
  td { border-bottom: 1px solid #ececef; padding: 4px 6px; vertical-align: top; }
  tr { break-inside: avoid; }
  .z { text-align: right; }
  .id { font-weight: 600; white-space: nowrap; }
  .note { color: #52525b; font-size: 8pt; }
  .leer { color: #a1a1aa; }
  td.crit { color: #c8261c; font-weight: 700; background: #fef1f0; }
  td.warn { color: #b45309; font-weight: 600; }
  .st { font-size: 7.5pt; font-weight: 600; padding: 1px 6px; border-radius: 99px; white-space: nowrap; }
  .st.ok { background: #f3f9e3; color: #4d7a05; } .st.offen { background: #fff6e5; color: #9a5b00; } .st.krit { background: #fef1f0; color: #c8261c; }
  .auff ul { margin: 0; padding-left: 16px; } .auff li { margin: 2px 0; }
  .auff h2 span { color: #c8261c; }
  .unterschriften { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-top: 24px; break-inside: avoid; }
  .sig img { height: 50px; max-width: 100%; display: block; }
  .sig-leer { height: 50px; }
  .sig-l { border-top: 1px solid #18181b; margin: 2px 0 4px; }
  .klein { color: #6b6b73; font-size: 7.5pt; }
  footer { margin-top: 18px; color: #a1a1aa; font-size: 7.5pt; display: flex; justify-content: space-between; }
  @media print { .leiste { display: none; } .seite { padding: 0; } }
</style></head><body>
<div class="leiste"><span>Prüfprotokoll – zum Speichern im Druckdialog <strong>„Als PDF speichern“</strong> wählen.</span><button onclick="window.print()">Drucken / PDF</button></div>
<div class="seite">
  <header><div><h1>Prüfprotokoll</h1><div class="unter">DC-Strangmessung · Inbetriebnahme</div></div>${logo ? `<img src="${logo}" alt="SOLPRO">` : '<strong>SOLPRO</strong>'}</header>
  <div class="meta">
    <div><span>Projekt</span><strong>${esc(proj.name || '—')}</strong></div>
    <div><span>Bereich</span><strong>${esc(bereich)}</strong></div>
    <div><span>Gruppe</span><strong>${esc(proj.group || '—')}</strong></div>
    <div><span>Status</span><strong>${statusText}</strong></div>
    <div><span>Modulleistung</span><strong>${wp} Wp</strong></div>
    <div><span>Anlagenleistung aktiv</span><strong>${kwp} kWp</strong></div>
    <div><span>Prüfer</span><strong>${esc(pruefer)}</strong></div>
    <div><span>Erstellt am</span><strong>${heute}</strong></div>
  </div>
  ${(beschreibung || fotoUrl) ? `<div class="projekt${fotoUrl ? ' mit-foto' : ''}">
    ${beschreibung ? `<div class="projekt-text"><span>Projektbeschreibung</span><p>${esc(beschreibung)}</p></div>` : ''}
    ${fotoUrl ? `<figure class="projekt-foto"><img src="${esc(fotoUrl)}" alt="Anlagenfoto"><figcaption>Anlagenfoto</figcaption></figure>` : ''}
  </div>` : ''}
  <div class="kacheln">
    <div class="kachel"><b>${aktiv}</b><span>Strings aktiv</span></div>
    <div class="kachel" style="--f:#2563EB"><b>${module}</b><span>Module</span></div>
    <div class="kachel" style="--f:#15803D"><b>${fertig}</b><span>fertig gemessen</span></div>
    <div class="kachel" style="--f:#E08A00"><b>${offen}</b><span>offen</span></div>
    <div class="kachel" style="--f:#C8261C"><b>${krit}</b><span>auffällig</span></div>
  </div>
  ${auffHtml}
  ${wrHtml || '<p>Keine aktiven Strings.</p>'}
  <div class="unterschriften">${unterschrift(proj.signature, 'Prüfer')}${unterschrift(proj.abnahme, 'Abnahme')}</div>
  ${wrFotos.length ? `<section class="fotos"><div class="wr-kopf"><span>Prüfprotokoll · ${esc(proj.name || '')}</span><span>${heuteKurz}</span></div>
    <h2>Fotodokumentation <span>${wrFotos.length} ${wrFotos.length === 1 ? 'Foto' : 'Fotos'}</span></h2>
    <div class="foto-raster">${wrFotos.map(f => `<figure><img src="${esc(f.url)}" alt=""><figcaption>WR ${f.wr} – ${esc(f.name)}</figcaption></figure>`).join('')}</div></section>` : ''}
  <footer><span>SOLPRO Messtool</span><span>${esc(proj.name || '')} · ${heute}</span></footer>
</div>
<script>
  // Erst drucken, wenn die Schrift (Inter) wirklich geladen ist – sonst zeigt
  // die erste Druckvorschau eine Ersatzschrift und "Als PDF speichern" sieht
  // danach anders aus (andere Umbrueche).
  window.addEventListener('load', function(){
    var bereit = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
    var notfall = new Promise(function(r){ setTimeout(r, 3000); });
    Promise.race([bereit, notfall]).then(function(){ setTimeout(function(){ window.print(); }, 150); });
  });
<\/script>
</body></html>`);
  win.document.close();
}

// ── Datensicherung (Admin): alle Projekte als Datei ───────────────────────
async function datensicherungExport(){
  if(currentUserRole !== 'admin') return toast('Nur für Admins');
  if(!supabaseClient || !currentUser) return toast('Keine Verbindung');
  toast('Sicherung wird erstellt …');
  try {
    await flushCloudSync();
    const { data, error } = await supabaseClient.from('pv_projects').select('*');
    if(error) throw error;
    const inhalt = { erstellt: new Date().toISOString(), von: currentUser.email, anzahl: (data || []).length, projekte: data || [] };
    const blob = new Blob([JSON.stringify(inhalt, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `SOLPRO-Messtool-Sicherung_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    toast(`Sicherung mit ${inhalt.anzahl} Projekten gespeichert`);
  } catch(e){
    toastError('Sicherung fehlgeschlagen', e);
  }
}

// ── Benutzerverwaltung: Suche ─────────────────────────────────────────────
function filterUsers(text){
  const q = String(text || '').trim().toLowerCase();
  document.querySelectorAll('#users-list .user-row').forEach(r => {
    r.hidden = !!q && !(r.dataset.suche || '').includes(q);
  });
}

// ── Pruefprotokoll-Dialog: Projektbeschreibung + Anlagenfoto ──────────────
// Beides wird am Projekt gespeichert (Beschreibung in der Projekt-Konfig,
// Foto ueber das bestehende Foto-System mit ziel "wr:anlage"), damit es
// beim naechsten Export und fuer das ganze Team wieder da ist.
const ANLAGENFOTO = 'anlage';

async function pruefprotokollDialog(){
  if(!darf('export')) return toast('Keine Berechtigung für Exporte');
  const proj = getCurrentProject();
  if(!proj) return toast('Bitte zuerst ein Projekt öffnen');
  const pid = proj.id;
  const darfAendern = typeof fotoDarfAendern === 'function' ? fotoDarfAendern() : true;
  let gewaehlt = null;          // Pfad des gewaehlten Fotos, '' = kein Foto
  let fotos = [];

  const ov = document.createElement('div');
  ov.className = 'app-dialog-overlay';
  ov.innerHTML = `<div class="app-dialog pp-dialog" role="dialog" aria-modal="true" aria-labelledby="ppd-titel">
      <h2 id="ppd-titel">Prüfprotokoll erstellen</h2>
      <label class="ppd-label" for="ppd-text">Projektbeschreibung <span>optional</span></label>
      <textarea id="ppd-text" class="sp-inp ppd-text" rows="4" maxlength="800"
        placeholder="z. B. Aufdachanlage Halle 3, 3 Wechselrichter, DC-Messung zur Inbetriebnahme"></textarea>
      <div class="ppd-foto-kopf">
        <span class="ppd-label">Anlagenfoto <span>optional</span></span>
        <button type="button" class="btn btn-ghost ppd-neu">${ICON.camera} Foto aufnehmen / wählen</button>
      </div>
      <div class="ppd-fotos" role="radiogroup" aria-label="Anlagenfoto auswählen"></div>
      <p class="ppd-hinweis" hidden>Das Protokoll ist abgeschlossen – Beschreibung und Foto kann nur noch der Admin ändern.</p>
      <div class="app-dialog-knoepfe">
        <button type="button" class="btn btn-ghost" data-a="nein">Abbrechen</button>
        <button type="button" class="btn btn-primary" data-a="ja">Protokoll erstellen</button>
      </div>
    </div>`;
  const ta = ov.querySelector('#ppd-text');
  const liste = ov.querySelector('.ppd-fotos');
  const neuBtn = ov.querySelector('.ppd-neu');
  ta.value = proj.beschreibung || '';
  if(!darfAendern){ ta.readOnly = true; neuBtn.hidden = true; ov.querySelector('.ppd-hinweis').hidden = false; }

  async function fotosLaden(){
    if(typeof fotoListeLaden !== 'function') return zeichnen();
    await fotoListeLaden(pid);
    const pfade = fotoFuerWr(pid, ANLAGENFOTO).filter(f => !f.wartet).map(f => f.pfad);
    if(pfade.length) await fotoUrlsHolen(pfade);
    fotos = fotoFuerWr(pid, ANLAGENFOTO).filter(f => f.url);
    if(gewaehlt === null) gewaehlt = fotos.length ? fotos[fotos.length - 1].pfad : '';   // neuestes vorwaehlen
    zeichnen();
  }
  function zeichnen(){
    const kachel = (pfad, inhalt, titel) =>
      `<button type="button" class="ppd-foto${gewaehlt === pfad ? ' an' : ''}" role="radio" aria-checked="${gewaehlt === pfad}" data-pfad="${esc(pfad)}" title="${esc(titel)}">${inhalt}</button>`;
    liste.innerHTML = kachel('', '<span class="ppd-kein">Kein Foto</span>', 'Ohne Foto')
      + fotos.map(f => kachel(f.pfad, `<img src="${esc(f.url)}" alt="">`, f.wartet ? 'wird noch hochgeladen' : 'Anlagenfoto')).join('');
  }
  liste.addEventListener('click', e => {
    const b = e.target.closest('.ppd-foto');
    if(!b) return;
    gewaehlt = b.dataset.pfad;
    zeichnen();
  });
  neuBtn.addEventListener('click', () => {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.setAttribute('capture', 'environment');
    inp.style.display = 'none';
    inp.onchange = async () => {
      const d = inp.files && inp.files[0];
      inp.remove();
      if(!d) return;
      neuBtn.disabled = true;
      await fotoHinzufuegen(pid, ANLAGENFOTO, d);
      gewaehlt = null;               // neues Foto automatisch waehlen
      await fotosLaden();
      neuBtn.disabled = false;
    };
    document.body.appendChild(inp);
    inp.click();
  });

  function schliessen(){ document.removeEventListener('keydown', taste, true); ov.remove(); }
  function taste(e){ if(e.key === 'Escape'){ e.preventDefault(); schliessen(); } }
  ov.addEventListener('click', e => { if(e.target === ov) schliessen(); });
  ov.querySelector('[data-a="nein"]').addEventListener('click', schliessen);
  ov.querySelector('[data-a="ja"]').addEventListener('click', () => {
    // Fenster sofort im Klick oeffnen – sonst blockiert der Browser das Popup
    const win = window.open('', '_blank');
    if(!win) return toast('Popup wurde blockiert – bitte Popups für diese Seite erlauben');
    win.document.write('<p style="font-family:system-ui,sans-serif;padding:24px;color:#6b6b73">Protokoll wird erstellt …</p>');
    const text = ta.value.trim();
    if(darfAendern && text !== (proj.beschreibung || '')){
      proj.beschreibung = text;
      saveProjectToCloud(pid, true);
    }
    const foto = fotos.find(f => f.pfad === gewaehlt);
    schliessen();
    (async () => {
      let wrFotos = [];
      try { wrFotos = await wrFotosSammeln(pid); } catch(_){}
      druckePruefprotokoll({ win, beschreibung: text, fotoUrl: foto ? foto.url : '', wrFotos });
    })();
  });

  document.addEventListener('keydown', taste, true);
  document.body.appendChild(ov);
  setTimeout(() => ta.focus(), 30);
  fotosLaden();
}

// Alle Fotos der Wechselrichter eines Projekts (mit Links) – fuer Protokoll und Anlagenbuch
async function wrFotosSammeln(pid){
  if(typeof fotoListeLaden !== 'function') return [];
  await fotoListeLaden(pid);
  const plan = getCurrentPlan();
  const wrs = Object.keys(plan).map(Number).sort((a, b) => a - b);
  const pfade = wrs.flatMap(wr => fotoFuerWr(pid, wr)).filter(f => !f.wartet).map(f => f.pfad);
  if(pfade.length) await fotoUrlsHolen(pfade);
  return wrs.flatMap(wr => fotoFuerWr(pid, wr).filter(f => f.url)
    .map(f => ({ wr, name: (plan[wr] && plan[wr].name) || 'WR ' + wr, url: f.url })));
}

// ══════════════════════════════════════════════════════════════════════════
//   ANLAGENBUCH (Dokumentation nach OVE/ONORM E 8101)
//   Eigener Reiter, nur mit Recht "anlagenbuch" (Standard: nur Admin).
//   Angaben liegen im Projekt (config._anlagenbuch), Komponenten mit
//   Datenblaettern im Katalog (pv_komponenten), projektbezogene Dokumente in
//   pv_projekt_dokumente. Daraus entsteht EIN PDF inkl. angehaengter
//   Datenblaetter (pdf-lib).
// ══════════════════════════════════════════════════════════════════════════
var abVersion = 0;          // zaehlt Aenderungen am Anlagenbuch
var abOffen = false;        // Aenderungen noch nicht in der Cloud
let abDaten = null;         // Anlagenbuch des offenen Projekts
let abKatalog = [];         // pv_komponenten
let abDokumente = [];       // pv_projekt_dokumente des Projekts
let abSpeicherTimer = null;
const AB_BUCKET = 'pv-dokumente';
const AB_MAX_DATEI = 25 * 1024 * 1024;
const AB_PDFLIB = 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js';

const AB_KAT = {
  modul: 'Solarmodul', wechselrichter: 'Wechselrichter', speicher: 'Stromspeicher',
  unterkonstruktion: 'Unterkonstruktion', schutz: 'Überspannungsschutz', stempel: 'Firmenstempel', sonstiges: 'Sonstiges'
};
const AB_KAT_DATEN = {
  modul: [['wp', 'Nennleistung (Wp)'], ['uoc', 'Uoc bei STC (V)'], ['isc', 'Isc bei STC (A)'], ['tk_uoc', 'Temperaturkoeffizient Uoc (%/K, z. B. -0,27)']],
  wechselrichter: [['leistung_kw', 'AC-Nennleistung (kW)'], ['ip', 'Schutzart (z. B. IP66)']],
  speicher: [['kapazitaet', 'Kapazität (kWh)'], ['spannung', 'Nennspannung (V)']],
  schutz: [['typ', 'Ableiter-Typ (z. B. Typ I+II)'], ['seite', 'Einsatz (DC / AC)']],
  unterkonstruktion: [], stempel: [], sonstiges: []
};
const AB_DOK_KAT = {
  schaltplan: 'Schaltplan', stringplan: 'Stringplan', zertifikat: 'Zertifikat / Konformität',
  netzbetreiber: 'Netzbetreiber (Anmeldung, Fertigmeldung)', datenblatt: 'Datenblatt', sonstiges: 'Sonstiges'
};
const AB_ERGEBNIS = ['i. O.', 'nicht i. O.', 'nicht zutreffend'];
const AB_NORMEN = 'ÖVE/ÖNORM E 8101 – Elektrische Niederspannungsanlagen\n'
  + 'ÖVE/ÖNORM EN 62446-1 – Dokumentation und Prüfung netzgekoppelter PV-Anlagen\n'
  + 'OVE R 11-1 – PV-Anlagen: Schutz von Einsatzkräften\n'
  + 'OVE R 6-2-1 / R 6-2-2 – Blitz- und Überspannungsschutz';
const AB_BESTAETIGUNG = 'Hiermit wird bestätigt, dass die in diesem Anlagenbuch beschriebene Photovoltaikanlage nach den angeführten '
  + 'Normen und Richtlinien errichtet und einer Erstprüfung gemäß ÖVE/ÖNORM E 8101 (Besichtigung, Erprobung, Messung) '
  + 'unterzogen wurde. Die Prüfergebnisse sind in diesem Anlagenbuch dokumentiert.';

// Vorlagen "Betrieb & Wartung" je Anlagentyp (pro Projekt anpassbar)
const AB_BETRIEB = {
  notfall: 'Im Notfall (z. B. Brand oder Beschädigung) die Anlage auf der AC-Seite über den Trennschalter bzw. Leitungsschutzschalter '
    + 'im Zählerverteiler abschalten und – falls vorhanden – die DC-Freischaltung (Feuerwehrschalter) betätigen. '
    + 'Achtung: Solarmodule und DC-Leitungen stehen bei Tageslicht immer unter Spannung. Arbeiten an der Anlage nur durch eine Elektrofachkraft.',
  privat: 'Ertrag regelmäßig über die App bzw. das Monitoring des Wechselrichters kontrollieren – ein plötzlicher Ertragseinbruch deutet auf eine Störung hin.\n'
    + 'Einmal jährlich Sichtkontrolle auf Beschädigungen, starke Verschmutzung und lose Leitungen – vom Boden aus, nicht auf das Dach steigen.\n'
    + 'Eine Reinigung ist meist nicht nötig; bei starker Verschmutzung nur mit klarem Wasser und weicher Bürste, ohne Hochdruck und ohne Reinigungsmittel.\n'
    + 'Wir empfehlen eine wiederkehrende Überprüfung der Anlage durch eine Elektrofachkraft (z. B. alle 4 Jahre).',
  gewerbe: 'Ertrag und Störmeldungen laufend über das Monitoring überwachen.\n'
    + 'Jährliche Sichtprüfung von Modulfeld, Leitungswegen, Befestigungen und Brandschutzmaßnahmen.\n'
    + 'Wiederkehrende Prüfung der elektrischen Anlage gemäß ÖVE/ÖNORM E 8101 in den vorgeschriebenen bzw. vom Versicherer geforderten Intervallen; eine Thermografie des Modulfelds wird empfohlen.\n'
    + 'Freischalt- und Sicherheitseinrichtungen (Feuerwehrschalter, Überspannungsschutz) regelmäßig auf Funktion prüfen.',
  freiflaeche: 'Ertrag und Störmeldungen laufend über die Fernüberwachung kontrollieren.\n'
    + 'Regelmäßige Begehung: Modulfeld, Unterkonstruktion, Leitungswege, Einzäunung und Beschilderung.\n'
    + 'Grünpflege so durchführen, dass keine Verschattung entsteht und keine Leitungen beschädigt werden.\n'
    + 'Wiederkehrende Prüfung der elektrischen Anlage gemäß ÖVE/ÖNORM E 8101; eine Thermografie des Modulfelds wird empfohlen.'
};

const AB_ALLE = ['privat', 'gewerbe', 'freiflaeche'];
const AB_USCHUTZ = ['Typ I', 'Typ II', 'Typ I+II', 'Typ III', 'nicht vorhanden'];

// Kapitel mit Geltungsbereich: Privatkunden bekommen ein kompaktes,
// verstaendliches Anlagenbuch; Gewerbe und Freiflaeche die volle Tiefe.
// [pfad, beschriftung, typ, optionen/platzhalter]
const AB_KAPITEL = [
  { id: 'stamm', titel: 'Allgemeine Angaben & Stammdaten', fuer: AB_ALLE, felder: [
    ['betreiber.name', 'Anlagenbetreiber – Name'], ['betreiber.kontakt', 'Kontakt (Telefon, E-Mail)'],
    ['betreiber.adresse', 'Adresse des Betreibers', 'area'],
    ['standort.adresse', 'Anlagenadresse (Standort)', 'area'],
    ['zaehlpunkt', 'Zählpunktnummer (33-stellig, AT…)', 'zp'],
    ['inbetriebnahme', 'Datum der Erstinbetriebnahme', 'date'],
    ['aenderungen', 'Wesentliche nachträgliche Änderungen', 'area', 'Datum und Art der Änderung'],
    ['normen', 'Angewendete Normen und Richtlinien', 'area'],
    ['@beschreibung', 'Anlagenbeschreibung', 'area', 'Kurzbeschreibung der Anlage'],
    ['@foto', 'Anlagenfoto']
  ]},
  { id: 'anlage', titel: 'Art der PV-Anlage & Komponenten', fuer: AB_ALLE, felder: [
    ['betriebsart', 'Betriebsart', 'select', ['Netzparallelbetrieb', 'Netzparallelbetrieb mit Speicher', 'Inselbetrieb (AC-gekoppelt)', 'Inselbetrieb (DC-gekoppelt)']],
    ['modul.komponente', 'Solarmodul (aus Katalog)', 'katalog', 'modul'],
    ['modul.ausrichtung', 'Ausrichtung', 'text', 'z. B. Süd (180°) oder Ost/West'],
    ['modul.neigung', 'Neigungswinkel (°)', 'num'],
    ['montage.komponente', 'Unterkonstruktion (aus Katalog)', 'katalog', 'unterkonstruktion'],
    ['montage.text', 'Art der Montage', 'area', 'z. B. Dachhaken, Triangel-Aufständerung, Ballastierung'],
    ['@wr', 'Wechselrichter'],
    ['speicher.komponente', 'Stromspeicher (aus Katalog, leer = kein Speicher)', 'katalog', 'speicher'],
    ['speicher.ort', 'Aufstellungsort des Speichers'],
    ['speicher.lueftung', 'Be- und Entlüftung Batterieraum']
  ]},
  { id: 'sicherheit', titel: 'Sicherheit & Abschaltung', fuer: ['privat'], felder: [
    ['schalter.dc', 'DC-Freischaltung / Feuerwehrschalter – wo?', 'area', 'z. B. am Dachaustritt, im Technikraum'],
    ['schalter.ac', 'AC-Abschaltung – wo?', 'area', 'z. B. Leitungsschutzschalter im Zählerverteiler'],
    ['ueberspannung.dc', 'Überspannungsschutz DC-seitig', 'select', AB_USCHUTZ],
    ['ueberspannung.ac', 'Überspannungsschutz AC-seitig', 'select', AB_USCHUTZ],
    ['r11.kennzeichnung', 'Hinweisschild „PV-Anlage“ beim Hausanschluss bzw. Zählerverteiler', 'check'],
    ['r11.notaus', 'Feuerwehrschalter bzw. DC-Freischaltung vorhanden', 'check']
  ]},
  { id: 'verkabelung', titel: 'Verkabelung & Schutzorgane', fuer: ['gewerbe', 'freiflaeche'], felder: [
    ['kabel.dc_querschnitt', 'DC-Solarkabel – Querschnitt (mm²)'], ['kabel.dc_laenge', 'DC – Leitungslängen (m)'],
    ['kabel.dc_verlegung', 'DC – Verlegeart', 'text', 'z. B. im Freien UV-beständig, im Kabelkanal'],
    ['kabel.ac_querschnitt', 'AC-Zuleitung – Querschnitt (mm²)'], ['kabel.ac_laenge', 'AC – Leitungslänge (m)'],
    ['kabel.ac_verlegung', 'AC – Verlegeart', 'text', 'z. B. unter Putz, im Kabelkanal'],
    ['schalter.dc', 'DC-Freischaltung – Position und Typ', 'area', 'möglichst nahe am Generator'],
    ['schalter.ac', 'AC-seitige Netztrennung – Position und Typ', 'area'],
    ['ueberspannung.dc', 'Überspannungsschutz DC-seitig', 'select', AB_USCHUTZ],
    ['ueberspannung.ac', 'Überspannungsschutz AC-seitig', 'select', AB_USCHUTZ],
    ['ueberspannung.komponente', 'Ableiter (aus Katalog)', 'katalog', 'schutz']
  ]},
  { id: 'einsatz', titel: 'Sicherheit für Einsatzkräfte (OVE R 11-1)', fuer: ['gewerbe', 'freiflaeche'], felder: [
    ['r11.kennzeichnung', 'Kennzeichnung der Leitungswege und Hinweisschilder', 'check'],
    ['r11.abschottung', 'Brandabschottungen bei Durchführungen', 'check'],
    ['r11.notaus', 'Not-Aus- bzw. Feuerwehrschalter', 'check'],
    ['r11.freischaltung', 'Automatische Freischalteinrichtung direkt am Generator', 'check'],
    ['r11.plan', 'Übersichtsplan für die Feuerwehr beim Hausanschluss', 'check'],
    ['r11.text', 'Weitere Maßnahmen', 'area']
  ]},
  { id: 'infrastruktur', titel: 'Standort & Infrastruktur', fuer: ['freiflaeche'], felder: [
    ['ff.netzanschluss', 'Netzanschluss / Übergabe- bzw. Trafostation', 'area'],
    ['ff.einzaeunung', 'Einzäunung und Zugang', 'area'],
    ['ff.erdung', 'Erdung und Potentialausgleich der Unterkonstruktion', 'area'],
    ['ff.monitoring', 'Fernüberwachung / Monitoring', 'area'],
    ['ff.flaeche', 'Pflege der Fläche (Mahd, Beweidung …)', 'area']
  ]},
  { id: 'pruefkurz', titel: 'Prüfbestätigung (ÖVE/ÖNORM E 8101)', fuer: ['privat'], felder: [
    ['pruefung.datum', 'Prüfdatum', 'date'], ['pruefung.pruefer', 'Prüfer'],
    ['pruefung.besichtigung', 'Besichtigung', 'select', AB_ERGEBNIS],
    ['pruefung.erprobung', 'Erprobung (Funktion, Schutzeinrichtungen)', 'select', AB_ERGEBNIS],
    ['pruefung.messung', 'Messungen (leer = automatisch aus der Matrix)', 'select', AB_ERGEBNIS]
  ]},
  { id: 'pruefung', titel: 'Prüf- und Messergebnisse (ÖVE/ÖNORM E 8101)', fuer: ['gewerbe', 'freiflaeche'], felder: [
    ['pruefung.datum', 'Prüfdatum', 'date'], ['pruefung.pruefer', 'Prüfer'],
    ['pruefung.geraet', 'Messgerät (Hersteller, Typ, Seriennummer)'], ['pruefung.kalibrierung', 'Kalibriert am', 'date'],
    ['pruefung.temperatur', 'Modultemperatur (°C, optional)', 'num'],
    ['pruefung.wetter', 'Witterung', 'text', 'z. B. sonnig, wolkenlos'],
    ['pruefung.besichtigung', 'Besichtigung', 'select', AB_ERGEBNIS],
    ['pruefung.erprobung', 'Erprobung', 'select', AB_ERGEBNIS],
    ['pruefung.schutzleiter_wert', 'Niederohmigkeit Schutz-/Potentialausgleichsleiter (Ω)', 'num'],
    ['pruefung.schutzleiter', 'Schutzleiter – Ergebnis', 'select', AB_ERGEBNIS],
    ['pruefung.riso_ac_wert', 'Isolationswiderstand AC (MΩ)', 'num'],
    ['pruefung.riso_ac', 'Isolationswiderstand AC – Ergebnis', 'select', AB_ERGEBNIS],
    ['pruefung.ens', 'Funktionsprüfung Schutzeinrichtungen / Kuppelschalter (ENS)', 'select', AB_ERGEBNIS],
    ['pruefung.bemerkung', 'Bemerkungen zur Prüfung', 'area']
  ]},
  { id: 'betrieb', titel: 'Betrieb & Wartung', fuer: AB_ALLE, felder: [
    ['betrieb.notfall', 'Verhalten im Notfall / Abschaltung', 'area'],
    ['betrieb.wartung', 'Wartung und Kontrolle (eine Zeile pro Punkt)', 'area'],
    ['betrieb.service', 'Service-Kontakt (leer = aus den Firmendaten)', 'area']
  ]},
  { id: 'bestaetigung', titel: 'Rechtliche Bestätigung', fuer: AB_ALLE, felder: [['@firma', 'Firmendaten']] }
];
function abKapitelFuer(bereich){ return AB_KAPITEL.filter(k => k.fuer.includes(bereich || 'gewerbe')); }
function abBereich(){ return projektBereich(getCurrentProject()); }

// ── Daten-Helfer ──────────────────────────────────────────────────────────
function abNeu(){
  return { normen: AB_NORMEN, bestaetigung: AB_BESTAETIGUNG, betriebsart: 'Netzparallelbetrieb', wr: {}, zusatz: [] };
}
function abWert(pfad){
  if(pfad === '@beschreibung'){ const p = getCurrentProject(); return (p && p.beschreibung) || ''; }
  return pfad.split('.').reduce((o, k) => (o && o[k] !== undefined) ? o[k] : undefined, abDaten) ?? '';
}
function abSetzen(pfad, wert){
  if(pfad === '@beschreibung'){ const p = getCurrentProject(); if(p) p.beschreibung = wert; return; }
  const teile = pfad.split('.');
  let o = abDaten;
  teile.slice(0, -1).forEach(k => { if(!o[k] || typeof o[k] !== 'object') o[k] = {}; o = o[k]; });
  o[teile[teile.length - 1]] = wert;
}
const abZahl = v => { const n = parseFloat(String(v ?? '').replace(',', '.')); return isNaN(n) ? null : n; };
const abKomp = id => abKatalog.find(k => k.id === id) || null;
const abKompName = k => k ? `${k.hersteller} ${k.typ}` : '';
function abDarfAendern(){ return darf('anlagenbuch') && (currentUserRole === 'admin' || !isProtocolLocked()); }
const AB_ENTWURF = pid => `pv_ab_entwurf::${currentUser ? currentUser.id : 'anon'}::${pid}`;

function abSpeichernVerzoegert(){
  const proj = getCurrentProject();
  if(!proj || !abDaten) return;
  abVersion++;
  abOffen = true;
  proj.anlagenbuch = abDaten;
  try { localStorage.setItem(AB_ENTWURF(proj.id), JSON.stringify({ daten: abDaten, beschreibung: proj.beschreibung || '', at: new Date().toISOString() })); } catch(_){}
  updateSyncStatus();
  clearTimeout(abSpeicherTimer);
  abSpeicherTimer = setTimeout(() => {
    // Nur das gerade offene Projekt speichern (sonst wuerden Messwerte eines
    // anderen Projekts mit leerem Stand ueberschrieben)
    if(proj.id === CURRENT_PROJECT_ID) saveProjectToCloud(proj.id, true);
  }, 900);
}
function abNachUpload(pid, version){
  if(pid !== CURRENT_PROJECT_ID || version !== abVersion) return;
  abOffen = false;
  try { localStorage.removeItem(AB_ENTWURF(pid)); } catch(_){}
}

// ── Laden ─────────────────────────────────────────────────────────────────
async function abKatalogLaden(){
  if(!supabaseClient || !currentUser) return;
  const { data, error } = await supabaseClient.from('pv_komponenten').select('*').order('kategorie').order('hersteller').order('typ');
  if(error) throw error;
  abKatalog = data || [];
}
async function abDokumenteLaden(pid){
  abDokumente = [];
  if(!supabaseClient || !currentUser) return;
  const { data, error } = await supabaseClient.from('pv_projekt_dokumente').select('*').eq('project_id', pid).order('kategorie').order('erstellt_am');
  if(error) throw error;
  abDokumente = data || [];
}

// ── Reiter zeichnen ───────────────────────────────────────────────────────
async function anlagenbuchRendern(){
  const box = g('ab-inhalt');
  if(!box) return;
  if(!darf('anlagenbuch')){ box.innerHTML = '<div class="ab-leer">Für das Anlagenbuch fehlt dir die Berechtigung.</div>'; return; }
  const proj = getCurrentProject();
  if(!proj){
    box.innerHTML = `<div class="ab-leer"><h2>Anlagenbuch</h2><p>Bitte zuerst ein Projekt öffnen – das Anlagenbuch gehört immer zu einer Anlage.</p>
      <button class="btn btn-primary" onclick="switchMainTab('projects')">Projekt auswählen</button></div>`;
    return;
  }
  // Angaben: eigener, noch nicht hochgeladener Entwurf hat Vorrang
  abDaten = proj.anlagenbuch ? JSON.parse(JSON.stringify(proj.anlagenbuch)) : abNeu();
  if(!abDaten.wr) abDaten.wr = {};
  if(!Array.isArray(abDaten.zusatz)) abDaten.zusatz = [];
  try {
    const roh = localStorage.getItem(AB_ENTWURF(proj.id));
    if(roh){
      const e = JSON.parse(roh);
      if(e && e.daten && JSON.stringify(e.daten) !== JSON.stringify(proj.anlagenbuch || null)){
        abDaten = e.daten;
        if(typeof e.beschreibung === 'string') proj.beschreibung = e.beschreibung;
        toast('Nicht hochgeladene Anlagenbuch-Angaben wiederhergestellt');
        abSpeichernVerzoegert();
      }
    }
  } catch(_){}
  if(!abDaten.pruefung) abDaten.pruefung = {};
  if(!abDaten.pruefung.pruefer) abDaten.pruefung.pruefer = (proj.signature && proj.signature.name) || anzeigeName();

  box.innerHTML = '<div class="ab-leer">Lade Anlagenbuch …</div>';
  try { await Promise.all([abKatalogLaden(), abDokumenteLaden(proj.id), abFirmaLaden()]); }
  catch(e){ console.warn('Anlagenbuch laden:', e); toast('Katalog/Dokumente konnten nicht geladen werden – Netz prüfen'); }
  if(getCurrentProject() !== proj) return;
  if(!proj.anlagenbuch && abFirma && abFirma.normen) abDaten.normen = abFirma.normen;
  if(!abDaten.betrieb) abDaten.betrieb = {};
  if(!abDaten.betrieb.notfall) abDaten.betrieb.notfall = AB_BETRIEB.notfall;
  if(!abDaten.betrieb.wartung) abDaten.betrieb.wartung = AB_BETRIEB[projektBereich(proj)] || AB_BETRIEB.gewerbe;
  abWrVorschlaege();
  abZeichnen();
}

// Wechselrichter automatisch dem Katalog zuordnen, wenn der Name passt
function abWrVorschlaege(){
  const plan = getCurrentPlan();
  const wrKatalog = abKatalog.filter(k => k.kategorie === 'wechselrichter');
  let geaendert = false;
  Object.keys(plan).forEach(wr => {
    if(abDaten.wr[wr]) return;
    const name = String((plan[wr] && plan[wr].name) || '').toLowerCase().replace(/\s+/g, '');
    if(!name) return;
    const treffer = wrKatalog.filter(k => {
      const t = k.typ.toLowerCase().replace(/\s+/g, '');
      return t && (name.includes(t) || t.includes(name));
    });
    if(treffer.length === 1){ abDaten.wr[wr] = treffer[0].id; geaendert = true; }
  });
  if(geaendert && abDarfAendern()) abSpeichernVerzoegert();
}

function abFeldHtml([pfad, label, typ, opt]){
  const wert = abWert(pfad);
  const dis = abDarfAendern() ? '' : ' disabled';
  const brt = (typ === 'area') ? ' ab-breit' : '';
  if(pfad === '@wr') return abWrTabelleHtml();
  if(pfad === '@firma') return abFirmaUebersichtHtml();
  if(pfad === '@foto') return '<div class="ab-breit" id="ab-fotos"><span class="ab-feld-titel">Anlagenfoto (Deckblatt)</span><p class="ab-klein">Fotos werden geladen …</p></div>';
  if(typ === 'area'){
    return `<label class="ab-feld${brt}"><span>${esc(label)}</span><textarea class="sp-inp" rows="3" data-ab="${pfad}" placeholder="${esc(opt || '')}"${dis}>${esc(wert)}</textarea></label>`;
  }
  if(typ === 'select'){
    return `<label class="ab-feld"><span>${esc(label)}</span><select class="sp-inp" data-ab="${pfad}"${dis}>`
      + ['', ...opt].map(o => `<option value="${esc(o)}"${o === wert ? ' selected' : ''}>${esc(o || '– bitte wählen –')}</option>`).join('')
      + '</select></label>';
  }
  if(typ === 'katalog'){
    const liste = abKatalog.filter(k => k.kategorie === opt);
    return `<label class="ab-feld"><span>${esc(label)}</span><select class="sp-inp" data-ab="${pfad}"${dis}>`
      + `<option value="">${liste.length ? '– keine Auswahl –' : '– Katalog ist leer –'}</option>`
      + liste.map(k => `<option value="${k.id}"${k.id === wert ? ' selected' : ''}>${esc(abKompName(k))}</option>`).join('')
      + '</select></label>';
  }
  if(typ === 'check'){
    return `<label class="ab-check"><input type="checkbox" data-ab="${pfad}"${wert ? ' checked' : ''}${dis}> <span>${esc(label)}</span></label>`;
  }
  const art = typ === 'date' ? 'date' : 'text';
  const im = typ === 'num' ? ' inputmode="decimal"' : '';
  let hinweis = '';
  if(typ === 'zp'){
    const z = String(wert || '').replace(/\s+/g, '');
    hinweis = `<small class="ab-hinweis" data-zp>${z ? (/^AT[0-9A-Z]{31}$/i.test(z) ? '✓ gültiges Format' : 'Format: AT + 31 Zeichen (33 gesamt)') : ''}</small>`;
  }
  return `<label class="ab-feld"><span>${esc(label)}</span><input type="${art}" class="sp-inp" data-ab="${pfad}"${im} value="${esc(wert)}" placeholder="${esc(typ !== 'zp' ? (opt || '') : 'AT0010000000000000001000000000000')}"${dis}>${hinweis}</label>`;
}

function abWrTabelleHtml(){
  const plan = getCurrentPlan();
  const dis = abDarfAendern() ? '' : ' disabled';
  const liste = abKatalog.filter(k => k.kategorie === 'wechselrichter');
  const zeilen = Object.keys(plan).map(Number).sort((a, b) => a - b).map(wr => {
    const ids = Object.keys(APP_STATE).filter(id => id.split('.')[0] === String(wr) && APP_STATE[id].stat === 'JA');
    const k = abKomp(abDaten.wr[wr]);
    return `<tr><td>WR ${wr}</td><td>${esc((plan[wr] && plan[wr].name) || '—')}</td><td class="z">${ids.length}</td>
      <td><select class="sp-inp" data-ab="wr.${wr}"${dis}><option value="">${liste.length ? '– Typ wählen –' : '– Katalog ist leer –'}</option>
      ${liste.map(x => `<option value="${x.id}"${x.id === abDaten.wr[wr] ? ' selected' : ''}>${esc(abKompName(x))}</option>`).join('')}</select></td>
      <td class="klein">${k ? esc([k.daten && k.daten.leistung_kw ? k.daten.leistung_kw + ' kW' : '', k.daten && k.daten.ip].filter(Boolean).join(' · ')) : ''}</td></tr>`;
  }).join('');
  return `<div class="ab-breit ab-wr"><span class="ab-feld-titel">Wechselrichter (aus dem Projekt)</span>
    <table class="ab-tabelle"><thead><tr><th>Nr.</th><th>Bezeichnung</th><th class="z">Strings</th><th>Typ aus Katalog</th><th>Daten</th></tr></thead>
    <tbody>${zeilen || '<tr><td colspan="5">Keine Wechselrichter im Projekt</td></tr>'}</tbody></table></div>`;
}

function abDokumenteHtml(){
  const auto = abAutoDatenblaetter();
  const autoIds = new Set(auto.map(a => a.k.id));
  const zusatzListe = abKatalog.filter(k => k.pfad && !autoIds.has(k.id) && k.kategorie !== 'stempel');
  const darfDok = abDarfAendern();
  return `
    ${darf('katalog') ? '<p class="ab-klein">Neue Module, Wechselrichter usw. legst du im Reiter <a href="#" onclick="switchMainTab(\'komponenten\');return false;">Komponenten</a> an.</p>' : ''}
    <div class="ab-unter">Datenblätter aus den gewählten Komponenten</div>
    ${auto.length ? `<ul class="ab-liste">${auto.map(a => `<li><span>${esc(AB_KAT[a.k.kategorie])}: ${esc(abKompName(a.k))}</span>
        ${a.k.pfad ? '<span class="ab-ok">Datenblatt vorhanden</span>' : '<span class="ab-fehlt">kein Datenblatt im Katalog</span>'}</li>`).join('')}</ul>`
      : '<p class="ab-klein">Noch keine Komponenten gewählt.</p>'}
    <div class="ab-unter">Weitere Datenblätter aus dem Katalog</div>
    ${zusatzListe.length ? zusatzListe.map(k => `<label class="ab-check"><input type="checkbox" data-ab-zusatz="${k.id}"${abDaten.zusatz.includes(k.id) ? ' checked' : ''}${darfDok ? '' : ' disabled'}>
        <span>${esc(AB_KAT[k.kategorie])}: ${esc(abKompName(k))}</span></label>`).join('') : '<p class="ab-klein">Keine weiteren Datenblätter im Katalog.</p>'}
    <div class="ab-unter">Projekt-Dokumente (Schaltplan, Stringplan, Zertifikate …)</div>
    ${abDokumente.length ? `<ul class="ab-liste">${abDokumente.map(d => `<li><span>${esc(AB_DOK_KAT[d.kategorie] || d.kategorie)}: ${esc(d.titel)}</span>
        <span class="ab-aktionen"><button type="button" class="btn btn-ghost ab-mini" onclick="abDokOeffnen('${d.id}')">Ansehen</button>
        ${darfDok ? `<button type="button" class="btn btn-ghost ab-mini ab-gefahr" onclick="abDokLoeschen('${d.id}')">Entfernen</button>` : ''}</span></li>`).join('')}</ul>`
      : '<p class="ab-klein">Noch keine Projekt-Dokumente.</p>'}
    ${darfDok ? '<button type="button" class="btn btn-ghost" onclick="abDokHochladen()">Dokument hochladen</button>' : ''}`;
}

function abKatalogHtml(){
  const pflegen = darf('katalog');
  const gruppen = Object.keys(AB_KAT).filter(kat => kat !== 'stempel').map(kat => {
    const liste = abKatalog.filter(k => k.kategorie === kat);
    if(!liste.length) return '';
    return `<div class="ab-unter">${esc(AB_KAT[kat])}</div><ul class="ab-liste">${liste.map(k => {
      const d = k.daten || {};
      const info = (AB_KAT_DATEN[kat] || []).map(([f, l]) => d[f] ? `${l.split(' (')[0]}: ${d[f]}` : '').filter(Boolean).join(' · ');
      return `<li><span><strong>${esc(abKompName(k))}</strong>${info ? `<br><small>${esc(info)}</small>` : ''}</span>
        <span class="ab-aktionen">${k.pfad ? `<button type="button" class="btn btn-ghost ab-mini" onclick="abKatalogOeffnen('${k.id}')">Datenblatt</button>` : '<span class="ab-fehlt">ohne Datei</span>'}
        ${pflegen ? `<button type="button" class="btn btn-ghost ab-mini" onclick="abKatalogDialog('${k.id}')">Bearbeiten</button>
          <button type="button" class="btn btn-ghost ab-mini ab-gefahr" onclick="abKatalogLoeschen('${k.id}')">Löschen</button>` : ''}</span></li>`;
    }).join('')}</ul>`;
  }).join('');
  return `${gruppen || '<p class="ab-klein">Der Katalog ist noch leer. Lege eure Module, Wechselrichter usw. einmal an – danach sind sie in jedem Projekt auswählbar.</p>'}
    ${pflegen ? '<button type="button" class="btn btn-primary" onclick="abKatalogDialog()">Komponente hinzufügen</button>' : ''}`;
}

function abZeichnen(){
  const box = g('ab-inhalt');
  const proj = getCurrentProject();
  if(!box || !proj || !abDaten) return;
  const gesperrt = !abDarfAendern();
  box.innerHTML = `
    <div class="ab-kopf">
      <div><h1>Anlagenbuch</h1><p>${esc(proj.name)} · ${esc(BEREICHE[abBereich()] ? BEREICHE[abBereich()].name : '')} · Dokumentation nach ÖVE/ÖNORM E 8101</p>
        <p class="ab-klein">Umfang passend zum Bereich des Projekts – Privatanlagen kompakt, Gewerbe und Freifläche mit allen Prüf- und Messergebnissen.</p></div>
      <button type="button" class="btn btn-primary ab-erstellen" onclick="anlagenbuchErstellen()">Anlagenbuch erstellen (PDF)</button>
    </div>
    ${gesperrt ? '<div class="ab-info">Das Protokoll ist abgeschlossen – Änderungen am Anlagenbuch sind nur noch dem Admin möglich.</div>' : ''}
    <div class="ab-status" id="ab-status" hidden></div>
    ${abKapitelFuer(abBereich()).map((k, i) => `<details class="ab-kapitel"${i === 0 ? ' open' : ''}><summary><span class="ab-nr">${i + 1}</span>${esc(k.titel)}</summary>
      <div class="ab-raster">${k.felder.map(abFeldHtml).join('')}</div></details>`).join('')}
    <details class="ab-kapitel"><summary><span class="ab-nr">A</span>Datenblätter & Dokumente</summary><div class="ab-block">${abDokumenteHtml()}</div></details>
    <div class="ab-fuss"><button type="button" class="btn btn-primary" onclick="anlagenbuchErstellen()">Anlagenbuch erstellen (PDF)</button></div>`;
  abFotoWahlZeichnen();
}

// Eingaben speichern (ein Listener fuer alles)
document.addEventListener('input', e => abEingabe(e));
document.addEventListener('change', e => abEingabe(e));
function abEingabe(e){
  const el = e.target;
  if(!el || !el.closest || !el.closest('#ab-inhalt') || !abDaten) return;
  if(!abDarfAendern()) return;
  if(el.dataset.abZusatz){
    const id = el.dataset.abZusatz;
    abDaten.zusatz = abDaten.zusatz.filter(x => x !== id);
    if(el.checked) abDaten.zusatz.push(id);
    if(e.type === 'change') abSpeichernVerzoegert();
    return;
  }
  const pfad = el.dataset.ab;
  if(!pfad) return;
  // Textfelder bei jeder Eingabe, Auswahl/Checkbox bei Aenderung
  if(e.type === 'input' && (el.tagName === 'SELECT' || el.type === 'checkbox')) return;
  abSetzen(pfad, el.type === 'checkbox' ? el.checked : el.value);
  if(pfad === 'zaehlpunkt'){
    const h = el.parentElement.querySelector('[data-zp]');
    const z = el.value.replace(/\s+/g, '');
    if(h) h.textContent = z ? (/^AT[0-9A-Z]{31}$/i.test(z) ? '✓ gültiges Format' : 'Format: AT + 31 Zeichen (33 gesamt)') : '';
  }
  abSpeichernVerzoegert();
  if(el.tagName === 'SELECT' && (pfad.endsWith('.komponente') || pfad.startsWith('wr.'))){
    // Datenblatt-Liste und WR-Daten aktualisieren
    const offen = [...document.querySelectorAll('#ab-inhalt details.ab-kapitel')].map(d => d.open);
    abZeichnen();
    document.querySelectorAll('#ab-inhalt details.ab-kapitel').forEach((d, i) => { d.open = !!offen[i]; });
  }
}

// ── Katalog pflegen ───────────────────────────────────────────────────────
function abDateiEndung(datei){
  const t = (datei.type || '').toLowerCase();
  if(t === 'application/pdf') return 'pdf';
  if(t === 'image/png') return 'png';
  if(t === 'image/jpeg') return 'jpg';
  return null;
}
function abDateiPruefen(datei){
  if(!datei) return 'Keine Datei gewählt';
  if(!abDateiEndung(datei)) return 'Nur PDF, JPG oder PNG möglich';
  if(datei.size > AB_MAX_DATEI) return 'Die Datei ist größer als 25 MB';
  return null;
}
async function abHochladen(pfad, datei){
  const { error } = await supabaseClient.storage.from(AB_BUCKET).upload(pfad, datei, { contentType: datei.type, upsert: false });
  if(error) throw error;
}
async function abDateiLink(pfad){
  const { data, error } = await supabaseClient.storage.from(AB_BUCKET).createSignedUrl(pfad, 600);
  if(error) throw error;
  return data.signedUrl;
}
async function abKatalogOeffnen(id){
  const k = abKomp(id);
  if(!k || !k.pfad) return;
  const w = window.open('', '_blank');
  try { const url = await abDateiLink(k.pfad); if(w) w.location = url; else location.assign(url); }
  catch(e){ if(w) w.close(); toastError('Datenblatt konnte nicht geöffnet werden', e); }
}

function abKatalogDialog(id){
  if(!darf('katalog')) return toast('Keine Berechtigung für den Katalog');
  const k = id ? abKomp(id) : null;
  const ov = document.createElement('div');
  ov.className = 'app-dialog-overlay';
  ov.innerHTML = `<div class="app-dialog ab-dialog" role="dialog" aria-modal="true" aria-labelledby="abk-titel">
      <h2 id="abk-titel">${k ? 'Komponente bearbeiten' : 'Komponente hinzufügen'}</h2>
      <div class="ab-raster ab-raster-eng">
        <label class="ab-feld"><span>Kategorie</span><select class="sp-inp" id="abk-kat">
          ${Object.keys(AB_KAT).filter(x => x !== 'stempel').map(x => `<option value="${x}"${(k ? k.kategorie : 'modul') === x ? ' selected' : ''}>${esc(AB_KAT[x])}</option>`).join('')}</select></label>
        <label class="ab-feld"><span>Hersteller</span><input class="sp-inp" id="abk-hersteller" maxlength="80" value="${esc(k ? k.hersteller : '')}"></label>
        <label class="ab-feld ab-breit"><span>Typ / Modell</span><input class="sp-inp" id="abk-typ" maxlength="120" value="${esc(k ? k.typ : '')}"></label>
        <div class="ab-breit ab-raster ab-raster-eng" id="abk-daten"></div>
        <label class="ab-feld ab-breit"><span>${k && k.pfad ? 'Datenblatt ersetzen (optional)' : 'Datenblatt (PDF oder Bild, optional)'}</span>
          <input type="file" id="abk-datei" accept="application/pdf,image/jpeg,image/png"></label>
      </div>
      <div class="app-dialog-knoepfe"><button type="button" class="btn btn-ghost" data-a="nein">Abbrechen</button>
        <button type="button" class="btn btn-primary" data-a="ja">Speichern</button></div>
    </div>`;
  const datenBox = ov.querySelector('#abk-daten');
  const katSel = ov.querySelector('#abk-kat');
  const datenZeichnen = () => {
    const felder = AB_KAT_DATEN[katSel.value] || [];
    datenBox.innerHTML = felder.map(([f, l]) => `<label class="ab-feld"><span>${esc(l)}</span>
      <input class="sp-inp" data-abk="${f}" value="${esc(k && k.daten && k.daten[f] != null ? k.daten[f] : '')}"></label>`).join('');
  };
  katSel.addEventListener('change', datenZeichnen);
  datenZeichnen();
  const schliessen = () => ov.remove();
  ov.addEventListener('click', e => { if(e.target === ov) schliessen(); });
  ov.querySelector('[data-a="nein"]').addEventListener('click', schliessen);
  ov.querySelector('[data-a="ja"]').addEventListener('click', async () => {
    const hersteller = ov.querySelector('#abk-hersteller').value.trim();
    const typ = ov.querySelector('#abk-typ').value.trim();
    if(!hersteller || !typ) return toast('Bitte Hersteller und Typ angeben');
    const daten = {};
    datenBox.querySelectorAll('[data-abk]').forEach(i => { if(i.value.trim()) daten[i.dataset.abk] = i.value.trim(); });
    const datei = ov.querySelector('#abk-datei').files[0];
    if(datei){ const f = abDateiPruefen(datei); if(f) return toast(f); }
    const btn = ov.querySelector('[data-a="ja"]');
    btn.disabled = true; btn.textContent = 'Speichere …';
    try {
      let pfad = k ? k.pfad : null;
      const alt = pfad;
      if(datei){
        pfad = `bibliothek/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${abDateiEndung(datei)}`;
        await abHochladen(pfad, datei);
      }
      const zeile = { kategorie: katSel.value, hersteller, typ, daten, pfad,
        dateiname: datei ? datei.name : (k ? k.dateiname : null), groesse: datei ? datei.size : (k ? k.groesse : null), mime: datei ? datei.type : (k ? k.mime : null) };
      const antwort = k
        ? await supabaseClient.from('pv_komponenten').update(zeile).eq('id', k.id)
        : await supabaseClient.from('pv_komponenten').insert(zeile);
      if(antwort.error) throw antwort.error;
      if(datei && alt && alt !== pfad) await supabaseClient.storage.from(AB_BUCKET).remove([alt]);
      schliessen();
      toast('Komponente gespeichert');
      await abKatalogLaden();
      abZeichnenBehalten();
    } catch(e){
      btn.disabled = false; btn.textContent = 'Speichern';
      toastError('Speichern fehlgeschlagen', e);
    }
  });
  document.body.appendChild(ov);
  setTimeout(() => ov.querySelector('#abk-hersteller').focus(), 30);
}

async function abKatalogLoeschen(id){
  const k = abKomp(id);
  if(!k || !darf('katalog')) return;
  if(!(await appFrage(`Komponente löschen?\n\n„${abKompName(k)}“ wird aus dem Katalog gelöscht. In Projekten, in denen sie ausgewählt ist, fehlt sie danach im Anlagenbuch.`))) return;
  try {
    const { error } = await supabaseClient.from('pv_komponenten').delete().eq('id', id);
    if(error) throw error;
    if(k.pfad) await supabaseClient.storage.from(AB_BUCKET).remove([k.pfad]);
    toast('Komponente gelöscht');
    await abKatalogLaden();
    abZeichnenBehalten();
  } catch(e){ toastError('Löschen fehlgeschlagen', e); }
}

function abZeichnenBehalten(){
  if(document.body.classList.contains('tab-komponenten')) return komponentenZeichnen();
  const offen = [...document.querySelectorAll('#ab-inhalt details.ab-kapitel')].map(d => d.open);
  abZeichnen();
  document.querySelectorAll('#ab-inhalt details.ab-kapitel').forEach((d, i) => { d.open = !!offen[i]; });
}

// ── Projekt-Dokumente ─────────────────────────────────────────────────────
function abDokHochladen(){
  const proj = getCurrentProject();
  if(!proj || !abDarfAendern()) return toast('Keine Berechtigung');
  const ov = document.createElement('div');
  ov.className = 'app-dialog-overlay';
  ov.innerHTML = `<div class="app-dialog ab-dialog" role="dialog" aria-modal="true" aria-labelledby="abd-titel">
      <h2 id="abd-titel">Dokument hochladen</h2>
      <div class="ab-raster ab-raster-eng">
        <label class="ab-feld"><span>Art</span><select class="sp-inp" id="abd-kat">
          ${Object.keys(AB_DOK_KAT).map(x => `<option value="${x}">${esc(AB_DOK_KAT[x])}</option>`).join('')}</select></label>
        <label class="ab-feld"><span>Titel</span><input class="sp-inp" id="abd-titel-in" maxlength="120" placeholder="z. B. Schaltplan DC"></label>
        <label class="ab-feld ab-breit"><span>Datei (PDF oder Bild, max. 25 MB)</span><input type="file" id="abd-datei" accept="application/pdf,image/jpeg,image/png"></label>
      </div>
      <div class="app-dialog-knoepfe"><button type="button" class="btn btn-ghost" data-a="nein">Abbrechen</button>
        <button type="button" class="btn btn-primary" data-a="ja">Hochladen</button></div>
    </div>`;
  const schliessen = () => ov.remove();
  ov.addEventListener('click', e => { if(e.target === ov) schliessen(); });
  ov.querySelector('[data-a="nein"]').addEventListener('click', schliessen);
  ov.querySelector('#abd-datei').addEventListener('change', e => {
    const t = ov.querySelector('#abd-titel-in');
    const f = e.target.files[0];
    if(f && !t.value) t.value = f.name.replace(/\.[^.]+$/, '');
  });
  ov.querySelector('[data-a="ja"]').addEventListener('click', async () => {
    const datei = ov.querySelector('#abd-datei').files[0];
    const fehler = abDateiPruefen(datei);
    if(fehler) return toast(fehler);
    const titel = ov.querySelector('#abd-titel-in').value.trim() || datei.name;
    const btn = ov.querySelector('[data-a="ja"]');
    btn.disabled = true; btn.textContent = 'Lade hoch …';
    try {
      const pfad = `${proj.id}/dok/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${abDateiEndung(datei)}`;
      await abHochladen(pfad, datei);
      const { error } = await supabaseClient.from('pv_projekt_dokumente').insert({
        project_id: proj.id, titel, kategorie: ov.querySelector('#abd-kat').value, pfad,
        dateiname: datei.name, groesse: datei.size, mime: datei.type, erstellt_von: currentUser.id
      });
      if(error){ await supabaseClient.storage.from(AB_BUCKET).remove([pfad]); throw error; }
      schliessen();
      toast('Dokument hochgeladen');
      await abDokumenteLaden(proj.id);
      abZeichnenBehalten();
    } catch(e){
      btn.disabled = false; btn.textContent = 'Hochladen';
      toastError('Hochladen fehlgeschlagen', e);
    }
  });
  document.body.appendChild(ov);
}
async function abDokOeffnen(id){
  const d = abDokumente.find(x => x.id === id);
  if(!d) return;
  const w = window.open('', '_blank');
  try { const url = await abDateiLink(d.pfad); if(w) w.location = url; else location.assign(url); }
  catch(e){ if(w) w.close(); toastError('Dokument konnte nicht geöffnet werden', e); }
}
async function abDokLoeschen(id){
  const d = abDokumente.find(x => x.id === id);
  const proj = getCurrentProject();
  if(!d || !proj || !abDarfAendern()) return;
  if(!(await appFrage(`Dokument entfernen?\n\n„${d.titel}“ wird aus dem Projekt gelöscht.`))) return;
  try {
    const { error } = await supabaseClient.from('pv_projekt_dokumente').delete().eq('id', id);
    if(error) throw error;
    await supabaseClient.storage.from(AB_BUCKET).remove([d.pfad]);
    toast('Dokument entfernt');
    await abDokumenteLaden(proj.id);
    abZeichnenBehalten();
  } catch(e){ toastError('Entfernen fehlgeschlagen', e); }
}

// Datenblaetter der gewaehlten Komponenten (ohne Doppelte)
function abAutoDatenblaetter(){
  const ids = [];
  const dazu = (id, rolle) => { const k = abKomp(id); if(k && !ids.some(x => x.k.id === k.id)) ids.push({ k, rolle }); };
  if(!abDaten) return ids;
  dazu(abDaten.modul && abDaten.modul.komponente, 'modul');
  Object.keys(abDaten.wr || {}).forEach(wr => dazu(abDaten.wr[wr], 'wr'));
  dazu(abDaten.speicher && abDaten.speicher.komponente, 'speicher');
  dazu(abDaten.montage && abDaten.montage.komponente, 'montage');
  dazu(abDaten.ueberspannung && abDaten.ueberspannung.komponente, 'schutz');
  return ids;
}

// ══════════════════════════════════════════════════════════════════════════
//   PDF-ERZEUGUNG
// ══════════════════════════════════════════════════════════════════════════
function abPdfLibLaden(){
  if(window.PDFLib) return Promise.resolve(window.PDFLib);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = AB_PDFLIB;
    s.onload = () => window.PDFLib ? res(window.PDFLib) : rej(new Error('pdf-lib nicht verfügbar'));
    s.onerror = () => rej(new Error('PDF-Bibliothek konnte nicht geladen werden – Internetverbindung prüfen'));
    document.head.appendChild(s);
  });
}

// Standardschrift (WinAnsi): Zeichen ausserhalb ersetzen
const AB_WINANSI = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
function abPdfText(t){
  return String(t ?? '')
    .replace(/Ω/g, 'Ohm').replace(/→/g, '->').replace(/≤/g, '<=').replace(/≥/g, '>=')
    .replace(/[\t  ]/g, ' ')
    .replace(/./gu, ch => {
      const c = ch.codePointAt(0);
      if((c >= 32 && c <= 126) || (c >= 160 && c <= 255) || AB_WINANSI.includes(ch)) return ch;
      return c === 10 ? ch : '?';
    });
}
function abUmbrechen(text, font, size, maxW){
  const out = [];
  String(text).split('\n').forEach(abs => {
    let zeile = '';
    abs.split(/\s+/).filter(w => w !== '').forEach(wort => {
      let w = wort;
      const probe = zeile ? zeile + ' ' + w : w;
      if(font.widthOfTextAtSize(probe, size) <= maxW){ zeile = probe; return; }
      if(zeile) out.push(zeile);
      while(font.widthOfTextAtSize(w, size) > maxW && w.length > 1){
        let i = w.length - 1;
        while(i > 1 && font.widthOfTextAtSize(w.slice(0, i), size) > maxW) i--;
        out.push(w.slice(0, i)); w = w.slice(i);
      }
      zeile = w;
    });
    out.push(zeile);
  });
  return out;
}

class AbPdf {
  constructor(L, pdf, fR, fB, kopfText){
    this.L = L; this.pdf = pdf; this.fR = fR; this.fB = fB; this.kopfText = kopfText;
    this.W = 595.28; this.H = 841.89; this.rl = 52; this.rr = 52; this.ro = 66; this.ru = 60;
    this.page = null; this.y = 0; this.kapitel = [];
  }
  get breite(){ return this.W - this.rl - this.rr; }
  farbe(hex){ const n = parseInt(hex.slice(1), 16); return this.L.rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255); }
  text(t, x, y, size, font, farbe = '#18181b'){ this.page.drawText(abPdfText(t), { x, y, size, font, color: this.farbe(farbe) }); }
  linie(y, farbe = '#e4e4e7', dicke = 0.5){ this.page.drawLine({ start: { x: this.rl, y }, end: { x: this.W - this.rr, y }, thickness: dicke, color: this.farbe(farbe) }); }
  seite(){
    this.page = this.pdf.addPage([this.W, this.H]);
    this.y = this.H - this.ro;
    this.text(this.kopfText, this.rl, this.H - 36, 7.5, this.fR, '#6b6b73');
    this.page.drawLine({ start: { x: this.rl, y: this.H - 42 }, end: { x: this.W - this.rr, y: this.H - 42 }, thickness: 1.2, color: this.farbe('#93BD14') });
    this.logoKopf();
    return this.page;
  }
  // Firmenlogo klein oben rechts auf jeder Inhaltsseite
  logoKopf(){
    if(!this.logo) return;
    const h = 18, w = this.logo.width * h / this.logo.height;
    this.page.drawImage(this.logo, { x: this.W - this.rr - w, y: this.H - 40 + 2, width: w, height: h });
  }
  platz(h){ if(this.y - h < this.ru) this.seite(); }
  neuesKapitel(titel){
    this.seite();
    this.kapitel.push({ titel, seite: this.pdf.getPageCount() });
    this.text(titel, this.rl, this.y - 6, 17, this.fB);
    this.y -= 32;
  }
  ueberschrift(t){
    this.platz(44);
    this.y -= 6;
    this.text(t, this.rl, this.y - 11, 11, this.fB);
    this.y -= 18;
  }
  absatz(t, { size = 9.5, font = this.fR, farbe = '#18181b', einzug = 0 } = {}){
    if(!String(t || '').trim()) return;
    abUmbrechen(abPdfText(t), font, size, this.breite - einzug).forEach(z => {
      this.platz(size * 1.5);
      this.text(z, this.rl + einzug, this.y - size, size, font, farbe);
      this.y -= size * 1.45;
    });
    this.y -= 4;
  }
  hinweis(t){ this.absatz(t, { size: 8.5, farbe: '#6b6b73' }); }
  kv(paare){
    const lw = 170, size = 9, vw = this.breite - lw - 8;
    const zeilen = paare.filter(p => p && p[1] !== undefined && p[1] !== null && String(p[1]).trim() !== '');
    if(!zeilen.length){ this.hinweis('Keine Angaben.'); return; }
    zeilen.forEach(([k, v]) => {
      const wz = abUmbrechen(abPdfText(v), this.fR, size, vw);
      const kz = abUmbrechen(abPdfText(k), this.fB, size, lw - 8);
      const h = Math.max(wz.length, kz.length) * size * 1.4 + 7;
      this.platz(h);
      kz.forEach((z, i) => this.text(z, this.rl, this.y - size - 2 - i * size * 1.4, size, this.fB, '#3f3f46'));
      wz.forEach((z, i) => this.text(z, this.rl + lw, this.y - size - 2 - i * size * 1.4, size, this.fR));
      this.y -= h;
      this.linie(this.y + 2);
    });
    this.y -= 8;
  }
  zelle(t, x, w, y, size, font, farbe, rechts){
    let s = abPdfText(t ?? '');
    let n = 0;
    while(s.length > 1 && font.widthOfTextAtSize(s, size) > w - 8 && n++ < 200) s = s.slice(0, -2) + '…';
    const tw = font.widthOfTextAtSize(s, size);
    this.page.drawText(s, { x: rechts ? x + w - 4 - tw : x + 4, y, size, font, color: this.farbe(farbe) });
  }
  tabelle(spalten, zeilen){
    const size = 8, summe = spalten.reduce((s, c) => s + c.w, 0);
    const br = spalten.map(c => c.w / summe * this.breite);
    const xs = []; let x = this.rl; br.forEach(b => { xs.push(x); x += b; });
    const kopf = () => {
      this.platz(34);
      this.page.drawRectangle({ x: this.rl, y: this.y - 16, width: this.breite, height: 16, color: this.farbe('#f4f4f5') });
      spalten.forEach((c, i) => this.zelle(c.t, xs[i], br[i], this.y - 11, size, this.fB, '#3f3f46', c.r));
      this.y -= 16;
    };
    kopf();
    zeilen.forEach(z => {
      if(this.y - 14 < this.ru){ this.seite(); kopf(); }
      z.forEach((zelle, i) => {
        const o = (zelle && typeof zelle === 'object') ? zelle : { t: zelle };
        if(o.hinter) this.page.drawRectangle({ x: xs[i], y: this.y - 14, width: br[i], height: 14, color: this.farbe(o.hinter) });
        this.zelle(o.t, xs[i], br[i], this.y - 10, size, o.fett ? this.fB : this.fR, o.farbe || '#18181b', spalten[i].r);
      });
      this.y -= 14;
      this.linie(this.y, '#ececef', 0.4);
    });
    this.y -= 10;
  }
  haken(label, an){
    this.platz(16);
    const y = this.y - 11;
    this.page.drawRectangle({ x: this.rl, y: y - 1, width: 9, height: 9, borderColor: this.farbe('#52525b'), borderWidth: 0.8 });
    if(an){
      this.page.drawLine({ start: { x: this.rl + 1.8, y: y + 3.5 }, end: { x: this.rl + 3.8, y: y + 1.2 }, thickness: 1.3, color: this.farbe('#15803d') });
      this.page.drawLine({ start: { x: this.rl + 3.8, y: y + 1.2 }, end: { x: this.rl + 7.6, y: y + 7 }, thickness: 1.3, color: this.farbe('#15803d') });
    }
    this.text(label, this.rl + 16, y, 9.5, this.fR);
    this.y -= 16;
  }
  bild(img, maxW, maxH, x = this.rl){
    const s = Math.min(maxW / img.width, maxH / img.height, 10);
    const w = img.width * s, h = img.height * s;
    this.page.drawImage(img, { x, y: this.y - h, width: w, height: h });
    return h;
  }
}

async function abBytes(url){
  const r = await fetch(url);
  if(!r.ok) throw new Error('HTTP ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}
async function abBildEinbetten(pdf, bytes){
  const png = bytes[0] === 0x89 && bytes[1] === 0x50;
  return png ? pdf.embedPng(bytes) : pdf.embedJpg(bytes);
}

function abStatus(t){
  const el = g('ab-status');
  if(!el) return;
  el.hidden = !t;
  el.textContent = t || '';
}

async function anlagenbuchErstellen(){
  if(!darf('anlagenbuch')) return toast('Keine Berechtigung');
  const proj = getCurrentProject();
  if(!proj || !abDaten) return toast('Bitte zuerst ein Projekt öffnen');
  const knoepfe = [...document.querySelectorAll('#ab-inhalt .ab-erstellen, #ab-inhalt .ab-fuss .btn')];
  knoepfe.forEach(b => b.disabled = true);
  const hinweise = [];
  try {
    abStatus('PDF-Bibliothek wird geladen …');
    const L = await abPdfLibLaden();
    const pdf = await L.PDFDocument.create();
    const fR = await pdf.embedFont(L.StandardFonts.Helvetica);
    const fB = await pdf.embedFont(L.StandardFonts.HelveticaBold);
    const heute = new Date().toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const datum = iso => iso ? new Date(iso).toLocaleDateString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    const plan = getCurrentPlan();
    const d = abDaten;
    const doc = new AbPdf(L, pdf, fR, fB, `Anlagenbuch · ${proj.name}`);
    const modul = abKomp(d.modul && d.modul.komponente);
    const md = (modul && modul.daten) || {};
    const wp = abZahl(md.wp) || getCurrentWp();
    const aktive = getAllFullIds().filter(id => APP_STATE[id] && APP_STATE[id].stat === 'JA');
    const module = aktive.reduce((s, id) => s + (Number(APP_STATE[id].mod) || 0), 0);
    const kwp = (module * wp / 1000);
    const wrNrn = Object.keys(plan).map(Number).sort((a, b) => a - b);
    const fmt = (n, st = 2) => (n === null || n === undefined || isNaN(n)) ? '' : Number(n).toLocaleString('de-AT', { minimumFractionDigits: st, maximumFractionDigits: st });

    // Bilder laden
    abStatus('Fotos werden geladen …');
    const logoEl = document.querySelector('#auth-gate .brand-logo--light');
    let logo = null;
    try { if(abFirma && abFirma.logo) logo = await abBildEinbetten(pdf, await abBytes(await abDateiLink(abFirma.logo))); } catch(_){ hinweise.push('Firmenlogo konnte nicht geladen werden'); }
    try { if(!logo && logoEl) logo = await pdf.embedPng(logoEl.getAttribute('src')); } catch(_){}
    doc.logo = logo;
    const fotos = { anlage: null, wr: [] };
    if(typeof fotoListeLaden === 'function'){
      try {
        await fotoListeLaden(proj.id);
        const alle = [ANLAGENFOTO, ...wrNrn].flatMap(z => fotoFuerWr(proj.id, z));
        const pfade = alle.filter(f => !f.wartet).map(f => f.pfad);
        if(pfade.length) await fotoUrlsHolen(pfade);
        const an = fotoFuerWr(proj.id, ANLAGENFOTO).filter(f => f.url);
        if(an.length) fotos.anlage = await abBildEinbetten(pdf, await abBytes((an.find(f => f.pfad === d.anlagenfoto) || an[an.length - 1]).url));
        for(const wr of wrNrn){
          for(const f of fotoFuerWr(proj.id, wr).filter(f => f.url)){
            try { fotos.wr.push({ wr, img: await abBildEinbetten(pdf, await abBytes(f.url)) }); } catch(_){ hinweise.push(`Ein Foto von WR ${wr} konnte nicht geladen werden`); }
          }
        }
      } catch(e){ hinweise.push('Fotos konnten nicht vollständig geladen werden'); }
    }
    const stempelK = abKatalog.find(k => k.kategorie === 'stempel' && k.pfad && /image/.test(k.mime || ''));
    let stempel = null;
    if(stempelK){ try { stempel = await abBildEinbetten(pdf, await abBytes(await abDateiLink(stempelK.pfad))); } catch(_){ hinweise.push('Firmenstempel konnte nicht geladen werden'); } }
    let unterschrift = null;
    if(proj.signature && proj.signature.dataUrl){ try { unterschrift = await pdf.embedPng(proj.signature.dataUrl); } catch(_){} }

    // ── Deckblatt ──
    abStatus('Seiten werden erstellt …');
    const deck = pdf.addPage([doc.W, doc.H]);
    doc.page = deck;
    deck.drawRectangle({ x: 0, y: doc.H - 10, width: doc.W, height: 10, color: doc.farbe('#93BD14') });
    if(logo){ const s = Math.min(54 / logo.height, 240 / logo.width); deck.drawImage(logo, { x: doc.rl, y: doc.H - 42 - logo.height * s, width: logo.width * s, height: logo.height * s }); }
    doc.text('Anlagenbuch', doc.rl, doc.H - 170, 34, fB);
    const typName = BEREICHE[projektBereich(proj)] ? BEREICHE[projektBereich(proj)].name : '';
    doc.text(`Photovoltaikanlage${typName ? ' · ' + typName : ''} · Dokumentation nach ÖVE/ÖNORM E 8101`, doc.rl, doc.H - 194, 12, fR, '#52525b');
    doc.text(proj.name || '', doc.rl, doc.H - 236, 18, fB);
    const deckInfo = [
      ['Anlagenbetreiber', d.betreiber && d.betreiber.name],
      ['Standort', d.standort && d.standort.adresse ? String(d.standort.adresse).replace(/\n/g, ', ') : ''],
      ['DC-Nennleistung', kwp ? `${fmt(kwp)} kWp` : ''],
      ['Erstinbetriebnahme', datum(d.inbetriebnahme)]
    ].filter(x => x[1]);
    let dy = doc.H - 270;
    deckInfo.forEach(([k, v]) => { doc.text(k, doc.rl, dy, 9, fR, '#6b6b73'); doc.text(v, doc.rl + 130, dy, 10, fB); dy -= 18; });
    if(fotos.anlage){
      const maxW = doc.breite, maxH = 300;
      const s = Math.min(maxW / fotos.anlage.width, maxH / fotos.anlage.height);
      const w = fotos.anlage.width * s, h = fotos.anlage.height * s;
      deck.drawImage(fotos.anlage, { x: doc.rl + (maxW - w) / 2, y: dy - 20 - h, width: w, height: h });
    }
    deck.drawLine({ start: { x: doc.rl, y: 92 }, end: { x: doc.W - doc.rr, y: 92 }, thickness: 0.6, color: doc.farbe('#e4e4e7') });
    doc.text(`Errichter: ${abErrichter(d).firma || '—'}`, doc.rl, 74, 9, fR, '#52525b');
    doc.text(`Erstellt am ${heute} mit SOLPRO Messtool`, doc.rl, 60, 9, fR, '#52525b');

    // Inhaltsverzeichnis: Seite reservieren, spaeter fuellen
    const tocSeite = pdf.addPage([doc.W, doc.H]);

    // ── Kapitel je nach Anlagentyp (Privat / Gewerbe / Freiflaeche) ──
    const bereich = projektBereich(proj);
    const er = abErrichter(d);
    const pr = d.pruefung || {};
    let knr = 0;
    const kap = titel => doc.neuesKapitel(`${++knr}  ${titel}`);
    const risoWerte = aktive.map(id => abZahl(APP_STATE[id].riso)).filter(v => v !== null);
    const risoMin = risoWerte.length ? Math.min(...risoWerte) : null;
    const auff = aktive.filter(id => evaluateString(id).level === 'crit' || getStringStatus(id) === 'ERROR');
    const fertig = aktive.filter(id => getStringStatus(id) === 'COMPLETE').length;
    const messungAuto = aktive.length ? (auff.length ? 'nicht i. O.' : (fertig === aktive.length ? 'i. O.' : '')) : '';
    const erg = v => ({ t: v || '—', farbe: v === 'nicht i. O.' ? '#c8261c' : (v === 'i. O.' ? '#15803d' : '#18181b'), fett: !!v });
    const bt = d.betrieb || {};

    for(const k of abKapitelFuer(bereich)){
      if(k.id === 'stamm'){
        kap(k.titel);
        doc.ueberschrift('Anlagenbetreiber');
        doc.kv([['Name', d.betreiber && d.betreiber.name], ['Adresse', d.betreiber && d.betreiber.adresse], ['Kontakt', d.betreiber && d.betreiber.kontakt]]);
        doc.ueberschrift('Standort');
        doc.kv([['Anlagenadresse', d.standort && d.standort.adresse], ['Zählpunktnummer', d.zaehlpunkt]]);
        doc.ueberschrift('Errichtung & Änderungen');
        doc.kv([['Erstinbetriebnahme', datum(d.inbetriebnahme)], ['Wesentliche Änderungen', d.aenderungen || 'keine']]);
        doc.ueberschrift('Angewendete Normen und Richtlinien');
        String(d.normen || (abFirma && abFirma.normen) || AB_NORMEN).split('\n').filter(z => z.trim()).forEach(z => doc.absatz('•  ' + z.trim(), { size: 9.5 }));
        if(proj.beschreibung){ doc.ueberschrift('Anlagenbeschreibung'); doc.absatz(proj.beschreibung); }
      }

      else if(k.id === 'anlage'){
        kap(k.titel);
        doc.kv([['Anlagentyp', BEREICHE[bereich] ? BEREICHE[bereich].name : ''], ['Betriebsart', d.betriebsart],
          ['DC-Nennleistung gesamt', kwp ? `${fmt(kwp)} kWp` : ''], ['Anzahl Module', String(module)], ['Anzahl Wechselrichter', String(wrNrn.length)]]);
        doc.ueberschrift('Solarmodule');
        doc.kv([['Hersteller', modul && modul.hersteller], ['Typ', modul && modul.typ], ['Nennleistung je Modul', wp ? `${wp} Wp` : ''],
          ['Modulanzahl', String(module)], ['Gesamtleistung', kwp ? `${fmt(kwp)} kWp` : ''],
          ['Ausrichtung', d.modul && d.modul.ausrichtung], ['Neigungswinkel', d.modul && d.modul.neigung ? `${d.modul.neigung}°` : '']]);
        doc.ueberschrift('Modulmontage / Trägersystem');
        const uk = abKomp(d.montage && d.montage.komponente);
        doc.kv([['System', uk ? abKompName(uk) : ''], ['Art der Montage', d.montage && d.montage.text]]);
        doc.ueberschrift('Wechselrichter');
        doc.tabelle([{ t: 'WR', w: 5 }, { t: 'Bezeichnung', w: 16 }, { t: 'Hersteller / Typ', w: 24 }, { t: 'kW', w: 7, r: 1 }, { t: 'IP', w: 7 },
          { t: 'MPPT', w: 6, r: 1 }, { t: 'Strings', w: 7, r: 1 }, { t: 'Module', w: 7, r: 1 }, { t: 'kWp DC', w: 9, r: 1 }],
          wrNrn.map(wr => {
            const kk = abKomp(d.wr && d.wr[wr]); const kd = (kk && kk.daten) || {};
            const ids = aktive.filter(id => id.split('.')[0] === String(wr));
            const m = ids.reduce((s, id) => s + (Number(APP_STATE[id].mod) || 0), 0);
            return [String(wr), (plan[wr] && plan[wr].name) || '', kk ? abKompName(kk) : '—', kd.leistung_kw || '', kd.ip || '',
              String((plan[wr] && plan[wr].mppts) || ''), String(ids.length), String(m), fmt(m * wp / 1000)];
          }));
        doc.ueberschrift('Stromspeicher');
        const sp = abKomp(d.speicher && d.speicher.komponente);
        if(sp){
          const sd = sp.daten || {};
          doc.kv([['Hersteller', sp.hersteller], ['Typ', sp.typ], ['Kapazität', sd.kapazitaet ? `${sd.kapazitaet} kWh` : ''],
            ['Nennspannung', sd.spannung ? `${sd.spannung} V` : ''], ['Aufstellungsort', d.speicher.ort], ['Be- und Entlüftung', d.speicher.lueftung]]);
        } else doc.hinweis('Kein Stromspeicher vorhanden.');
      }

      else if(k.id === 'sicherheit'){
        kap(k.titel);
        doc.kv([['DC-Freischaltung / Feuerwehrschalter', d.schalter && d.schalter.dc], ['AC-Abschaltung', d.schalter && d.schalter.ac],
          ['Überspannungsschutz DC-seitig', d.ueberspannung && d.ueberspannung.dc], ['Überspannungsschutz AC-seitig', d.ueberspannung && d.ueberspannung.ac]]);
        const r11 = d.r11 || {};
        k.felder.filter(f => f[2] === 'check').forEach(f => doc.haken(f[1], !!r11[f[0].split('.')[1]]));
      }

      else if(k.id === 'verkabelung'){
        kap(k.titel);
        const kb = d.kabel || {};
        doc.ueberschrift('DC-Leitungen (Solarkabel)');
        doc.kv([['Querschnitt', kb.dc_querschnitt ? `${kb.dc_querschnitt} mm²` : ''], ['Leitungslängen', kb.dc_laenge ? `${kb.dc_laenge} m` : ''], ['Verlegeart', kb.dc_verlegung]]);
        doc.ueberschrift('AC-Zuleitung');
        doc.kv([['Querschnitt', kb.ac_querschnitt ? `${kb.ac_querschnitt} mm²` : ''], ['Leitungslänge', kb.ac_laenge ? `${kb.ac_laenge} m` : ''], ['Verlegeart', kb.ac_verlegung]]);
        doc.ueberschrift('Schalteinrichtungen');
        doc.kv([['DC-Freischaltung', d.schalter && d.schalter.dc], ['AC-seitige Netztrennung', d.schalter && d.schalter.ac]]);
        doc.ueberschrift('Überspannungs- und Blitzschutz (OVE R 6-2-1 / R 6-2-2)');
        const ab = abKomp(d.ueberspannung && d.ueberspannung.komponente);
        doc.kv([['DC-seitig', d.ueberspannung && d.ueberspannung.dc], ['AC-seitig', d.ueberspannung && d.ueberspannung.ac], ['Ableiter', ab ? abKompName(ab) : '']]);
      }

      else if(k.id === 'einsatz'){
        kap(k.titel);
        const r11 = d.r11 || {};
        k.felder.filter(f => f[2] === 'check').forEach(f => doc.haken(f[1], !!r11[f[0].split('.')[1]]));
        doc.y -= 6;
        if(r11.text){ doc.ueberschrift('Weitere Maßnahmen'); doc.absatz(r11.text); }
      }

      else if(k.id === 'infrastruktur'){
        kap(k.titel);
        const ff = d.ff || {};
        doc.kv([['Netzanschluss / Übergabestation', ff.netzanschluss], ['Einzäunung und Zugang', ff.einzaeunung],
          ['Erdung und Potentialausgleich', ff.erdung], ['Fernüberwachung', ff.monitoring], ['Pflege der Fläche', ff.flaeche]]);
      }

      else if(k.id === 'pruefkurz'){
        kap(k.titel);
        doc.kv([['Prüfdatum', datum(pr.datum)], ['Prüfer', pr.pruefer]]);
        doc.ueberschrift('Erstprüfung');
        doc.tabelle([{ t: 'Prüfpunkt', w: 70 }, { t: 'Ergebnis', w: 30 }], [
          ['Besichtigung', erg(pr.besichtigung)],
          ['Erprobung (Funktion, Schutzeinrichtungen)', erg(pr.erprobung)],
          ['Messungen (Isolationswiderstand, Leerlaufspannung, Kurzschlussstrom)', erg(pr.messung || messungAuto)]
        ]);
        doc.hinweis('Die einzelnen Messwerte je String sind beim Errichter dokumentiert und können jederzeit angefordert werden.');
      }

      else if(k.id === 'pruefung'){
        kap(k.titel);
        doc.ueberschrift('Prüfbedingungen');
        doc.kv([['Prüfdatum', datum(pr.datum)], ['Prüfer', pr.pruefer], ['Messgerät', pr.geraet], ['Kalibriert am', datum(pr.kalibrierung)],
          ['Modultemperatur', pr.temperatur ? `${pr.temperatur} °C` : ''], ['Witterung', pr.wetter]]);
        doc.ueberschrift('Erstprüfung – Besichtigung, Erprobung, Messung');
        doc.tabelle([{ t: 'Prüfpunkt', w: 50 }, { t: 'Messwert', w: 25 }, { t: 'Ergebnis', w: 25 }], [
          ['Besichtigung', '', erg(pr.besichtigung)],
          ['Erprobung', '', erg(pr.erprobung)],
          ['Niederohmigkeit Schutz-/Potentialausgleichsleiter', pr.schutzleiter_wert ? `${pr.schutzleiter_wert} Ohm` : '', erg(pr.schutzleiter)],
          ['Isolationswiderstand DC (kleinster Stringwert)', risoMin !== null ? `${fmt(risoMin, 1)} MOhm` : '', erg(risoMin === null ? '' : (risoMin >= 1 ? 'i. O.' : 'nicht i. O.'))],
          ['Isolationswiderstand AC', pr.riso_ac_wert ? `${pr.riso_ac_wert} MOhm` : '', erg(pr.riso_ac)],
          ['Funktionsprüfung Schutzeinrichtungen / ENS', '', erg(pr.ens)],
          ['Leerlaufspannung Uoc / Kurzschlussstrom Isc', `${fertig} von ${aktive.length} Strings`, erg(messungAuto)]
        ]);
        if(pr.bemerkung){ doc.ueberschrift('Bemerkungen'); doc.absatz(pr.bemerkung); }
        // Kontrollberechnung: Soll-Uoc = Module x Uoc(STC), optional temperaturkorrigiert
        const uocM = abZahl(md.uoc), tk = abZahl(md.tk_uoc), T = abZahl(pr.temperatur);
        const tFaktor = (tk !== null && T !== null) ? (1 + tk / 100 * (T - 25)) : 1;
        const mitSoll = uocM !== null;
        doc.ueberschrift('Messwerte je Wechselrichter');
        doc.hinweis(mitSoll
          ? `Kontrollberechnung: Soll-Uoc = Modulanzahl × Uoc(STC) ${tk !== null && T !== null ? `× Temperaturkorrektur (${fmt(tk)} %/K, ${T} °C)` : '(ohne Temperaturkorrektur)'}. Abweichungen über 10 % sind markiert.`
          : 'Für die Kontrollberechnung im Katalog beim Solarmodul Uoc hinterlegen.');
        wrNrn.forEach(wr => {
          const ids = aktive.filter(id => id.split('.')[0] === String(wr));
          if(!ids.length) return;
          doc.platz(60);
          doc.text(`WR ${wr} – ${(plan[wr] && plan[wr].name) || ''}`, doc.rl, doc.y - 10, 9.5, fB);
          doc.y -= 16;
          const spalten = mitSoll
            ? [{ t: 'Klemme', w: 10 }, { t: 'Plan-String', w: 12 }, { t: 'Module', w: 8, r: 1 }, { t: 'Uoc V', w: 10, r: 1 }, { t: 'Soll V', w: 10, r: 1 }, { t: 'Abw.', w: 9, r: 1 },
               { t: 'Isc A', w: 9, r: 1 }, { t: 'Riso MOhm', w: 12, r: 1 }, { t: 'Status', w: 11 }]
            : [{ t: 'Klemme', w: 12 }, { t: 'Plan-String', w: 16 }, { t: 'Module', w: 9, r: 1 }, { t: 'Uoc V', w: 12, r: 1 },
               { t: 'Isc A', w: 12, r: 1 }, { t: 'Riso MOhm', w: 14, r: 1 }, { t: 'Status', w: 14 }];
          doc.tabelle(spalten, ids.map(id => {
            const it = APP_STATE[id];
            const ev = evaluateString(id); const st = getStringStatus(id);
            const krit = ev.level === 'crit' || st === 'ERROR';
            const status = krit ? { t: 'Auffällig', farbe: '#c8261c', fett: true } : (st === 'COMPLETE' ? { t: 'OK', farbe: '#15803d' } : { t: 'Offen', farbe: '#b45309' });
            const feld = f => ({ t: it[f] || '—', farbe: ev.fields[f] ? '#c8261c' : '#18181b', fett: !!ev.fields[f] });
            if(!mitSoll) return [id, it.planName || '—', String(it.mod || ''), feld('uoc'), feld('isc'), feld('riso'), status];
            const n = Number(it.mod) || 0;
            const uSoll = n ? n * uocM * tFaktor : null;
            const u = abZahl(it.uoc);
            let abw = { t: '' };
            if(u !== null && uSoll){
              const p = (u - uSoll) / uSoll * 100;
              abw = { t: `${p > 0 ? '+' : ''}${fmt(p, 1)} %`, farbe: Math.abs(p) > 10 ? '#b45309' : '#6b6b73', fett: Math.abs(p) > 10 };
            }
            return [id, it.planName || '—', String(n || ''), feld('uoc'), uSoll ? fmt(uSoll, 1) : '', abw, feld('isc'), feld('riso'), status];
          }));
        });
        if(auff.length){
          doc.ueberschrift(`Auffälligkeiten (${auff.length})`);
          auff.forEach(id => doc.absatz(`${id}: ${(evaluateString(id).msgs || []).join(' · ') || 'Wert außerhalb des gültigen Bereichs'}`, { size: 9, farbe: '#c8261c' }));
        }
      }

      else if(k.id === 'betrieb'){
        kap(k.titel);
        doc.ueberschrift('Verhalten im Notfall / Abschaltung');
        doc.absatz(bt.notfall || AB_BETRIEB.notfall);
        doc.ueberschrift('Wartung und Kontrolle');
        String(bt.wartung || AB_BETRIEB[bereich] || AB_BETRIEB.gewerbe).split('\n').filter(z => z.trim()).forEach(z => doc.absatz('•  ' + z.trim()));
        doc.ueberschrift('Service und Ansprechpartner');
        doc.kv(bt.service ? [['Service-Kontakt', bt.service]]
          : [['Errichter', er.firma], ['Telefon', er.telefon], ['E-Mail', er.email], ['Adresse', er.adresse]]);
      }

      else if(k.id === 'bestaetigung'){
        kap(k.titel);
        doc.kv([['Elektrotechnik-Unternehmen', er.firma], ['Gewerbeberechtigung / Konzession', er.konzession],
          ['Adresse', er.adresse], ['Verantwortliche Person', er.verantwortlich]]);
        doc.absatz(er.bestaetigung, { size: 10 });
        doc.platz(150);
        doc.y -= 20;
        const boxY = doc.y, boxH = 110, boxW = (doc.breite - 24) / 2;
        const p6 = doc.page;
        p6.drawRectangle({ x: doc.rl, y: boxY - boxH, width: boxW, height: boxH, borderColor: doc.farbe('#d4d4d8'), borderWidth: 0.8 });
        p6.drawRectangle({ x: doc.rl + boxW + 24, y: boxY - boxH, width: boxW, height: boxH, borderColor: doc.farbe('#d4d4d8'), borderWidth: 0.8 });
        if(unterschrift){
          const s = Math.min((boxW - 20) / unterschrift.width, 60 / unterschrift.height);
          p6.drawImage(unterschrift, { x: doc.rl + 10, y: boxY - 74, width: unterschrift.width * s, height: unterschrift.height * s });
        }
        doc.text(`${er.ort || ''}${er.ort ? ', ' : ''}${datum(proj.signature && proj.signature.at) || heute}`, doc.rl + 10, boxY - boxH + 24, 8.5, fR, '#3f3f46');
        doc.text(`Unterschrift ${er.verantwortlich || (proj.signature && proj.signature.name) || ''}`, doc.rl + 10, boxY - boxH + 10, 8, fR, '#6b6b73');
        if(stempel){
          const s = Math.min((boxW - 20) / stempel.width, (boxH - 30) / stempel.height);
          p6.drawImage(stempel, { x: doc.rl + boxW + 34, y: boxY - boxH + 22, width: stempel.width * s, height: stempel.height * s });
        }
        doc.text('Firmenstempel (Stampiglie)', doc.rl + boxW + 34, boxY - boxH + 10, 8, fR, '#6b6b73');
        doc.y = boxY - boxH - 10;
      }
    }

    // ── Anhang A: Fotos ──
    if(fotos.anlage || fotos.wr.length){
      doc.neuesKapitel('Anhang A  Fotodokumentation');
      if(fotos.anlage){
        doc.platz(320);
        const h = doc.bild(fotos.anlage, doc.breite, 300);
        doc.y -= h + 4; doc.text('Anlagenfoto', doc.rl, doc.y - 8, 8, fR, '#6b6b73'); doc.y -= 22;
      }
      const spW = (doc.breite - 16) / 2, spH = 190;
      for(let i = 0; i < fotos.wr.length; i += 2){
        doc.platz(spH + 26);
        let hMax = 0;
        [fotos.wr[i], fotos.wr[i + 1]].forEach((f, j) => {
          if(!f) return;
          const x = doc.rl + j * (spW + 16);
          const h = doc.bild(f.img, spW, spH, x);
          hMax = Math.max(hMax, h);
          doc.text(`WR ${f.wr} – ${(plan[f.wr] && plan[f.wr].name) || ''}`, x, doc.y - h - 12, 8, fR, '#6b6b73');
        });
        doc.y -= hMax + 24;
      }
    }

    // ── Anhang B: Datenblaetter & Dokumente ──
    const anhang = [
      ...abAutoDatenblaetter().map(a => ({ titel: `${AB_KAT[a.k.kategorie]}: ${abKompName(a.k)}`, pfad: a.k.pfad, mime: a.k.mime })),
      ...(d.zusatz || []).map(abKomp).filter(Boolean).map(k => ({ titel: `${AB_KAT[k.kategorie]}: ${abKompName(k)}`, pfad: k.pfad, mime: k.mime })),
      ...abDokumente.map(x => ({ titel: `${AB_DOK_KAT[x.kategorie] || x.kategorie}: ${x.titel}`, pfad: x.pfad, mime: x.mime }))
    ].filter(a => a.pfad);
    const eindeutig = anhang.filter((a, i) => anhang.findIndex(b => b.pfad === a.pfad) === i);
    if(eindeutig.length){
      doc.neuesKapitel('Anhang B  Datenblätter & Dokumente');
      const listeSeite = doc.page, listeY = doc.y;
      const eintraege = [];
      for(let i = 0; i < eindeutig.length; i++){
        const a = eindeutig[i];
        abStatus(`Dokumente werden eingebunden (${i + 1}/${eindeutig.length}) …`);
        const start = pdf.getPageCount() + 1;
        try {
          const { data, error } = await supabaseClient.storage.from(AB_BUCKET).download(a.pfad);
          if(error) throw error;
          const bytes = new Uint8Array(await data.arrayBuffer());
          if(/pdf/.test(a.mime || data.type)){
            const src = await L.PDFDocument.load(bytes, { ignoreEncryption: true });
            const kopien = await pdf.copyPages(src, src.getPageIndices());
            kopien.forEach(p => pdf.addPage(p));
          } else {
            const img = await abBildEinbetten(pdf, bytes);
            doc.seite();
            doc.text(a.titel, doc.rl, doc.y - 10, 11, fB); doc.y -= 24;
            doc.bild(img, doc.breite, doc.H - doc.ro - doc.ru - 40);
          }
          eintraege.push({ titel: a.titel, seite: start });
        } catch(e){
          console.warn('Anhang:', a.titel, e);
          hinweise.push(`„${a.titel}“ konnte nicht eingebunden werden`);
          eintraege.push({ titel: a.titel + ' (liegt separat bei)', seite: null });
        }
      }
      doc.page = listeSeite; doc.y = listeY;
      doc.tabelle([{ t: 'Nr.', w: 6 }, { t: 'Dokument', w: 80 }, { t: 'Seite', w: 14, r: 1 }],
        eintraege.map((e, i) => [String(i + 1), e.titel, e.seite ? String(e.seite) : '—']));
    }

    // ── Inhaltsverzeichnis ──
    doc.page = tocSeite; doc.y = doc.H - doc.ro;
    doc.text(doc.kopfText, doc.rl, doc.H - 36, 7.5, fR, '#6b6b73');
    tocSeite.drawLine({ start: { x: doc.rl, y: doc.H - 42 }, end: { x: doc.W - doc.rr, y: doc.H - 42 }, thickness: 1.2, color: doc.farbe('#93BD14') });
    doc.logoKopf();
    doc.text('Inhaltsverzeichnis', doc.rl, doc.y - 6, 17, fB); doc.y -= 40;
    doc.kapitel.forEach(k => {
      doc.text(k.titel, doc.rl, doc.y, 11, fR);
      const nr = String(k.seite); const w = fR.widthOfTextAtSize(nr, 11);
      doc.text(nr, doc.W - doc.rr - w, doc.y, 11, fR);
      const tw = fR.widthOfTextAtSize(abPdfText(k.titel), 11);
      tocSeite.drawLine({ start: { x: doc.rl + tw + 8, y: doc.y + 2 }, end: { x: doc.W - doc.rr - w - 8, y: doc.y + 2 }, thickness: 0.5, color: doc.farbe('#d4d4d8'), dashArray: [1, 3] });
      doc.y -= 22;
    });

    // Seitenzahlen
    const seiten = pdf.getPages();
    seiten.forEach((p, i) => {
      if(i === 0) return;
      const t = `Seite ${i + 1} von ${seiten.length}`;
      const { width } = p.getSize();
      p.drawText(t, { x: width - 52 - fR.widthOfTextAtSize(t, 7.5), y: 22, size: 7.5, font: fR, color: doc.farbe('#6b6b73') });
    });

    pdf.setTitle(`Anlagenbuch ${proj.name || ''}`);
    pdf.setAuthor(abErrichter(d).firma || 'SOLPRO');
    pdf.setCreator('SOLPRO Messtool');
    abStatus('PDF wird gespeichert …');
    const bytes = await pdf.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Anlagenbuch_${String(proj.name || 'Projekt').replace(/[^\wäöüÄÖÜß.-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    window.__abLetztesPdf = bytes;
    abStatus(hinweise.length ? `Fertig mit Hinweisen: ${hinweise.join(' · ')}` : `Fertig – ${seiten.length} Seiten`);
    toast(`Anlagenbuch erstellt (${seiten.length} Seiten)`);
  } catch(e){
    abStatus('');
    toastError('Anlagenbuch konnte nicht erstellt werden', e);
  } finally {
    knoepfe.forEach(b => b.disabled = false);
  }
}

// ══════════════════════════════════════════════════════════════════════════
//   REITER "KOMPONENTEN": Firmendaten + Komponenten-Katalog
//   Firmendaten liegen einmal zentral (pv_einstellungen, schluessel 'firma')
//   und fliessen automatisch in die rechtliche Bestaetigung jedes
//   Anlagenbuchs. Pflegen darf, wer das Recht "katalog" hat.
// ══════════════════════════════════════════════════════════════════════════
let abFirma = null;
let firmaTimer = null;
const FIRMA_FELDER = [
  ['firma', 'Firmenname (befugtes Elektrotechnik-Unternehmen)'],
  ['konzession', 'Gewerbeberechtigung / Konzession (z. B. GISA-Zahl)'],
  ['adresse', 'Adresse', 'area'],
  ['telefon', 'Telefon'], ['email', 'E-Mail'],
  ['verantwortlich', 'Verantwortliche Person (unterschreibt)'],
  ['ort', 'Ort der Unterzeichnung'],
  ['bestaetigung', 'Bestätigungstext', 'area'],
  ['normen', 'Standard-Normenliste für neue Anlagenbücher', 'area']
];

async function abFirmaLaden(){
  if(!supabaseClient || !currentUser) return;
  const { data, error } = await supabaseClient.from('pv_einstellungen').select('wert').eq('schluessel', 'firma').maybeSingle();
  if(error) throw error;
  abFirma = (data && data.wert) || {};
}

// Firmendaten fuer die Bestaetigung: zentral, sonst aeltere Projektangaben
function abErrichter(d){
  const f = abFirma || {}, p = (d && d.errichter) || {};
  const w = k => (f[k] && String(f[k]).trim()) || p[k] || '';
  return { firma: w('firma'), konzession: w('konzession'), adresse: w('adresse'), telefon: w('telefon'),
    email: w('email'), verantwortlich: w('verantwortlich'), ort: w('ort'),
    bestaetigung: (f.bestaetigung && f.bestaetigung.trim()) || (d && d.bestaetigung) || AB_BESTAETIGUNG };
}

function abFirmaUebersichtHtml(){
  const er = abErrichter(abDaten);
  const zeilen = [['Unternehmen', er.firma], ['Gewerbeberechtigung', er.konzession], ['Adresse', er.adresse],
    ['Verantwortlich', er.verantwortlich], ['Ort', er.ort]].filter(z => z[1]);
  const link = darf('katalog') ? ' – ändern im Reiter <a href="#" onclick="switchMainTab(\'komponenten\');return false;">Komponenten</a>' : '';
  return `<div class="ab-breit ab-firma"><p class="ab-klein">Die Angaben kommen automatisch aus den Firmendaten${link}.</p>
    ${zeilen.length ? `<dl>${zeilen.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>`
      : '<p class="ab-fehlt">Noch keine Firmendaten hinterlegt.</p>'}</div>`;
}

async function komponentenRendern(){
  const box = g('komp-inhalt');
  if(!box) return;
  if(!darf('katalog')){ box.innerHTML = '<div class="ab-leer">Für diesen Bereich fehlt dir die Berechtigung.</div>'; return; }
  box.innerHTML = '<div class="ab-leer">Lade …</div>';
  try { await Promise.all([abKatalogLaden(), abFirmaLaden()]); }
  catch(e){ toastError('Komponenten konnten nicht geladen werden', e); }
  komponentenZeichnen();
}

function komponentenZeichnen(){
  const box = g('komp-inhalt');
  if(!box) return;
  const f = abFirma || {};
  const stempel = abKatalog.find(k => k.kategorie === 'stempel' && k.pfad);
  const vorgabe = k => k === 'bestaetigung' ? AB_BESTAETIGUNG : (k === 'normen' ? AB_NORMEN : '');
  box.innerHTML = `
    <div class="ab-kopf"><div><h1>Komponenten</h1><p>Firmendaten und Katalog – gelten für alle Anlagenbücher</p></div></div>
    <details class="ab-kapitel" open><summary><span class="ab-nr">F</span>Firmendaten<span class="ab-sum-info">für die rechtliche Bestätigung</span></summary>
      <div class="ab-raster">
        ${FIRMA_FELDER.map(([k, l, t]) => t === 'area'
          ? `<label class="ab-feld ab-breit"><span>${esc(l)}</span><textarea class="sp-inp" rows="3" data-firma="${k}">${esc(f[k] != null ? f[k] : vorgabe(k))}</textarea></label>`
          : `<label class="ab-feld"><span>${esc(l)}</span><input class="sp-inp" data-firma="${k}" value="${esc(f[k] || '')}"></label>`).join('')}
        <div class="ab-feld ab-breit"><span>Firmenlogo – erscheint auf Deckblatt und jeder Seite des Anlagenbuchs</span>
          <div class="komp-stempel">${f.logo ? '<img id="komp-logo-bild" alt="Firmenlogo">' : '<span class="ab-klein">Noch kein eigenes Logo – verwendet wird das App-Logo.</span>'}
            <button type="button" class="btn btn-ghost" onclick="firmaLogoHochladen()">${f.logo ? 'Logo ersetzen' : 'Logo hochladen (PNG/JPG)'}</button></div></div>
        <div class="ab-feld ab-breit"><span>Firmenstempel (Stampiglie) als Bild – erscheint im Bestätigungsfeld</span>
          <div class="komp-stempel">${stempel ? '<img id="komp-stempel-bild" alt="Firmenstempel">' : '<span class="ab-klein">Noch kein Stempel hinterlegt.</span>'}
            <button type="button" class="btn btn-ghost" onclick="firmaStempelHochladen()">${stempel ? 'Stempel ersetzen' : 'Stempel hochladen (PNG/JPG)'}</button></div></div>
        <div class="ab-breit ab-klein" id="firma-status"></div>
      </div>
    </details>
    <details class="ab-kapitel" open><summary><span class="ab-nr">K</span>Komponenten-Katalog<span class="ab-sum-info">Module, Wechselrichter, Speicher …</span></summary>
      <div class="ab-block">${abKatalogHtml()}</div>
    </details>`;
  if(stempel) abDateiLink(stempel.pfad).then(u => { const i = g('komp-stempel-bild'); if(i) i.src = u; }).catch(() => {});
  if(f.logo) abDateiLink(f.logo).then(u => { const i = g('komp-logo-bild'); if(i) i.src = u; }).catch(() => {});
}

document.addEventListener('input', e => {
  const el = e.target;
  if(!el || !el.dataset || !el.dataset.firma || !el.closest || !el.closest('#komp-inhalt')) return;
  if(!darf('katalog')) return;
  abFirma = abFirma || {};
  abFirma[el.dataset.firma] = el.value;
  const st = g('firma-status');
  if(st) st.textContent = 'Wird gespeichert …';
  clearTimeout(firmaTimer);
  firmaTimer = setTimeout(firmaSpeichern, 800);
});

async function firmaSpeichern(){
  const st = g('firma-status');
  try {
    const { error } = await supabaseClient.from('pv_einstellungen')
      .upsert({ schluessel: 'firma', wert: abFirma || {}, geaendert_am: new Date().toISOString() });
    if(error) throw error;
    if(st) st.textContent = 'Gespeichert ✓';
  } catch(e){
    if(st) st.textContent = 'Nicht gespeichert – Internetverbindung prüfen';
    toastError('Firmendaten konnten nicht gespeichert werden', e);
  }
}

function firmaStempelHochladen(){
  if(!darf('katalog')) return toast('Keine Berechtigung');
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/png,image/jpeg'; inp.style.display = 'none';
  inp.onchange = async () => {
    const datei = inp.files && inp.files[0];
    inp.remove();
    if(!datei) return;
    if(!/^image\/(png|jpeg)$/.test(datei.type)) return toast('Bitte ein PNG- oder JPG-Bild wählen');
    const fehler = abDateiPruefen(datei);
    if(fehler) return toast(fehler);
    try {
      const alt = abKatalog.find(k => k.kategorie === 'stempel');
      const pfad = `bibliothek/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${abDateiEndung(datei)}`;
      await abHochladen(pfad, datei);
      const zeile = { kategorie: 'stempel', hersteller: (abFirma && abFirma.firma) || 'Firma', typ: 'Firmenstempel', daten: {},
        pfad, dateiname: datei.name, groesse: datei.size, mime: datei.type };
      const r = alt ? await supabaseClient.from('pv_komponenten').update(zeile).eq('id', alt.id)
                    : await supabaseClient.from('pv_komponenten').insert(zeile);
      if(r.error){ await supabaseClient.storage.from(AB_BUCKET).remove([pfad]); throw r.error; }
      if(alt && alt.pfad) await supabaseClient.storage.from(AB_BUCKET).remove([alt.pfad]);
      toast('Firmenstempel gespeichert');
      await abKatalogLaden();
      komponentenZeichnen();
    } catch(e){ toastError('Stempel konnte nicht gespeichert werden', e); }
  };
  document.body.appendChild(inp);
  inp.click();
}

// ── Anlagenfoto direkt im Anlagenbuch waehlen oder aufnehmen ──────────────
async function abFotosLaden(){
  const proj = getCurrentProject();
  if(!proj || typeof fotoListeLaden !== 'function') return [];
  await fotoListeLaden(proj.id);
  const pfade = fotoFuerWr(proj.id, ANLAGENFOTO).filter(f => !f.wartet).map(f => f.pfad);
  if(pfade.length) await fotoUrlsHolen(pfade);
  return fotoFuerWr(proj.id, ANLAGENFOTO).filter(f => f.url);
}
async function abFotoWahlZeichnen(){
  if(!g('ab-fotos')) return;
  let fotos = [];
  try { fotos = await abFotosLaden(); } catch(_){}
  const box = g('ab-fotos');
  if(!box || !abDaten) return;
  const gew = abDaten.anlagenfoto;
  const aktiv = (gew && fotos.some(f => f.pfad === gew)) ? gew : (fotos.length ? fotos[fotos.length - 1].pfad : '');
  const darfFoto = abDarfAendern() && (typeof fotoDarfAendern !== 'function' || fotoDarfAendern());
  box.innerHTML = `<span class="ab-feld-titel">Anlagenfoto (Deckblatt und Fotodokumentation)</span>
    <div class="ppd-fotos">${fotos.length ? fotos.map(f => `<button type="button" class="ppd-foto${f.pfad === aktiv ? ' an' : ''}" data-abfoto="${esc(f.pfad)}"
      title="${f.wartet ? 'wird noch hochgeladen' : 'als Anlagenfoto verwenden'}" aria-pressed="${f.pfad === aktiv}"><img src="${esc(f.url)}" alt=""></button>`).join('')
      : '<span class="ab-klein">Noch kein Anlagenfoto vorhanden.</span>'}</div>
    ${darfFoto ? `<button type="button" class="btn btn-ghost ppd-neu" onclick="abFotoNeu()">${ICON.camera} Foto aufnehmen / hochladen</button>` : ''}`;
}
document.addEventListener('click', e => {
  const b = e.target.closest && e.target.closest('[data-abfoto]');
  if(!b || !abDaten || !abDarfAendern()) return;
  abDaten.anlagenfoto = b.dataset.abfoto;
  abSpeichernVerzoegert();
  abFotoWahlZeichnen();
});
function abFotoNeu(){
  const proj = getCurrentProject();
  if(!proj || !abDarfAendern()) return toast('Keine Berechtigung');
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/*';
  inp.setAttribute('capture', 'environment');
  inp.style.display = 'none';
  inp.onchange = async () => {
    const d = inp.files && inp.files[0];
    inp.remove();
    if(!d) return;
    await fotoHinzufuegen(proj.id, ANLAGENFOTO, d);
    const fotos = await abFotosLaden();
    if(fotos.length && abDaten){ abDaten.anlagenfoto = fotos[fotos.length - 1].pfad; abSpeichernVerzoegert(); }
    abFotoWahlZeichnen();
  };
  document.body.appendChild(inp);
  inp.click();
}

// Firmenlogo hochladen (liegt im Speicher, Pfad in den Firmendaten)
function firmaLogoHochladen(){
  if(!darf('katalog')) return toast('Keine Berechtigung');
  const inp = document.createElement('input');
  inp.type = 'file'; inp.accept = 'image/png,image/jpeg'; inp.style.display = 'none';
  inp.onchange = async () => {
    const datei = inp.files && inp.files[0];
    inp.remove();
    if(!datei) return;
    if(!/^image\/(png|jpeg)$/.test(datei.type)) return toast('Bitte ein PNG- oder JPG-Bild wählen');
    const fehler = abDateiPruefen(datei);
    if(fehler) return toast(fehler);
    try {
      const alt = abFirma && abFirma.logo;
      const pfad = `bibliothek/firmenlogo-${Date.now()}.${abDateiEndung(datei)}`;
      await abHochladen(pfad, datei);
      abFirma = abFirma || {};
      abFirma.logo = pfad;
      await firmaSpeichern();
      if(alt && alt !== pfad) await supabaseClient.storage.from(AB_BUCKET).remove([alt]);
      toast('Firmenlogo gespeichert');
      komponentenZeichnen();
    } catch(e){ toastError('Logo konnte nicht gespeichert werden', e); }
  };
  document.body.appendChild(inp);
  inp.click();
}

// ══════════════════════════════════════════════════════════════════════════
//   PPK – AC-PRUEFPROTOKOLL (offizielle Foerder-Vorlage "Pruefbefund")
//   Fuellt das ausfuellbare Original-PDF (vorlagen/pruefbefund_2022.pdf)
//   direkt aus. Viele Werte kommen automatisch aus Projekt, Anlagenbuch,
//   Katalog und Matrix; der Elektriker ergaenzt nur den AC-Teil.
//   Daten je Projekt in pv_ppk (unabhaengig von der DC-Sperre).
// ══════════════════════════════════════════════════════════════════════════
const PPK_VORLAGE = 'vorlagen/pruefbefund_2022.pdf';
let ppkDaten = null;          // { w: {...}, sig: dataUrl }
let ppkTimer = null;
var ppkOffen = false;
const cbx = n => 'Check Box' + n;
const PJN = (ja, nein) => [['ja', cbx(ja)], ['nein', cbx(nein)]];
const PIO = (io, nio) => [['in Ordnung', cbx(io)], ['nicht in Ordnung', cbx(nio)]];

const PPK_TEILE = [
  { teil: 'A', titel: 'Prüfbefund', abschnitte: [
    { titel: 'Anlage & Betreiber', felder: [
      { t: 'text', f: 'Anlagenbetreiber', l: 'Anlagenbetreiber', a: 'betreiber' },
      { t: 'text', f: 'TelefonNr', l: 'Telefon', a: 'telefon' },
      { t: 'text', f: 'Anlagenadresse', l: 'Anlagenadresse', a: 'adresse', b: 1 },
      { t: 'text', f: 'Postadresse', l: 'Postadresse', a: 'postadresse', b: 1 },
      { t: 'text', f: 'Zu Befund Nr', l: 'Befund-Nr.' }
    ]},
    { titel: 'Art der Prüfung', felder: [
      { t: 'seg', k: 'art', l: 'Dieser Befund dient als', a: 'art', o: [['Erstprüfung', cbx(17)], ['Außerordentliche Erstprüfung', cbx(18)], ['Wiederkehrende Prüfung', cbx(19)]] }
    ]},
    { titel: 'Umfang der Überprüfung', felder: [
      { t: 'text', f: 'Anlagenteil Geprüft nach', l: 'Geprüft nach', a: 'norm_teil' },
      { t: 'matrix', k: 'umfang', l: 'Zutreffendes antippen',
        spalten: ['Versorgung, Schutzmaßnahmen', 'Verteiler', 'Betriebsmittel', 'Blitzschutz'],
        zeilen: [['Technische Unterlagen vorhanden', [1, 2, 3, 4]], ['Prüfbefund vorhanden', [5, 6, 7, 8]], ['Anlagenzustand in Ordnung', [9, 10, 11, 12]]] }
    ]},
    { titel: 'Ergebnis der Prüfung', felder: [
      { t: 'seg', k: 'ergebnis', l: 'Die Anlage ist', o: [['in Ordnung', cbx(20)], ['geringfügige Mängel', cbx(21)], ['nicht in Ordnung', cbx(22)]] },
      { t: 'num', f: 'Wochen zu beheben sind', l: 'Mängel beheben innerhalb von (Wochen)', nur: ['ergebnis', 'geringfügige Mängel'] },
      { t: 'multi', k: 'gefahr', l: 'Maßnahmen', nur: ['ergebnis', 'nicht in Ordnung'],
        o: [['Gefahr für Leben bzw. Sachwerte', cbx(23)], ['Anlage spannungslos geschaltet', cbx(24)], ['Abschaltung nicht möglich', cbx(25)], ['Meldung an die Behörde erstattet', cbx(26)]] }
    ]},
    { titel: 'Datum & Unterschrift', felder: [
      { t: 'date', f: 'Datum der Überprüfung', l: 'Datum der Überprüfung', a: 'heute' },
      { t: 'text', f: 'Name des Prüfers', l: 'Name des Prüfers', a: 'pruefer' },
      { t: 'date', f: 'Datum der nächsten Überprüfung', l: 'Datum der nächsten Überprüfung' },
      { t: 'text', f: 'Ort;Seite2', l: 'Ort', a: 'ort' },
      { t: 'date', f: 'am;Seite2', l: 'am', a: 'heute' },
      { t: 'text', f: 'Name, Seite2', l: 'Anlagenverantwortlicher (nimmt zur Kenntnis)', a: 'betreiber' },
      { t: 'sig', l: 'Unterschrift Prüfer' }
    ]}
  ]},
  { teil: 'B', titel: 'Anlagendokumentation', abschnitte: [
    { titel: 'Allgemeine Angaben', felder: [
      { t: 'text', f: 'Jahr', l: 'Errichtungsjahr', a: 'jahr' },
      { t: 'text', f: 'Wesentliche Änderungen an der Anlage Jahr', l: 'Wesentliche Änderungen (Jahr)' },
      { t: 'text', f: 'Anlage ausgeführt nach Norm', l: 'Anlage ausgeführt nach (Norm)', a: 'norm' },
      { t: 'multi', k: 'richtl1', l: 'OVE-Richtlinien', o: [['R 11', cbx(27)], ['R 6-2-1', cbx(28)], ['R 6-2-2', cbx(29)]] },
      { t: 'area', f: ['Von der Behörde wurden folgende Auflagen erteilt', 'Von der Behörde wurden folgende Auflagen erteilt2'], l: 'Behördliche Auflagen' },
      { t: 'date', f: 'Datum der letzten Anlagenüberprüfung', l: 'Datum der letzten Anlagenüberprüfung' },
      { t: 'text', f: 'Zählpunktnummer', l: 'Zählpunktnummer', a: 'zaehlpunkt', b: 1 }
    ]},
    { titel: 'Art der PV-Anlage', felder: [
      { t: 'seg', k: 'anlagenart', l: 'Betriebsart', a: 'anlagenart', o: [['Netzparallelbetrieb', cbx(31)], ['Inselbetrieb (DC)', cbx(30)], ['Inselbetrieb (AC)', cbx(33)]] }
    ]},
    { titel: 'Solarmodule & PV-Generator', felder: [
      { t: 'text', f: 'Hersteller', l: 'Hersteller', a: 'm_hersteller' }, { t: 'text', f: 'Lieferant', l: 'Lieferant' },
      { t: 'text', f: 'Type', l: 'Type', a: 'm_typ', b: 1 },
      { t: 'seg', k: 'rueckstrom', l: 'Rückstromfähig', o: PJN(34, 35) },
      { t: 'num', f: 'Nennleistung', l: 'Nennleistung (Wp)', a: 'm_wp' }, { t: 'num', f: 'Leerlaufspg UDC', l: 'Leerlaufspannung Uoc (V)', a: 'm_uoc' },
      { t: 'num', f: 'Kurzschlussstrom ISC', l: 'Kurzschlussstrom Isc (A)', a: 'm_isc' }, { t: 'num', f: 'Betriebsstrom IMPP', l: 'Betriebsstrom Impp (A)' },
      { t: 'num', f: 'Max zulässige Systemsp', l: 'Max. zulässige Systemspannung (V)' },
      { t: 'num', f: 'Anzahl Module Strang', l: 'Anzahl Module / Strang', a: 'mod_strang' },
      { t: 'num', f: 'Systemnennsp', l: 'Systemnennspannung (V)', a: 'u_system' },
      { t: 'num', f: 'Gesamtleistung Nennbedingungen', l: 'Gesamtleistung (kWp)', a: 'kwp' },
      { t: 'num', f: 'Gesamtstrom Nennbedingungen', l: 'Gesamtstrom (A)' }
    ]},
    { titel: 'Modulmontage', felder: [
      { t: 'seg', k: 'statik', l: 'Statische Vorbemessung Montagesystem', o: [['ja (s. Beilage)', cbx(36)], ['nein', cbx(37)]] },
      { t: 'text', f: 'Ausrichtung n Himmelsrichtung', l: 'Ausrichtung (Grad)', a: 'ausrichtung' },
      { t: 'num', f: 'Modulneigung', l: 'Modulneigung (Grad)', a: 'neigung' },
      { t: 'seg', k: 'montage', l: 'Montageart', o: [['Dachintegriert', cbx(38)], ['Dachparallel', cbx(39)], ['aufgeständert', cbx(40)], ['Fassade', cbx(41)], ['Sonstige', cbx(42)]] },
      { t: 'text', f: 'Modulmontage Sonstige', l: 'Sonstige Montageart', nur: ['montage', 'Sonstige'] }
    ]},
    { titel: 'Laderegler (falls vorhanden)', optional: 1, felder: [
      { t: 'text', f: 'Hersteller_2', l: 'Hersteller' }, { t: 'text', f: 'Lieferant_2', l: 'Lieferant' }, { t: 'text', f: 'Type_2', l: 'Type' },
      { t: 'num', f: 'Nennstrom', l: 'Nennstrom (A)' },
      { t: 'seg', k: 'regler', l: 'Reglerfunktion', o: [['Shunt', cbx(43)], ['Zweipunkt', cbx(44)], ['Parallel', cbx(45)], ['MPP', cbx(46)], ['Serie', cbx(47)]] },
      { t: 'seg', k: 'regler_temp', l: 'Temperaturkompensation mit externem Messfühler', o: PJN(48, 49) },
      { t: 'seg', k: 'regler_u', l: 'Laderegler mit Spannungsfühler', o: PJN(50, 51) }
    ]},
    { titel: 'Stromspeicher (falls vorhanden)', optional: 1, felder: [
      { t: 'text', f: 'Hersteller_3', l: 'Hersteller', a: 's_hersteller' }, { t: 'text', f: 'Lieferant_3', l: 'Lieferant' },
      { t: 'text', f: 'Type_3', l: 'Type', a: 's_typ' }, { t: 'text', f: 'Bauart', l: 'Bauart' },
      { t: 'seg', k: 'saeurewanne', l: 'Säurewanne', o: PJN(52, 53) },
      { t: 'text', f: 'Aufstellungsort', l: 'Aufstellungsort', a: 's_ort' },
      { t: 'multi', k: 'wartungsfrei', l: 'Ausführung', o: [['wartungsfrei', cbx(54)]] },
      { t: 'num', f: 'Nennspannung', l: 'Nennspannung (V)', a: 's_spannung' }, { t: 'num', f: 'Zellenanzahl', l: 'Zellenanzahl' },
      { t: 'text', f: 'Kapazität', l: 'Kapazität (Ah/10)' }, { t: 'text', f: 'Anschlußleitung', l: 'Anschlussleitung (mm²)' },
      { t: 'num', f: 'Hauptabsicherung', l: 'Hauptabsicherung (A)' },
      { t: 'seg', k: 'belueftung', l: 'Raum Be-/Entlüftung', o: [['statisch', cbx(55)], ['mechanisch', cbx(56)]] }
    ]},
    { titel: 'Wechselrichter', felder: [
      { t: 'text', f: 'Hersteller_4', l: 'Hersteller', a: 'w_hersteller' }, { t: 'text', f: 'Lieferant_4', l: 'Lieferant' },
      { t: 'text', f: 'Type_4', l: 'Type', a: 'w_typ', b: 1 },
      { t: 'seg', k: 'wrart', l: 'Art', a: 'wrart', o: [['Netzgekoppelt', cbx(58)], ['Inselwechselrichter', cbx(57)]] },
      { t: 'num', f: 'Anzahl WR', l: 'Anzahl Wechselrichter', a: 'wr_anzahl' },
      { t: 'multi', k: 'modulwr', l: 'Bauform', o: [['Modulwechselrichter', cbx(61)]] },
      { t: 'seg', k: 'trenntrafo', l: 'Trenntrafo', o: PJN(64, 65) },
      { t: 'seg', k: 'rcmu', l: 'WR mit allstromsensitivem RCMU', o: PJN(67, 68) },
      { t: 'seg', k: 'iso_ueb', l: 'Isolationsüberwachungsgerät', o: PJN(69, 70) },
      { t: 'seg', k: 'netzfrei', l: 'Automatische Netzfreischaltstelle', o: PJN(71, 72) },
      { t: 'text', f: 'Sonstige integrierte Schutzgeräte', l: 'Sonstige integrierte Schutzgeräte', b: 1 },
      { t: 'num', f: 'von', l: 'DC-Eingangsspannungsbereich von (V)' }, { t: 'num', f: 'bis', l: 'bis (V)' },
      { t: 'num', f: 'Max Eingangsspannung', l: 'Max. Eingangsspannung (V)' }, { t: 'num', f: 'Max Eingangsstrom', l: 'Max. Eingangsstrom (A)' },
      { t: 'num', f: 'Nennspannung_2', l: 'AC-Nennspannung (V)' }, { t: 'num', f: 'ACNennleistung', l: 'AC-Nennleistung (kW)', a: 'w_kw' },
      { t: 'text', f: 'Gehäuse Schutzart', l: 'Gehäuse-Schutzart', a: 'w_ip' }, { t: 'text', f: 'Temperaturbereich', l: 'Temperaturbereich' },
      { t: 'seg', k: 'inselfaehig', l: 'Wechselrichter inselbetriebsfähig', o: PJN(73, 74) },
      { t: 'text', f: 'Ort; Seite4', l: 'Wechselrichter-/AC-Freischaltstelle – Ort', b: 1 }
    ]},
    { titel: 'Überspannungsschutz AC', felder: [
      { t: 'text', f: 'Klasse', l: 'Klasse', a: 'uesk_ac' }, { t: 'text', f: 'Type_5', l: 'Type' },
      { t: 'num', f: 'IIMP', l: 'Iimp (kA)' }, { t: 'num', f: 'IN', l: 'In (kA)' }, { t: 'num', f: 'UC', l: 'Uc (V)' },
      { t: 'text', f: 'Montageort', l: 'Montageort' }
    ]},
    { titel: 'Netzeinspeisung', felder: [
      { t: 'multi', k: 'phasen', l: 'Einspeisung über', o: [['L1', cbx(75)], ['L2', cbx(76)], ['L3', cbx(77)]] },
      { t: 'text', f: 'Einspeisepunkt Ort', l: 'Einspeisepunkt (Ort)' }, { t: 'text', f: 'Art des Zählers', l: 'Art des Zählers' },
      { t: 'seg', k: 'einspeisung', l: 'Art der Einspeisung', o: [['Überschusseinspeisung', cbx(78)], ['Volleinspeisung', cbx(79)]] }
    ]},
    { titel: 'DC-Installation', felder: [
      { t: 'titel', l: 'Modulverbindungsleitung' },
      { t: 'text', f: 'Spannungsfestigkeit', l: 'Spannungsfestigkeit' }, { t: 'text', f: 'Lieferant_5', l: 'Lieferant' },
      { t: 'seg', k: 'db_mvl', l: 'Datenblatt vorhanden', o: PJN(80, 81) },
      { t: 'text', f: 'Leitungstype', l: 'Leitungstype' }, { t: 'text', f: 'Querschnitt', l: 'Querschnitt' },
      { t: 'seg', k: 'klemm', l: 'Klemmverbindung', o: PJN(82, 83) }, { t: 'seg', k: 'steck', l: 'Steckverbindung', o: PJN(84, 85) },
      { t: 'titel', l: 'Sonstige DC-Verbindungsleitung' },
      { t: 'text', f: 'Spannungsfestigkeit_2', l: 'Spannungsfestigkeit' }, { t: 'text', f: 'Lieferant_6', l: 'Lieferant' },
      { t: 'seg', k: 'db_dcl', l: 'Datenblatt vorhanden', o: PJN(86, 87) },
      { t: 'text', f: 'Leitungstype_2', l: 'Leitungstype' }, { t: 'text', f: 'Querschnitt_2', l: 'Querschnitt' },
      { t: 'text', f: 'Verlegung der Leitung', l: 'Verlegung der Leitung', b: 1 },
      { t: 'titel', l: 'Schutzziel' },
      { t: 'seg', k: 'kse', l: 'Kurzschlusseinrichtung', o: [['vorhanden', cbx(88)], ['nicht vorhanden', cbx(89)]] },
      { t: 'num', f: 'Anzahl', l: 'Abschalteinrichtung – Anzahl' }, { t: 'text', f: 'Type_6', l: 'Type' },
      { t: 'num', f: 'Strom', l: 'Strom (A)' }, { t: 'num', f: 'Spannung', l: 'Spannung (V)' },
      { t: 'seg', k: 'abs_wr', l: 'Im WR integriert', o: PJN(90, 91) },
      { t: 'seg', k: 'abs_ext', l: 'Externe Freischalteinrichtung', o: [['ja (empfohlen)', cbx(92)], ['nein', cbx(93)]] },
      { t: 'text', f: 'Ort Freischalteinrichtung In unmittelbarer Nähe der Module empfohlen', l: 'Ort der Freischalteinrichtung', a: 'dc_frei', b: 1 },
      { t: 'multi', k: 'baulich', l: 'Bauliche Maßnahmen', o: [['Brandgeschützte Verlegung im Gebäude', cbx(94)], ['Verlegung außerhalb des Gebäudes', cbx(95)]] },
      { t: 'area', f: ['Bauliche Maßnahmen', 'Bauliche Maßnahmen1', 'Bauliche Maßnahmen2'], l: 'Weitere bauliche Maßnahmen' }
    ]},
    { titel: 'Generatoranschlusskasten (GAK)', optional: 1, felder: [
      { t: 'text', f: 'Einbauten', l: 'Einbauten', b: 1 }, { t: 'text', f: 'Schutzart', l: 'Schutzart' },
      { t: 'text', f: 'Aufstellungsort_2', l: 'Aufstellungsort' }, { t: 'text', f: 'Stranganschlüsse', l: 'Stranganschlüsse' }
    ]},
    { titel: 'Überspannungsschutz DC', felder: [
      { t: 'text', f: 'Lieferant_7', l: 'Lieferant' }, { t: 'seg', k: 'db_ueds', l: 'Datenblatt vorhanden', o: [['ja', cbx(96)], ['nein', cbx(97)]] },
      { t: 'text', f: 'Klasse_2', l: 'Klasse', a: 'uesk_dc' }, { t: 'text', f: 'Type_7', l: 'Type' },
      { t: 'num', f: 'IIMP_2', l: 'Iimp (kA)' }, { t: 'num', f: 'IN_2', l: 'In (kA)' }, { t: 'num', f: 'UC_2', l: 'Uc (V)' },
      { t: 'text', f: 'Montageort_2', l: 'Montageort' }
    ]},
    { titel: 'Potentialausgleich & Blitzschutz', schnell: 1, felder: [
      { t: 'seg', k: 'hpa', l: 'Hauptpotentialausgleich ordnungsgemäß', o: PJN(98, 99) },
      { t: 'seg', k: 'pa_pv', l: 'Potentialausgleich der PV-Anlage ordnungsgemäß', o: PJN(100, 101) },
      { t: 'seg', k: 'blitz', l: 'Blitzschutzanlage', o: [['vorhanden', cbx(102)], ['nicht vorhanden', cbx(103)]] },
      { t: 'seg', k: 'blitz_vs', l: 'Blitzschutz entspricht den Vorschriften', o: [['ja', cbx(104)], ['nein', cbx(105)], ['nicht geprüft', cbx(106)]] },
      { t: 'seg', k: 'blitz_prot', l: 'Blitzschutz-Protokoll', o: [['vorhanden', cbx(107)], ['nur RA-Messung', cbx(108)]] },
      { t: 'seg', k: 'uess_ac', l: 'Überspannungsschutz AC', o: [['in Ordnung', cbx(109)], ['nicht in Ordnung', cbx(110)], ['nicht vorhanden', cbx(111)]] },
      { t: 'seg', k: 'uess_dc', l: 'Überspannungsschutz DC', o: [['in Ordnung', cbx(112)], ['nicht in Ordnung', cbx(113)], ['nicht vorhanden', cbx(114)]] },
      { t: 'multi', k: 'richtl2', l: 'Anlage ausgeführt nach', o: [['R 11', cbx(115)], ['R 6-2-1', cbx(116)], ['R 6-2-2', cbx(117)]] }
    ]},
    { titel: 'Installation & Netzanschluss (AC)', felder: [
      { t: 'text', f: 'Netzbetreiber', l: 'Netzbetreiber' }, { t: 'num', f: 'Nennspg', l: 'Nennspannung (V)' },
      { t: 'num', f: 'Absicherung', l: 'Absicherung (A)' },
      { t: 'text', f: 'Ort_2', l: 'Hausanschluss / Hauptsicherungskasten – Ort', b: 1 },
      { t: 'seg', k: 'tafel', l: 'Beschriftungstafel (Rücklieferer PV-Anlage)', o: PJN(120, 121) },
      { t: 'seg', k: 'selbstfrei', l: 'Selbstständige Freischalteinrichtung', o: PJN(122, 123) },
      { t: 'text', f: 'Hauptleitung', l: 'Hauptleitung (mm²)' }, { t: 'text', f: 'Bauart der Hauptsicherung', l: 'Bauart der Hauptsicherung' },
      { t: 'num', f: 'mm²Absicherung der Hauptleitung', l: 'Absicherung der Hauptleitung (A)' }, { t: 'text', f: 'inauf', l: 'Hauptleitung in/auf' },
      { t: 'text', f: 'Vorzählerleitung', l: 'Vorzählerleitung (mm²)' }, { t: 'text', f: 'Bauart der Vorzählersicherung', l: 'Bauart der Vorzählersicherung' },
      { t: 'num', f: 'Absicherung der Vorzählerleitung', l: 'Absicherung der Vorzählerleitung (A)' }, { t: 'text', f: 'inauf_2', l: 'Vorzählerleitung in/auf' },
      { t: 'text', f: 'Zählerplatz Standort', l: 'Zählerplatz (Standort)' }, { t: 'text', f: 'Verlegung', l: 'Verlegung' },
      { t: 'area', f: ['Art und Verlegung der Leitungen und KabelQuerschnitte Zuleitungen PVGenerator bis WRRow1'], l: 'Art und Verlegung der Leitungen/Querschnitte (PV-Generator bis WR)' }
    ]},
    { titel: 'Organisatorisches & Kennzeichnung', schnell: 1, felder: [
      { t: 'seg', k: 'org1', l: 'Bekanntgabe besonderer Gefahren für Einsatzkräfte', o: PJN(124, 125) },
      { t: 'seg', k: 'org2', l: 'Informationen und Planungsunterlagen zur Verfügung gestellt', o: PJN(126, 127) },
      { t: 'seg', k: 'org3', l: 'Einweisung der Einsatzkräfte über Schalthandlungen', o: PJN(128, 129) },
      { t: 'seg', k: 'hinweis', l: 'Hinweisschild vorhanden', o: PJN(130, 131) },
      { t: 'seg', k: 'plan', l: 'Übersichtsplan vorhanden', o: PJN(132, 133) },
      { t: 'seg', k: 'unterw', l: 'Unterweisung des Anlageninhabers erfolgt', o: PJN(134, 135) }
    ]}
  ]},
  { teil: 'C', titel: 'Prüfung', abschnitte: [
    { titel: 'Besichtigung', schnell: 1, felder: [
      { t: 'seg', k: 'c_hinweis', l: 'Hinweisschild im HSK vorhanden', o: PJN(136, 137) },
      { t: 'seg', k: 'c_plan', l: 'Übersichtsplan vorhanden', o: PJN(138, 139) },
      { t: 'text', f: 'Mechanischer Zustand der elektr Betriebsmittel', l: 'Mechanischer Zustand der elektr. Betriebsmittel', b: 1 },
      { t: 'text', f: 'Mechanisches GerüstSichtkontrolle', l: 'Mechanisches Gerüst – Sichtkontrolle', b: 1 },
      { t: 'seg', k: 'c_verb', l: 'Mechanische Verbindungen', o: [['in Ordnung', cbx(140)], ['nicht in Ordnung', cbx(141)], ['nicht zugänglich', cbx(142)]] }
    ]},
    { titel: 'Schutzmaßnahmen Gleichstromseite (DC)', schnell: 1, felder: [
      { t: 'pruef', k: 'dc_si', l: 'Schutzisolierung', an: cbx(143), io: [cbx(144), cbx(145)] },
      { t: 'pruef', k: 'dc_skl', l: 'Schutzkleinspannung', an: cbx(146), io: [cbx(147), cbx(148)] },
      { t: 'pruef', k: 'dc_uel', l: 'Sichtprüfung der Überspannungsleiter', an: cbx(149), io: [cbx(150), cbx(151)] },
      { t: 'pruef', k: 'dc_so', l: 'Sonstige Schutzmaßnahme', an: cbx(152), io: [cbx(153), cbx(154)] },
      { t: 'text', f: 'Prüfung Sonstige', l: 'Sonstige Schutzmaßnahme – Bezeichnung', nur: ['dc_so', '*'] }
    ]},
    { titel: 'Schutzmaßnahmen Wechselstromseite (AC)', schnell: 1, felder: [
      { t: 'pruef', k: 'ac_null', l: 'Nullung', an: cbx(155), io: [cbx(156), cbx(157)] },
      { t: 'pruef', k: 'ac_fi', l: 'Fehlerstrom-Schutzschaltung', an: cbx(158), io: [cbx(159), cbx(160)] },
      { t: 'pruef', k: 'ac_uel', l: 'Sichtprüfung der Überspannungsleiter', an: cbx(161), io: [cbx(162), cbx(163)] },
      { t: 'pruef', k: 'ac_kse', l: 'Kurzschlusseinrichtung', an: cbx(164), io: [cbx(165), cbx(166)] }
    ]},
    { titel: 'Erdung & Schutzpotentialausgleich', schnell: 1, felder: [
      { t: 'seg', k: 'erd', l: 'Erdungsanlage', o: PIO(167, 168) },
      { t: 'seg', k: 'spa', l: 'Schutzpotentialausgleich', o: PIO(169, 170) },
      { t: 'seg', k: 'nod', l: 'Niederohmige Durchgänge', o: PIO(171, 172) }
    ]},
    { titel: 'Wechselrichter', schnell: 1, felder: [
      { t: 'seg', k: 'wr_konf', l: 'Konformitätserklärung vorhanden', o: PIO(173, 174) },
      { t: 'seg', k: 'wr_ab', l: 'Wechselrichter konform mit Anlagenbuch', o: PIO(175, 176) },
      { t: 'seg', k: 'wr_db', l: 'Datenblätter vorhanden', o: PIO(177, 178) },
      { t: 'seg', k: 'wr_kse', l: 'Kurzschlusseinrichtung vorhanden', o: PIO(179, 180) },
      { t: 'seg', k: 'wr_abs', l: 'Abschalteinrichtung', o: PJN(181, 182) },
      { t: 'seg', k: 'wr_abs_io', l: 'Abschalteinrichtung – Zustand', o: [['in Ordnung', cbx(183)], ['nicht in Ordnung', cbx(184)]] },
      { t: 'seg', k: 'wr_bau', l: 'Bauliche Maßnahme', o: [['ja', cbx(185)], ['nein', cbx(186)]] },
      { t: 'seg', k: 'wr_bau_io', l: 'Bauliche Maßnahme – Zustand', o: [['in Ordnung', cbx(187)], ['nicht in Ordnung', cbx(188)]] }
    ]},
    { titel: 'Überspannungsschutz', schnell: 1, felder: [
      { t: 'seg', k: 'ue_vorh', l: 'Überspannungsschutz vorhanden', o: PJN(189, 190) },
      { t: 'seg', k: 'ue_io', l: 'Zustand', o: [['in Ordnung', cbx(191)], ['nicht in Ordnung', cbx(192)]] }
    ]},
    { titel: 'Verwendete Messgeräte', felder: [
      { t: 'text', f: 'Hersteller_5', l: 'Messgerät 1 – Hersteller' }, { t: 'text', f: 'Type_8', l: 'Type' }, { t: 'text', f: 'Seriennummer', l: 'Seriennummer' },
      { t: 'text', f: 'Hersteller_6', l: 'Messgerät 2 – Hersteller' }, { t: 'text', f: 'Type_9', l: 'Type' }, { t: 'text', f: 'Seriennummer_2', l: 'Seriennummer' }
    ]},
    { titel: 'Isolationswiderstand Gleichstromseite', felder: [
      { t: 'riso' },
      { t: 'num', f: 'UPrüf', l: 'Prüfspannung (V)' }, { t: 'num', f: 'Minimalwert PlusMinus', l: 'Plus/Minus (MΩ)' },
      { t: 'num', f: 'PlusPE', l: 'Plus/PE (MΩ)' }, { t: 'num', f: 'MinusPE', l: 'Minus/PE (MΩ)' },
      { t: 'seg', k: 'riso_dc', l: 'Isolationswiderstand ist', o: PIO(193, 194) },
      { t: 'titel', l: 'Bei Wiederholungsprüfung' },
      { t: 'num', f: 'UPrüf_2', l: 'Prüfspannung (V)' }, { t: 'num', f: 'Minimalwert', l: 'Minimalwert (MΩ)' },
      { t: 'num', f: 'PlusPE_2', l: 'Plus/PE (MΩ)' }, { t: 'num', f: 'MinusPE_2', l: 'Minus/PE (MΩ)' },
      { t: 'seg', k: 'riso_dc2', l: 'Isolationswiderstand ist', o: PIO(195, 196) }
    ]},
    { titel: 'Strangmessung (aus der Matrix)', felder: [
      { t: 'strang' },
      { t: 'num', f: 'Betriebsstrom', l: 'Solargenerator-Gesamtstrom (A)' }, { t: 'num', f: 'Betriebsspannung', l: 'Betriebsspannung (V)' },
      { t: 'num', f: 'Temperatur', l: 'Temperatur (°C)', a: 'temp' }, { t: 'text', f: 'Witterung', l: 'Witterung', a: 'wetter' }
    ]},
    { titel: 'Isolationswiderstand Wechselstromseite', felder: [
      { t: 'num', f: 'UPrüf_3', l: 'Prüfspannung (V)' },
      { t: 'num', f: 'LL', l: 'L/L (MΩ)' }, { t: 'num', f: 'LN', l: 'L/N (MΩ)' },
      { t: 'num', f: 'LPE', l: 'L/PE (MΩ)' }, { t: 'num', f: 'NPE', l: 'N/PE (MΩ)' },
      { t: 'num', f: 'L123NPEN', l: 'Wenn nicht einzeln möglich: L1,2,3 – N/PE(N) (MΩ)' },
      { t: 'seg', k: 'riso_ac', l: 'Isolationswiderstand ist', o: PIO(197, 198) }
    ]}
  ]}
];

// ── Werte ─────────────────────────────────────────────────────────────────
const PPK_SCHLUESSEL = pid => `pv_ppk_entwurf::${currentUser ? currentUser.id : 'anon'}::${pid}`;
const ppkEinzeilig = t => String(t || '').replace(/\s*\n\s*/g, ', ').trim();
function ppkStraenge(){
  return getAllFullIds().filter(id => APP_STATE[id] && APP_STATE[id].stat === 'JA');
}
function ppkAuto(){
  const proj = getCurrentProject();
  const ab = (proj && proj.anlagenbuch) || {};
  const f = abFirma || {};
  const mod = abKomp(ab.modul && ab.modul.komponente);
  const md = (mod && mod.daten) || {};
  const plan = getCurrentPlan();
  const wrK = Object.keys(plan).map(wr => abKomp(ab.wr && ab.wr[wr])).filter(Boolean);
  const wd = (wrK[0] && wrK[0].daten) || {};
  const sp = abKomp(ab.speicher && ab.speicher.komponente);
  const aktiv = ppkStraenge();
  const mods = aktiv.map(id => Number(APP_STATE[id].mod) || 0).filter(Boolean);
  const zaehl = {}; mods.forEach(m => { zaehl[m] = (zaehl[m] || 0) + 1; });
  const haeufig = Object.keys(zaehl).sort((a, b) => zaehl[b] - zaehl[a])[0] || '';
  const wp = abZahl(md.wp) || getCurrentWp();
  const summe = mods.reduce((a, b) => a + b, 0);
  const uocs = aktiv.map(id => abZahl(APP_STATE[id].uoc)).filter(v => v !== null);
  const eindeutig = arr => [...new Set(arr.filter(Boolean))].join(' / ');
  const ba = String(ab.betriebsart || '');
  const heute = new Date().toISOString().slice(0, 10);
  return {
    betreiber: ab.betreiber && ab.betreiber.name, telefon: ab.betreiber && ab.betreiber.kontakt,
    adresse: ppkEinzeilig(ab.standort && ab.standort.adresse), postadresse: ppkEinzeilig(ab.betreiber && ab.betreiber.adresse),
    art: 'Erstprüfung', norm_teil: 'ÖVE/ÖNORM E 8101', norm: 'ÖVE/ÖNORM E 8101', heute,
    pruefer: anzeigeName(), ort: f.ort,
    jahr: ab.inbetriebnahme ? String(ab.inbetriebnahme).slice(0, 4) : String(new Date().getFullYear()),
    zaehlpunkt: ab.zaehlpunkt,
    anlagenart: /DC-gekoppelt/.test(ba) ? 'Inselbetrieb (DC)' : (/AC-gekoppelt/.test(ba) ? 'Inselbetrieb (AC)' : 'Netzparallelbetrieb'),
    m_hersteller: mod && mod.hersteller, m_typ: mod && mod.typ, m_wp: md.wp || (wp ? String(wp) : ''), m_uoc: md.uoc, m_isc: md.isc,
    mod_strang: haeufig, u_system: uocs.length ? String(Math.round(Math.max(...uocs))) : '',
    kwp: summe ? (summe * wp / 1000).toFixed(2).replace('.', ',') : '',
    ausrichtung: ab.modul && ab.modul.ausrichtung, neigung: ab.modul && ab.modul.neigung,
    s_hersteller: sp && sp.hersteller, s_typ: sp && sp.typ, s_spannung: sp && sp.daten && sp.daten.spannung, s_ort: ab.speicher && ab.speicher.ort,
    w_hersteller: eindeutig(wrK.map(k => k.hersteller)), w_typ: eindeutig(wrK.map(k => k.typ)), wrart: 'Netzgekoppelt',
    wr_anzahl: String(Object.keys(plan).length || ''), w_kw: wd.leistung_kw, w_ip: wd.ip,
    uesk_ac: ab.ueberspannung && ab.ueberspannung.ac !== 'nicht vorhanden' ? ab.ueberspannung.ac : '',
    uesk_dc: ab.ueberspannung && ab.ueberspannung.dc !== 'nicht vorhanden' ? ab.ueberspannung.dc : '',
    dc_frei: ppkEinzeilig(ab.schalter && ab.schalter.dc),
    temp: ab.pruefung && ab.pruefung.temperatur, wetter: ab.pruefung && ab.pruefung.wetter
  };
}
function ppkFeldKey(fd){ return fd.f ? (Array.isArray(fd.f) ? fd.f[0] : fd.f) : fd.k; }
function ppkWert(fd, auto){
  const k = ppkFeldKey(fd);
  const eigen = ppkDaten && ppkDaten.w ? ppkDaten.w[k] : undefined;
  if(eigen !== undefined && eigen !== null && eigen !== '') return { v: eigen, auto: false };
  const a = fd.a && auto ? auto[fd.a] : undefined;
  return (a !== undefined && a !== null && a !== '') ? { v: a, auto: true } : { v: fd.t === 'multi' ? [] : '', auto: false };
}
function ppkSichtbar(fd){
  if(!fd.nur) return true;
  const [k, v] = fd.nur;
  const w = ppkDaten && ppkDaten.w ? ppkDaten.w[k] : '';
  return v === '*' ? !!w : w === v;
}
function ppkDarfAendern(){ return darf('ppk'); }

// ── Reiter zeichnen ───────────────────────────────────────────────────────
async function ppkRendern(){
  const box = g('ppk-inhalt');
  if(!box) return;
  if(!darf('ppk')){ box.innerHTML = '<div class="ab-leer">Für das AC-Prüfprotokoll fehlt dir die Berechtigung.</div>'; return; }
  const proj = getCurrentProject();
  if(!proj){
    box.innerHTML = `<div class="ab-leer"><h2>PPK – AC-Prüfprotokoll</h2><p>Bitte zuerst ein Projekt öffnen – links im Menü unter „Projekte“.</p>
      <button class="btn btn-primary" onclick="toggleSidebar()">Projekt wählen</button></div>`;
    return;
  }
  box.innerHTML = '<div class="ab-leer">Lade PPK …</div>';
  ppkDaten = { w: {} };
  try {
    await Promise.all([abKatalogLaden().catch(() => {}), abFirmaLaden().catch(() => {})]);
    const { data, error } = await supabaseClient.from('pv_ppk').select('daten').eq('project_id', proj.id).maybeSingle();
    if(error) throw error;
    if(data && data.daten) ppkDaten = data.daten;
  } catch(e){ console.warn('PPK laden:', e); toast('PPK konnte nicht aus der Cloud geladen werden – Netz prüfen'); }
  if(!ppkDaten.w) ppkDaten.w = {};
  try {
    const roh = localStorage.getItem(PPK_SCHLUESSEL(proj.id));
    if(roh){
      const e = JSON.parse(roh);
      if(e && e.daten && JSON.stringify(e.daten) !== JSON.stringify(ppkDaten)){
        ppkDaten = e.daten;
        toast('Nicht hochgeladene PPK-Eingaben wiederhergestellt');
        ppkSpeichernVerzoegert();
      }
    }
  } catch(_){}
  if(getCurrentProject() !== proj) return;
  ppkZeichnen();
}

function ppkFeldHtml(fd, auto){
  if(!ppkSichtbar(fd)) return '';
  const dis = ppkDarfAendern() ? '' : ' disabled';
  if(fd.t === 'titel') return `<div class="ab-breit ab-unter">${esc(fd.l)}</div>`;
  if(fd.t === 'sig'){
    return `<div class="ab-breit ppk-sig"><span class="ab-feld-titel">${esc(fd.l)}</span>
      <canvas id="ppk-sig" width="600" height="160"></canvas>
      <div class="ppk-sig-knoepfe"><span class="ab-klein">Mit Finger oder Maus unterschreiben – kommt ins Feld „Unterschrift“ und zur Stampiglie.</span>
      <button type="button" class="btn btn-ghost ab-mini" onclick="ppkSigLoeschen()">Löschen</button></div></div>`;
  }
  if(fd.t === 'strang'){
    const ids = ppkStraenge();
    const zeilen = ids.slice(0, 12).map((id, i) => `<tr><td>${i + 1}</td><td>${esc(id)}</td><td class="z">${esc(APP_STATE[id].uoc || '—')}</td><td class="z">${esc(APP_STATE[id].isc || '—')}</td></tr>`).join('');
    return `<div class="ab-breit"><table class="ab-tabelle"><thead><tr><th>Strang</th><th>Klemme</th><th class="z">Uoc (V)</th><th class="z">Isc (A)</th></tr></thead>
      <tbody>${zeilen || '<tr><td colspan="4">Noch keine DC-Messwerte in der Matrix.</td></tr>'}</tbody></table>
      <p class="ab-klein">${ids.length > 12 ? `Das Formular hat Platz für 12 Stränge – alle ${ids.length} Stränge kommen zusätzlich auf ein Beiblatt.` : 'Die Werte kommen automatisch aus der DC-Messung.'}</p></div>`;
  }
  if(fd.t === 'riso'){
    const w = ppkStraenge().map(id => abZahl(APP_STATE[id].riso)).filter(v => v !== null);
    if(!w.length) return '';
    const min = Math.min(...w);
    return `<div class="ab-breit ppk-hinweis">Kleinster DC-Isolationswert aus der Matrix: <strong>${String(min).replace('.', ',')} MΩ</strong>
      ${dis ? '' : `<button type="button" class="btn btn-ghost ab-mini" onclick="ppkRisoUebernehmen('${min}')">für Plus/PE und Minus/PE übernehmen</button>`}</div>`;
  }
  const { v, auto: istAuto } = ppkWert(fd, auto);
  const marke = istAuto ? '<em class="ppk-auto">aus Projekt</em>' : '';
  if(fd.t === 'seg' || fd.t === 'pruef'){
    const opts = fd.t === 'pruef' ? [['i. O.'], ['nicht i. O.']] : fd.o;
    return `<div class="ab-feld${fd.o && fd.o.length > 3 ? ' ab-breit' : ''}"><span>${esc(fd.l)} ${marke}</span><div class="ppk-seg">${opts.map(([lab]) =>
      `<button type="button" class="${v === lab ? 'an' : ''}" data-ppk-seg="${esc(fd.k)}" data-v="${esc(lab)}"${dis}>${esc(lab)}</button>`).join('')}</div></div>`;
  }
  if(fd.t === 'multi'){
    const arr = Array.isArray(v) ? v : [];
    return `<div class="ab-feld${fd.o.length > 2 ? ' ab-breit' : ''}"><span>${esc(fd.l)}</span><div class="ppk-chips">${fd.o.map(([lab]) =>
      `<button type="button" class="${arr.includes(lab) ? 'an' : ''}" data-ppk-multi="${esc(fd.k)}" data-v="${esc(lab)}"${dis}>${esc(lab)}</button>`).join('')}</div></div>`;
  }
  if(fd.t === 'matrix'){
    const m = (ppkDaten.w[fd.k] && typeof ppkDaten.w[fd.k] === 'object') ? ppkDaten.w[fd.k] : {};
    return `<div class="ab-breit"><span class="ab-feld-titel">${esc(fd.l)}</span><div class="ppk-matrix"><table class="ab-tabelle"><thead><tr><th></th>${fd.spalten.map(s => `<th>${esc(s)}</th>`).join('')}</tr></thead><tbody>
      ${fd.zeilen.map(([lab, boxen], zi) => `<tr><td>${esc(lab)}</td>${boxen.map((b, si) => `<td><button type="button" class="ppk-haken${m[zi + '_' + si] ? ' an' : ''}" data-ppk-mx="${fd.k}" data-zelle="${zi}_${si}"${dis} aria-pressed="${!!m[zi + '_' + si]}">${m[zi + '_' + si] ? '✓' : ''}</button></td>`).join('')}</tr>`).join('')}
      </tbody></table></div><button type="button" class="btn btn-ghost ab-mini" data-ppk-mx-alle="${fd.k}"${dis}>Alle antippen</button></div>`;
  }
  const k = ppkFeldKey(fd);
  if(fd.t === 'area'){
    return `<label class="ab-feld ab-breit"><span>${esc(fd.l)} ${marke}</span><textarea class="sp-inp" rows="${fd.f.length}" data-ppk="${esc(k)}"${dis}>${esc(v)}</textarea></label>`;
  }
  const art = fd.t === 'date' ? 'date' : 'text';
  const im = fd.t === 'num' ? ' inputmode="decimal"' : '';
  return `<label class="ab-feld${fd.b ? ' ab-breit' : ''}"><span>${esc(fd.l)} ${marke}</span><input type="${art}" class="sp-inp${istAuto ? ' ppk-auto-feld' : ''}" data-ppk="${esc(k)}"${im} value="${esc(v)}"${dis}></label>`;
}

function ppkZeichnen(){
  const box = g('ppk-inhalt');
  const proj = getCurrentProject();
  if(!box || !proj || !ppkDaten) return;
  const offen = [...box.querySelectorAll('details.ab-kapitel')].map(d => d.open);
  const hatteZustand = offen.length > 0;
  const auto = ppkAuto();
  let nr = 0;
  box.innerHTML = `
    <div class="ab-kopf">
      <div><h1>PPK – AC-Prüfprotokoll</h1><p>${esc(proj.name)} · Förder-Vorlage „Prüfbefund“ nach ÖVE/ÖNORM E 8101</p>
        <p class="ab-klein">Grau markierte Werte kommen automatisch aus dem Projekt und können überschrieben werden.</p></div>
      <div class="ppk-kopf-rechts"><span class="ppk-status" id="ppk-status"></span>
        <button type="button" class="btn btn-primary" onclick="ppkErstellen()">PPK erstellen (PDF)</button></div>
    </div>
    <div class="ab-status" id="ppk-meldung" hidden></div>
    ${PPK_TEILE.map(t => `<div class="ppk-teil"><h2><span>${t.teil}</span>${esc(t.titel)}</h2>
      ${t.abschnitte.map(a => { const i = nr++; return `<details class="ab-kapitel"${hatteZustand ? (offen[i] ? ' open' : '') : (i === 0 ? ' open' : '')}>
        <summary><span class="ab-nr">${t.teil}${t.abschnitte.indexOf(a) + 1}</span>${esc(a.titel)}${a.optional ? '<span class="ab-sum-info">optional</span>' : ''}</summary>
        <div class="ab-raster">${a.schnell && ppkDarfAendern() ? `<div class="ab-breit"><button type="button" class="btn btn-ghost ab-mini" data-ppk-schnell="${esc(t.teil)}|${esc(a.titel)}">Alle Punkte: ja / in Ordnung</button></div>` : ''}
        ${a.felder.map(fd => ppkFeldHtml(fd, auto)).join('')}</div></details>`; }).join('')}</div>`).join('')}
    <div class="ab-fuss"><button type="button" class="btn btn-primary" onclick="ppkErstellen()">PPK erstellen (PDF)</button></div>`;
  ppkSigEinrichten();
  ppkStatus();
}

// ── Eingaben ──────────────────────────────────────────────────────────────
function ppkSetzen(k, v){ ppkDaten.w[k] = v; ppkSpeichernVerzoegert(); }
document.addEventListener('input', e => {
  const el = e.target;
  if(!el || !el.dataset || !el.dataset.ppk || !el.closest || !el.closest('#ppk-inhalt') || !ppkDaten || !ppkDarfAendern()) return;
  ppkDaten.w[el.dataset.ppk] = el.value;
  el.classList.remove('ppk-auto-feld');
  ppkSpeichernVerzoegert();
});
document.addEventListener('click', e => {
  const t = e.target.closest ? e.target.closest('#ppk-inhalt [data-ppk-seg], #ppk-inhalt [data-ppk-multi], #ppk-inhalt [data-ppk-mx], #ppk-inhalt [data-ppk-mx-alle], #ppk-inhalt [data-ppk-schnell]') : null;
  if(!t || !ppkDaten || !ppkDarfAendern()) return;
  const w = ppkDaten.w;
  if(t.dataset.ppkSeg){ const k = t.dataset.ppkSeg; w[k] = (w[k] === t.dataset.v) ? '' : t.dataset.v; }
  else if(t.dataset.ppkMulti){ const k = t.dataset.ppkMulti; const a = Array.isArray(w[k]) ? w[k] : []; w[k] = a.includes(t.dataset.v) ? a.filter(x => x !== t.dataset.v) : [...a, t.dataset.v]; }
  else if(t.dataset.ppkMx){ const k = t.dataset.ppkMx; const m = (w[k] && typeof w[k] === 'object') ? w[k] : {}; m[t.dataset.zelle] = !m[t.dataset.zelle]; w[k] = m; }
  else if(t.dataset.ppkMxAlle){ const k = t.dataset.ppkMxAlle; const m = {}; for(let z = 0; z < 3; z++) for(let s = 0; s < 4; s++) m[z + '_' + s] = true; w[k] = m; }
  else if(t.dataset.ppkSchnell){
    const [teil, titel] = t.dataset.ppkSchnell.split('|');
    const ab = PPK_TEILE.find(x => x.teil === teil).abschnitte.find(x => x.titel === titel);
    ab.felder.forEach(fd => {
      if(fd.t === 'pruef') w[fd.k] = 'i. O.';
      else if(fd.t === 'seg'){ const pos = fd.o.find(([lab]) => lab === 'in Ordnung' || lab === 'ja' || lab === 'vorhanden'); if(pos) w[fd.k] = pos[0]; }
    });
  }
  ppkSpeichernVerzoegert();
  ppkZeichnen();
});
function ppkRisoUebernehmen(min){
  const v = String(min).replace('.', ',');
  ppkDaten.w['PlusPE'] = v; ppkDaten.w['MinusPE'] = v;
  ppkSpeichernVerzoegert(); ppkZeichnen();
}

// Unterschrift
function ppkSigEinrichten(){
  const c = g('ppk-sig');
  if(!c) return;
  const ctx = c.getContext('2d');
  ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.strokeStyle = '#1e3a8a';
  if(ppkDaten.sig){ const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height); img.src = ppkDaten.sig; }
  if(!ppkDarfAendern()) return;
  let zieht = false;
  const pos = e => { const r = c.getBoundingClientRect(); const p = e.touches ? e.touches[0] : e; return [(p.clientX - r.left) * c.width / r.width, (p.clientY - r.top) * c.height / r.height]; };
  const start = e => { zieht = true; const [x, y] = pos(e); ctx.beginPath(); ctx.moveTo(x, y); e.preventDefault(); };
  const zug = e => { if(!zieht) return; const [x, y] = pos(e); ctx.lineTo(x, y); ctx.stroke(); e.preventDefault(); };
  const ende = () => { if(!zieht) return; zieht = false; ppkDaten.sig = c.toDataURL('image/png'); ppkSpeichernVerzoegert(); };
  c.addEventListener('mousedown', start); c.addEventListener('mousemove', zug); window.addEventListener('mouseup', ende);
  c.addEventListener('touchstart', start, { passive: false }); c.addEventListener('touchmove', zug, { passive: false }); c.addEventListener('touchend', ende);
}
function ppkSigLoeschen(){
  const c = g('ppk-sig');
  if(c) c.getContext('2d').clearRect(0, 0, c.width, c.height);
  if(ppkDaten){ delete ppkDaten.sig; ppkSpeichernVerzoegert(); }
}

// Speichern
function ppkStatus(t){
  const el = g('ppk-status');
  if(el) el.textContent = t !== undefined ? t : (ppkOffen ? 'Wird gespeichert …' : 'Alles gespeichert');
}
function ppkSpeichernVerzoegert(){
  const proj = getCurrentProject();
  if(!proj || !ppkDaten) return;
  ppkOffen = true;
  try { localStorage.setItem(PPK_SCHLUESSEL(proj.id), JSON.stringify({ daten: ppkDaten, at: new Date().toISOString() })); } catch(_){}
  ppkStatus();
  clearTimeout(ppkTimer);
  ppkTimer = setTimeout(() => ppkHochladen(proj.id), 900);
}
async function ppkHochladen(pid){
  if(!supabaseClient || !currentUser || pid !== CURRENT_PROJECT_ID || !ppkDaten) return;
  const gesendet = JSON.stringify(ppkDaten);
  try {
    const { error } = await supabaseClient.from('pv_ppk').upsert({ project_id: pid, daten: ppkDaten, updated_at: new Date().toISOString() });
    if(error) throw error;
    if(JSON.stringify(ppkDaten) === gesendet){
      ppkOffen = false;
      try { localStorage.removeItem(PPK_SCHLUESSEL(pid)); } catch(_){}
    }
    ppkStatus();
  } catch(e){
    console.warn('PPK speichern:', e);
    ppkStatus('Offline – auf dem Gerät gesichert');
    clearTimeout(ppkTimer);
    ppkTimer = setTimeout(() => ppkHochladen(pid), 30000);
  }
}
window.addEventListener('online', () => { if(ppkOffen && CURRENT_PROJECT_ID) ppkHochladen(CURRENT_PROJECT_ID); });

// ── PDF: Original-Vorlage ausfuellen ──────────────────────────────────────
function ppkDatum(v){
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : String(v || '');
}
async function ppkErstellen(){
  if(!darf('ppk')) return toast('Keine Berechtigung');
  const proj = getCurrentProject();
  if(!proj || !ppkDaten) return toast('Bitte zuerst ein Projekt öffnen');
  const meld = t => { const el = g('ppk-meldung'); if(el){ el.hidden = !t; el.textContent = t || ''; } };
  const hinweise = [];
  try {
    meld('Vorlage wird geladen …');
    const L = await abPdfLibLaden();
    const r = await fetch(PPK_VORLAGE);
    if(!r.ok) throw new Error('Vorlage nicht gefunden');
    const pdf = await L.PDFDocument.load(new Uint8Array(await r.arrayBuffer()));
    const form = pdf.getForm();
    const font = await pdf.embedFont(L.StandardFonts.Helvetica);
    const auto = ppkAuto();
    const text = (name, v) => {
      if(v === undefined || v === null || String(v).trim() === '') return;
      try {
        const tf = form.getTextField(name);
        let s = abPdfText(String(v));
        const max = tf.getMaxLength ? tf.getMaxLength() : undefined;
        if(max && s.length > max) s = s.slice(0, max);
        try { tf.setFontSize(9); } catch(_){}
        tf.setText(s);
      } catch(e){ hinweise.push(`Feld „${name}“`); }
    };
    const haken = name => { try { form.getCheckBox(name).check(); } catch(e){ hinweise.push(`Kästchen „${name}“`); } };

    PPK_TEILE.forEach(t => t.abschnitte.forEach(a => a.felder.forEach(fd => {
      if(!ppkSichtbar(fd)) return;
      const { v } = ppkWert(fd, auto);
      if(fd.t === 'text' || fd.t === 'num') text(fd.f, v);
      else if(fd.t === 'date') text(fd.f, ppkDatum(v));
      else if(fd.t === 'area'){ const z = String(v || '').split('\n'); fd.f.forEach((n, i) => text(n, i < fd.f.length - 1 ? z[i] : z.slice(i).join(' '))); }
      else if(fd.t === 'seg'){ const o = fd.o.find(([lab]) => lab === v); if(o) haken(o[1]); }
      else if(fd.t === 'multi'){ (Array.isArray(v) ? v : []).forEach(x => { const o = fd.o.find(([lab]) => lab === x); if(o) haken(o[1]); }); }
      else if(fd.t === 'pruef'){ if(v === 'i. O.' || v === 'nicht i. O.'){ haken(fd.an); haken(v === 'i. O.' ? fd.io[0] : fd.io[1]); } }
      else if(fd.t === 'matrix'){ const m = ppkDaten.w[fd.k] || {}; fd.zeilen.forEach(([, boxen], zi) => boxen.forEach((b, si) => { if(m[zi + '_' + si]) haken(cbx(b)); })); }
    })));
    // Kopfzeilen der Folgeseiten
    const kopf = { betreiber: ppkWert({ f: 'Anlagenbetreiber', a: 'betreiber' }, auto).v, adresse: ppkWert({ f: 'Anlagenadresse', a: 'adresse' }, auto).v,
      tel: ppkWert({ f: 'TelefonNr', a: 'telefon' }, auto).v, befund: ppkWert({ f: 'Zu Befund Nr' }, auto).v };
    ['_2', '_3'].forEach(s => { text('Anlagenbetreiber' + s, kopf.betreiber); text('Anlagenadresse' + s, kopf.adresse); text('TelefonNr' + s, kopf.tel); });
    text('Zu Befund Nr_2', kopf.befund);
    // Kaestchen, die an einem Wert haengen
    const w = ppkDaten.w;
    if(ppkWert({ f: 'Anzahl WR', a: 'wr_anzahl' }, auto).v) haken(cbx(60));
    if(w.trenntrafo) haken(cbx(63));
    if(w['Nennspg']) haken(cbx(118));
    if(w['Absicherung']) haken(cbx(119));
    // Strangmessung (Formular: 12 Straenge)
    const ids = ppkStraenge();
    const uFeld = ['1_3', '2_2', '3_3', '4_2', '5', '6', '7', '8', '9', '10', '11', '12_2'];
    const iFeld = ['1_4', '2_3', '3_4', '4_3', '5_2', '6_2', '7_2', '8_2', '9_2', '10_2', '11_2', '12_3'];
    ids.slice(0, 12).forEach((id, i) => { text(uFeld[i], APP_STATE[id].uoc); text(iFeld[i], APP_STATE[id].isc); });

    form.updateFieldAppearances(font);
    // Befund-Seite VOR dem Entfernen holen – pdf-lib zaehlt die Seiten danach
    // nicht sofort neu, sonst landet die Unterschrift auf der falschen Seite.
    const befund = pdf.getPage(2);
    pdf.removePage(0);   // Seite 1 = Info der Foerderstelle, gehoert nicht zum Protokoll

    // Unterschrift und Stampiglie auf dem Befund (Seite 2 der Vorlage)
    let sig = null;
    if(ppkDaten.sig){ try { sig = await pdf.embedPng(ppkDaten.sig); } catch(_){} }
    let stempel = null;
    const stK = abKatalog.find(k => k.kategorie === 'stempel' && k.pfad && /image/.test(k.mime || ''));
    if(stK){ try { stempel = await abBildEinbetten(pdf, await abBytes(await abDateiLink(stK.pfad))); } catch(_){ hinweise.push('Firmenstempel'); } }
    const setze = (img, x, y, mw, mh) => { const s = Math.min(mw / img.width, mh / img.height); befund.drawImage(img, { x, y, width: img.width * s, height: img.height * s }); };
    if(sig){ setze(sig, 360, 356, 190, 34); setze(sig, 460, 174, 110, 60); }
    if(stempel) setze(stempel, 330, 174, 125, 85);

    // Beiblatt, wenn mehr als 12 Straenge
    if(ids.length > 12){
      const fR = font, fB = await pdf.embedFont(L.StandardFonts.HelveticaBold);
      const doc = new AbPdf(L, pdf, fR, fB, `Beiblatt zum Prüfbefund · ${proj.name}`);
      doc.seite();
      doc.text('Beiblatt: Messung der einzelnen Stränge', doc.rl, doc.y - 6, 14, fB); doc.y -= 28;
      doc.hinweis(`Ergänzung zu Abschnitt 3.2.3 (Funktionsprüfung) – alle ${ids.length} Stränge.`);
      doc.tabelle([{ t: 'Strang', w: 10, r: 1 }, { t: 'Klemme', w: 16 }, { t: 'Module', w: 12, r: 1 }, { t: 'Uoc (V)', w: 16, r: 1 }, { t: 'Isc (A)', w: 16, r: 1 }, { t: 'Riso (MOhm)', w: 16, r: 1 }],
        ids.map((id, i) => [String(i + 1), id, String(APP_STATE[id].mod || ''), APP_STATE[id].uoc || '—', APP_STATE[id].isc || '—', APP_STATE[id].riso || '—']));
    }

    pdf.setTitle(`Prüfbefund ${proj.name || ''}`);
    pdf.setCreator('SOLPRO Messtool');
    const bytes = await pdf.save();
    window.__ppkLetztesPdf = bytes;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    a.download = `PPK_${String(proj.name || 'Projekt').replace(/[^\wäöüÄÖÜß.-]+/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
    meld(hinweise.length ? `Fertig – nicht ausgefüllt: ${hinweise.slice(0, 5).join(', ')}${hinweise.length > 5 ? ' …' : ''}` : `Fertig – ${pdf.getPageCount()} Seiten`);
    toast('PPK erstellt');
  } catch(e){
    meld('');
    toastError('PPK konnte nicht erstellt werden', e);
  }
}
