import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
const name = process.argv[2];
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const log = [];
let code = 0;
function run(args) {
  const r = spawnSync(process.execPath, args, { encoding: "utf8", env: { ...process.env, SKIP_LIVE: "1" }, maxBuffer: 20 * 1024 * 1024 });
  log.push(r.stdout ?? "", r.stderr ?? "");
  if (r.status !== 0) code = r.status ?? 1;
}
if (name === "core" || name === "calc") run(["node_modules/tsx/dist/cli.mjs", ...pkg.scripts[`test:${name}`].split(" ").slice(1)]);
else if (name === "relay") {
  for (const c of pkg.scripts["test:relay"].split(" && ")) {
    if (c.includes("--eval")) run(["--input-type=module", "--eval", "process.env.SKIP_LIVE='1'; await import('./relay/codal-engine.test.mjs')"]);
    else run(c.split(" ").slice(1));
    if (code) break;
  }
} else if (name === "lint") run(["node_modules/eslint/bin/eslint.js", ".", "--max-warnings=0"]);
else if (name === "typecheck") run(["node_modules/typescript/bin/tsc", "--noEmit", "--incremental", "false"]);
else if (name === "build") run(["node_modules/next/dist/bin/next", "build"]);
else throw new Error("Unknown check");
writeFileSync(`docs/ops/seasonal-program/next-07-evidence/${name}-tests.log`, log.join("\n").replace(/[ \t]+$/gm, "").trimEnd() + `\n${name} exit=${code}\n`);
process.stdout.write(log.join("\n").split("\n").slice(-15).join("\n") + `\n${name} exit=${code}\n`);
process.exitCode = code;
