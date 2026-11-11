import { diagnosticResult, diagnosticObservation, requestTemplate } from "./debug.js";

const page = document.querySelector("#lr-app");

new ResizeObserver(() => {
  parent.postMessage({
    type: "gateway-preview-height",
    height: Math.ceil(page.getBoundingClientRect().height),
  }, location.origin);
}).observe(page);

const original = document.querySelector("#redaction-original");
const input = document.querySelector("#redaction-input");
const send = document.querySelector("#redaction-send");
const panel = document.querySelector("#redaction-result");
const endpoint = "/api/gateway/redaction";
const labels = ["Payment card", "Leia’s contact email", "Rebel dispatch phone", "Hangar API authorization"];
const debug = document.querySelector("#redaction-debug");
const debugToggle = document.querySelector("#redaction-debug-toggle");
const copy = document.querySelector("#debug-copy");
const timeline = document.querySelector("#debug-timeline");
let diagnostics = { status: "Not started", jobId: null, started: null, elapsedMs: null, result: null, timeline: [] };
const local = ["localhost", "127.0.0.1", "[::1]"].includes(location.hostname);
document.querySelector("#debug-local").hidden = !local;
document.querySelector("#debug-request").textContent = JSON.stringify(requestTemplate, null, 2);

debugToggle.addEventListener("click", () => {
  debug.hidden = !debug.hidden;
  debugToggle.setAttribute("aria-expanded", String(!debug.hidden));
});

function renderRows(selector, rows) {
  const list = document.querySelector(selector);
  list.replaceChildren();
  for (const [label, text] of rows) {
    const term = document.createElement("dt");
    const description = document.createElement("dd");
    term.textContent = label;
    description.textContent = text;
    list.append(term, description);
  }
}

function renderDebug() {
  const result = diagnostics.result;
  const unknown = "Not available";
  document.querySelector("#debug-state").textContent = diagnostics.status;
  renderRows("#debug-run", [
    ["Job ID", diagnostics.jobId || unknown],
    ["State", diagnostics.status],
    ["Started", diagnostics.started || unknown],
    ["Browser elapsed", diagnostics.elapsedMs === null ? unknown : (diagnostics.elapsedMs / 1000).toFixed(1) + " s"],
  ]);
  renderRows("#debug-gateway", [
    ["Model alias", "r5r5-summary"],
    ["HTTP status", result?.gatewayStatus ?? unknown],
    ["Request ID", result?.gatewayRequestId || unknown],
    ["Policy decision", result?.policyDecision || "Not reported by runner"],
    ["Matched policy", result?.matchedPolicy || "Not reported by runner"],
  ]);
  renderRows("#debug-upstream", [
    ["Receipt", result?.upstreamReceived === true ? "Received" : result?.upstreamReceived === false ? "No receipt observed" : unknown],
    ...labels.map((label, i) => [label, result?.fields[i] || unknown]),
    ["Summary preserved", result?.summaryPreserved === true ? "Yes" : result?.summaryPreserved === false ? "No" : unknown],
  ]);
  document.querySelector("#debug-observation").textContent = !result && diagnostics.status === "Failed"
    ? "The run ended without a Gateway result. Check the request timeline; no protection outcome is confirmed."
    : diagnosticObservation(result);
  document.querySelector("#debug-result").textContent = result ? JSON.stringify(result, null, 2) : "No result received.";
  copy.disabled = !diagnostics.started;
}

function trace(message) {
  const elapsedMs = Math.max(0, Date.now() - Date.parse(diagnostics.started));
  diagnostics.timeline.push({ elapsedMs, message });
  const item = document.createElement("li");
  const time = document.createElement("span");
  time.textContent = "+" + (elapsedMs / 1000).toFixed(1) + " s";
  item.append(time, document.createTextNode(message));
  timeline.append(item);
}

copy.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(JSON.stringify(diagnostics, null, 2));
    copy.textContent = "Copied";
  } catch { copy.textContent = "Copy unavailable"; }
  setTimeout(() => { copy.textContent = "Copy diagnostics"; }, 1800);
});
renderDebug();

original.addEventListener("click", () => {
  input.open = true;
  send.disabled = false;
  send.focus();
});

function show(text) {
  const line = document.createElement("p");
  line.textContent = text;
  panel.replaceChildren(line);
}

async function jsonResponse(response) {
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || "The Gateway demo could not be reached.");
  return body;
}

function showResult(result) {
  const masked = result.fields.filter((field) => field === "masked").length;
  show(result.upstreamReceived
    ? `Upstream received the request · ${masked} of 4 fields masked · HTTP ${result.gatewayStatus}`
    : `No upstream receipt · HTTP ${result.gatewayStatus}`);
  panel.firstChild.className = "redaction-outcome";
  const fields = document.createElement("dl");
  labels.forEach((label, index) => {
    const term = document.createElement("dt");
    const value = document.createElement("dd");
    term.textContent = label;
    value.textContent = result.fields[index];
    fields.append(term, value);
  });
  panel.append(fields);
  if (result.summaryPreserved) {
    const summary = document.createElement("p");
    summary.textContent = "The summary preserved THB 1,250 and the parking fee.";
    panel.append(summary);
  }
  if (result.gatewayRequestId) {
    const requestId = document.createElement("p");
    requestId.textContent = "Gateway request ID " + result.gatewayRequestId;
    panel.append(requestId);
  }
}

send.addEventListener("click", async () => {
  original.disabled = send.disabled = true;
  diagnostics = { status: "Submitting", jobId: null, started: new Date().toISOString(), elapsedMs: null, result: null, timeline: [] };
  timeline.replaceChildren();
  trace("Browser submitted the fixed synthetic fixture job.");
  renderDebug();
  show("Waiting for the EKS runner…");
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    trace("Worker job creation returned HTTP " + response.status + ".");
    const queued = await jsonResponse(response);
    diagnostics.jobId = queued.id;
    diagnostics.status = "Queued";
    trace("Job queued for the EKS runner.");
    renderDebug();
    const until = Date.now() + 110_000;
    while (Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 2200));
      const job = await jsonResponse(await fetch(endpoint + "/" + encodeURIComponent(queued.id)));
      if (job.status === "failed") {
        trace("Runner reported a failed job; no Gateway result was provided.");
        throw new Error("The EKS runner could not complete the test.");
      }
      if (job.status === "done") {
        diagnostics.result = diagnosticResult(job.result);
        diagnostics.status = "Completed";
        trace("Runner result received. Upstream evidence checked by runner.");
        showResult(job.result);
        return;
      }
      if (job.status === "running") {
        if (diagnostics.status !== "Running") trace("EKS runner claimed the job.");
        diagnostics.status = "Running";
        show("Sending the request through Gateway…");
        renderDebug();
      }
    }
    throw new Error("The Gateway demo timed out. Try again in a moment.");
  } catch (error) {
    diagnostics.status = "Failed";
    // Copy only this app's bounded error category, never arbitrary error bodies.
    trace("Run did not complete. Gateway protection remains unverified.");
    show(error.message);
  } finally {
    diagnostics.elapsedMs = Math.max(0, Date.now() - Date.parse(diagnostics.started));
    renderDebug();
    original.disabled = send.disabled = false;
  }
});
