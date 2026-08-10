(function () {
  "use strict";

  // ---------- Rest duration stepper ----------
  var MIN_SECONDS = 15;
  var MAX_SECONDS = 5 * 60;
  var STEP_SECONDS = 15;
  var DEFAULT_SECONDS = 120;

  var durationValueEl = document.getElementById("durationValue");
  var decBtn = document.getElementById("decBtn");
  var incBtn = document.getElementById("incBtn");
  var controlsEl = document.querySelector(".controls");
  var timeLabel = document.getElementById("timeLabel");
  var restButton = document.getElementById("restButton");
  var buttonLabel = document.getElementById("buttonLabel");

  function formatTime(totalSeconds) {
    var m = Math.floor(totalSeconds / 60);
    var sec = totalSeconds % 60;
    return (m < 10 ? "0" + m : m) + ":" + (sec < 10 ? "0" + sec : sec);
  }

  var selectedSeconds = DEFAULT_SECONDS;

  function renderDuration() {
    var text = formatTime(selectedSeconds);
    durationValueEl.textContent = text;
    if (!isRunning) timeLabel.textContent = text;
  }

  function adjustDuration(deltaSeconds) {
    selectedSeconds = Math.max(MIN_SECONDS, Math.min(MAX_SECONDS, selectedSeconds + deltaSeconds));
    renderDuration();
  }

  decBtn.addEventListener("click", function () { adjustDuration(-STEP_SECONDS); });
  incBtn.addEventListener("click", function () { adjustDuration(STEP_SECONDS); });

  // ---------- Bell sound: a boxing-round ringside bell ----------
  var audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  // Inharmonic partial ratios give the metallic, non-musical timbre of a
  // struck bell (as opposed to stacking pure harmonics, which sounds like
  // an organ note).
  var BELL_PARTIALS = [1, 1.79, 2.76, 3.98, 5.1];
  var BELL_FUNDAMENTAL = 1500;

  function strikeBell(startTime, volume) {
    BELL_PARTIALS.forEach(function (ratio, i) {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = BELL_FUNDAMENTAL * ratio;
      var peak = volume / (i + 1.3);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(peak, startTime + 0.004);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.55);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.6);
    });

    // Short filtered noise burst for the metallic "clang" of the strike itself.
    var duration = 0.06;
    var bufferSize = Math.floor(audioCtx.sampleRate * duration);
    var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    var noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    var bandpass = audioCtx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.value = 3200;
    bandpass.Q.value = 0.6;
    var noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(volume * 0.6, startTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    noise.connect(bandpass);
    bandpass.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    noise.start(startTime);
  }

  function playBell() {
    ensureAudio();
    var now = audioCtx.currentTime;
    // A ringside bell is struck in a quick triple-tap at the start of a round.
    [0, 0.16, 0.32].forEach(function (offset) {
      strikeBell(now + offset, 0.55);
    });
  }

  // ---------- Countdown state machine ----------
  var isRunning = false;
  var endTime = 0;
  var totalDuration = DEFAULT_SECONDS;
  var rafId = null;

  var GREEN = [46, 204, 113];
  var RED = [231, 76, 60];

  function lerpColor(a, b, t) {
    var r = Math.round(a[0] + (b[0] - a[0]) * t);
    var g = Math.round(a[1] + (b[1] - a[1]) * t);
    var bl = Math.round(a[2] + (b[2] - a[2]) * t);
    return "rgb(" + r + "," + g + "," + bl + ")";
  }

  function setButtonProgress(fraction) {
    restButton.style.setProperty("--btn-color", lerpColor(GREEN, RED, fraction));
  }

  function tick() {
    var remainingMs = endTime - Date.now();
    var remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    timeLabel.textContent = formatTime(remainingSeconds);

    var elapsedFraction = 1 - remainingMs / (totalDuration * 1000);
    setButtonProgress(Math.max(0, Math.min(1, elapsedFraction)));

    if (remainingMs <= 0) {
      finishCountdown();
      return;
    }
    rafId = requestAnimationFrame(tick);
  }

  function startCountdown() {
    ensureAudio();
    isRunning = true;
    totalDuration = selectedSeconds;
    endTime = Date.now() + totalDuration * 1000;
    buttonLabel.textContent = "";
    controlsEl.classList.add("disabled");
    rafId = requestAnimationFrame(tick);
  }

  function resetToIdle() {
    isRunning = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    buttonLabel.textContent = "START";
    controlsEl.classList.remove("disabled");
    setButtonProgress(0);
    timeLabel.textContent = formatTime(selectedSeconds);
  }

  function finishCountdown() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    isRunning = false;
    setButtonProgress(0);
    buttonLabel.textContent = "START";
    controlsEl.classList.remove("disabled");
    timeLabel.textContent = formatTime(selectedSeconds);
    playBell();
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
  setButtonProgress(0);

  // ---------- PWA service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
})();
