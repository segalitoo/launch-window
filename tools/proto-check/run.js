// Runs scenario 6 + 7 inside the prototype with a fixed 1/60 step and logs event times.
(() => {
  const P = window.__P, T = 24, DT = 1 / 60;
  P.newGame(); const S = P.S;
  const log = [];
  const U = id => S.squad.find(u => u.id === id);
  const yoav = U('shadow'), noa = U('lure'), itai = U('sapper');
  const g = i => S.guards[i];
  const idle = u => !u.path.length && !u.order && u.busy <= 0;
  const W = v => v * T;
  function until(label, f, max) {
    for (let i = 0; i < Math.round(max / DT); i++) {
      if (f()) { log.push(`t=${S.t.toFixed(2)} ${label}`); return true; }
      if (S.over) break;
      P.update(DT);
    }
    if (f()) { log.push(`t=${S.t.toFixed(2)} ${label}`); return true; }
    throw new Error('timeout ' + label + ' t=' + S.t.toFixed(2) + ' alarms=' + S.stats.alarms);
  }
  const take = (u, gu) => { P.clearOrder(u); u.order = { type: 'takedown', guard: gu, repath: 0 }; };
  const grab = (u, b) => { P.clearOrder(u); u.order = { type: 'grab', body: b }; u.path = P.pathTo(u, b.x, b.y) || []; };
  try {
    itai.crawl = true; P.orderInteract(itai, P.objectAt(16, 27));
    P.orderMove(yoav, W(12.5), W(28.5)); P.orderMove(noa, W(10.5), W(28.5));
    until('yard gate breached', () => S.doors[0].open, 40);
    until('Noa in position', () => idle(noa), 20);
    P.doThrow(noa, W(14.5), W(22.5));
    until('yard guard investigates', () => g(3).state === 'investigate', 3);
    until('yard guard searches the corner', () => g(3).state === 'search', 10);
    take(yoav, g(3)); until('yard guard down', () => g(3).state === 'down', 10);
    grab(yoav, g(3)); until('Yoav has the body', () => yoav.carrying === g(3), 10);
    P.orderMove(yoav, W(12.5), W(28.5)); until('body outside the wall', () => idle(yoav), 20);
    yoav.carrying.carried = false; yoav.carrying = null;
    itai.crawl = false; P.orderInteract(itai, P.objectAt(15, 23));
    until('power cut', () => !S.generator.on, 30);
    const south = g(8), spin = g(7);
    P.orderMove(yoav, W(22.5), W(24.5)); until('Yoav behind the crates', () => idle(yoav), 20);
    yoav.crawl = true;
    until('south patrol walks east, back turned', () => south.dir === 1 && south.x > W(27.5) && south.x < W(29), 40);
    yoav.crawl = false; take(yoav, south); until('south patrol down', () => south.state === 'down', 15);
    P.orderInteract(itai, P.objectAt(35, 22)); P.orderMove(noa, W(43.5), W(14.5));
    until('compound door breached', () => S.doors[1].open, 60);
    P.orderMove(itai, W(33.5), W(24.5)); until('Noa in the east corridor', () => idle(noa), 60);
    P.doThrow(noa, W(36.5), W(13.5));
    until('spinning guard investigates', () => spin.state === 'investigate', 3);
    until('spinning guard searches', () => spin.state === 'search', 10);
    take(yoav, spin); until('spinning guard down', () => spin.state === 'down', 15);
    P.orderInteract(itai, P.objectAt(32, 18)); until('TEL-3 rigged', () => S.launchers[2].done, 40);
  } catch (e) { log.push('ERROR ' + e.message); }
  log.push('alarms=' + S.stats.alarms + ' takedowns=' + S.stats.takedowns);
  return log.join('\n');
})()
