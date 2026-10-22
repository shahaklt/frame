// Film-style looks. Each entry describes a colour pipeline applied per pixel.
// `frame: "polaroid"` also switches the layout to an instant-film border.
const LOOKS = {
  warm: { contrast: 1, lift: 0.02, tint: [1.06, 1, 0.9], saturation: 1.05, vignette: 0.1, grain: 0, soften: 0 },
  fade: { contrast: 0.85, lift: 0.1, tint: [1.02, 1, 0.94], saturation: 0.8, vignette: 0.12, grain: 0.02, soften: 0.1 },
  mono: { contrast: 1.15, lift: 0.03, tint: [1, 1, 1], saturation: 0, vignette: 0.2, grain: 0.04, soften: 0 },
  // Instant film: lifted blacks, soft highlights, warm yellow cast, faded colour,
  // a dark corner falloff, fine grain and a slight softness from the lens.
  polaroid: {
    contrast: 0.9,
    lift: 0.09,
    tint: [1.07, 1.01, 0.86],
    saturation: 0.82,
    vignette: 0.28,
    grain: 0.035,
    soften: 0.2,
    frame: "polaroid",
  },
};

// Mutates the RGBA array `px` (width x height) in place.
function applyLook(px, width, height, look) {
  const src = new Uint8ClampedArray(px);
  const cx = width / 2;
  const cy = height / 2;
  const maxDist = Math.hypot(cx, cy);
  const soften = look.soften;
  const keep = 1 - soften;

  for (let y = 0; y < height; y++) {
    const yUp = (y > 0 ? y - 1 : y) * width;
    const yRow = y * width;
    const yDown = (y < height - 1 ? y + 1 : y) * width;

    for (let x = 0; x < width; x++) {
      const xLeft = x > 0 ? x - 1 : x;
      const xRight = x < width - 1 ? x + 1 : x;
      const i = (yRow + x) * 4;
      const left = (yRow + xLeft) * 4;
      const right = (yRow + xRight) * 4;
      const up = (yUp + x) * 4;
      const down = (yDown + x) * 4;

      // Blend each pixel with its four neighbours to soften the image slightly.
      let r = (src[i] * keep + ((src[left] + src[right] + src[up] + src[down]) / 4) * soften) / 255;
      let g = (src[i + 1] * keep + ((src[left + 1] + src[right + 1] + src[up + 1] + src[down + 1]) / 4) * soften) / 255;
      let b = (src[i + 2] * keep + ((src[left + 2] + src[right + 2] + src[up + 2] + src[down + 2]) / 4) * soften) / 255;

      const lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = lum + (r - lum) * look.saturation;
      g = lum + (g - lum) * look.saturation;
      b = lum + (b - lum) * look.saturation;

      const d = Math.hypot(x - cx, y - cy) / maxDist;
      const vignette = 1 - look.vignette * d * d;
      const grain = (Math.random() - 0.5) * 2 * look.grain;

      px[i] = finishChannel(r, look, look.tint[0], vignette, grain) * 255;
      px[i + 1] = finishChannel(g, look, look.tint[1], vignette, grain) * 255;
      px[i + 2] = finishChannel(b, look, look.tint[2], vignette, grain) * 255;
    }
  }
}

function finishChannel(v, look, tint, vignette, grain) {
  const contrasted = (v - 0.5) * look.contrast + 0.5;
  const lifted = look.lift + contrasted * (1 - look.lift);
  return clamp01(lifted * tint * vignette + grain);
}

function clamp01(v) {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

if (typeof module !== "undefined") {
  module.exports = { LOOKS, applyLook };
}
