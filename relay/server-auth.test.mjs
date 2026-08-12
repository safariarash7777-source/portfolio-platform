import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const SERVER_URL = pathToFileURL(fileURLToPath(new URL("./server.mjs", import.meta.url))).href;

function runProbe(token) {
  const probe = `
    import http from "node:http";
    import { server } from ${JSON.stringify(SERVER_URL)};

    const paths = ["/", "/debug", "/market.json", "/codal-raw", "/symbol.json", "/codal-list", "/codal-test"];
    const request = (path, headers = {}) => new Promise((resolve, reject) => {
      const req = http.request({ hostname: "127.0.0.1", port: server.address().port, path, headers }, (res) => {
        res.resume();
        res.on("end", () => resolve(res.statusCode));
      });
      req.on("error", reject);
      req.end();
    });

    server.listen(0, "127.0.0.1", async () => {
      try {
        const result = { health: await request("/healthz"), protected: {} };
        for (const path of paths) result.protected[path] = await request(path);
        if (${token === undefined ? "false" : "true"}) {
          result.debugWithToken = await request("/debug", { Authorization: "Bearer ${token ?? ""}" });
        }
        console.log(JSON.stringify(result));
        server.close(() => process.exit(0));
      } catch (error) {
        console.error(error);
        server.close(() => process.exit(1));
      }
    });
  `;

  return new Promise((resolve, reject) => {
    const env = { ...process.env, PORT: "0", BRSAPI_KEY: "", SUPABASE_URL: "", SUPABASE_SERVICE_ROLE_KEY: "" };
    if (token === undefined) delete env.RELAY_TOKEN;
    else env.RELAY_TOKEN = token;
    const child = spawn(process.execPath, ["--input-type=module", "--eval", probe], {
      cwd: fileURLToPath(new URL("..", import.meta.url)),
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`auth probe exited ${code}: ${stderr}`));
      try { resolve(JSON.parse(stdout.trim().split("\n").at(-1))); }
      catch (error) { reject(new Error(`invalid auth probe output: ${error.message}\n${stdout}\n${stderr}`)); }
    });
  });
}

test("relay keeps only /healthz public when RELAY_TOKEN is unset", async () => {
  const result = await runProbe(undefined);
  assert.equal(result.health, 200);
  for (const [path, status] of Object.entries(result.protected)) {
    assert.equal(status, 401, `${path} must fail closed without RELAY_TOKEN`);
  }
});

test("relay protects /debug when RELAY_TOKEN is configured", async () => {
  const result = await runProbe("gate2-test-token");
  assert.equal(result.health, 200);
  assert.equal(result.protected["/debug"], 401);
  assert.equal(result.debugWithToken, 200);
});
