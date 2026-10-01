// Automatische Tests fuer js/logik.js – ausfuehren mit:  node --test
// Braucht nur Node.js (ab Version 18), keine weiteren Pakete.
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  esc, normaliseNumber, toNum, querschnittRechnen, stringBewerten, ppkKennzahlen
} = require('../js/logik.js');

const nahe = (ist, soll, text) => assert.ok(Math.abs(ist - soll) < 1e-6, `${text}: ${ist} statt ${soll}`);
const qs = e => querschnittRechnen({ art: 'dc', mat: 'cu', uac: '400', strom: '', spannung: '', laenge: '', du: '1', cosphi: '1', ...e });

// ── Querschnittberechnung ───────────────────────────────────────────────────
test('DC-Strang Kupfer: A = 2 · L · I ÷ (κ · ΔU)', () => {
  const r = qs({ strom: '13,5', spannung: '780', laenge: '40', du: '1' });
  // 2 · 40 m · 13,5 A ÷ (56 · 7,8 V) = 2,47 mm² → 2,5 mm²
  nahe(r.aMin, 1080 / 436.8, 'Mindestquerschnitt');
  assert.equal(r.empfohlen, 2.5);
  nahe(r.duV, 7.8, 'zulaessiger Spannungsfall in V');
  // Verlust bei 2,5 mm²: 2 · I² · L ÷ (κ · A)
  nahe(r.verlust(2.5), 2 * 13.5 * 13.5 * 40 / (56 * 2.5), 'Verlust');
});

test('DC Aluminium: kleinster Normquerschnitt ist 16 mm²', () => {
  const r = qs({ mat: 'al', strom: '13,5', spannung: '780', laenge: '40' });
  nahe(r.aMin, 1080 / (35 * 7.8), 'Mindestquerschnitt Alu');
  assert.equal(r.empfohlen, 16);
  // Vergleichswert fuer Kupfer, wie er unter dem Ergebnis steht
  assert.equal(r.anderes, 'cu');
  nahe(r.aMinAnders, 1080 / 436.8, 'Mindestquerschnitt Kupfer');
  assert.equal(r.iAnders, 1);                       // 2,5 mm² in der Kupfer-Reihe
});

test('AC 400 V dreiphasig: Strom aus kVA, Faktor √3 · cos φ', () => {
  const r = qs({ art: 'ac', uac: '400', strom: '110', laenge: '60', du: '1', cosphi: '0,9' });
  const I = 110000 / (Math.sqrt(3) * 400);                    // 158,8 A
  nahe(r.I, I, 'Strom je Aussenleiter');
  nahe(r.aMin, Math.sqrt(3) * 0.9 * 60 * I / (56 * 4), 'Mindestquerschnitt'); // 66,3 mm²
  assert.equal(r.empfohlen, 70);
  assert.equal(r.leiter, 3);
  nahe(r.verlust(70), 3 * I * I * 60 / (56 * 70), 'Verlust (3 Leiter)');
});

test('AC 230 V einphasig: I = S ÷ U, Faktor 2 · cos φ', () => {
  const r = qs({ art: 'ac', uac: '230', strom: '5', laenge: '20', du: '1,5', cosphi: '1' });
  const I = 5000 / 230;
  nahe(r.I, I, 'Strom');
  nahe(r.aMin, 2 * 20 * I / (56 * 3.45), 'Mindestquerschnitt');   // 4,5 mm²
  assert.equal(r.empfohlen, 6);
  assert.equal(r.leiter, 2);
});

test('Genau auf einem Normquerschnitt: dieser reicht, kein Sprung zum naechsten', () => {
  // 2 · 56 m · 10 A ÷ (56 · 5 V) = 4 mm²
  const r = qs({ strom: '10', spannung: '500', laenge: '56', du: '1' });
  assert.equal(r.empfohlen, 4);
});

test('Empfohlener Querschnitt haelt den Spannungsfall ein, der naechstkleinere nicht', () => {
  for(const [strom, spannung, laenge, du] of [['13,5', '780', '40', '1'], ['9,8', '650', '120', '1,5'], ['30', '800', '200', '3']]){
    const r = qs({ strom, spannung, laenge, du });
    assert.ok(r.iEmpf > 0, 'Beispiel braucht einen kleineren Querschnitt zum Vergleich');
    assert.ok(r.spannungsfall(r.empfohlen) / r.U * 100 <= r.du + 1e-9, 'empfohlen muss passen');
    assert.ok(r.spannungsfall(r.reihe[r.iEmpf - 1]) / r.U * 100 > r.du, 'eins kleiner darf nicht passen');
  }
});

test('Mehr als der groesste Normquerschnitt: keine Empfehlung', () => {
  const r = qs({ strom: '500', spannung: '800', laenge: '400', du: '0,5' });
  assert.equal(r.iEmpf, -1);
  assert.equal(r.empfohlen, null);
  assert.ok(r.aMin > 300);
});

test('Fehlende oder ungueltige Eingaben werden gemeldet', () => {
  assert.deepEqual(qs({}).fehlt, ['Strom', 'Spannung', 'Länge']);
  assert.deepEqual(qs({ art: 'ac', laenge: '10' }).fehlt, ['Leistung']);   // AC: Spannung ist ausgewaehlt
  assert.deepEqual(qs({ strom: 'abc', spannung: '780', laenge: '40' }).fehlt, ['Strom']);
  assert.match(qs({ strom: '13', spannung: '700', laenge: '40', du: '0' }).fehler, /Spannungsfall/);
  assert.match(qs({ strom: '13', spannung: '700', laenge: '40', du: '25' }).fehler, /Spannungsfall/);
  assert.match(qs({ art: 'ac', strom: '10', laenge: '40', cosphi: '1,2' }).fehler, /cos φ/);
  // Bei DC spielt cos φ keine Rolle
  assert.equal(qs({ strom: '13', spannung: '700', laenge: '40', cosphi: '1,2' }).fehler, undefined);
});

// ── Grobpruefung der Messwerte ──────────────────────────────────────────────
const str = e => stringBewerten({ stat: 'JA', mod: '18', uoc: '720', isc: '10', riso: '50', ...e });

test('Gesunder String: nichts gemeldet', () => {
  assert.deepEqual(str({}), { level: 'ok', fields: {}, msgs: [] });
});

test('Inaktive oder fehlende Strings werden nicht bewertet', () => {
  assert.equal(stringBewerten({ stat: 'NEIN', riso: '0,1' }).level, 'ok');
  assert.equal(stringBewerten(undefined).level, 'ok');
});

test('Riso unter 1 MΩ ist ein Isolationsfehler, 0 heisst "nicht gemessen"', () => {
  const r = str({ riso: '0,5' });
  assert.equal(r.level, 'crit');
  assert.equal(r.fields.riso, 'crit');
  assert.match(r.msgs[0], /unter 1 MΩ/);
  assert.equal(str({ riso: '0,99' }).level, 'crit');
  assert.equal(str({ riso: '1' }).level, 'ok');       // genau 1,0 MΩ ist erlaubt
  assert.equal(str({ riso: '0' }).level, 'ok');
  assert.equal(str({ riso: '' }).level, 'ok');
});

test('Uoc: 25 bis 60 V je Modul sind plausibel', () => {
  assert.equal(str({ mod: '10', uoc: '250' }).level, 'ok');   // genau 25 V
  assert.equal(str({ mod: '10', uoc: '600' }).level, 'ok');   // genau 60 V
  assert.equal(str({ mod: '10', uoc: '249' }).fields.uoc, 'crit');
  assert.equal(str({ mod: '10', uoc: '601' }).fields.uoc, 'crit');
  const r = str({ mod: '7', uoc: '800' });                    // Beispiel aus der Beschreibung
  assert.match(r.msgs[0], /114 V je Modul/);
});

test('Uoc ohne Modulanzahl wird nicht geprueft', () => {
  assert.equal(str({ mod: '0', uoc: '800' }).level, 'ok');
  assert.equal(str({ mod: '', uoc: '800' }).level, 'ok');
});

test('Beide Fehler zugleich werden beide gemeldet', () => {
  const r = str({ mod: '7', uoc: '800', riso: '0,5' });
  assert.deepEqual(Object.keys(r.fields).sort(), ['riso', 'uoc']);
  assert.equal(r.msgs.length, 2);
});

// ── Eingabe der Messwerte ───────────────────────────────────────────────────
test('Messwerte: Komma und Punkt, gespeichert wird mit Komma', () => {
  assert.equal(normaliseNumber('uoc', '712,4'), '712,4');
  assert.equal(normaliseNumber('uoc', '712.4'), '712,4');
  assert.equal(normaliseNumber('isc', ' 10,2 '), '10,2');
  assert.equal(normaliseNumber('mod', '18'), '18');
  assert.equal(normaliseNumber('uoc', ''), '');
});

test('Messwerte: Grenzen und ungueltige Eingaben', () => {
  assert.equal(normaliseNumber('mod', '100'), '100');
  assert.equal(normaliseNumber('mod', '101'), null);
  assert.equal(normaliseNumber('mod', '12,5'), null);          // Module nur ganzzahlig
  assert.equal(normaliseNumber('uoc', '2000'), '2000');
  assert.equal(normaliseNumber('uoc', '2001'), null);
  assert.equal(normaliseNumber('isc', '100,1'), null);
  assert.equal(normaliseNumber('riso', '10000'), '10000');
  assert.equal(normaliseNumber('riso', '10001'), null);
  for(const falsch of ['-1', 'abc', '1,2,3', '5e2', '12 V']) assert.equal(normaliseNumber('uoc', falsch), null, falsch);
  assert.equal(normaliseNumber('unbekannt', '5'), null);
});

test('toNum liest Zahlen mit Komma, sonst null', () => {
  assert.equal(toNum('12,5'), 12.5);
  assert.equal(toNum('12.5'), 12.5);
  assert.equal(toNum(7), 7);
  for(const leer of ['', 'abc', null, undefined, 'Infinity']) assert.equal(toNum(leer), null, String(leer));
});

// ── HTML-Schutz ─────────────────────────────────────────────────────────────
test('esc entschaerft alle HTML-Sonderzeichen', () => {
  assert.equal(esc(`<img src=x onerror="a('b')">&`), '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;');
  assert.equal(esc(null), '');
  assert.equal(esc(undefined), '');
  assert.equal(esc(0), '0');
  // Eine echte Unterschrift (data-URL) bleibt unveraendert
  const sig = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  assert.equal(esc(sig), sig);
});

// ── PPK: Kennzahlen aus der DC-Messung ──────────────────────────────────────
test('PPK: Module je String, Systemspannung, kWp und Gesamtstrom', () => {
  const k = ppkKennzahlen([
    { mod: '18', uoc: '712,4', isc: '10,2' },
    { mod: '18', uoc: '715,6', isc: '10,1' },
    { mod: '20', uoc: '791', isc: '10' }
  ], 400);
  assert.equal(k.mod_strang, '18');                 // haeufigste Modulanzahl
  assert.equal(k.u_system, '791');                  // hoechste gemessene Uoc, gerundet
  assert.equal(k.kwp, '22,40');                     // 56 Module · 400 Wp
  assert.equal(k.i_gesamt, '30,30');                // 10,2 + 10,1 + 10,0 A
});

test('PPK: bei Gleichstand gewinnt die kleinere Modulanzahl', () => {
  assert.equal(ppkKennzahlen([{ mod: '20' }, { mod: '18' }], 400).mod_strang, '18');
});

test('PPK: Strings ohne Module zaehlen nicht zum Gesamtstrom', () => {
  const k = ppkKennzahlen([{ mod: '18', uoc: '700', isc: '10' }, { mod: '0', uoc: '800', isc: '9' }], 400);
  assert.equal(k.i_gesamt, '10,00');
  assert.equal(k.u_system, '800');                  // Uoc wird trotzdem beruecksichtigt
  assert.equal(k.kwp, '7,20');
});

test('PPK: ohne Messwerte bleiben alle Felder leer', () => {
  assert.deepEqual(ppkKennzahlen([], 400), { mod_strang: '', u_system: '', kwp: '', i_gesamt: '' });
  assert.deepEqual(ppkKennzahlen([{ mod: '', uoc: '', isc: '' }], 400), { mod_strang: '', u_system: '', kwp: '', i_gesamt: '' });
});
