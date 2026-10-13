// In-process TypeScript compilation avoids tsx/esbuild subprocesses under the offline guard.
const { readFileSync } = require("node:fs");
const ts = require("typescript");
require.extensions[".ts"] = (loaded, filename) => {
  const source = readFileSync(filename, "utf8");
  loaded._compile(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: filename,
  }).outputText, filename);
};
require("../../app/(auth)/login/page.test.ts");
require("../../app/(auth)/login/callback-error.test.ts");
require("../../app/auth/callback/route.test.ts");
require("../../components/account/returnPath.test.ts");
