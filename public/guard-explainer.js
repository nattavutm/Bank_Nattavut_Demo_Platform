/* Explanatory animation only. It never calls an API or changes live protection. */
(() => {
  const paths = {
    chat: '<path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2Z"/><path d="M7 9h10M7 13h6"/>',
    app: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M3 9h18M8 3v6M8 14h3m-3 3h7"/>',
    agent: '<rect x="4" y="7" width="16" height="14" rx="4"/><path d="M12 3v4M8 12v2m8-2v2M9 17h6"/>',
    model: '<path d="m12 3 9 5v8l-9 5-9-5V8Z"/><path d="m3 8 9 5 9-5m-9 5v8M7.5 5.5l9 5"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  };
  const icon = name => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + paths[name] + '</svg>';
  const cases = {
    normal: { name: 'Normal request', phases: ['source', 'input-check', 'model', 'output-check', 'output-allow', 'delivered'] },
    prompt: { name: 'Blocked prompt', phases: ['source', 'input-check', 'input-block', 'input-reject', 'notice'] },
    response: { name: 'Blocked response', phases: ['source', 'input-check', 'model', 'output-check', 'output-block', 'output-reject', 'notice'] },
  };
  const sourceTypes = [{id: 'employee', icon: 'chat', name: 'Employee Chat'}, {id: 'internal', icon: 'app', name: 'Internal App'}, {id: 'agent', icon: 'agent', name: 'AI Agent'}];
  const motion = window.FlowAnimation;
  const state = { mode: 'with', scenario: 'normal', index: 0, paused: false, autoCases: true, sourceIndex: 0 };
  const pauseIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
  const resumeIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>';
  const ns = 'http://www.w3.org/2000/svg';
  let cleanup;

  function check(stage) {
    return '<div class="ge-check-slot ge-' + stage + '-slot"><div class="ge-check" data-ge-node="' + stage + '"><span class="ge-guard-symbol"><img src="/brand/guard-flow-symbol.png" alt="TrendAI" width="58" height="51"></span><h3>' + (stage === 'input' ? 'Prompt inspection' : 'Response inspection') + '</h3><span class="ge-decision" data-ge-decision="' + stage + '"></span></div></div>';
  }
  function node(name, label, extra = '', symbol = name) {
    return '<div class="ge-node ge-' + name + ' ' + extra + '" data-ge-node="' + name + '">' + icon(symbol === 'return-app' ? 'app' : symbol) + '<h3>' + label + '</h3></div>';
  }
  const sources = '<div class="ge-sources" data-ge-node="source">' + sourceTypes.map(item => '<div data-ge-source="' + item.id + '">' + icon(item.icon) + '<span>' + item.name + '</span></div>').join('') + '</div>';
  function markup() {
    return '<section class="guard-explainer" aria-labelledby="ge-title">' +
      '<div class="ge-intro"><p class="ge-eyebrow">How AI Guard works</p><h2 id="ge-title">Inspect prompts. Check responses.<br>Enforce AI policies.</h2><p>Add policy-based inspection before requests reach your model<br class="ge-desktop-break"> and before responses reach your users.</p></div>' +
      '<div class="ge-toggle" role="tablist" aria-label="Illustrated AI Guard flow"><button type="button" role="tab" id="ge-without" data-ge-mode="without" aria-controls="ge-panel">WITHOUT AI GUARD</button><button type="button" role="tab" id="ge-with" data-ge-mode="with" aria-controls="ge-panel">WITH TRENDAI AI GUARD</button></div>' +
      '<div id="ge-panel" class="ge-panel" role="tabpanel" tabindex="0"><div class="ge-desktop-flow ge-graph" role="img" aria-label="AI Guard explanatory diagram">' + sources + node('app', 'AI Application') + check('input') + node('model', 'LLM') + check('output') + '</div>' +
      '<div class="ge-mobile-flow ge-graph"><div class="ge-mobile-sources">' + sources + '</div>' + node('app', 'AI Application') + check('input') + check('output') + node('model', 'LLM') + '</div>' +
      '<div class="ge-flow-status"><span class="ge-status-dot" aria-hidden="true"></span><p data-ge-status></p></div><div class="ge-controls"><div class="ge-scenarios" role="group" aria-label="Illustrated examples">' + Object.entries(cases).map(([key, item]) => '<button type="button" data-ge-scenario="' + key + '">' + item.name + '</button>').join('') + '</div><button type="button" class="ge-pause" data-ge-pause aria-label="Pause explanatory animation">' + pauseIcon + '</button></div></div>' +
      '</section>';
  }

  const {rounded, route} = motion;
  function mount(host) {
    cleanup?.();
    if (!host) return;
    host.innerHTML = markup();
    const section = host.querySelector('.guard-explainer');
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    let frame, visible = false, destroyed = false, activeRoutes = [], stepDuration = 1, flightDuration = 0;
    let timeline;
    const phases = () => state.mode === 'with' ? cases[state.scenario].phases : ['source', 'model', 'return', 'delivered'];
    const all = (selector, fn) => section.querySelectorAll(selector).forEach(fn);
    const isPaused = () => state.paused || media.matches || !visible || document.hidden;

    function draw() {
      frame = undefined;
      if (destroyed) return;
      const previousDuration = stepDuration;
      all('.ge-graph', graph => {
        graph.querySelector('.ge-pipes')?.remove();
        if (!graph.offsetWidth) return;
        const rect = graph.getBoundingClientRect();
        const svg = document.createElementNS(ns, 'svg');
        svg.classList.add('ge-pipes');
        svg.setAttribute('viewBox', '0 0 ' + rect.width + ' ' + rect.height);
        svg.setAttribute('aria-hidden', 'true');
        const vertical = graph.classList.contains('ge-mobile-flow');
        const at = (el, side, fraction = .5) => {
          const r = el.getBoundingClientRect();
          return {x: r.left - rect.left + (side === 'right' ? r.width : side === 'left' ? 0 : r.width * fraction), y: r.top - rect.top + (side === 'bottom' ? r.height : side === 'top' ? 0 : r.height * fraction)};
        };
        const app = graph.querySelector('[data-ge-node=app]'), model = graph.querySelector('[data-ge-node=model]');
        const input = graph.querySelector('[data-ge-node=input] .ge-guard-symbol'), output = graph.querySelector('[data-ge-node=output] .ge-guard-symbol');
        const add = (a, b, phase, back = false, source = '', points) => {
          const d = points ? rounded(points) : route(a, b, vertical);
          const g = motion.addRoute(svg, d);
          g.dataset.geRoute = phase;
          if (phase === 'roundtrip') g.classList.add('ge-source-roundtrip');
          if (source) g.dataset.geSourceRoute = source;
          if (back) g.classList.add('ge-route-return');
        };
        if (!vertical) {
          graph.querySelectorAll('[data-ge-source]').forEach(el => {
            // One physical path per caller. Reply motion reverses this same path.
            add(at(el, 'right'), at(app, 'left'), 'roundtrip', false, el.dataset.geSource);
          });
          if (state.mode === 'with') {
            add(at(app, 'right', .25), at(input, 'left'), 'input-check');
            add(at(input, 'right'), at(model, 'left', .25), 'model');
            add(at(model, 'left', .75), at(output, 'right'), 'output-check', true);
            add(at(output, 'left'), at(app, 'right', .75), 'output-allow', true);
          } else {
            add(at(app, 'right', .25), at(model, 'left', .25), 'model');
            add(at(model, 'left', .75), at(app, 'right', .75), 'return', true);
          }
        } else {
          graph.querySelectorAll('[data-ge-source]').forEach(el => {
            const a = at(el, 'left'), b = at(app, 'top');
            add(a, b, 'roundtrip', false, el.dataset.geSource, [a, {x: -6, y: a.y}, {x: -6, y: b.y - 18}, {x: b.x, y: b.y - 18}, b]);
          });
          if (state.mode === 'with') {
            add(at(app, 'bottom', .25), at(input, 'top'), 'input-check');
            add(at(input, 'bottom'), at(model, 'top', .25), 'model');
            add(at(model, 'top', .75), at(output, 'bottom'), 'output-check', true);
            add(at(output, 'top'), at(app, 'bottom', .75), 'output-allow', true);
          } else {
            add(at(app, 'bottom', .25), at(model, 'top', .25), 'model');
            add(at(model, 'top', .75), at(app, 'bottom', .75), 'return', true);
          }
        }
        graph.prepend(svg);
      });
      paint();
      timeline?.resize(previousDuration, stepDuration);
    }
    function queueDraw() { if (!frame) frame = requestAnimationFrame(draw); }
    function paint() {
      const sequence = phases();
      state.index = Math.min(state.index, sequence.length - 1);
      const phase = media.matches ? sequence.at(-1) : sequence[state.index];
      const seen = new Set(media.matches ? sequence : sequence.slice(0, state.index + 1));
      const withGuard = state.mode === 'with';
      const inputBlocked = seen.has('input-block'), outputBlocked = seen.has('output-block');
      section.classList.toggle('ge-mode-without', !withGuard);
      section.classList.toggle('ge-paused', isPaused());
      section.dataset.phase = phase;
      section.dataset.speed = String(motion.speed);
      const caller = sourceTypes[state.sourceIndex];
      section.dataset.source = caller.id;
      section.dataset.outcome = inputBlocked || outputBlocked ? 'block' : seen.has('delivered') && withGuard ? 'allow' : 'pending';

      all('[data-ge-mode]', button => { const on = button.dataset.geMode === state.mode; button.setAttribute('aria-selected', String(on)); button.tabIndex = on ? 0 : -1; });
      section.querySelector('#ge-panel').setAttribute('aria-labelledby', 'ge-' + state.mode);
      all('[data-ge-scenario]', button => { button.setAttribute('aria-pressed', String(button.dataset.geScenario === state.scenario)); button.disabled = !withGuard; });
      all('.ge-check', el => el.setAttribute('aria-hidden', String(!withGuard)));
      for (const stage of ['input', 'output']) {
        const allowed = (stage === 'input' && seen.has('model')) || (stage === 'output' && seen.has('output-allow'));
        const value = !withGuard ? '' : seen.has(stage + '-block') ? 'Block' : allowed ? 'Allow' : '';
        all('[data-ge-decision="' + stage + '"]', el => { el.textContent = value; el.dataset.decision = value.toLowerCase(); });
        all('[data-ge-node="' + stage + '"]', el => el.classList.toggle('ge-is-blocked', value === 'Block'));
      }
      all('[data-ge-node=model]', el => el.classList.toggle('ge-not-reached', inputBlocked));
      const returned = phase === 'delivered', notice = phase === 'notice';
      all('[data-ge-source]', el => {
        const current = el.dataset.geSource === caller.id;
        el.classList.toggle('ge-source-current', current);
        el.classList.toggle('ge-delivered', current && returned);
        el.classList.toggle('ge-notice', current && notice);
      });
      activeRoutes = [];
      all('.ge-route', group => {
        const shared = group.dataset.geRoute === 'roundtrip';
        const returning = shared && (returned || notice);
        const rejectInput = phase === 'input-reject' && group.dataset.geRoute === 'input-check';
        const rejectOutput = phase === 'output-reject' && group.dataset.geRoute === 'output-allow';
        const match = shared ? phase === 'source' || returning : group.dataset.geRoute === phase || rejectInput || rejectOutput;
        if (shared) group.classList.toggle('ge-route-return', returning);
        const reverse = returning || rejectInput;
        group.dataset.geDirection = reverse ? 'return' : 'forward';
        const active = match && (!group.dataset.geSourceRoute || group.dataset.geSourceRoute === caller.id) && !!group.closest('.ge-graph').offsetWidth && !media.matches;
        group.classList.toggle('ge-route-notice', (notice && shared) || rejectInput || rejectOutput);
        group.classList.toggle('is-traveling', active);
        if (active) activeRoutes.push({group, reverse});
      });
      flightDuration = Math.max(0, ...activeRoutes.map(({group}) => motion.travelMs(group.querySelector('.ge-pipe-track').getTotalLength())));
      // Travel at one physical speed; pause briefly at each processing node.
      stepDuration = flightDuration + (['input-block','output-block'].includes(phase) ? 550 : returned || notice ? 650 : 250);
      section.dataset.stepDuration = String(Math.round(stepDuration));
      const title = !withGuard ? '' : inputBlocked ? 'Blocked before model invocation' : outputBlocked ? 'Blocked before delivery' : phase === 'delivered' ? 'Allow' : '';
      section.querySelector('[data-ge-status]').textContent = title;
      section.querySelector('.ge-flow-status').hidden = !withGuard;
      section.querySelector('.ge-desktop-flow').setAttribute('aria-label', withGuard
        ? 'Illustrative API-based inspection. AI Guard returns a decision; the application enforces it. ' + caller.name + ' sends the request and receives the response or an application-generated block notice. ' + cases[state.scenario].name + '. ' + title
        : caller.name + ' sends the request through the application to the model. The response returns through the application to ' + caller.name + '. Without AI Guard inspection.');
      const pause = section.querySelector('[data-ge-pause]');
      pause.hidden = media.matches;
      pause.innerHTML = state.paused ? resumeIcon : pauseIcon;
      pause.setAttribute('aria-label', state.paused ? 'Resume explanatory animation' : 'Pause explanatory animation');
      pause.title = state.paused ? 'Resume animation' : 'Pause animation';
    }
    function advance() {
      if (state.index >= phases().length - 1) {
        state.index = 0;
        state.sourceIndex = (state.sourceIndex + 1) % sourceTypes.length;
        if (state.sourceIndex === 0 && state.mode === 'with' && state.autoCases) {
          const keys = Object.keys(cases);
          state.scenario = keys[(keys.indexOf(state.scenario) + 1) % keys.length];
        }
      } else state.index++;
      paint();
    }
    function drawMotion(elapsed) {
      activeRoutes.forEach(({group, reverse}) => motion.moveRoute(group, elapsed, reverse));
      const final = ['delivered','notice'].includes(phases()[state.index]);
      if (final && elapsed < flightDuration && !media.matches) {
        all('[data-ge-source]', el => el.classList.remove('ge-delivered', 'ge-notice'));
        if (phases()[state.index] === 'delivered') section.querySelector('[data-ge-status]').textContent = '';
      } else if (final) {
        const caller = sourceTypes[state.sourceIndex].id;
        all('[data-ge-source]', el => {
          el.classList.toggle('ge-delivered', el.dataset.geSource === caller && phases()[state.index] === 'delivered');
          el.classList.toggle('ge-notice', el.dataset.geSource === caller && phases()[state.index] === 'notice');
        });
        if (state.mode === 'with' && phases()[state.index] === 'delivered') section.querySelector('[data-ge-status]').textContent = 'Allow';
      }
    }
    function schedule() { drawMotion(timeline.elapsed); if (isPaused()) timeline.pause(); else timeline.resume(); }
    timeline = motion.createTimeline({duration: () => stepDuration, advance, paint: drawMotion});
    function selectMode(value, focus = false) {
      state.mode = value; state.index = 0; state.sourceIndex = 0;
      paint(); draw(); timeline.reset();
      if (focus) section.querySelector('[data-ge-mode="' + value + '"]').focus();
      schedule();
    }
    section.addEventListener('click', event => {
      const button = event.target.closest('button');
      if (!button) return;
      if (button.dataset.geMode) selectMode(button.dataset.geMode);
      else if (button.dataset.geScenario) {
        state.scenario = button.dataset.geScenario; state.autoCases = false; state.sourceIndex = 0;
        state.index = media.matches || state.paused ? phases().length - 1 : 0;
        paint(); timeline.reset(); schedule();
      } else if (button.hasAttribute('data-ge-pause')) {
        state.paused = !state.paused;
        paint(); schedule();
      }
    });
    section.querySelector('.ge-toggle').addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      selectMode(event.key === 'Home' ? 'without' : event.key === 'End' ? 'with' : state.mode === 'with' ? 'without' : 'with', true);
    });
    const observer = new IntersectionObserver(entries => { visible = entries[0].isIntersecting; paint(); schedule(); }, {threshold: .15});
    const resize = new ResizeObserver(queueDraw);
    all('.ge-graph', el => resize.observe(el));
    const refresh = () => { paint(); schedule(); };
    media.addEventListener('change', refresh);
    document.addEventListener('visibilitychange', refresh);
    observer.observe(section.querySelector('.ge-panel'));
    paint(); queueDraw();
    cleanup = () => { destroyed = true; timeline.destroy(); cancelAnimationFrame(frame); observer.disconnect(); resize.disconnect(); media.removeEventListener('change', refresh); document.removeEventListener('visibilitychange', refresh); };
  }
  window.guardExplainer = { mount, destroy: () => { cleanup?.(); cleanup = undefined; } };
})();
