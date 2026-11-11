import "/flow-animation.js";

// A self-contained illustration. Controls never submit jobs or change policy.
const motion = window.FlowAnimation;
const ns = "http://www.w3.org/2000/svg";
const symbols = {
  chat: '<path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2Z"/><path d="M7 9h10M7 13h6"/>',
  app: '<rect x="3" y="3" width="18" height="18" rx="4"/><path d="M3 9h18M8 3v6M8 14h3m-3 3h7"/>',
  agent: '<rect x="4" y="7" width="16" height="14" rx="4"/><path d="M12 3v4M8 12v2m8-2v2M9 17h6"/>',
  model: '<path d="m12 3 9 5v8l-9 5-9-5V8Z"/><path d="m3 8 9 5 9-5m-9 5v8M7.5 5.5l9 5"/>',
};
const icon = (name) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + symbols[name] + "</svg>";
const sources = [
  { id: "employee", name: "Employee Chat", icon: "chat" },
  { id: "internal", name: "Internal App", icon: "app" },
  { id: "agent", name: "AI Agent", icon: "agent" },
];
const pauseIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 5v14M16 5v14"/></svg>';
const playIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg>';
const sourceNodes = () => '<div class="ge-sources">' + sources.map((source) => '<div data-mask-source="' + source.id + '">' + icon(source.icon) + "<span>" + source.name + "</span></div>").join("") + "</div>";
const node = (name, label, image) => '<div class="ge-node ge-' + name + '" data-mask-node="' + name + '">' + icon(image) + "<h3>" + label + "</h3></div>";
const gatewayNode = () => '<div class="ge-node mask-gateway" data-mask-node="gateway"><span class="ge-guard-symbol"><img src="/brand/guard-flow-symbol.png" width="58" height="51" alt="TrendAI"></span><h3>AI Gateway</h3><div class="mask-gateway-policy"><span>Data redaction</span><span class="ge-decision" data-mask-decision="input"></span></div><div class="mask-gateway-policy"><span>Response inspection</span><span class="ge-decision" data-mask-decision="output"></span></div></div>';
const graph = (mobile) => '<div role="img" class="ge-graph ' + (mobile ? 'ge-mobile-flow' : 'ge-desktop-flow') + '">' +
  (mobile ? '<div class="ge-mobile-sources">' + sourceNodes() + "</div>" : sourceNodes()) +
  node("app", "AI Application", "app") + gatewayNode() + node("model", "LLM", "model") + "</div>";

export function mountMaskExplainer(host) {
  if (!host) return () => {};
  host.innerHTML = '<section class="guard-explainer mask-explainer" aria-label="How Gateway data redaction works">' +
    '<div class="ge-toggle" role="tablist" aria-label="Illustrated Gateway protection"><button type="button" role="tab" id="mask-without" data-mask-mode="without" aria-controls="mask-flow-panel">WITHOUT GATEWAY</button><button type="button" role="tab" id="mask-with" data-mask-mode="with" aria-controls="mask-flow-panel">WITH TRENDAI AI GATEWAY</button></div>' +
    '<div id="mask-flow-panel" class="ge-panel" role="tabpanel" tabindex="0">' + graph(false) + graph(true) +
    '<div class="mask-payload" aria-label="Illustrated model input"><span data-mask-payload-label></span><code data-mask-payload></code></div>' +
    '<div class="ge-controls"><div class="ge-scenarios" role="group" aria-label="Illustration examples"><span class="mask-illustration-label">Illustration</span><button type="button" data-mask-case="sensitive">Sensitive data</button><button type="button" data-mask-case="normal">Normal request</button></div><button type="button" class="ge-pause" data-mask-pause aria-label="Pause explanatory animation">' + pauseIcon + "</button></div></div></section>";
  const section = host.firstElementChild;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const state = { mode: "with", scenario: "sensitive", index: 0, source: 0, paused: false };
  let destroyed = false, visible = false, drawFrame, routes = [], duration = 1, flight = 0, timeline;
  const all = (selector, action) => section.querySelectorAll(selector).forEach(action);
  const phases = () => state.mode === "without" ? ["source", "model", "return", "delivered"]
    : ["source", "gateway", "redact", "model", "model-return", "gateway-return", "delivered"];
  const paused = () => state.paused || reduced.matches || !visible || document.hidden;

  function draw() {
    drawFrame = undefined;
    if (destroyed) return;
    const previous = duration;
    all(".ge-graph", (graph) => {
      graph.querySelector(".ge-pipes")?.remove();
      if (!graph.offsetWidth) return;
      const rect = graph.getBoundingClientRect(), vertical = graph.classList.contains("ge-mobile-flow");
      const svg = document.createElementNS(ns, "svg");
      svg.classList.add("ge-pipes");
      svg.setAttribute("viewBox", `0 0 ${rect.width} ${rect.height}`);
      svg.setAttribute("aria-hidden", "true");
      const at = (element, side, fraction = .5) => {
        const r = element.getBoundingClientRect();
        return { x: r.left - rect.left + (side === "right" ? r.width : side === "left" ? 0 : r.width * fraction),
          y: r.top - rect.top + (side === "bottom" ? r.height : side === "top" ? 0 : r.height * fraction) };
      };
      const app = graph.querySelector('[data-mask-node="app"]'), model = graph.querySelector('[data-mask-node="model"]');
      const gateway = graph.querySelector('[data-mask-node="gateway"]');
      const add = (a, b, phase, source, points) => {
        const route = motion.addRoute(svg, points ? motion.rounded(points) : motion.route(a, b, vertical));
        route.dataset.maskRoute = phase;
        if (source) route.dataset.maskSourceRoute = source;
      };
      graph.querySelectorAll("[data-mask-source]").forEach((source) => {
        const a = at(source, vertical ? "left" : "right"), b = at(app, vertical ? "top" : "left");
        add(a, b, "source", source.dataset.maskSource, vertical
          ? [a, { x: -5, y: a.y }, { x: -5, y: b.y - 18 }, { x: b.x, y: b.y - 18 }, b] : undefined);
      });
      const forwardSide = vertical ? "bottom" : "right", backwardSide = vertical ? "top" : "left";
      if (state.mode === "with") {
        add(at(app, forwardSide), at(gateway, backwardSide), "gateway");
        add(at(gateway, forwardSide), at(model, backwardSide), "model");
      } else {
        add(at(app, forwardSide), at(model, backwardSide), "model");
      }
      graph.prepend(svg);
    });
    paint();
    timeline?.resize(previous, duration);
  }

  function paint() {
    const sequence = phases(), phase = reduced.matches ? sequence.at(-1) : sequence[state.index];
    const seen = new Set(reduced.matches ? sequence : sequence.slice(0, state.index + 1));
    const withGateway = state.mode === "with", sensitive = state.scenario === "sensitive";
    const caller = sources[state.source];
    section.classList.toggle("ge-mode-without", !withGateway);
    section.dataset.phase = phase;
    all("[data-mask-mode]", (button) => {
      const selected = button.dataset.maskMode === state.mode;
      button.setAttribute("aria-selected", String(selected)); button.tabIndex = selected ? 0 : -1;
    });
    section.querySelector("#mask-flow-panel").setAttribute("aria-labelledby", "mask-" + state.mode);
    all("[data-mask-case]", (button) => button.setAttribute("aria-pressed", String(button.dataset.maskCase === state.scenario)));
    all("[data-mask-source]", (node) => {
      node.classList.toggle("ge-source-current", node.dataset.maskSource === caller.id);
      node.classList.toggle("ge-delivered", node.dataset.maskSource === caller.id && phase === "delivered");
    });
    all("[data-mask-decision]", (label) => {
      const input = label.dataset.maskDecision === "input";
      const ready = seen.has(input ? "redact" : "gateway-return");
      label.textContent = withGateway && ready ? input && sensitive ? "Redact" : "Allow" : "";
      label.dataset.decision = ready && withGateway ? "allow" : "";
    });
    routes = [];
    all(".ge-route", (group) => {
      const shared = group.dataset.maskRoute === "source", returning = phase === "delivered" && shared;
      const modelReturn = group.dataset.maskRoute === "model" && ["model-return", "return"].includes(phase);
      const gatewayReturn = group.dataset.maskRoute === "gateway" && phase === "gateway-return";
      const reverse = returning || modelReturn || gatewayReturn;
      const active = (shared ? phase === "source" || returning : group.dataset.maskRoute === phase || modelReturn || gatewayReturn) &&
        (!group.dataset.maskSourceRoute || group.dataset.maskSourceRoute === caller.id) && !!group.closest(".ge-graph").offsetWidth && !reduced.matches;
      group.classList.toggle("is-traveling", active);
      group.classList.toggle("ge-route-return", reverse);
      if (active) routes.push({ group, reverse });
    });
    flight = Math.max(0, ...routes.map(({ group }) => motion.travelMs(group.querySelector(".ge-pipe-track").getTotalLength())));
    duration = flight + (phase === "redact" ? 800 : phase === "delivered" ? 700 : 200);
    const redacted = sensitive && withGateway && seen.has("redact");
    section.querySelector("[data-mask-payload-label]").textContent = sensitive
      ? redacted ? "Model input after redaction" : "Original sensitive data" : "Model input";
    section.querySelector("[data-mask-payload]").textContent = sensitive
      ? redacted ? "Payment card: [REDACTED]" : "Payment card: 4111 1111 1111 1111" : "Summarize the Millennium Falcon parking fee.";
    section.querySelector(".mask-payload").dataset.masked = String(redacted);
    all(".ge-graph", (graph) => graph.setAttribute("aria-label", `Illustration: ${caller.name} sends a request through the AI application ${withGateway ? "and AI Gateway" : "directly"} to the model. ${redacted ? "Sensitive data is redacted before the model." : ""} The response returns to the same source.`));
    const pause = section.querySelector("[data-mask-pause]");
    pause.hidden = reduced.matches;
    pause.innerHTML = state.paused ? playIcon : pauseIcon;
    pause.setAttribute("aria-label", state.paused ? "Resume explanatory animation" : "Pause explanatory animation");
  }
  function travel(elapsed) {
    routes.forEach(({ group, reverse }) => motion.moveRoute(group, elapsed, reverse));
    if (phases()[state.index] === "delivered" && !reduced.matches) {
      all("[data-mask-source]", (node) => node.classList.toggle("ge-delivered", elapsed >= flight && node.dataset.maskSource === sources[state.source].id));
    }
  }
  function advance() {
    if (state.index === phases().length - 1) { state.index = 0; state.source = (state.source + 1) % sources.length; }
    else state.index++;
    paint();
  }
  timeline = motion.createTimeline({ duration: () => duration, advance, paint: travel });
  function schedule() { travel(timeline.elapsed); if (paused()) timeline.pause(); else timeline.resume(); }
  function reset() { state.index = state.source = 0; paint(); draw(); timeline.reset(); schedule(); }
  function onClick(event) {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.maskMode) { state.mode = button.dataset.maskMode; reset(); }
    else if (button.dataset.maskCase) { state.scenario = button.dataset.maskCase; reset(); }
    else if (button.hasAttribute("data-mask-pause")) { state.paused = !state.paused; paint(); schedule(); }
  }
  function onKey(event) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    state.mode = event.key === "Home" ? "without" : event.key === "End" ? "with" : state.mode === "with" ? "without" : "with";
    reset(); section.querySelector(`[data-mask-mode="${state.mode}"]`).focus();
  }
  function refresh() { paint(); schedule(); }
  const observer = new IntersectionObserver((entries) => { visible = entries[0].isIntersecting; refresh(); }, { threshold: .1 });
  const resize = new ResizeObserver(() => { if (!drawFrame) drawFrame = requestAnimationFrame(draw); });
  section.addEventListener("click", onClick);
  section.querySelector(".ge-toggle").addEventListener("keydown", onKey);
  reduced.addEventListener("change", refresh);
  document.addEventListener("visibilitychange", refresh);
  all(".ge-graph", (graph) => resize.observe(graph));
  observer.observe(section.querySelector(".ge-panel"));
  paint(); draw(); schedule();
  return () => {
    destroyed = true; timeline.destroy(); cancelAnimationFrame(drawFrame);
    observer.disconnect(); resize.disconnect(); reduced.removeEventListener("change", refresh);
    document.removeEventListener("visibilitychange", refresh);
    section.removeEventListener("click", onClick); section.querySelector(".ge-toggle").removeEventListener("keydown", onKey);
  };
}
