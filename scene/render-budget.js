// Keep a native CSS pixel minimum and the original 2x ceiling. Very large
// Retina windows otherwise rasterize up to four full-screen copies per frame.
export function roomPixelRatio(width, height, pixelRatio = 1) {
  const nativeRatio = Number.isFinite(pixelRatio) ? Math.max(1, pixelRatio) : 1;
  const area = Math.max(1, width) * Math.max(1, height);
  return Math.min(nativeRatio, 2, Math.max(1, Math.sqrt(4200000 / area)));
}
