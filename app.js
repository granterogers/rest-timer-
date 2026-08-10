(function () {
  "use strict";

  // ---------- Rest duration stepper ----------
  var MIN_SECONDS = 15;
  var MAX_SECONDS = 5 * 60;
  var STEP_SECONDS = 15;
  var DEFAULT_SECONDS = 120;

  var decBtn = document.getElementById("decBtn");
  var incBtn = document.getElementById("incBtn");
  var controlsEl = document.querySelector(".controls");
  var timeLabel = document.getElementById("timeLabel");
  var restButton = document.getElementById("restButton");
  var buttonLabel = document.getElementById("buttonLabel");

  var IDLE_LABEL_HTML =
    '<span class="label-line">BEGIN</span><span class="label-line">REST</span>';

  function formatTime(totalSeconds) {
    var m = Math.floor(totalSeconds / 60);
    var sec = totalSeconds % 60;
    return (m < 10 ? "0" + m : m) + ":" + (sec < 10 ? "0" + sec : sec);
  }

  var selectedSeconds = DEFAULT_SECONDS;

  function renderDuration() {
    if (!isRunning) timeLabel.textContent = formatTime(selectedSeconds);
  }

  function adjustDuration(deltaSeconds) {
    selectedSeconds = Math.max(MIN_SECONDS, Math.min(MAX_SECONDS, selectedSeconds + deltaSeconds));
    renderDuration();
  }

  decBtn.addEventListener("click", function () { adjustDuration(-STEP_SECONDS); });
  incBtn.addEventListener("click", function () { adjustDuration(STEP_SECONDS); });

  // ---------- Sound: a pleasant chime to begin, a boxing-style bell to end ----------
  var audioCtx = null;

  function ensureAudio() {
    // Safari (17+) defaults Web Audio to the "ambient" audio session
    // category, which the hardware mute switch silences. Declaring
    // "playback" makes it behave like a music/media app and ignore the
    // mute switch. No-op on browsers that don't support this API.
    if ("audioSession" in navigator) {
      try { navigator.audioSession.type = "playback"; } catch (e) { /* ignore */ }
    }
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") {
      return audioCtx.resume();
    }
    return Promise.resolve();
  }

  function noiseBurst(startTime, duration, peak, filterType, filterFreq) {
    var bufferSize = Math.floor(audioCtx.sampleRate * duration);
    var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    var noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    var filter = audioCtx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = filterFreq;
    var gain = audioCtx.createGain();
    gain.gain.setValueAtTime(peak, startTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    noise.start(startTime);
  }

  // Gently detuned overtones read as a soft, pleasant handbell.
  var CHIME_PARTIALS = [1, 2.01, 3.0, 4.16];
  var CHIME_FUNDAMENTAL = 660;

  function playChime() {
    var startTime = audioCtx.currentTime;
    CHIME_PARTIALS.forEach(function (ratio, i) {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = CHIME_FUNDAMENTAL * ratio;
      var peak = 0.32 / (i + 1);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(peak, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(startTime);
      osc.stop(startTime + 1.5);
    });
    noiseBurst(startTime, 0.03, 0.12, "lowpass", 2200);
  }

  // Inharmonic partial ratios give the metallic, non-musical timbre of a
  // struck bell (as opposed to stacking pure harmonics, which sounds like
  // an organ note) - struck three times fast, like a ringside boxing bell.
  var GONG_PARTIALS = [1, 1.79, 2.76, 3.98, 5.1];
  var GONG_FUNDAMENTAL = 1500;

  function strikeGong(startTime, volume) {
    GONG_PARTIALS.forEach(function (ratio, i) {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = GONG_FUNDAMENTAL * ratio;
      var peak = volume / (i + 1.3);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(peak, startTime + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.55);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.6);
    });
    noiseBurst(startTime, 0.06, volume * 0.6, "bandpass", 3200);
  }

  function playBoxingBell() {
    var now = audioCtx.currentTime;
    [0, 0.16, 0.32].forEach(function (offset) {
      strikeGong(now + offset, 0.55);
    });
  }

  // ---------- Countdown state machine ----------
  var isRunning = false;
  var endTime = 0;
  var rafId = null;

  function tick() {
    var remainingMs = endTime - Date.now();
    var remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    timeLabel.textContent = formatTime(remainingSeconds);

    if (remainingMs <= 0) {
      finishCountdown();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function startCountdown() {
    isRunning = true;
    endTime = Date.now() + selectedSeconds * 1000;
    buttonLabel.innerHTML = "";
    restButton.classList.add("is-running");
    controlsEl.classList.add("disabled");
    ensureAudio().then(playChime);
    rafId = requestAnimationFrame(tick);
  }

  function resetToIdle() {
    isRunning = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    buttonLabel.innerHTML = IDLE_LABEL_HTML;
    restButton.classList.remove("is-running");
    controlsEl.classList.remove("disabled");
    timeLabel.textContent = formatTime(selectedSeconds);
  }

  function finishCountdown() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    isRunning = false;
    buttonLabel.innerHTML = IDLE_LABEL_HTML;
    restButton.classList.remove("is-running");
    controlsEl.classList.remove("disabled");
    timeLabel.textContent = formatTime(selectedSeconds);
    ensureAudio().then(playBoxingBell);
  }

  restButton.addEventListener("click", function () {
    if (isRunning) {
      resetToIdle();
    } else {
      startCountdown();
    }
  });

  // Initial paint.
  renderDuration();

  // ---------- Prevent pinch/double-tap zoom while tapping controls ----------
  document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
  document.addEventListener("dblclick", function (e) { e.preventDefault(); });

  // ---------- PWA service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
})();
