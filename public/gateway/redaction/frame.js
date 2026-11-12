import { requestTemplate } from "./fixture.js";
import { fixtureFields, fixtureBody } from "./fixture.js";
import { inspectRedaction } from "./observation.js";
import { mountMaskExplainer } from "./mask-explainer.js";
const page = document.querySelector("#lr-app");
const destroy = mountMaskExplainer(document.querySelector("#mask-explainer"));
window.addEventListener("pagehide", destroy, { once: true });
new ResizeObserver(() => parent.postMessage({ type: "gateway-preview-height",
  height: Math.ceil(page.getBoundingClientRect().height) }, location.origin)).observe(page);
const direct = document.querySelector("#redaction-original"), gateway = document.querySelector("#redaction-send");
const endpoint = "/api/gateway/redaction/live";
const panels = { direct: document.querySelector("#redaction-baseline-result"), gateway: document.querySelector("#redaction-result") };
const debug = document.querySelector("#redaction-debug"), toggle = document.querySelector("#redaction-debug-toggle");
const copy = document.querySelector("#debug-copy"), timeline = document.querySelector("#debug-timeline");
const labels = fixtureFields.map(f => f.label);
const runs = { direct: null, gateway: null };
let selected = "gateway";
document.querySelector("#debug-local").hidden = !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
document.querySelector("#debug-request").textContent = JSON.stringify(requestTemplate, null, 2);
toggle.addEventListener("click", () => { debug.hidden = !debug.hidden; toggle.setAttribute("aria-expanded", String(!debug.hidden)); });
for (const [mode, id] of [["direct", "#debug-direct"], ["gateway", "#debug-protected"]])
  document.querySelector(id).addEventListener("click", () => { selected = mode; renderDebug(); });
function rows(selector, values) {
  const list = document.querySelector(selector); list.replaceChildren();
  for (const [label, value] of values) {
    const dt = document.createElement("dt"), dd = document.createElement("dd");
    dt.textContent = label; dd.textContent = value; list.append(dt, dd);
  }
}
function paragraph(target, text, className) {
  const p = document.createElement("p"); p.textContent = text;
  if (className) p.className = className;
  target.append(p); return p;
}
function show(mode, text) { panels[mode].replaceChildren(); paragraph(panels[mode], text); }
function renderDebug() {
  const run = runs[selected], result = run?.result, unavailable = "Not available";
  document.querySelector("#debug-state").textContent = (selected === "direct" ? "Without Gateway" : "With Gateway") + " · " + (run?.status || "Not started");
  document.querySelector("#debug-route").textContent = selected === "direct"
    ? "Browser → Worker job → EKS adapter → Cloudflare Workers AI"
    : "Browser → Worker job → EKS runner → AI Gateway → EKS adapter → Cloudflare Workers AI";
  rows("#debug-run", [["Job ID", run?.id || unavailable], ["State", run?.status || "Not started"],
    ["Started", run?.started || unavailable], ["Elapsed", run?.elapsedMs ? (run.elapsedMs / 1000).toFixed(1) + " s" : unavailable]]);
  rows("#debug-gateway", [["Route", selected === "direct" ? "Direct · Gateway bypassed" : "Via AI Gateway"],
    ["Model", result?.model || "@cf/meta/llama-3.2-3b-instruct"], ["HTTP status", result?.responseStatus ?? unavailable],
    ["Gateway request ID", result?.gatewayRequestId || (selected === "direct" ? "Not used" : unavailable)],
    ["Gateway decision", result?.gatewayErrorCode === "policy_violation" ? "Block · policy_violation" : selected === "direct" ? "Not used" : "Verify in Vision One Events"]]);
  rows("#debug-upstream", [["Workers AI state", result?.modelStatus || unavailable], ["Model mode", result?.modelMode || unavailable],
    ...labels.map((label, i) => [label, result?.fields?.[i] || unavailable]),
    ["Amount and purpose preserved", result ? (result.summaryPreserved ? "Yes" : "Not confirmed") : unavailable]]);
  document.querySelector("#debug-observation").textContent = result?.modelMode === "live"
    ? "Workers AI completed inference. The input receipt is recorded by the Worker immediately before the model call. The displayed answer is the response returned through the selected route."
    : "No completed live inference is confirmed for this test. Missing evidence alone does not prove a Gateway block.";
  document.querySelector("#debug-result").textContent = result ? JSON.stringify(result, null, 2) : "No result received.";
  timeline.replaceChildren();
  for (const event of run?.timeline || []) {
    const li = document.createElement("li"), time = document.createElement("span");
    time.textContent = "+" + (event.elapsedMs / 1000).toFixed(1) + " s";
    li.append(time, document.createTextNode(event.message)); timeline.append(li);
  }
  copy.disabled = !runs.direct && !runs.gateway;
  document.querySelector("#debug-direct").setAttribute("aria-pressed", String(selected === "direct"));
  document.querySelector("#debug-protected").setAttribute("aria-pressed", String(selected === "gateway"));
}
copy.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(JSON.stringify(runs, null, 2)); copy.textContent = "Copied"; }
  catch { copy.textContent = "Copy unavailable"; }
  setTimeout(() => { copy.textContent = "Copy diagnostics"; }, 1800);
});
function renderResult(mode, result) {
  const panel = panels[mode]; panel.replaceChildren();
  const masked = result.fields.filter(f => f === "masked").length;
  paragraph(panel, result.gatewayErrorCode === "policy_violation" ? `Blocked by Gateway · HTTP ${result.responseStatus}`
    : result.modelMode === "live" ? (mode === "direct" ? `Original request delivered · HTTP ${result.responseStatus}`
      : `${masked} of 4 values masked · HTTP ${result.responseStatus}`)
      : `Live inference not confirmed · HTTP ${result.responseStatus}`, "redaction-outcome");
  if (result.receivedText) {
    const observed = inspectRedaction(fixtureBody, result.receivedText, fixtureFields);
    const dl = document.createElement("dl"); dl.className = "redaction-values";
    labels.forEach((label, i) => {
      const dt = document.createElement("dt"), dd = document.createElement("dd"), code = document.createElement("code");
      dt.textContent = label; code.textContent = observed.fieldValues[i] || "Not confirmed";
      dd.dataset.state = observed.fields[i]; dd.append(code); dl.append(dt, dd);
    });
    panel.append(dl);
    const details = document.createElement("details"), heading = document.createElement("summary"), text = document.createElement("pre");
    details.className = "redaction-received"; heading.textContent = "Input submitted to Workers AI";
    text.textContent = result.receivedText; details.append(heading, text); panel.append(details);
  }
  if (result.reply) {
    const heading = document.createElement("h3"); heading.textContent = "Model response"; panel.append(heading);
    paragraph(panel, result.reply, "redaction-model-response");
    paragraph(panel, result.model, "redaction-label");
  }
  if (result.gatewayRequestId) paragraph(panel, "Gateway request ID " + result.gatewayRequestId, "redaction-label");
}
async function responseJson(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "The live demo could not be reached.");
  return data;
}
async function start(mode) {
  direct.disabled = gateway.disabled = true; selected = mode;
  document.querySelector("#redaction-input").open = true;
  const run = runs[mode] = { mode, status: "Submitting", id: null, started: new Date().toISOString(), elapsedMs: null, result: null, timeline: [] };
  const trace = message => { run.timeline.push({ elapsedMs: Date.now() - Date.parse(run.started), message }); renderDebug(); };
  show(mode, "Queued · Waiting for the EKS runner…"); trace("Submitted a fresh fixed-fixture inference job.");
  try {
    const queued = await responseJson(await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode }) }));
    run.id = queued.id; run.status = "Queued"; trace("Job queued for " + mode + " delivery.");
    const until = Date.now() + 160000;
    while (Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, 2200));
      const job = await responseJson(await fetch(endpoint + "/" + encodeURIComponent(run.id)));
      if (job.mode !== mode) throw new Error("The returned run does not match this comparison side.");
      if (job.status === "failed") throw new Error("The live request did not complete. No example reply was substituted.");
      if (job.status === "done") {
        run.result = job.result; run.status = "Completed"; renderResult(mode, job.result);
        trace("Received transport result and Worker-recorded model evidence."); return;
      }
      if (job.status === "running" && run.status !== "Running") {
        run.status = "Running"; trace("EKS runner claimed this job.");
        show(mode, mode === "direct" ? "In progress · Sending directly to Workers AI…" : "In progress · Sending through AI Gateway to Workers AI…");
      }
    }
    throw new Error("This run timed out. Reload before starting another test.");
  } catch (error) { run.status = "Failed"; show(mode, error.message); trace("No successful outcome is confirmed."); }
  finally { run.elapsedMs = Date.now() - Date.parse(run.started); direct.disabled = gateway.disabled = false; renderDebug(); }
}
direct.addEventListener("click", () => start("direct"));
gateway.addEventListener("click", () => start("gateway"));
renderDebug();
