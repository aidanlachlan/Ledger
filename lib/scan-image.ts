// Pixel cleanup for receipt photos before OCR. Works on a grayscale buffer
// (one byte per pixel) so it can be tested without a browser.

export type Rect = { x: number; y: number; width: number; height: number };

// Otsu's threshold: the brightness that best splits paper from background.
export function paperThreshold(gray: Uint8Array): number {
  const histogram = new Array<number>(256).fill(0);
  for (const value of gray) histogram[value]++;
  const total = gray.length;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * histogram[i];
  let below = 0,
    belowSum = 0,
    best = 0,
    threshold = 128;
  for (let i = 0; i < 256; i++) {
    below += histogram[i];
    if (!below || below === total) continue;
    belowSum += i * histogram[i];
    const above = total - below;
    const meanBelow = belowSum / below;
    const meanAbove = (sum - belowSum) / above;
    const between = below * above * (meanBelow - meanAbove) ** 2;
    if (between > best) {
      best = between;
      threshold = i;
    }
  }
  return threshold;
}

// The bounding box of the receipt: the columns, then rows within them, that
// are mostly paper. Returns the whole image when no clear receipt is found.
export function findPaper(
  gray: Uint8Array,
  width: number,
  height: number,
): Rect {
  const whole = { x: 0, y: 0, width, height };
  const threshold = paperThreshold(gray);
  const step = Math.max(1, Math.floor(Math.min(width, height) / 400));
  const bright = (x: number, y: number) => gray[y * width + x] > threshold;
  const columns: number[] = [];
  for (let x = 0; x < width; x += step) {
    let count = 0,
      samples = 0;
    for (let y = 0; y < height; y += step, samples++) if (bright(x, y)) count++;
    if (count > samples * 0.6) columns.push(x);
  }
  if (!columns.length) return whole;
  const left = columns[0],
    right = Math.min(width, columns.at(-1)! + step);
  if (right - left < width * 0.2) return whole;
  const rows: number[] = [];
  for (let y = 0; y < height; y += step) {
    let count = 0,
      samples = 0;
    for (let x = left; x < right; x += step, samples++)
      if (bright(x, y)) count++;
    if (count > samples * 0.5) rows.push(y);
  }
  if (!rows.length) return whole;
  const top = rows[0],
    bottom = Math.min(height, rows.at(-1)! + step);
  if (bottom - top < height * 0.2) return whole;
  // Trim a little inside the edges, where shadows and torn paper sit, unless
  // the receipt fills the photo.
  const inset =
    right - left >= width * 0.95 ? 0 : Math.round((right - left) * 0.015);
  return {
    x: left + inset,
    y: top,
    width: right - left - inset * 2,
    height: bottom - top,
  };
}

// Stretches brightness so the darkest 1% is black and the brightest 1% white.
export function stretchContrast(gray: Uint8Array): void {
  const histogram = new Array<number>(256).fill(0);
  for (const value of gray) histogram[value]++;
  const cut = gray.length * 0.01;
  let low = 0,
    high = 255,
    seen = 0;
  while (low < 255 && (seen += histogram[low]) <= cut) low++;
  seen = 0;
  while (high > 0 && (seen += histogram[high]) <= cut) high--;
  if (high <= low) return;
  const scale = 255 / (high - low);
  for (let i = 0; i < gray.length; i++)
    gray[i] = Math.max(0, Math.min(255, Math.round((gray[i] - low) * scale)));
}
