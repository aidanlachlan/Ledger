// Copies the OCR engine into public/ocr so the browser loads it from Ledger
// itself, never a CDN. Runs after npm install; public/ocr is not committed.
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const out = join(process.cwd(), "public", "ocr");
const from = (pkg, file) =>
  join(dirname(require.resolve(`${pkg}/package.json`)), file);
const files = [
  [from("tesseract.js", "dist/worker.min.js"), "worker.min.js"],
  // The worker picks one of these by the device's SIMD support.
  ...["", "-simd", "-relaxedsimd"].map((kind) => [
    from("tesseract.js-core", `tesseract-core${kind}-lstm.wasm.js`),
    `tesseract-core${kind}-lstm.wasm.js`,
  ]),
  [
    from("@tesseract.js-data/eng", "4.0.0_best_int/eng.traineddata.gz"),
    "eng.traineddata.gz",
  ],
];
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const [source, name] of files) copyFileSync(source, join(out, name));
