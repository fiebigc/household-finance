/**
 * Writes app-icon.source.svg + public/favicon.svg: black circle + Comfortaa (600) "$" as vector paths.
 * Requires: opentype.js, wawoff2; font from @fontsource/comfortaa (WOFF2).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import decompress from "wawoff2/decompress.js";
import opentype from "opentype.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const woff2Path = path.join(
  root,
  "node_modules/@fontsource/comfortaa/files/comfortaa-latin-600-normal.woff2",
);

if (!fs.existsSync(woff2Path)) {
  console.error("Missing font file. Run: npm install @fontsource/comfortaa");
  process.exit(1);
}

const ttfBuffer = await decompress(fs.readFileSync(woff2Path));
const font = opentype.parse(ttfBuffer);
const fontSize = 580;
const b = font.getPath("$", 0, 0, fontSize).getBoundingBox();
const cx = (b.x1 + b.x2) / 2;
const cy = (b.y1 + b.y2) / 2;
const dollarPath = font.getPath("$", -cx, -cy, fontSize);
const d = dollarPath.toPathData(2);

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024" aria-label="Dollar sign">
  <!-- Comfortaa weight 600 (latin), outlined for Tauri (no @font-face). Generate: npm run icons:build-dollar-svg -->
  <!-- opentype.js path coordinates match SVG y-down; do not vertically scale or the $ flips. -->
  <circle cx="512" cy="512" r="512" fill="#000000"/>
  <g transform="translate(512, 512)">
    <path fill="#ffffff" d="${d}"/>
  </g>
</svg>
`;

const outIcon = path.join(root, "src-tauri/icons/app-icon.source.svg");
const outFavicon = path.join(root, "public/favicon.svg");
fs.writeFileSync(outIcon, svg);
fs.writeFileSync(outFavicon, svg);
console.log("Wrote", outIcon);
console.log("Wrote", outFavicon);
