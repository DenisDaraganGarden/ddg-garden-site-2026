// A compact analytic alpha mask for the far-flight representation. Keeping it
// as texture data rather than an onBeforeCompile edit means the stock standard
// material owns UVs, alpha testing, lights and logarithmic depth correctly.
export function createSeagullDistantSilhouetteAlpha(size = 64) {
  const safeSize = Math.max(8, Math.floor(size));
  const pixels = new Uint8Array(safeSize * safeSize * 4);
  for (let row = 0; row < safeSize; row += 1) {
    for (let column = 0; column < safeSize; column += 1) {
      const x = ((column + 0.5) / safeSize) * 2 - 1;
      const y = ((row + 0.5) / safeSize) * 2 - 1;
      const horizontal = Math.abs(x);
      // Two thin, raised wing strokes make the readable M/V flight profile.
      // The gap below each stroke deliberately remains transparent: at the
      // horizon it reads as a gull, not as a filled diamond or card.
      const wingCentreY = -0.045 - horizontal * 0.42;
      const wingThickness = 0.068 + (1 - horizontal) * 0.036;
      const wings = horizontal > 0.075
        && horizontal < 0.94
        && Math.abs(y - wingCentreY) < wingThickness;
      const body = ((x / 0.105) ** 2) + (((y + 0.035) / 0.27) ** 2) < 1;
      const tailProgress = (y - 0.18) / 0.34;
      const tail = tailProgress > 0
        && tailProgress < 1
        && horizontal < 0.105 * (1 - tailProgress);
      const alpha = body || wings || tail ? 255 : 0;
      const offset = (row * safeSize + column) * 4;
      // Three's alphaMap shader samples the green channel.
      pixels[offset] = 255;
      pixels[offset + 1] = alpha;
      pixels[offset + 2] = 255;
      pixels[offset + 3] = alpha;
    }
  }
  return pixels;
}
