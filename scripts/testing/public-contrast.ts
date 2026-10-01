import { readFileSync, writeFileSync } from "node:fs";
import { contrastRatio, themeTokens } from "../../lib/core/contrast";
const css = readFileSync("app/globals.css", "utf8");
const pairs = [["--text", "--surface"], ["--text-2", "--bg"], ["--text-3", "--surface-2"], ["--heading", "--bg"], ["--gold-ink", "--surface"], ["--text-on-navy", "--navy-deep"], ["--gold-light", "--navy-deep"], ["--danger", "--surface"], ["--focus", "--surface"]];
const evidence = (["light", "dark"] as const).flatMap(theme => {
  const tokens = themeTokens(css, theme);
  return pairs.map(([foreground, background]) => ({ theme, foreground, background, ratio: Number(contrastRatio(tokens.get(foreground)!, tokens.get(background)!).toFixed(2)) }));
});
if (evidence.some(item => item.ratio < 4.5)) throw new Error("A public token pair fails normal-text AA");
writeFileSync("docs/ops/seasonal-program/next-05-evidence/contrast.json", JSON.stringify(evidence, null, 2) + "\n");
console.log(`Public contrast: ${evidence.length} token pairs pass AA`);
