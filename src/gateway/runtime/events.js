export async function emit(ctx, type, data = {}, options = {}) {
  const event = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    run_id: ctx.runId,
    scenario_id: ctx.scenario?.id || null,
    profile: ctx.profile,
    actor: {
      id: ctx.actor.id,
      type: ctx.actor.type,
      owner: ctx.actor.owner || null,
    },
    surface: ctx.scenario?.surface || "direct_tool",
    type,
    target: options.target || {
      kind: "mcp",
      name: "LeakReady",
      url: "local://leakready",
    },
    data: {
      tool: null,
      args: null,
      model: null,
      doc_ids: [],
      classifications: [],
      record_count: 0,
      preview: "",
      ...data,
    },
    outcome: options.outcome || "ok",
    upstream: options.upstream || { status: null, body_preview: "" },
    damage: options.damage || {},
    latency_ms: options.latency || 0,
    execution_mode: ctx.executionMode || "scripted_tool_replay",
    simulated_actions: true,
  };
  await ctx.db
    .prepare(
      "INSERT INTO events(id,ts,run_id,scenario_id,profile,actor_id,type,surface,json) VALUES(?,?,?,?,?,?,?,?,?)",
    )
    .bind(
      event.id,
      event.ts,
      event.run_id,
      event.scenario_id,
      event.profile,
      event.actor.id,
      event.type,
      event.surface,
      JSON.stringify(event),
    )
    .run();
  // D1 is the authoritative journal. KV is a TTL mirror; it is not used for atomic counters.
  await ctx.env.LR_EVENTS.put(
    "evt:" + event.ts + ":" + event.id,
    JSON.stringify(event),
    { expirationTtl: 604800 },
  );
  ctx.events.push(event);
  if (ctx.stream) ctx.stream(event);
  return event;
}
