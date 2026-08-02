/**
 * Render the OG image locally using satori + @resvg/resvg-js
 * This proves Persian text renders correctly with Vazirmatn font.
 * Output: docs/assets/public-experience/og-image-qa.png
 */
import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");

// Load Vazirmatn font
// satori requires static-weight TTF (not variable fonts or woff2)
const fontDataRegular = await readFile("/tmp/Vazirmatn-Regular.ttf");
const fontDataBold = await readFile("/tmp/Vazirmatn-Bold.ttf");

// JSX-like element tree (satori accepts plain objects)
const element = {
  type: "div",
  props: {
    style: {
      width: "1200px",
      height: "630px",
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      justifyContent: "flex-end",
      padding: "64px 72px",
      background: "linear-gradient(135deg, #0a1628 0%, #0d2045 55%, #1a3a6e 100%)",
      fontFamily: "Vazirmatn, sans-serif",
      direction: "rtl",
      position: "relative",
      overflow: "hidden",
    },
    children: [
      // Domain label
      {
        type: "div",
        props: {
          style: {
            position: "absolute",
            top: 52,
            right: 72,
            fontSize: 20,
            fontWeight: 400,
            color: "#60a5fa",
            display: "flex",
          },
          children: "arashsafari.ir",
        },
      },
      // Main title — \u202B = RLE (Right-to-Left Embedding) forces correct RTL word order in satori
      {
        type: "div",
        props: {
          style: {
            fontSize: 72,
            fontWeight: 800,
            color: "#f8fafc",
            lineHeight: 1.25,
            marginBottom: 18,
            display: "flex",
            textAlign: "right",
            maxWidth: "900px",
          },
          children: "\u202Bآرش صفری\u202C",
        },
      },
      // Subtitle
      {
        type: "div",
        props: {
          style: {
            fontSize: 30,
            fontWeight: 400,
            color: "#94a3b8",
            marginBottom: 44,
            display: "flex",
            textAlign: "right",
            maxWidth: "900px",
          },
          children: "\u202Bتحلیلگر و مشاور سرمایه‌گذاری · بازار سرمایهٔ ایران\u202C",
        },
      },
      // Pills container
      {
        type: "div",
        props: {
          style: {
            display: "flex",
            flexDirection: "row",
            gap: "14px",
            justifyContent: "flex-end",
          },
          children: ["\u202Bرصد بازار\u202C", "\u202Bکارنامهٔ تحلیل‌ها\u202C", "\u202Bبدون وعدهٔ سود\u202C"].map((label) => ({
            type: "div",
            props: {
              style: {
                fontSize: 18,
                fontWeight: 600,
                color: "#bfdbfe",
                background: "rgba(59,130,246,0.18)",
                border: "1px solid rgba(59,130,246,0.35)",
                borderRadius: "10px",
                padding: "10px 22px",
                display: "flex",
              },
              children: label,
            },
          })),
        },
      },
    ],
  },
};

console.log("Rendering OG image with satori...");

const svg = await satori(element, {
  width: 1200,
  height: 630,
  fonts: [
    {
      name: "Vazirmatn",
      data: fontDataRegular,
      style: "normal",
      weight: 400,
    },
    {
      name: "Vazirmatn",
      data: fontDataBold,
      style: "normal",
      weight: 700,
    },
  ],
});

console.log("Converting SVG to PNG...");

const resvg = new Resvg(svg, {
  fitTo: { mode: "width", value: 1200 },
});
const pngData = resvg.render();
const pngBuffer = pngData.asPng();

const outDir = path.join(projectRoot, "docs", "assets", "public-experience");
await mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, "og-image-qa.png");

import { writeFile } from "node:fs/promises";
await writeFile(outPath, pngBuffer);

console.log(`✓ OG image rendered: ${outPath}`);
console.log(`  Size: ${pngBuffer.length} bytes`);
console.log(`  Dimensions: 1200 × 630`);
