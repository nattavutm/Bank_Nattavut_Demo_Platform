import { readdir } from "node:fs/promises";
import { spawnSync } from "node:child_process";
async function check(dir) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const path = dir + "/" + e.name;
    if (e.isDirectory()) await check(path);
    else if (path.endsWith(".js")) {
      const r = spawnSync(process.execPath, ["--check", path], {
        stdio: "inherit",
      });
      if (r.status) process.exit(r.status);
    }
  }
}
await check("src/gateway");
await check("public/gateway");
