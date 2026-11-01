export async function workersAiModel(ctx, messages, tools) {
  if (!ctx.env.AI || ctx.cfg.model === "not-selected")
    throw Error(
      "Live Workers AI requires an owner-selected model and AI binding.",
    );
  const r = await ctx.env.AI.run(ctx.cfg.model, {
    messages,
    tools,
    max_tokens: 512,
  });
  return r;
}
