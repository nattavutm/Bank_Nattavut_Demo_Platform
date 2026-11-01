import seed from "../data/seed.json" with { type: "json" };
import { profileDb } from "./util.js";
export async function resetDemo(env) {
  for (const profile of ["unprotected", "protected"]) {
    const db = profileDb(env, profile);
    if (
      (
        await db
          .prepare("SELECT count(*) AS n FROM runs WHERE status='running'")
          .first()
      ).n
    )
      throw Error("Wait for active runs before reset.");
  }
  for (const profile of ["unprotected", "protected"]) {
    const db = profileDb(env, profile),
      statements = [];
    for (const table of [
      "customers",
      "deals",
      "notes",
      "employees",
      "tickets",
      "runs",
      "events",
      "damage",
      "inbox",
    ])
      statements.push(db.prepare("DELETE FROM " + table));
    for (const [table, rows] of Object.entries(seed))
      for (const row of rows) {
        const cols = Object.keys(row);
        statements.push(
          db
            .prepare(
              "INSERT INTO " +
                table +
                " (" +
                cols.join(",") +
                ") VALUES(" +
                cols.map(() => "?").join(",") +
                ")",
            )
            .bind(...Object.values(row)),
        );
      }
    statements.push(
      db
        .prepare("UPDATE state SET value=? WHERE key='generation'")
        .bind(crypto.randomUUID()),
    );
    await db.batch(statements);
  }
  for (const namespace of [env.LR_EVENTS, env.LR_STATE]) {
    let cursor;
    do {
      const page = await namespace.list({ cursor, limit: 1000 });
      for (const key of page.keys) await namespace.delete(key.name);
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
  }
  return {
    ok: true,
    customers: 50,
    employees: 25,
    message: "[SIMULATED] Both isolated preview profiles have been reset.",
  };
}
