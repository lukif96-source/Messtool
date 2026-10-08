if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')){
  // Lief die Seite schon unter einem Service Worker, heisst ein Wechsel: neue Version ist da
  const hatteVersion = !!navigator.serviceWorker.controller;
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').then(reg => {
      // Beim Zurueckholen der App (Handy) und stuendlich nach Updates schauen
      document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible') reg.update().catch(() => {}); });
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    }).catch(e => console.warn('Service Worker:', e));
  });
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(!hatteVersion || document.getElementById('neue-version')) return;
    const leiste = document.createElement('div');
    leiste.id = 'neue-version';
    leiste.className = 'neue-version no-print';
    leiste.setAttribute('role', 'status');
    leiste.innerHTML = '<span>Neue Version der App ist da.</span><button type="button" class="btn btn-primary">Neu laden</button>';
    leiste.querySelector('button').addEventListener('click', async () => {
      // Offene Eingaben vorher sichern
      try { if(typeof flushPendingProjectEdits === 'function') await flushPendingProjectEdits(); } catch(_){}
      location.reload();
    });
    document.body.appendChild(leiste);
  });
}
