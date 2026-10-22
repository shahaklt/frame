// Live camera with auto-framing. Draws the reframed view into `viewfinder` and
// captures the same crop at full resolution.
const Camera = (() => {
  const VIEW_WIDTH = 720;
  const ANALYSIS_WIDTH = 64;
  const ANALYSE_EVERY = 6; // frames; analysis is the expensive part

  const view = document.getElementById("viewfinder");
  const viewCtx = view.getContext("2d");
  const analysisCanvas = document.createElement("canvas");
  const analysisCtx = analysisCanvas.getContext("2d", { willReadFrequently: true });

  const video = document.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.setAttribute("muted", "");
  // Keep the element in the DOM but invisible; some mobile browsers won't play detached video.
  Object.assign(video.style, { position: "fixed", width: "1px", height: "1px", opacity: "0", pointerEvents: "none" });
  document.body.append(video);

  let stream = null;
  let running = false;
  let frameCount = 0;
  let facing = "environment";
  let aspect = "1:1";
  let autoFrame = true;
  let crop = null;
  let subject = null;

  async function start(options = {}) {
    aspect = options.aspect || aspect;
    autoFrame = options.autoFrame ?? autoFrame;
    await openStream();
    if (!running) requestAnimationFrame(tick);
    running = true;
  }

  async function openStream() {
    stopStream();
    stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1920 },
        height: { ideal: 1920 },
      },
      audio: false,
    });
    video.srcObject = stream;
    await video.play();
    crop = null;
    subject = null;
  }

  function stopStream() {
    if (stream) stream.getTracks().forEach((track) => track.stop());
    stream = null;
    video.srcObject = null;
  }

  function stop() {
    running = false;
    stopStream();
  }

  async function flip() {
    facing = facing === "environment" ? "user" : "environment";
    await openStream();
  }

  function setAspect(value) {
    aspect = value;
    crop = null;
  }

  function setAutoFrame(enabled) {
    autoFrame = enabled;
    crop = null;
  }

  function tick() {
    if (!running) return;
    if (video.readyState >= 2 && video.videoWidth) {
      updateCrop();
      drawView();
    }
    requestAnimationFrame(tick);
  }

  function updateCrop() {
    const source = { width: video.videoWidth, height: video.videoHeight };

    if (autoFrame && frameCount % ANALYSE_EVERY === 0) {
      subject = findSubject(source);
    }
    if (!autoFrame) subject = null;
    frameCount++;

    const target = cropFor(source, ASPECTS[aspect], subject);
    crop = crop ? smoothCrop(crop, target) : target;
  }

  function findSubject(source) {
    analysisCanvas.width = ANALYSIS_WIDTH;
    analysisCanvas.height = Math.round((ANALYSIS_WIDTH * source.height) / source.width);
    analysisCtx.drawImage(video, 0, 0, analysisCanvas.width, analysisCanvas.height);
    const data = analysisCtx.getImageData(0, 0, analysisCanvas.width, analysisCanvas.height).data;
    return saliencyCentroid(data, analysisCanvas.width, analysisCanvas.height);
  }

  function drawView() {
    const [aw, ah] = ASPECTS[aspect];
    view.width = VIEW_WIDTH;
    view.height = Math.round((VIEW_WIDTH * ah) / aw);
    viewCtx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, view.width, view.height);

    drawThirds();
    if (subject) drawSubject();
  }

  function drawThirds() {
    viewCtx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    viewCtx.lineWidth = 1;
    viewCtx.beginPath();
    for (let i = 1; i < 3; i++) {
      const x = Math.round((view.width * i) / 3) + 0.5;
      const y = Math.round((view.height * i) / 3) + 0.5;
      viewCtx.moveTo(x, 0);
      viewCtx.lineTo(x, view.height);
      viewCtx.moveTo(0, y);
      viewCtx.lineTo(view.width, y);
    }
    viewCtx.stroke();
  }

  function drawSubject() {
    // Map the subject from source coordinates into the view.
    const px = ((subject.x * video.videoWidth - crop.x) / crop.width) * view.width;
    const py = ((subject.y * video.videoHeight - crop.y) / crop.height) * view.height;
    viewCtx.fillStyle = "rgba(10, 132, 255, 0.9)";
    viewCtx.beginPath();
    viewCtx.arc(px, py, 6, 0, Math.PI * 2);
    viewCtx.fill();
  }

  // Full-resolution crop of what the viewfinder currently shows.
  function capture() {
    if (!crop) return null;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(crop.width);
    canvas.height = Math.round(crop.height);
    canvas.getContext("2d").drawImage(
      video,
      Math.round(crop.x),
      Math.round(crop.y),
      canvas.width,
      canvas.height,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return canvas;
  }

  return { start, stop, flip, capture, setAspect, setAutoFrame };
})();
