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

// Aspect chosen inside the camera. It is copied into `state.aspect` on capture.
let cameraAspect = state.aspect;

const els = {
  file: document.getElementById("file"),
  placeholder: document.getElementById("placeholder"),
  preview: document.getElementById("preview"),
  viewfinder: document.getElementById("viewfinder"),
  controls: document.getElementById("controls"),
  editBar: document.getElementById("editBar"),
  save: document.getElementById("save"),
  openCamera: document.getElementById("openCamera"),
  cameraControls: document.getElementById("cameraControls"),
  cameraBar: document.getElementById("cameraBar"),
  shutter: document.getElementById("shutter"),
  cancelCamera: document.getElementById("cancelCamera"),
  flipCamera: document.getElementById("flipCamera"),
  autoFrame: document.getElementById("autoFrame"),
  border: document.getElementById("border"),
  frameColor: document.getElementById("frameColor"),
  caption: document.getElementById("caption"),
};

els.file.addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    state.image = await loadImage(file);
    showEditor();
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
    setPressed(group, button.dataset.value);

    if (group.dataset.group === "camAspect") {
      cameraAspect = button.dataset.value;
      Camera.setAspect(cameraAspect);
      return;
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
els.openCamera.addEventListener("click", openCamera);
els.cancelCamera.addEventListener("click", closeCamera);
els.shutter.addEventListener("click", takePhoto);
els.flipCamera.addEventListener("click", () => {
  Camera.flip().catch(() => alert("Could not switch cameras."));
});
els.autoFrame.addEventListener("change", () => {
  Camera.setAutoFrame(els.autoFrame.checked);
});

if (!navigator.mediaDevices?.getUserMedia) {
  els.openCamera.disabled = true;
  els.openCamera.title = "Camera needs HTTPS and a supported browser";
}

function setPressed(group, value) {
  for (const button of group.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", String(button.dataset.value === value));
  }
}

function showEditor() {
  const hasImage = Boolean(state.image);
  els.viewfinder.hidden = true;
  els.cameraControls.hidden = true;
  els.cameraBar.hidden = true;
  els.editBar.hidden = false;
  els.placeholder.hidden = hasImage;
  els.preview.hidden = !hasImage;
  els.controls.hidden = !hasImage;
  els.save.disabled = !hasImage;
  scheduleRender();
}

async function openCamera() {
  cameraAspect = state.aspect;
  setPressed(document.querySelector('[data-group="camAspect"]'), cameraAspect);

  els.placeholder.hidden = true;
  els.preview.hidden = true;
  els.controls.hidden = true;
  els.editBar.hidden = true;
  els.viewfinder.hidden = false;
  els.cameraControls.hidden = false;
  els.cameraBar.hidden = false;

  try {
    await Camera.start({ aspect: cameraAspect, autoFrame: els.autoFrame.checked });
  } catch (error) {
    alert("Camera access was not allowed.");
    closeCamera();
  }
}

function closeCamera() {
  Camera.stop();
  showEditor();
}

function takePhoto() {
  const photo = Camera.capture();
  if (!photo) return;
  state.image = photo;
  state.aspect = cameraAspect;
  setPressed(document.querySelector('[data-group="aspect"]'), state.aspect);
  closeCamera();
}

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
  const look = LOOKS[opts.filter] || null;
  const polaroid = Boolean(look && look.frame === "polaroid");

  // Polaroid: thin even border with a deep strip along the bottom for the caption.
  // Other frames: even border, with a caption strip below the photo when needed.
  const pad = Math.round((w * opts.border) / 200);
  const side = polaroid ? Math.max(pad, Math.round(w * 0.045)) : pad;
  const stripH = polaroid ? Math.round(w * 0.2) : opts.caption ? Math.round(w * 0.1) : 0;
  const bottom = polaroid ? stripH : side + stripH;
  const innerW = w - side * 2;
  const innerH = h - side - bottom;

  ctx.fillStyle = opts.frameColor;
  ctx.fillRect(0, 0, w, h);

  // Cover-fit the photo into the inner box, centred.
  const srcW = image.naturalWidth || image.width;
  const srcH = image.naturalHeight || image.height;
  const scale = Math.max(innerW / srcW, innerH / srcH);
  const sw = innerW / scale;
  const sh = innerH / scale;
  const sx = (srcW - sw) / 2;
  const sy = (srcH - sh) / 2;
  ctx.drawImage(image, sx, sy, sw, sh, side, side, innerW, innerH);

  if (look) {
    const data = ctx.getImageData(side, side, innerW, innerH);
    applyLook(data.data, innerW, innerH, look);
    ctx.putImageData(data, side, side);
  }

  if (opts.caption) {
    const stripTop = side + innerH;
    const textY = polaroid ? stripTop + (h - stripTop) / 2 : stripTop + stripH / 2;
    ctx.fillStyle = isDark(opts.frameColor) ? "#ffffff" : "#111111";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = polaroid
      ? `${Math.round(w * 0.055)}px "Bradley Hand", "Segoe Print", "Comic Sans MS", cursive`
      : `500 ${Math.round(stripH * 0.4)}px -apple-system, system-ui, sans-serif`;
    ctx.fillText(opts.caption, w / 2, textY, w - side * 2);
  }
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
