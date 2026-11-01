// Stream observations, never infer a security decision from a missing event.
export function compareStream(env, scenarioId, options, runScenario) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        let open = true;
        const send = (value) => {
          if (open)
            try {
              controller.enqueue(encoder.encode(JSON.stringify(value) + "\n"));
            } catch {
              open = false;
            }
        };
        send({ type: "status", status: "in_progress" });
        try {
          const [unprotected, protectedResult] = await Promise.all(
            ["unprotected", "protected"].map((profile) =>
              runScenario(env, scenarioId, profile, {
                ...options,
                stream: (event) => send({ type: "event", profile, event }),
              }),
            ),
          );
          send({ type: "result", unprotected, protected: protectedResult });
        } catch (error) {
          send({ type: "error", error: error.message });
        }
        if (open) controller.close();
      },
    }),
    {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-store",
      },
    },
  );
}
