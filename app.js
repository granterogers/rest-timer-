(function () {
  "use strict";

  // ---------- Duration wheel setup ----------
  var MIN_SECONDS = 15;
  var MAX_SECONDS = 5 * 60;
  var STEP_SECONDS = 15;
  var DEFAULT_SECONDS = 120;

  var durations = [];
  for (var s = MIN_SECONDS; s <= MAX_SECONDS; s += STEP_SECONDS) durations.push(s);
  var defaultIndex = durations.indexOf(DEFAULT_SECONDS);

  var wheelEl = document.getElementById("wheel");
  var controlsEl = document.querySelector(".controls");
  var timeLabel = document.getElementById("timeLabel");
  var restButton = document.getElementById("restButton");
  var buttonLabel = document.getElementById("buttonLabel");

  function formatTime(totalSeconds) {
    var m = Math.floor(totalSeconds / 60);
    var sec = totalSeconds % 60;
    return (m < 10 ? "0" + m : m) + ":" + (sec < 10 ? "0" + sec : sec);
  }

  durations.forEach(function (secs) {
    var item = document.createElement("div");
    item.className = "wheel-item";
    item.textContent = formatTime(secs);
    item.dataset.seconds = secs;
    wheelEl.appendChild(item);
  });

  var selectedSeconds = DEFAULT_SECONDS;
  var itemHeight = 44;

  function highlightCentered() {
    var index = Math.round(wheelEl.scrollTop / itemHeight);
    index = Math.max(0, Math.min(durations.length - 1, index));
    var items = wheelEl.querySelectorAll(".wheel-item");
    items.forEach(function (el, i) {
      el.classList.toggle("selected", i === index);
    });
    selectedSeconds = durations[index];
    if (!isRunning) timeLabel.textContent = formatTime(selectedSeconds);
  }

  var scrollTimeout = null;
  wheelEl.addEventListener("scroll", function () {
    highlightCentered();
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(function () {
      var index = durations.indexOf(selectedSeconds);
      wheelEl.scrollTo({ top: index * itemHeight, behavior: "smooth" });
    }, 120);
  });

  // Set initial scroll position to the default duration.
  wheelEl.scrollTop = defaultIndex * itemHeight;
  highlightCentered();

  // ---------- Bell sound (synthesized, no external assets) ----------
  var audioCtx = null;

  function ensureAudio() {
    if (!audioCtx) {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
    }
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function ringBell(startTime) {
    var freqs = [880, 1320, 1760];
    freqs.forEach(function (freq, i) {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      var peak = 0.35 / (i + 1);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(peak, startTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.4);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(startTime);
      osc.stop(startTime + 1.5);
    });
  }

  function playBell() {
    ensureAudio();
    var now = audioCtx.currentTime;
    ringBell(now);
    ringBell(now + 0.5);
    ringBell(now + 1.0);
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
    restButton.style.background = lerpColor(GREEN, RED, fraction);
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
    buttonLabel.textContent = "STOP";
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
  timeLabel.textContent = formatTime(selectedSeconds);
  setButtonProgress(0);

  // ---------- PWA service worker ----------
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function () {});
    });
  }
})();
