// Reine Rechen- und Pruefregeln des Messtools – ohne Bildschirm, ohne
// Datenbank. Alles hier bekommt Werte hinein und gibt Werte heraus. Deshalb
// laeuft es auch ausserhalb des Browsers und wird automatisch getestet:
//   node --test
// Im Browser wird die Datei VOR app.js geladen; die Funktionen und Konstanten
// stehen dann app.js ganz normal zur Verfuegung.

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

/* ══════════════════════════════════════════════════════════════════════════
   QUERSCHNITTBERECHNUNG – die Rechnung (Anzeige: qsBerechnen in app.js)
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

// Eingabe wie im Formular (Texte mit Komma): { art: 'dc'|'ac', mat: 'cu'|'al',
// uac: '230'|'400'|'800', strom, spannung, laenge, du, cosphi }.
// DC rechnet mit dem Strom in A, AC mit der Scheinleistung in kVA (Feld "strom").
// Rueckgabe: { fehlt: [...] } oder { fehler: 'Text' } oder das Ergebnis.
function querschnittRechnen(e){
  const istAc = e.art === 'ac';
  const ac = QS_AC[e.uac];
  const L = toNum(e.laenge), du = toNum(e.du);
  const U = istAc ? Number(e.uac) : toNum(e.spannung);
  const cos = istAc ? toNum(e.cosphi) : 1;
  // AC: Strom je Aussenleiter aus der Scheinleistung – einphasig I = S ÷ U, dreiphasig I = S ÷ (√3 · U)
  const S = istAc ? toNum(e.strom) : 0;
  const I = istAc ? (S > 0 ? S * 1000 / ((e.uac === '230' ? 1 : Math.sqrt(3)) * U) : NaN) : toNum(e.strom);

  const fehlt = [];
  if(!(I > 0)) fehlt.push(istAc ? 'Leistung' : 'Strom');
  if(!(U > 0)) fehlt.push('Spannung');
  if(!(L > 0)) fehlt.push('Länge');
  if(fehlt.length) return { fehlt };
  if(!(du > 0 && du <= 20)) return { fehler: 'Zulässigen Spannungsfall zwischen 0 und 20 % eingeben.' };
  if(!(cos > 0 && cos <= 1)) return { fehler: 'cos φ zwischen 0 und 1 eingeben.' };

  const kappa = QS_KAPPA[e.mat];
  const k = istAc ? ac.k : 2;
  const leiter = istAc ? ac.leiter : 2;
  const faktor = k * cos;                      // DC: 2 · AC 230 V: 2·cos φ · AC 400/800 V: √3·cos φ
  const duV = U * du / 100;                    // zulaessiger Spannungsfall in V
  const mindest = mat => faktor * L * I / (QS_KAPPA[mat] * duV);
  // Index des kleinsten Normquerschnitts, der reicht; -1 = keiner reicht
  const normIndex = (mat, a) => QS_NORM[mat].findIndex(n => n >= a - 1e-9);
  const aMin = mindest(e.mat);
  const iEmpf = normIndex(e.mat, aMin);
  const anderes = e.mat === 'cu' ? 'al' : 'cu';
  const aMinAnders = mindest(anderes);
  return {
    istAc, I, S, U, L, du, cos, kappa, faktor, leiter, duV,
    aMin, reihe: QS_NORM[e.mat], iEmpf, empfohlen: iEmpf < 0 ? null : QS_NORM[e.mat][iEmpf],
    anderes, aMinAnders, iAnders: normIndex(anderes, aMinAnders),
    spannungsfall: a => faktor * L * I / (kappa * a),    // in V
    verlust: a => leiter * I * I * L / (kappa * a)        // in W
  };
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

// Bewertet einen String (ein Eintrag aus APP_STATE). Rueckgabe: { level:'ok'|'crit', fields:{}, msgs:[] }
function stringBewerten(it){
  const res = { level: 'ok', fields: {}, msgs: [] };
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

/* ══════════════════════════════════════════════════════════════════════════
   PPK – Kennzahlen aus der DC-Messung, die ins AC-Prüfprotokoll wandern
   ══════════════════════════════════════════════════════════════════════════ */
// strings: die aktiven Strings (Eintraege aus APP_STATE mit stat 'JA'),
// wp: Modulleistung in Wp. Alle Werte als Text fuers Formular, '' = unbekannt.
function ppkKennzahlen(strings, wp){
  const mods = strings.map(it => Number(it.mod) || 0).filter(Boolean);
  // Haeufigste Modulanzahl je String; bei Gleichstand die kleinere
  const zaehl = {}; mods.forEach(m => { zaehl[m] = (zaehl[m] || 0) + 1; });
  const haeufig = Object.keys(zaehl).sort((a, b) => zaehl[b] - zaehl[a])[0] || '';
  const summe = mods.reduce((a, b) => a + b, 0);
  const uocs = strings.map(it => toNum(it.uoc)).filter(v => v !== null);
  // Solargenerator-Gesamtstrom: Summe der gemessenen Strangstroeme (Isc)
  const iscs = strings.filter(it => Number(it.mod) > 0).map(it => toNum(it.isc)).filter(v => v !== null);
  return {
    mod_strang: haeufig,
    u_system: uocs.length ? String(Math.round(Math.max(...uocs))) : '',
    kwp: summe ? (summe * wp / 1000).toFixed(2).replace('.', ',') : '',
    i_gesamt: iscs.length ? iscs.reduce((a, b) => a + b, 0).toFixed(2).replace('.', ',') : ''
  };
}

// Fuer die automatischen Tests (Node); im Browser gibt es kein "module"
if(typeof module !== 'undefined' && module.exports){
  module.exports = {
    esc, normaliseNumber, validationMessage, toNum,
    QS_KAPPA, QS_NORM, QS_AC, querschnittRechnen,
    LIMIT_RISO_MIN, UOC_PRO_MODUL_MIN, UOC_PRO_MODUL_MAX, stringBewerten,
    ppkKennzahlen
  };
}
