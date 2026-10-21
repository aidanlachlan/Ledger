import { describe, expect, it } from "vitest";
import { findPaper, paperThreshold, stretchContrast } from "./scan-image";

// Synthetic 200 × 100 photo: a dark background with a bright receipt at
// x 60–139, y 10–89.
function photo() {
  const width = 200,
    height = 100;
  const gray = new Uint8Array(width * height).fill(60);
  for (let y = 10; y < 90; y++)
    for (let x = 60; x < 140; x++) gray[y * width + x] = 220;
  return { gray, width, height };
}

describe("scan image cleanup", () => {
  it("splits paper from background", () => {
    const t = paperThreshold(photo().gray);
    expect(t).toBeGreaterThanOrEqual(60);
    expect(t).toBeLessThan(220);
  });
  it("finds the receipt and trims just inside its edges", () => {
    const { gray, width, height } = photo();
    expect(findPaper(gray, width, height)).toEqual({
      x: 61,
      y: 10,
      width: 78,
      height: 80,
    });
  });
  it("keeps the whole image when there is no clear receipt", () => {
    const flat = new Uint8Array(200 * 100).fill(200);
    expect(findPaper(flat, 200, 100)).toEqual({
      x: 0,
      y: 0,
      width: 200,
      height: 100,
    });
    const { gray, width, height } = photo();
    for (let i = 0; i < gray.length; i++) if (i % width > 70) gray[i] = 60;
    expect(findPaper(gray, width, height)).toMatchObject({ x: 0, width: 200 });
  });
  it("stretches faded contrast to full range", () => {
    const gray = new Uint8Array(1000);
    for (let i = 0; i < gray.length; i++) gray[i] = i < 500 ? 100 : 180;
    stretchContrast(gray);
    expect(gray[0]).toBe(0);
    expect(gray[999]).toBe(255);
  });
});
