const BRANCH = "codex/fundamental-read-reconnect-20261114";
/** @param {Readonly<Record<string, string | undefined>>} env */
export function approvedPreviewBuild(env) {
  return env.VERCEL === "1" && env.VERCEL_ENV === "preview" &&
    env.VERCEL_GIT_PROVIDER === "github" && env.VERCEL_GIT_COMMIT_REF === BRANCH &&
    typeof env.VERCEL_GIT_COMMIT_SHA === "string" && /^[0-9a-f]{40}$/.test(env.VERCEL_GIT_COMMIT_SHA);
}
