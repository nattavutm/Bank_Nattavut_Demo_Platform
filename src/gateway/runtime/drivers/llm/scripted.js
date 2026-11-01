import { emit } from "../../events.js";
import { recordDamage } from "../../damage.js";
export async function scriptedModel(ctx, messages) {
  const n = (ctx.modelCalls = (ctx.modelCalls || 0) + 1);
  await emit(
    ctx,
    "llm_request",
    {
      model: "scripted-fixture",
      preview: "Deterministic local model fixture; no external inference.",
    },
    {
      target: { kind: "llm", name: "scripted", url: "local://scripted-model" },
    },
  );
  await recordDamage(ctx, [
    { metric: "llm_calls", entity: "fixture-call-" + n },
  ]);
  const reply = {
    role: "assistant",
    content: "[SIMULATED] Scripted report revision " + n,
  };
  await emit(
    ctx,
    "llm_response",
    { model: "scripted-fixture", preview: reply.content },
    {
      target: { kind: "llm", name: "scripted", url: "local://scripted-model" },
    },
  );
  return reply;
}
