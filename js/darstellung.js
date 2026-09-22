(function(){
  const BASIS = 'pv_design_v1';
  const schluessel = () => (currentUser && currentUser.email)
    ? BASIS + '::' + currentUser.email : BASIS;

  // Von Lukas eingestellt und uebernommen — das ist ab jetzt der Standard
  // fuer alle. Jeder kann ihn fuer sich weiter veraendern.
  const STD = {
    dark:  { acc:'#CCFF00', bg:'#0A0A0A', glas:13, blur:22, rad:22, schatten:130, dichte:100, schrift:100 },
    light: { acc:'#E8BB5C', bg:'#F6F3EC', glas:42, blur:10, rad:20, schatten:40,  dichte:100, schrift:100 }
  };
  const frisch = () => JSON.parse(JSON.stringify(STD));
  let T = frisch();

  function laden(){
    T = frisch();
    try {
      // Erst die persoenliche Einstellung, sonst die des Geraets.
      const roh = localStorage.getItem(schluessel()) || localStorage.getItem(BASIS);
      if(roh){
        const gespeichert = JSON.parse(roh);
        if(gespeichert.dark)  T.dark  = Object.assign(T.dark,  gespeichert.dark);
        if(gespeichert.light) T.light = Object.assign(T.light, gespeichert.light);
      }
    } catch(_){}
  }
  laden();

  const dunkel = () => !document.body.classList.contains('sun-mode');
  const jetzt = () => dunkel() ? T.dark : T.light;

  const zuRgb = h => { const n = parseInt(String(h).replace('#',''),16); return [(n>>16)&255,(n>>8)&255,n&255]; };
  const zuHex = a => '#' + a.map(v => Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
  const heller = (h,p) => zuHex(zuRgb(h).map(v => v + (255-v)*p/100));
  const dunkler = (h,p) => zuHex(zuRgb(h).map(v => v*(1-p/100)));
  const mitAlpha = (h,a) => { const [r,g,b] = zuRgb(h); return `rgba(${r},${g},${b},${a})`; };

  const WERTE = [
    { k:'glas',     l:'Glas-Stärke',   min:0,  max:60,  s:3, e:'%'  },
    { k:'blur',     l:'Weichzeichnen', min:0,  max:34,  s:2, e:'px' },
    { k:'rad',      l:'Ecken-Rundung', min:0,  max:32,  s:2, e:'px' },
    { k:'schatten', l:'Schatten',      min:0,  max:200, s:10,e:'%'  },
    { k:'dichte',   l:'Dichte',        min:70, max:140, s:5, e:'%'  },
    { k:'schrift',  l:'Schriftgröße',  min:85, max:130, s:5, e:'%'  }
  ];

  const AKZENTE = ['#93B8FF','#3358C4','#5B8DEF','#18A999','#22C55E','#CCFF00',
                   '#F59E0B','#F97316','#EF4444','#EC4899','#A855F7','#E8BB5C'];
  const GRUND_DUNKEL = ['#141829','#0A0E1C','#101014','#12120F','#101C18','#1C1424','#0E1A1A','#0A0A0A'];
  const GRUND_HELL   = ['#EAEEF9','#FFFFFF','#F2F5F1','#EFEFEA','#E6DDCB','#EDE9F5','#E9F1EE','#F6F3EC'];

  function baueCssFuer(modus){
    const d = (modus === 'dark'), t = d ? T.dark : T.light,
          sel = d ? 'body:not(.sun-mode)' : 'body.sun-mode';
    const glas  = d ? (t.glas/100) : (0.45 + t.glas/100*1.2);
    const panel = d ? ((t.glas+6)/100) : (0.30 + t.glas/100*1.2);
    const s = t.schatten/100, dp = t.dichte/100;
    const pill = Math.min(999, Math.round(t.rad * 2.5));
    const radSm = Math.round(t.rad * 0.65);
    const blurZiel = `blur(${t.blur}px) saturate(140%)`;
    const blurM = t.blur > 0
      ? `  ${sel} .kpi-card, ${sel} .wr-block, ${sel} .project-card, ${sel} .alarm-bar,\n`
        + `  ${sel} .main-tabs, ${sel} .kpi-strip, ${sel} table.mt tbody tr.mppt-header{\n`
        + `    backdrop-filter:${blurZiel} !important; -webkit-backdrop-filter:${blurZiel} !important; }`
      : `  ${sel} .kpi-card, ${sel} .wr-block, ${sel} .project-card{ backdrop-filter:none !important; }`;
    return `${sel}{
  --acc:${t.acc};
  --acc-grad:linear-gradient(135deg, ${heller(t.acc,14)} 0%, ${dunkler(t.acc,16)} 100%);
  --acc-line:${mitAlpha(t.acc,0.45)};
  --acc-soft:${mitAlpha(t.acc,0.16)};
  --glow:0 6px 22px ${mitAlpha(t.acc,0.30)};
  --bg:${t.bg};
  --surface:rgba(255,255,255,${glas.toFixed(3)});
  --panel:rgba(255,255,255,${panel.toFixed(3)});
  --blur:blur(${t.blur}px) saturate(140%);
  --rad:${t.rad}px;
  --rad-sm:${radSm}px;
  --sh-1:0 1px 2px rgba(0,0,0,${(0.26*s).toFixed(3)}), 0 8px 26px rgba(0,0,0,${(0.30*s).toFixed(3)});
  --sh-2:0 2px 10px rgba(0,0,0,${(0.32*s).toFixed(3)}), 0 24px 56px rgba(0,0,0,${(0.46*s).toFixed(3)});
}
${sel}::before{
  background:
    radial-gradient(120% 92% at 8% -14%, ${d?heller(t.bg,26):dunkler(t.bg,8)} 0%, transparent 60%),
    radial-gradient(90% 74% at 98% 110%, ${mitAlpha(t.acc, d?0.20:0.14)} 0%, transparent 64%) !important;
}
${sel} table.mt tbody tr[data-string-id]{ padding:${Math.round(13*dp)}px ${Math.round(14*dp)}px; gap:${Math.round(8*dp)}px; }
${sel} table.mt tbody tr[data-string-id] .sp-inp{ min-height:${Math.round(48*dp)}px; font-size:${(1.06*t.schrift/100).toFixed(3)}rem; }
${sel} .kpi-card{ padding:${Math.round(14*dp)}px ${Math.round(16*dp)}px; }
${sel} .project-card{ padding:${Math.round(18*dp)}px !important; }
${sel} .kpi-value{ font-size:${(1.9*t.schrift/100).toFixed(3)}rem; }

/* Pillenform folgt der Rundung — sonst bleiben Tabs, Knoepfe und Chips
   immer kreisrund und die Rundung wirkt scheinbar gar nicht. */
${sel}{ --pill:${pill}px; }
${sel} .sp-inp{ border-radius:${radSm}px; }
${sel} .tog, ${sel} .btn, ${sel} .filter-toggle-btn, ${sel} .wr-tab,
${sel} .main-tab, ${sel} .main-tabs, ${sel} .wr-num, ${sel} .role-chip,
${sel} .pc-menu-btn, ${sel} .toast{ border-radius:${pill}px !important; }

@media (max-width: 900px){
  /* Diese Flaechen waren am Handy fest verdrahtet — dadurch lief die
     Glas-Staerke hier ins Leere. Jetzt folgen sie wieder der Einstellung. */
  ${sel} .wr-block, ${sel} .project-card, ${sel} .kpi-card{ background:var(--surface) !important; }
  ${sel} table.mt tbody tr[data-string-id]{ background:var(--panel) !important; }
${blurM}
}`;
  }

  // Immer BEIDE Paletten schreiben: dann stimmt das Bild sofort, egal in
  // welcher Reihenfolge Theme-Wiederherstellung und Design starten.
  function baueCss(){ return baueCssFuer('light') + '\n' + baueCssFuer('dark'); }

  function anwenden(speichern){
    let el = document.getElementById('design-css');
    if(!el){ el = document.createElement('style'); el.id = 'design-css'; }
    // Ans ENDE des Koerpers, damit diese Ebene zuletzt greift.
    if(el.parentNode !== document.body) document.body.appendChild(el);
    el.textContent = baueCss();
    if(speichern !== false){
      try { localStorage.setItem(schluessel(), JSON.stringify(T)); } catch(_){}
    }
  }

  let ui = null;

  function bauePanel(){
    const p = document.createElement('div');
    p.id = 'design-panel';
    p.hidden = true;
    p.innerHTML = `
      <div class="dp-kopf">
        <b>Darstellung</b><span class="dp-mode" id="dp-mode">—</span>
        <button class="dp-x" id="dp-close" aria-label="Schließen">✕</button>
      </div>
      <div class="dp-body">
        <div class="dp-hint">Gilt nur für dich — jeder Benutzer hat seine eigene Einstellung.
          Hell und dunkel werden getrennt gemerkt.</div>
        <div class="dp-grp"><div class="dp-lbl">Akzentfarbe</div><div class="dp-sw" id="dp-acc-sw"></div></div>
        <div class="dp-grp"><div class="dp-lbl">Hintergrund</div><div class="dp-sw" id="dp-bg-sw"></div></div>
        ${WERTE.map(w => `
          <div class="dp-grp dp-step">
            <div class="dp-lbl">${w.l}</div>
            <div class="dp-ctl">
              <button class="dp-pm" data-k="${w.k}" data-d="-1" aria-label="${w.l} verringern">−</button>
              <span class="dp-val" id="dp-v-${w.k}">–</span>
              <button class="dp-pm" data-k="${w.k}" data-d="1" aria-label="${w.l} erhöhen">+</button>
            </div>
          </div>`).join('')}
      </div>
      <div class="dp-fuss">
        <button class="dp-btn dp-alt" id="dp-reset">Zurücksetzen</button>
        <button class="dp-btn dp-haupt" id="dp-fertig">Fertig</button>
      </div>`;
    document.body.appendChild(p);

    const css = document.createElement('style');
    css.textContent = `
      #design-panel{position:fixed;left:50%;transform:translateX(-50%);width:min(100%,560px);
        bottom:0;z-index:4200;max-height:80vh;overflow:auto;
        background:#14161F;color:#F2F4FC;border-top:2px solid #93B8FF;border-radius:18px 18px 0 0;
        box-shadow:0 -12px 40px rgba(0,0,0,.6);font-family:'Inter',sans-serif;
        padding:0 0 calc(16px + env(safe-area-inset-bottom, 0px));
        touch-action:pan-y;-webkit-overflow-scrolling:touch}
      #design-panel[hidden]{display:none}
      #design-panel *{touch-action:manipulation}
      .dp-kopf{position:sticky;top:0;background:#14161F;display:flex;align-items:center;gap:10px;
        padding:14px 16px 10px;border-bottom:1px solid rgba(255,255,255,.12);z-index:2}
      .dp-kopf b{font-size:.95rem}
      .dp-mode{font-size:.64rem;font-weight:800;text-transform:uppercase;letter-spacing:.12em;
        color:#93B8FF;background:rgba(147,184,255,.16);padding:3px 9px;border-radius:999px}
      .dp-x{margin-left:auto;background:transparent;border:0;color:#AAB0CC;font-size:1.2rem;
        cursor:pointer;padding:6px 10px;min-height:40px}
      .dp-body{padding:14px 16px;display:flex;flex-direction:column;gap:16px}
      .dp-hint{font-size:.72rem;line-height:1.45;color:#AAB0CC}
      .dp-lbl{font-size:.78rem;font-weight:700;color:#C6CBE4;margin-bottom:8px}
      .dp-sw{display:flex;flex-wrap:wrap;gap:8px}
      .dp-sw button{width:44px;height:44px;border-radius:12px;border:2px solid rgba(255,255,255,.18);
        cursor:pointer;padding:0}
      .dp-sw button[aria-pressed="true"]{border-color:#fff;box-shadow:0 0 0 3px rgba(147,184,255,.5)}
      .dp-step{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .dp-step .dp-lbl{margin:0}
      .dp-ctl{display:flex;align-items:center;gap:4px}
      .dp-pm{width:46px;height:46px;border-radius:12px;border:1px solid rgba(255,255,255,.22);
        background:rgba(255,255,255,.08);color:#F2F4FC;font-size:1.4rem;font-weight:800;
        cursor:pointer;line-height:1;display:flex;align-items:center;justify-content:center}
      .dp-pm:active{background:#93B8FF;color:#14161F}
      .dp-val{min-width:64px;text-align:center;font-family:'JetBrains Mono',monospace;
        font-size:.86rem;font-weight:800;color:#93B8FF}
      .dp-fuss{display:flex;gap:10px;padding:6px 16px 0}
      .dp-btn{flex:1;font:inherit;font-size:.84rem;font-weight:800;border-radius:999px;padding:13px 14px;
        min-height:48px;cursor:pointer;border:1px solid rgba(255,255,255,.22)}
      .dp-alt{background:transparent;color:#AAB0CC}
      .dp-haupt{background:#93B8FF;color:#14161F;border-color:transparent}
      @media print{#design-panel{display:none!important}}`;
    document.head.appendChild(css);

    let gebaut = false;
    function swatches(){
      const a = document.getElementById('dp-acc-sw');
      const b = document.getElementById('dp-bg-sw');
      const liste = dunkel() ? GRUND_DUNKEL : GRUND_HELL;
      // Nur bei Moduswechsel neu aufbauen — sonst wuerde das Ersetzen des
      // DOM das gerade laufende Ereignis doppelt behandeln.
      if(!gebaut || b.dataset.mode !== (dunkel() ? 'd' : 'h')){
        a.innerHTML = AKZENTE.map(c =>
          `<button type="button" style="background:${c}" data-c="${c}" data-rolle="acc" aria-label="Akzent ${c}"></button>`).join('');
        b.innerHTML = liste.map(c =>
          `<button type="button" style="background:${c}" data-c="${c}" data-rolle="bg" aria-label="Hintergrund ${c}"></button>`).join('');
        b.dataset.mode = dunkel() ? 'd' : 'h';
        gebaut = true;
        verdrahte();
      }
      markiere();
    }

    function markiere(){
      const t = jetzt();
      document.querySelectorAll('#dp-acc-sw button').forEach(x =>
        x.setAttribute('aria-pressed', String(x.dataset.c.toLowerCase() === String(t.acc).toLowerCase())));
      document.querySelectorAll('#dp-bg-sw button').forEach(x =>
        x.setAttribute('aria-pressed', String(x.dataset.c.toLowerCase() === String(t.bg).toLowerCase())));
    }

    function setz(){
      document.getElementById('dp-mode').textContent = dunkel() ? 'Cockpit' : 'Baustelle';
      const t = jetzt();
      WERTE.forEach(w => {
        const v = document.getElementById('dp-v-' + w.k);
        if(v) v.textContent = t[w.k] + w.e;
      });
      swatches();
    }

    // Direkte Handler an JEDEM Knopf und zusaetzlich pointerup: manche
    // mobilen Browser liefern bei schnellen Beruehrungen kein verwertbares
    // click-Ereignis an verschachtelte Elemente.
    function binde(el, fn){
      if(!el) return;
      let laeuft = false;
      const lauf = e => {
        if(laeuft) return;
        laeuft = true;
        setTimeout(() => { laeuft = false; }, 260);
        e.preventDefault();
        e.stopPropagation();
        try { fn(); } catch(err){ if(window.toast) toast('Fehler: ' + err.message); }
      };
      el.addEventListener('pointerup', lauf);
      el.addEventListener('click', lauf);
    }

    function verdrahte(){
      p.querySelectorAll('#dp-acc-sw button, #dp-bg-sw button').forEach(b => {
        if(b.dataset.bound) return;
        b.dataset.bound = '1';
        binde(b, () => { jetzt()[b.dataset.rolle] = b.dataset.c; markiere(); anwenden(); });
      });
    }

    p.querySelectorAll('.dp-pm').forEach(b => binde(b, () => {
      const w = WERTE.find(x => x.k === b.dataset.k);
      const t = jetzt();
      t[w.k] = Math.max(w.min, Math.min(w.max, t[w.k] + w.s * Number(b.dataset.d)));
      const v = document.getElementById('dp-v-' + w.k);
      if(v) v.textContent = t[w.k] + w.e;
      anwenden();
    }));

    binde(document.getElementById('dp-close'),  () => { p.hidden = true; });
    binde(document.getElementById('dp-fertig'), () => { p.hidden = true; if(window.toast) toast('🎨 Darstellung gespeichert'); });
    binde(document.getElementById('dp-reset'),  () => {
      if(dunkel()) T.dark = Object.assign({}, STD.dark); else T.light = Object.assign({}, STD.light);
      setz(); anwenden();
    });

    return { el: p, setz };
  }

  function oeffnen(){
    if(!ui) ui = bauePanel();
    ui.el.hidden = false;
    ui.setz();
    if(typeof closeSidebar === 'function') closeSidebar();
  }

  window.openDesignPanel = oeffnen;
  window.PV_DESIGN = {
    // Nach dem Anmelden noch einmal laden: ab jetzt gilt die persoenliche
    // Einstellung des angemeldeten Benutzers, nicht die des Geraets.
    neuLaden(){ laden(); anwenden(false); if(ui) ui.setz(); }
  };

  function start(){
    anwenden(false);
    const orig = window.setTheme;
    if(typeof orig === 'function'){
      window.setTheme = function(m, silent){
        orig(m, silent);
        anwenden(false);
        if(ui && !ui.el.hidden) ui.setz();
      };
    }
  }

  // Der Block steht am Ende des Koerpers — body existiert hier bereits.
  // Sofort starten vermeidet das kurze Aufblitzen der Standardfarben.
  if(document.body) start();
  else window.addEventListener('DOMContentLoaded', start);
})();
