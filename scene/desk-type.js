export const deskMincho = '"Yu Mincho", "Hiragino Mincho ProN", "Noto Serif CJK JP", "Noto Serif JP", "Study Mincho", serif';

// Canvas text does not repaint itself when a downloaded font becomes available.
export function finishCanvasType(texture, redraw, onTextureLoad) {
  const fonts = document.fonts;
  if (fonts?.status !== 'loading' || !fonts.ready) return;
  let live = true;
  const disposed = () => { live = false; };
  texture.addEventListener('dispose', disposed);
  fonts.ready.then(() => {
    texture.removeEventListener('dispose', disposed);
    if (!live) return;
    redraw();
    texture.needsUpdate = true;
    onTextureLoad?.();
  });
}
