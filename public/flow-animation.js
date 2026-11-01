/* One animation clock for explanatory diagrams. No network or product decisions. */
(() => {
  const speed = 150; // CSS pixels / second, independent of connector length.
  function createTimeline({ duration, advance, paint, raf = requestAnimationFrame, caf = cancelAnimationFrame }) {
    let elapsed = 0, last = null, frame = null, running = false;
    const tick = time => {
      frame = null;
      if (!running) return;
      if (last !== null) elapsed += Math.max(0, time - last);
      last = time;
      const end = duration();
      paint(Math.min(elapsed, end));
      if (elapsed >= end) { advance(); elapsed = 0; paint(0); }
      if (running) frame = raf(tick);
    };
    return {
      resume() { if (running) return; running = true; last = null; frame = raf(tick); },
      pause() { running = false; last = null; if (frame !== null) caf(frame); frame = null; },
      reset() { elapsed = 0; last = null; paint(0); },
      // Preserve position when responsive layout changes a path's geometry.
      resize(oldDuration, newDuration) { elapsed = oldDuration ? elapsed / oldDuration * newDuration : 0; last = null; paint(elapsed); },
      get elapsed() { return elapsed; },
      destroy() { this.pause(); },
    };
  }
  function rounded(points) {
    let d = 'M ' + points[0].x + ' ' + points[0].y;
    for (let i = 1; i < points.length - 1; i++) {
      const a = points[i - 1], b = points[i], c = points[i + 1];
      const ab = Math.hypot(b.x-a.x,b.y-a.y), bc = Math.hypot(c.x-b.x,c.y-b.y);
      if (!ab || !bc) { d += ' L '+b.x+' '+b.y; continue; }
      const r = Math.min(14,ab/2,bc/2);
      d += ' L '+(b.x-(b.x-a.x)/ab*r)+' '+(b.y-(b.y-a.y)/ab*r);
      d += ' Q '+b.x+' '+b.y+' '+(b.x+(c.x-b.x)/bc*r)+' '+(b.y+(c.y-b.y)/bc*r);
    }
    const end=points.at(-1); return d+' L '+end.x+' '+end.y;
  }
  function route(a,b,vertical) {
    const mid=vertical?(a.y+b.y)/2:(a.x+b.x)/2;
    return rounded(vertical?[a,{x:a.x,y:mid},{x:b.x,y:mid},b]:[a,{x:mid,y:a.y},{x:mid,y:b.y},b]);
  }
  const ns='http://www.w3.org/2000/svg';
  function addRoute(svg,d) {
    const group=document.createElementNS(ns,'g'); group.classList.add('ge-route');
    const track=document.createElementNS(ns,'path'); track.setAttribute('d',d); track.classList.add('ge-pipe-track'); group.append(track);
    const pulse=document.createElementNS(ns,'path'); pulse.setAttribute('d',d); pulse.classList.add('ge-pipe-pulse'); group.append(pulse);
    const circle=document.createElementNS(ns,'circle'); circle.setAttribute('r','4'); circle.classList.add('ge-traveler'); group.append(circle);
    svg.append(group); return group;
  }
  function travelMs(length) { return length / speed * 1000; }
  function position(length, elapsed, reverse=false) {
    const distance=Math.min(length,Math.max(0,elapsed)*speed/1000);
    return reverse?length-distance:distance;
  }
  function moveRoute(group,elapsed,reverse=false) {
    const path=group.querySelector('.ge-pipe-track'), length=path.getTotalLength();
    const distance=position(length,elapsed,reverse), point=path.getPointAtLength(distance);
    const circle=group.querySelector('.ge-traveler'), pulse=group.querySelector('.ge-pipe-pulse');
    circle.setAttribute('cx',point.x);circle.setAttribute('cy',point.y);
    pulse.setAttribute('stroke-dasharray','22 '+(length+44));
    pulse.setAttribute('stroke-dashoffset',reverse?-distance:22-distance);
    group.dataset.distance=distance.toFixed(2); group.dataset.length=length.toFixed(2);
  }
  window.FlowAnimation={speed,createTimeline,rounded,route,addRoute,travelMs,position,moveRoute};
})();
