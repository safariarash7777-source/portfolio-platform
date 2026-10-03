/** Optional isolated Docker transport for DB tests on Windows without a host psql. */
import { execFileSync as execNative, spawnSync as spawnNative, execFile, type ExecFileSyncOptions, type SpawnSyncOptions } from "node:child_process";
import { relative } from "node:path";
function command(file: string, args: readonly string[]) {
  const container = process.env.TEST_POSTGRES_CONTAINER;
  if (!container || file !== "psql") return { file, args: [...args] };
  if (container !== "portfolio-v1-synthetic-db") throw new Error("Only the dedicated synthetic DB container is allowed");
  const translated = [...args];
  const index = translated.indexOf("-f");
  if (index >= 0) translated[index + 1] = `/workspace/${relative(process.cwd(), translated[index + 1]).replaceAll("\\", "/")}`;
  return { file: "docker", args: ["exec", container, "psql", "-U", "postgres", ...translated] };
}
export function execFileSync(file: string, args: readonly string[], options: ExecFileSyncOptions & { encoding: "utf8" }): string {
  const cmd = command(file, args);
  return execNative(cmd.file, cmd.args, options) as unknown as string;
}
export function spawnSync(file: string, args: readonly string[], options: SpawnSyncOptions & { encoding: "utf8" }) {
  const cmd = command(file, args);
  return spawnNative(cmd.file, cmd.args, options);
}
export function psqlAsync(args: string[], env: NodeJS.ProcessEnv): Promise<string> {
  const cmd = command("psql", args);
  return new Promise((resolve, reject) => execFile(cmd.file, cmd.args, { env, encoding: "utf8" }, (error, stdout, stderr) => {
    if (error) reject(new Error(stderr)); else resolve(stdout);
  }));
}
