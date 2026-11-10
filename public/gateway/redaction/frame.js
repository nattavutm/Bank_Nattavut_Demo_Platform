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
  show("Waiting for the EKS runner…");
  try {
    const queued = await jsonResponse(await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    }));
    const until = Date.now() + 110_000;
    while (Date.now() < until) {
      await new Promise((resolve) => setTimeout(resolve, 2200));
      const job = await jsonResponse(await fetch(endpoint + "/" + encodeURIComponent(queued.id)));
      if (job.status === "failed") throw new Error("The EKS runner could not complete the test.");
      if (job.status === "done") {
        showResult(job.result);
        return;
      }
      if (job.status === "running") show("Sending the request through Gateway…");
    }
    throw new Error("The Gateway demo timed out. Try again in a moment.");
  } catch (error) {
    show(error.message);
  } finally {
    original.disabled = send.disabled = false;
  }
});
