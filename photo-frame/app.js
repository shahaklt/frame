const ASPECTS = {
  "1:1": [1, 1],
  "4:5": [4, 5],
  "9:16": [9, 16],
};

const PREVIEW_WIDTH = 1080;
const EXPORT_WIDTH = 2400;

const state = {
  image: null,
  aspect: "1:1",
  filter: "none",
  border: 6,
  frameColor: "#ffffff",
  caption: "",
};

const els = {
  file: document.getElementById("file"),
  placeholder: document.getElementById("placeholder"),
  preview: document.getElementById("preview"),
  controls: document.getElementById("controls"),
  save: document.getElementById("save"),
  border: document.getElementById("border"),
  frameColor: document.getElementById("frameColor"),
  caption: document.getElementById("caption"),
};

els.file.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    state.image = await loadImage(file);
    els.placeholder.hidden = true;
    els.preview.hidden = false;
    els.controls.hidden = false;
    els.save.disabled = false;
    scheduleRender();
  } catch (error) {
    alert("That file could not be opened as an image.");
  } finally {
    event.target.value = "";
  }
});

for (const group of document.querySelectorAll(".segmented")) {
  group.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    for (const other of group.querySelectorAll("button")) {
      other.setAttribute("aria-pressed", String(other === button));
    }
    state[group.dataset.group] = button.dataset.value;
    scheduleRender();
  });
}

els.border.addEventListener("input", () => {
  state.border = Number(els.border.value);
  scheduleRender();
});

els.frameColor.addEventListener("input", () => {
  state.frameColor = els.frameColor.value;
  scheduleRender();
});

els.caption.addEventListener("input", () => {
  state.caption = els.caption.value.trim();
  scheduleRender();
});

els.save.addEventListener("click", saveImage);

let renderQueued = false;
function scheduleRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (state.image) renderTo(els.preview, state.image, state, PREVIEW_WIDTH);
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("load failed"));
    };
    img.src = url;
  });
}

// Draws the framed photo onto `canvas` at `width` pixels wide.
// Used for both the live preview and the full-size export.
function renderTo(canvas, image, opts, width) {
  const [aw, ah] = ASPECTS[opts.aspect];
  const w = width;
  const h = Math.round((w * ah) / aw);
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d");
  const pad = Math.round((w * opts.border) / 200);
  const captionH = opts.caption ? Math.round(w * 0.1) : 0;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2 - captionH;

  ctx.fillStyle = opts.frameColor;
  ctx.fillRect(0, 0, w, h);

  // Cover-fit the photo into the inner box, centered.
  const scale = Math.max(innerW / image.naturalWidth, innerH / image.naturalHeight);
  const sw = innerW / scale;
  const sh = innerH / scale;
  const sx = (image.naturalWidth - sw) / 2;
  const sy = (image.naturalHeight - sh) / 2;
  ctx.drawImage(image, sx, sy, sw, sh, pad, pad, innerW, innerH);

  if (opts.filter !== "none") {
    const data = ctx.getImageData(pad, pad, innerW, innerH);
    applyFilter(data.data, opts.filter);
    ctx.putImageData(data, pad, pad);
  }

  if (opts.caption) {
    const textColor = isDark(opts.frameColor) ? "#ffffff" : "#111111";
    ctx.fillStyle = textColor;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `500 ${Math.round(captionH * 0.4)}px -apple-system, system-ui, sans-serif`;
    ctx.fillText(opts.caption, w / 2, h - captionH / 2, w - pad * 2);
  }
}

function applyFilter(px, name) {
  for (let i = 0; i < px.length; i += 4) {
    let r = px[i];
    let g = px[i + 1];
    let b = px[i + 2];

    if (name === "warm") {
      r = clamp(r * 1.08 + 8);
      g = clamp(g * 1.02);
      b = clamp(b * 0.88);
    } else if (name === "fade") {
      // Lift the blacks and soften contrast, like a faded print.
      r = clamp(r * 0.85 + 30);
      g = clamp(g * 0.85 + 30);
      b = clamp(b * 0.85 + 34);
    } else if (name === "mono") {
      const y = clamp(0.299 * r + 0.587 * g + 0.114 * b);
      r = g = b = y;
    }

    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }
}

function clamp(v) {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function isDark(hex) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("encode failed"))), "image/jpeg", 0.92);
  });
}

async function saveImage() {
  if (!state.image) return;
  els.save.disabled = true;
  const label = els.save.textContent;
  els.save.textContent = "Saving…";

  try {
    const full = document.createElement("canvas");
    renderTo(full, state.image, state, EXPORT_WIDTH);
    const blob = await canvasToBlob(full);
    const file = new File([blob], `photo-frame-${Date.now()}.jpg`, { type: "image/jpeg" });

    // On iPhone this opens the share sheet, which includes "Save Image".
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = file.name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (error) {
    alert("Could not save the image.");
  } finally {
    els.save.disabled = false;
    els.save.textContent = label;
  }
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
