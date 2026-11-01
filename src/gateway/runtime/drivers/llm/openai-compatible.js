import { httpJson } from "../../util.js";
import { emit } from "../../events.js";
import { interrupted, matchesBlock } from "../interruption.js";
export async function compatibleModel(ctx, messages, tools) {
  const c = ctx.cfg;
  if (!c.llmBase || !c.model || c.model === "not-selected")
    throw Error("Model endpoint and model id are not configured.");
  await emit(
    ctx,
    "llm_request",
    { model: c.model, preview: "Configured model request" },
    { target: { kind: "llm", name: c.model, url: c.llmBase } },
  );
  let r;
  try {
    r = await httpJson(c.llmBase.replace(/\/$/, "") + "/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(c.llmKey ? { Authorization: "Bearer " + c.llmKey } : {}),
      },
      body: JSON.stringify({ model: c.model, messages, tools, stream: false }),
    });
  } catch (error) {
    await emit(
      ctx,
      "error",
      { model: c.model, preview: error.message },
      { outcome: "interrupted" },
    );
    throw interrupted(
      "Model connection interrupted; security enforcement not verified.",
    );
  }
  const stopped =
    !r.ok || Boolean(r.data.error) || matchesBlock(r.raw, c.blockPattern);
  await emit(
    ctx,
    stopped ? "error" : "llm_response",
    { model: c.model, preview: r.raw.slice(0, 500) },
    {
      outcome: stopped ? "interrupted" : "ok",
      upstream: {
        status: r.status,
        body_preview: stopped ? r.raw.slice(0, 500) : "",
      },
    },
  );
  if (stopped)
    throw interrupted(
      "LLM request interrupted; security enforcement not verified.",
    );
  const message = r.data.choices?.[0]?.message;
  if (!message)
    throw interrupted("Model endpoint returned no supported response.");
  return message;
}
