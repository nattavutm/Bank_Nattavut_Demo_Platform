const root = document.querySelector("#lr-app");
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const icons = {
  send: '<path d="m21 3-7 18-4-7-7-4 18-7ZM10 14 21 3"/>',
  reset: '<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  data: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  activity: '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
};
const icon = (n) =>
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  icons[n] +
  "</svg>";
let scenarios = [],
  identities = [],
  profiles = null,
  selected = null,
  busy = false,
  result = null,
  damage = null,
  error = "",
  drawer = null,
  drawerData = null,
  table = "customers",
  progress = [];
async function api(path, method = "GET", body) {
  const r = await fetch("/api/gateway" + path.slice(4), {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (r.status === 401) {
    window.top.location.replace("/login");
    throw Error("Please sign in");
  }
  const j = await r.json();
  if (!r.ok) throw Error(j.error || "Demo request failed");
  return j;
}
const s = () => scenarios.find((x) => x.id === selected) || scenarios[0];
const actor = () => identities.find((i) => i.id === s()?.actor);
const groups = [
  { name: "Data leakage", codes: ["s01", "s02", "s03", "s04", "s05"] },
  { name: "Prompt & tool attacks", codes: ["s06", "s07", "s08", "s09"] },
  { name: "Agent misuse", codes: ["s10", "s11", "s12"] },
];
const descriptions = {
  s01: "An intern accesses confidential executive salary information.",
  s02: "An unapproved request reveals a confidential acquisition plan.",
  s03: "A sales user exports customer IDs and payment card data.",
  s04: "Customer information is pasted into a simulated public AI service.",
  s05: "A contractor finds an example credential in an internal runbook.",
  s06: "An instruction hidden in a support ticket redirects the agent to export customer data.",
  s07: "A poisoned document redirects the agent to send confidential salary information.",
  s08: "An instruction inside a customer note causes the agent to delete the record.",
  s09: "A malicious tool description redirects the agent to export customer data.",
  s10: "An over-privileged cleanup agent deletes five customer records.",
  s11: "An agent repeats 30 scripted model calls without a useful stopping condition.",
  s12: "A personal MCP client exports company customer information.",
};
const metrics = [
  ["pii_records_exposed", "PII records disclosed"],
  ["pii_records_sent_external", "PII records in attacker sink"],
  ["confidential_docs_exposed", "Confidential documents disclosed"],
  [
    "confidential_docs_sent_external",
    "Confidential documents in attacker sink",
  ],
  ["secrets_exposed", "Example credentials disclosed"],
  ["records_deleted", "Customer records deleted"],
  ["llm_calls", "Scripted model calls"],
];
function impactRows(d) {
  return metrics
    .filter(([k]) => d?.[k] > 0)
    .map(
      ([k, title]) =>
        '<div class="lr-impact-row"><strong>' +
        d[k] +
        "</strong><span>" +
        title +
        "</span></div>",
    )
    .join("");
}
function trigger() {
  const text = s().trigger,
    hidden = s().hidden_span;
  if (!text) return "";
  const at = hidden ? text.indexOf(hidden) : -1;
  return (
    '<div class="lr-trigger"><span>UNTRUSTED ' +
    (s().code === "s06"
      ? "TICKET"
      : s().code === "s09"
        ? "TOOL DESCRIPTION"
        : s().code === "s08"
          ? "CRM NOTE"
          : "SOURCE") +
    "</span><p>" +
    (at < 0
      ? esc(text)
      : esc(text.slice(0, at)) +
        "<mark>" +
        esc(hidden) +
        "</mark>" +
        esc(text.slice(at + hidden.length))) +
    "</p>" +
    (at >= 0
      ? "<small>Highlighted text is the injected instruction.</small>"
      : "") +
    "</div>"
  );
}
function panel(profile) {
  const protectedSide = profile === "protected",
    r = result?.[profile],
    notConnected = protectedSide && !profiles?.protected?.configured;
  const title = protectedSide
    ? "Protected by " + (profiles?.protected?.label || "AI Gateway")
    : "Without protection";
  let content = "";
  if (notConnected)
    content =
      '<div class="lr-panel-empty">' +
      icon("lock") +
      "<h3>Not connected</h3><p>Connect a protection layer here later.<br>No protected result is being simulated.</p></div>";
  else if (busy)
    content =
      '<div class="lr-panel-empty"><span class="lr-working"><i></i>Running the scripted demo…</span><p>Executing tools against synthetic demo data.</p></div><div class="lr-live-timeline" aria-live="polite">' +
      timeline({ events: progress }) +
      "</div>";
  else if (!r)
    content =
      '<div class="lr-panel-empty"><span class="lr-placeholder">Request → Tools → Outcome</span><p>Press Run demo to see the outcome.</p></div>';
  else {
    const isDamage = r.outcome === "DAMAGE DONE";
    content =
      '<div class="lr-result"><span class="lr-result-badge ' +
      (isDamage ? "lr-danger" : "lr-neutral") +
      '">' +
      esc(isDamage ? "LEAKED / DAMAGE DONE" : r.outcome) +
      '</span><span class="lr-replay">Scripted replay · Simulated business actions</span><div class="lr-impact">' +
      (impactRows(r.damage) || "<p>No synthetic impact was observed.</p>") +
      "</div>" +
      (r.error ? '<p class="lr-error">' + esc(r.error) + "</p>" : "") +
      '<div class="lr-timeline">' +
      timeline(r) +
      '</div><details class="lr-details"><summary>View response & evidence</summary><p>Run ' +
      esc(r.id) +
      "</p><pre>" +
      esc(r.reply || "No final response") +
      '</pre><button class="lr-text" data-export="' +
      profile +
      '">Download event JSON ↗</button></details></div>';
  }
  return (
    '<section class="lr-panel"><div class="lr-panel-title"><h2>' +
    esc(title) +
    "</h2><span>" +
    (notConnected
      ? "Coming soon"
      : protectedSide
        ? "Configured · Not verified"
        : "Unprotected target") +
    "</span></div>" +
    content +
    "</section>"
  );
}
function timeline(r) {
  const steps = r.events.filter((e) =>
    ["mcp_result", "egress", "retrieval", "error"].includes(e.type),
  );
  return (
    steps
      .slice(0, 10)
      .map((e) => {
        const label =
          e.type === "egress"
            ? "Simulated external delivery"
            : e.type === "retrieval"
              ? "Documents retrieved"
              : e.type === "error"
                ? "Run issue"
                : e.data.tool;
        return (
          '<div class="lr-step"><i></i><div><strong>' +
          esc(label) +
          "</strong><small>" +
          esc(e.data.preview.slice(0, 120)) +
          "</small></div></div>"
        );
      })
      .join("") +
    (steps.length > 10
      ? '<p class="lr-small">' +
        (steps.length - 10) +
        " more steps in the event log</p>"
      : "")
  );
}
function render() {
  if (!scenarios.length) return;
  const current = s();
  document.title = current.card_title + " · AI Gateway · LeakReady";
  root.innerHTML =
    '<div class="lr-embedded-tools"><span class="lr-local">PREVIEW · SCRIPTED</span><button data-open="data">Company data</button><button data-open="inbox">Attacker Inbox</button><button data-open="logs">Logs</button></div><div class="lr-workspace">' +
    '<main class="lr-main lr-case-main"><div class="lr-page-label"><nav class="lr-breadcrumb" aria-label="Breadcrumb"><span>AI Gateway</span><span aria-hidden="true">/</span><span aria-current="page">' +
    esc(current.card_title) +
    '</span></nav><button class="lr-text" id="lr-new" ' +
    (busy ? "disabled" : "") +
    ">" +
    icon("reset") +
    'Reset demo</button></div><div class="lr-case-intro"><span class="lr-eyebrow">' +
    esc(groups.find((g) => g.codes.includes(current.code))?.name) +
    "</span><h1>" +
    esc(current.card_title) +
    "</h1><p>" +
    esc(descriptions[current.code]) +
    '</p></div><section class="lr-request-area"><div class="lr-chips"><span>' +
    esc(current.chip) +
    "</span><span>Intended access: " +
    esc(actor()?.intended_access || actor()?.purpose) +
    "</span></div>" +
    (current.layer === "agentic" ? trigger() : "") +
    '<form id="lr-form" class="lr-composer"><div><span>' +
    (current.layer === "agentic" ? "Assigned task" : "Example request") +
    '</span><textarea id="lr-prompt" aria-label="Scenario request" readonly rows="2">' +
    esc(current.input) +
    '</textarea></div><button type="submit" id="lr-run" class="lr-run" ' +
    (busy ? "disabled" : "") +
    ' aria-label="Run demo">' +
    (busy ? '<span class="lr-spinner"></span>' : icon("send")) +
    '</button></form><div class="lr-under-composer"><span>Scripted replay · Synthetic environment · No live AI calls</span><button class="lr-text" id="lr-run-text" ' +
    (busy ? "disabled" : "") +
    ">" +
    (busy ? "Running…" : "Run demo " + icon("arrow")) +
    "</button></div></section>" +
    (error ? '<p class="lr-error" role="alert">' + esc(error) + "</p>" : "") +
    '<div class="lr-comparison">' +
    panel("unprotected") +
    panel("protected") +
    '</div><div class="lr-meter"><div><span class="lr-eyebrow">Cumulative simulated impact</span><strong>' +
    totalCaption() +
    '</strong></div><button class="lr-text" data-open="inbox">Open Attacker Inbox ↗</button></div><p class="lr-scope-note">OWASP LLM Top 10:2025 · Intended permissions are deliberately unenforced inside this synthetic company.</p></main></div><footer class="lr-footer"><span>All data is synthetic. Email/Slack delivery is a local sink. No real money or messages.</span><span>Powered by Bank Nattavut</span></footer><dialog id="lr-drawer" class="lr-drawer"><div class="lr-drawer-header"><h2>' +
    esc(
      drawer === "data"
        ? "Company data"
        : drawer === "inbox"
          ? "Attacker Inbox"
          : "Event log",
    ) +
    '</h2><button id="lr-close" aria-label="Close panel">' +
    icon("close") +
    '</button></div><div id="lr-drawer-content">' +
    drawerContent() +
    "</div></dialog>";
  document.querySelector("#lr-form").onsubmit = (e) => {
    e.preventDefault();
    run();
  };
  document.querySelector("#lr-run-text").onclick = run;
  document.querySelector("#lr-new").onclick = reset;
  root
    .querySelectorAll("[data-open]")
    .forEach((b) => (b.onclick = () => openDrawer(b.dataset.open)));
  document.querySelector("#lr-drawer").oncancel = () => {
    drawer = null;
    drawerData = null;
  };
  document.querySelector("#lr-close").onclick = () => {
    drawer = null;
    drawerData = null;
    document.querySelector("#lr-drawer").close();
  };
  root
    .querySelectorAll("[data-export]")
    .forEach((b) => (b.onclick = () => download(result[b.dataset.export])));
  if (drawer) {
    document.querySelector("#lr-drawer").showModal();
    wireDrawer();
  }
}
function totalCaption() {
  if (!damage) return "No demo run yet";
  const d = damage.unprotected;
  const parts = [];
  if (d.pii_records_exposed)
    parts.push(d.pii_records_exposed + " PII disclosures");
  if (d.pii_records_sent_external)
    parts.push(d.pii_records_sent_external + " PII records in sink");
  if (d.confidential_docs_exposed)
    parts.push(d.confidential_docs_exposed + " confidential disclosures");
  if (d.records_deleted) parts.push(d.records_deleted + " records deleted");
  if (d.secrets_exposed)
    parts.push(d.secrets_exposed + " example-key disclosures");
  if (d.confidential_docs_sent_external)
    parts.push(
      d.confidential_docs_sent_external + " confidential documents in sink",
    );
  if (d.llm_calls) parts.push(d.llm_calls + " fixture calls");
  return parts.join(" · ") || "No synthetic damage recorded";
}
function choose(id) {
  if (busy || !scenarios.some((c) => c.id === id)) return;
  selected = id;
  result = null;
  error = "";
  const u = new URL(location.href);
  u.searchParams.set("s", s().code);
  history.pushState({}, "", u);
  render();
}
async function run() {
  if (busy) return;
  busy = true;
  result = null;
  error = "";
  progress = [];
  render();
  try {
    const response = await fetch("/api/gateway/compare/" + selected, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/x-ndjson",
      },
      body: JSON.stringify({ mode: "fallback" }),
    });
    if (!response.ok) {
      const body = await response.json();
      throw Error(body.error || "Demo request failed");
    }
    const reader = response.body.getReader(),
      decoder = new TextDecoder();
    let buffer = "";
    function consume(line) {
      if (!line.trim()) return;
      const message = JSON.parse(line);
      if (message.type === "event" && message.profile === "unprotected") {
        progress.push(message.event);
        render();
      }
      if (message.type === "result")
        result = {
          unprotected: message.unprotected,
          protected: message.protected,
        };
      if (message.type === "error") throw Error(message.error);
    }
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) consume(line);
    }
    buffer += decoder.decode();
    consume(buffer);
    if (!result)
      throw Error(
        "The stream ended before a result was received. Inspect Logs before retrying.",
      );
    damage = await api("/api/damage");
  } catch (e) {
    error = e.message;
  } finally {
    busy = false;
    render();
  }
}
async function reset() {
  if (busy) return;
  busy = true;
  error = "";
  render();
  try {
    await api("/api/reset", "POST", {});
    result = null;
    damage = await api("/api/damage");
  } catch (e) {
    error = e.message;
  } finally {
    busy = false;
    render();
  }
}
async function openDrawer(kind) {
  drawer = kind;
  drawerData = null;
  render();
  try {
    drawerData = await api(
      kind === "data"
        ? "/api/data/" + table
        : kind === "inbox"
          ? "/api/inbox"
          : "/api/events",
    );
    render();
  } catch (e) {
    drawerData = { error: e.message };
    render();
  }
}
function drawerContent() {
  if (!drawer) return "";
  if (!drawerData) return '<p class="lr-small">Loading local data…</p>';
  if (drawerData.error) return "<p>" + esc(drawerData.error) + "</p>";
  if (drawer === "data") {
    const rows = drawerData.rows || [];
    const cols =
      table === "customers"
        ? ["id", "full_name", "thai_id", "credit_card", "classification"]
        : table === "employees"
          ? ["id", "full_name", "salary_thb", "classification"]
          : Object.keys(rows[0] || {}).slice(0, 5);
    return (
      '<div class="lr-data-tabs">' +
      ["customers", "employees", "tickets", "notes", "deals"]
        .map(
          (t) =>
            '<button data-table="' +
            t +
            '" class="' +
            (t === table ? "lr-active" : "") +
            '">' +
            t +
            "</button>",
        )
        .join("") +
      '</div><p class="lr-small">Synthetic records · ' +
      rows.length +
      ' rows · Intended permissions are not enforced.</p><div class="lr-table-wrap"><table><thead><tr>' +
      cols.map((c) => "<th>" + esc(c) + "</th>").join("") +
      "</tr></thead><tbody>" +
      rows
        .map(
          (r) =>
            "<tr>" +
            cols.map((c) => "<td>" + esc(r[c]) + "</td>").join("") +
            "</tr>",
        )
        .join("") +
      "</tbody></table></div>"
    );
  }
  if (drawer === "inbox") {
    const msgs = drawerData.messages || [];
    return (
      '<p class="lr-small">Local mailbox sink only. No email was sent to real recipients.</p>' +
      (!msgs.length
        ? '<div class="lr-inbox-empty">No simulated deliveries yet.<p>Try “Poisoned ticket” in the Agentic demos.</p></div>'
        : msgs
            .map(
              (m) =>
                '<article class="lr-mail"><span>' +
                (m.external ? "EXTERNAL SINK" : "INTERNAL MAILBOX") +
                " · [SIMULATED]</span><h3>" +
                esc(m.subject) +
                "</h3><p>To: " +
                esc(m.to_address) +
                "</p><details><summary>View delivered content</summary><pre>" +
                esc(m.body) +
                "</pre></details></article>",
            )
            .join(""))
    );
  }
  const events = drawerData.events || [];
  return (
    '<p class="lr-small">' +
    events.length +
    " actual preview events · Scripted replay is not live agent reasoning.</p>" +
    events
      .map(
        (e) =>
          '<details class="lr-log"><summary><span>' +
          esc(e.type) +
          "</span> " +
          esc(e.data.tool || e.data.preview.slice(0, 60)) +
          " <small>" +
          esc(e.actor.id) +
          "</small></summary><pre>" +
          esc(JSON.stringify(e, null, 2)) +
          "</pre></details>",
      )
      .join("")
  );
}
function wireDrawer() {
  root.querySelectorAll("[data-table]").forEach(
    (b) =>
      (b.onclick = () => {
        table = b.dataset.table;
        openDrawer("data");
      }),
  );
}
function download(r) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob([JSON.stringify(r, null, 2)], { type: "application/json" }),
  );
  a.download = "leakready-" + r.id + ".json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
window.addEventListener("popstate", () => {
  if (busy) return;
  const code = new URL(location.href).searchParams.get("s");
  const current =
    scenarios.find((c) => c.code === code || c.id === code) ||
    scenarios.find((c) => c.code === "s03");
  if (!current) return;
  selected = current.id;
  result = null;
  error = "";
  render();
});
try {
  const [data, p, d] = await Promise.all([
    api("/api/scenarios"),
    api("/api/profiles"),
    api("/api/damage"),
  ]);
  scenarios = data.scenarios;
  identities = data.identities;
  profiles = p;
  damage = d;
  const q = new URL(location.href).searchParams.get("s");
  const picked =
    scenarios.find((x) => x.code === q || x.id === q) ||
    scenarios.find((x) => x.code === "s03");
  selected = picked.id;
  render();
} catch (e) {
  root.innerHTML = '<p class="lr-loading">' + esc(e.message) + "</p>";
}

new ResizeObserver(() =>
  parent.postMessage(
    {
      type: "gateway-preview-height",
      height:
        Math.ceil(
          document.querySelector("#lr-app").getBoundingClientRect().height,
        ) + 2,
    },
    location.origin,
  ),
).observe(document.querySelector("#lr-app"));
