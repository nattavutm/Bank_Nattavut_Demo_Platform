import { fixtureBody } from "./fixture.js";
import { describeRedaction, comparisonTakeaway } from "./presentation.js";
import { validatePrompt, promptContext } from "./prompt.js";
import { mountMaskExplainer } from "./mask-explainer.js";
const page = document.querySelector("#lr-app");
const destroy = mountMaskExplainer(document.querySelector("#mask-explainer"));
window.addEventListener("pagehide", destroy, { once: true });
new ResizeObserver(() => parent.postMessage({ type: "gateway-preview-height",
  height: Math.ceil(page.getBoundingClientRect().height) }, location.origin)).observe(page);
const send = document.querySelector('#redaction-send'), prompt = document.querySelector('#redaction-prompt');
const newComparison = document.querySelector('#redaction-new'), form = document.querySelector('#redaction-form');
const promptError = document.querySelector('#prompt-error');
prompt.value = fixtureBody;
const endpoint = "/api/gateway/redaction/live";
const panels = { direct: document.querySelector("#redaction-baseline-result"), gateway: document.querySelector("#redaction-result") };
const debug = document.querySelector("#redaction-debug"), toggle = document.querySelector("#redaction-debug-toggle");
const copy = document.querySelector("#debug-copy"), timeline = document.querySelector("#debug-timeline");
const runs = { direct: null, gateway: null };
let selected = "gateway";
document.querySelector("#debug-local").hidden = !["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);

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
function show(mode, text) {
  panels[mode].replaceChildren(); const status = paragraph(panels[mode], text, 'result-waiting');
  status.dataset.state = runs[mode]?.status === 'Failed' ? 'failed' : 'pending';
}
function renderDebug() {
  const run = runs[selected], result = run?.result, unavailable = "Not available";
  document.querySelector("#debug-state").textContent = (selected === "direct" ? "Without Gateway" : "With Gateway") + " · " + (run?.status || "Not started");
  document.querySelector("#debug-route").textContent = selected === "direct"
    ? "Browser → Cloudflare Worker → Workers AI"
    : "Browser → Cloudflare Worker → AI Gateway → Cloudflare Worker → Workers AI";
  rows("#debug-run", [["Job ID", run?.id || unavailable], ["State", run?.status || "Not started"],
    ["Started", run?.started || unavailable], ["Elapsed", run?.elapsedMs ? (run.elapsedMs / 1000).toFixed(1) + " s" : unavailable]]);
  rows("#debug-gateway", [["Route", selected === "direct" ? "Direct · Gateway bypassed" : "Via AI Gateway"],
    ["Model", result?.model || "@cf/meta/llama-3.2-3b-instruct"], ["HTTP status", result?.responseStatus ?? unavailable],
    ["Gateway request ID", result?.gatewayRequestId || (selected === "direct" ? "Not used" : unavailable)],
    ["Gateway decision", result?.gatewayErrorCode === "policy_violation" ? "Block · policy_violation" : selected === "direct" ? "Not used" : "Verify in Vision One Events"]]);
  rows("#debug-upstream", [["Workers AI state", result?.modelStatus || unavailable], ["Model mode", result?.modelMode || unavailable],
    ...promptContext(run?.prompt ?? prompt.value).fields.map((field, i) => [field.label, result?.fields?.[i] || unavailable]),
    ["Amount and purpose preserved", result ? (result.summaryPreserved === null ? "Not evaluated for this prompt" : result.summaryPreserved ? "Yes" : "Not confirmed") : unavailable]]);
  document.querySelector("#debug-observation").textContent = result?.modelMode === "live"
    ? "Workers AI completed inference. The input receipt is recorded by the Worker immediately before the model call. The displayed answer is the response returned through the selected route."
    : "No completed live inference is confirmed for this test. Missing evidence alone does not prove a Gateway block.";
  document.querySelector("#debug-result").textContent = result ? JSON.stringify(result, null, 2) : "No result received.";
  document.querySelector('#debug-request').textContent = JSON.stringify({model:'r5r5-summary',messages:[{role:'user',content:run?.prompt ?? prompt.value}]},null,2);
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
function renderComparison() {
  const takeaway = document.querySelector('#comparison-takeaway');
  const content = comparisonTakeaway(runs.direct, runs.gateway);
  takeaway.hidden = !content; takeaway.replaceChildren();
  if (content) {
    const heading = document.createElement('h2'); heading.textContent = content.title; takeaway.append(heading);
    paragraph(takeaway, content.text);
  }
}
function renderResult(mode, result) {
  const panel = panels[mode]; panel.replaceChildren();
  const view = describeRedaction(mode, result);
  const outcome = document.createElement('div'); outcome.className = 'result-verdict'; outcome.dataset.tone = view.tone;
  const headline = document.createElement('h3'); headline.textContent = view.title; outcome.append(headline);
  paragraph(outcome, view.detail); panel.append(outcome);
  const heading = document.createElement('h3'); heading.className = 'result-section-title'; heading.textContent = 'Raw input received by the model'; panel.append(heading);
  if (view.receivedText) {
    const raw = document.createElement('pre'); raw.className = 'redaction-raw-input';
    raw.dataset.mode = mode; raw.textContent = view.receivedText;
    panel.append(raw);
  } else paragraph(panel, 'No verified model-input receipt is available for this run.', 'redaction-label');
  const response = document.createElement('section'); response.className = 'refund-answer';
  const responseTitle = document.createElement('h3'); responseTitle.textContent = 'AI response'; response.append(responseTitle);
  if (result.reply) paragraph(response, result.reply, 'redaction-model-response');
  else paragraph(response, 'No model answer was returned.', 'redaction-label');
  const checkText = !view.task ? 'Task check: not evaluated for this custom prompt' : view.taskPreserved ? `Task check: ${view.task.currency} ${view.task.amount} + ${view.task.purpose} retained` : 'Task check: amount and purpose not confirmed';
  const check = paragraph(response, checkText, 'refund-task-check');
  check.dataset.preserved = String(view.taskPreserved); panel.append(response);
  const details = document.createElement('details'), summary = document.createElement('summary');
  details.className = 'redaction-received'; summary.textContent = 'View request evidence'; details.append(summary);
  paragraph(details, `HTTP ${result.responseStatus} · ${result.model || 'Model not confirmed'}`, 'redaction-label');
  if (result.gatewayRequestId) paragraph(details, 'Gateway request ID ' + result.gatewayRequestId, 'redaction-label');
  panel.append(details); renderComparison();
}
async function responseJson(response) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "The live demo could not be reached.");
  return data;
}
async function sendRoute(mode, submittedPrompt) {
  selected = mode;
  const run = runs[mode] = { mode, prompt: submittedPrompt, status: "Submitting", id: null, started: new Date().toISOString(), elapsedMs: null, result: null, timeline: [] };
  const trace = message => { run.timeline.push({ elapsedMs: Date.now() - Date.parse(run.started), message }); renderDebug(); };
  renderComparison();
  show(mode, "In progress · Sending the live request…"); trace("Submitted a fresh inference job with the edited prompt.");
  try {
    const queued = await responseJson(await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode, prompt: submittedPrompt }) }));
    run.id = queued.id; run.status = "Processing"; trace("Job accepted for " + mode + " delivery.");
    const until = Date.now() + 160000;
    while (Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, 2200));
      const job = await responseJson(await fetch(endpoint + "/" + encodeURIComponent(run.id)));
      if (job.mode !== mode) throw new Error("The returned run does not match this comparison side.");
      if (job.status === "failed") throw new Error("The live request did not complete. No example reply was substituted.");
      if (job.status === "done") {
        if (job.result.originalText !== submittedPrompt) throw new Error("The returned result does not match the submitted prompt.");
        run.result = job.result; run.status = "Completed"; renderResult(mode, job.result);
        trace("Received transport result and Worker-recorded model evidence."); return;
      }
      if (job.status === "running" && run.status !== "Running") {
        run.status = "Running"; trace("Request processing started.");
        show(mode, mode === "direct" ? "In progress · Sending directly to Workers AI…" : "In progress · Sending through AI Gateway to Workers AI…");
      }
    }
    throw new Error("This run timed out. Reload before starting another test.");
  } catch (error) { run.status = "Failed"; show(mode, error.message); trace("No successful outcome is confirmed."); }
  finally { run.elapsedMs = Date.now() - Date.parse(run.started); renderDebug(); }
}
function fitPrompt() { prompt.style.height = 'auto'; prompt.style.height = prompt.scrollHeight + 'px'; }
window.addEventListener('resize', fitPrompt);
fitPrompt();
let busy = false;
function clearResults() {
  runs.direct = runs.gateway = null;
  for (const mode of ['direct','gateway']) {
    panels[mode].replaceChildren();
    paragraph(panels[mode], 'Ready · Send the prompt to compare this route.', 'result-waiting');
  }
  renderComparison(); renderDebug();
}
form.addEventListener('submit', async event => {
  event.preventDefault(); if (busy) return;
  let submittedPrompt;
  try { submittedPrompt = validatePrompt(prompt.value); }
  catch (error) { promptError.textContent = error.message; promptError.hidden = false; return; }
  promptError.hidden = true; busy = true; send.disabled = newComparison.disabled = prompt.disabled = true;
  clearResults();
  show('gateway', 'In progress · Sending Without Gateway first, then through Gateway…');
  try { for (const route of ['direct','gateway']) await sendRoute(route, submittedPrompt); }
  finally { busy = false; send.disabled = newComparison.disabled = prompt.disabled = false; }
});
prompt.addEventListener('input', () => { fitPrompt(); promptError.hidden = true; clearResults(); });
prompt.addEventListener('keydown', event => {
  if (event.key === 'Enter' && (event.ctrlKey || event.metaKey) && !busy) { event.preventDefault(); form.requestSubmit(); }
});
newComparison.addEventListener('click', () => { if (busy) return; prompt.value = fixtureBody; fitPrompt(); promptError.hidden = true; clearResults(); prompt.focus(); });
renderDebug();
