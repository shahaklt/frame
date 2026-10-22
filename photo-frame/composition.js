// Composition helpers for the live camera.
// Coordinates are normalised to 0..1 unless noted.

const ASPECTS = {
  "1:1": [1, 1],
  "4:5": [4, 5],
  "9:16": [9, 16],
};

// Finds where the visual interest in a frame is. Edges are a cheap stand-in for
// "what the eye lands on": strong local contrast gets more weight, and a mild
// centre bias keeps flat, empty frames from drifting to a corner.
// `rgba` is ImageData.data for a small (ideally ~64px wide) frame.
function saliencyCentroid(rgba, width, height) {
  const luma = new Float32Array(width * height);
  for (let i = 0, p = 0; i < luma.length; i++, p += 4) {
    luma[i] = (0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]) / 255;
  }

  let total = 0;
  let sumX = 0;
  let sumY = 0;
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const i = y * width + x;
      const edge = Math.abs(luma[i] - luma[i + 1]) + Math.abs(luma[i] - luma[i + width]);
      const dx = (x / width - 0.5) * 2;
      const dy = (y / height - 0.5) * 2;
      const centreBias = 1 - 0.3 * Math.min(1, Math.hypot(dx, dy));
      const weight = edge * edge * centreBias;
      total += weight;
      sumX += weight * x;
      sumY += weight * y;
    }
  }

  if (total < 1e-6) return null;
  return { x: sumX / total / width, y: sumY / total / height };
}

// Largest crop of the source with the requested aspect ratio ([w, h]).
// With a subject, the crop is placed so the subject sits on a rule-of-thirds line:
// the left or right third depending on which side of the frame it is on, and the
// upper third for vertical placement (headroom). The crop is clamped to the source.
function cropFor(source, aspect, subject) {
  const ratio = aspect[0] / aspect[1];
  let w = source.width;
  let h = w / ratio;
  if (h > source.height) {
    h = source.height;
    w = h * ratio;
  }

  if (!subject) {
    return { x: (source.width - w) / 2, y: (source.height - h) / 2, width: w, height: h };
  }

  const tx = subject.x < 0.5 ? 1 / 3 : 2 / 3;
  const ty = 1 / 3;
  const x = subject.x * source.width - tx * w;
  const y = subject.y * source.height - ty * h;
  return {
    x: clamp(x, 0, source.width - w),
    y: clamp(y, 0, source.height - h),
    width: w,
    height: h,
  };
}

// Eases the current crop toward the target so auto-framing glides instead of jumping.
function smoothCrop(current, target, amount = 0.12) {
  return {
    x: current.x + (target.x - current.x) * amount,
    y: current.y + (target.y - current.y) * amount,
    width: current.width + (target.width - current.width) * amount,
    height: current.height + (target.height - current.height) * amount,
  };
}

function clamp(v, min, max) {
  return v < min ? min : v > max ? max : v;
}

if (typeof module !== "undefined") {
  module.exports = { ASPECTS, saliencyCentroid, cropFor, smoothCrop };
}
