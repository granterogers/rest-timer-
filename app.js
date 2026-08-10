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

  // ---------- Bell sound: a single, warm, pleasant chime ----------
  var audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  // Gently detuned overtones (rather than a harsh metallic ratio set) read as
  // a soft, pleasant handbell instead of an alarm.
  var BELL_PARTIALS = [1, 2.01, 3.00, 4.16];
  var BELL_FUNDAMENTAL = 660;

  function playBell() {
    ensureAudio();
    var startTime = audioCtx.currentTime;

    BELL_PARTIALS.forEach(function (ratio, i) {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = BELL_FUNDAMENTAL * ratio;
      var peak = 0.32 / (i + 1);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(peak, startTime + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(startTime);
      osc.stop(startTime + 1.5);
    });

    // A very soft, brief attack "tap" so the tone doesn't start too abruptly.
    var duration = 0.03;
    var bufferSize = Math.floor(audioCtx.sampleRate * duration);
    var buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    var data = buffer.getChannelData(0);
    for (var i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
    }
    var noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    var lowpass = audioCtx.createBiquadFilter();
    lowpass.type = "lowpass";
    lowpass.frequency.value = 2200;
    var noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(0.12, startTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    noise.connect(lowpass);
    lowpass.connect(noiseGain);
    noiseGain.connect(audioCtx.destination);
    noise.start(startTime);
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
    ensureAudio();
    isRunning = true;
    endTime = Date.now() + selectedSeconds * 1000;
    buttonLabel.textContent = "";
    restButton.classList.add("is-running");
    controlsEl.classList.add("disabled");
    playBell();
    rafId = requestAnimationFrame(tick);
  }

  function resetToIdle() {
    isRunning = false;
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    buttonLabel.textContent = "BEGIN REST";
    restButton.classList.remove("is-running");
    controlsEl.classList.remove("disabled");
    timeLabel.textContent = formatTime(selectedSeconds);
  }

  function finishCountdown() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
    isRunning = false;
    buttonLabel.textContent = "BEGIN REST";
    restButton.classList.remove("is-running");
    controlsEl.classList.remove("disabled");
    timeLabel.textContent = formatTime(selectedSeconds);
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
