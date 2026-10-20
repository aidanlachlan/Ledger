import { findPaper, stretchContrast } from "../../lib/scan-image";

// OCR reads receipt print best at about this width in pixels.
const TEXT_WIDTH = 1200;
const MAX_HEIGHT = 8000;
// Finding the paper does not need full resolution.
const PROBE_SIZE = 1600;

export type ReadProgress = { step: "loading" | "reading"; percent: number };

function context(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("This browser cannot read photos.");
  return { canvas, ctx };
}
function grayscale(data: Uint8ClampedArray): Uint8Array {
  const gray = new Uint8Array(data.length / 4);
  for (let i = 0; i < gray.length; i++)
    gray[i] =
      (data[i * 4] * 299 + data[i * 4 + 1] * 587 + data[i * 4 + 2] * 114) /
      1000;
  return gray;
}

// Crops the photo to the receipt, scales it to a readable size and turns it
// into high-contrast grayscale.
async function prepare(file: Blob): Promise<HTMLCanvasElement> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(
      1,
      PROBE_SIZE / Math.max(bitmap.width, bitmap.height),
    );
    const probe = context(
      Math.max(1, Math.round(bitmap.width * scale)),
      Math.max(1, Math.round(bitmap.height * scale)),
    );
    probe.ctx.drawImage(bitmap, 0, 0, probe.canvas.width, probe.canvas.height);
    const paper = findPaper(
      grayscale(
        probe.ctx.getImageData(0, 0, probe.canvas.width, probe.canvas.height)
          .data,
      ),
      probe.canvas.width,
      probe.canvas.height,
    );
    const sx = paper.x / scale,
      sy = paper.y / scale,
      sw = paper.width / scale,
      sh = paper.height / scale;
    const size = Math.min(TEXT_WIDTH / sw, MAX_HEIGHT / sh);
    const out = context(
      Math.max(1, Math.round(sw * size)),
      Math.max(1, Math.round(sh * size)),
    );
    out.ctx.imageSmoothingQuality = "high";
    out.ctx.drawImage(
      bitmap,
      sx,
      sy,
      sw,
      sh,
      0,
      0,
      out.canvas.width,
      out.canvas.height,
    );
    const image = out.ctx.getImageData(
      0,
      0,
      out.canvas.width,
      out.canvas.height,
    );
    const gray = grayscale(image.data);
    stretchContrast(gray);
    for (let i = 0; i < gray.length; i++)
      image.data[i * 4] =
        image.data[i * 4 + 1] =
        image.data[i * 4 + 2] =
          gray[i];
    out.ctx.putImageData(image, 0, 0);
    return out.canvas;
  } finally {
    bitmap.close();
  }
}

// Reads a receipt photo into text on this device. The photo and its text
// never leave the browser; the OCR engine loads from Ledger's own /ocr files.
export async function readReceipt(
  file: Blob,
  onProgress: (progress: ReadProgress) => void,
): Promise<string> {
  const image = await prepare(file);
  const { createWorker, PSM } = await import("tesseract.js");
  const worker = await createWorker("eng", 1, {
    workerPath: "/ocr/worker.min.js",
    corePath: "/ocr",
    langPath: "/ocr",
    workerBlobURL: false,
    logger: (message) =>
      onProgress({
        step: message.status === "recognizing text" ? "reading" : "loading",
        percent: Math.round(message.progress * 100),
      }),
  });
  try {
    await worker.setParameters({
      // Read the receipt as one block so each printed row stays one line.
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: "1",
    });
    const { data } = await worker.recognize(image);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
