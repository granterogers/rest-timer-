(function () {
  "use strict";

  // ---------- Rest duration stepper ----------
  var MIN_SECONDS = 15;
  var MAX_SECONDS = 5 * 60;
  var STEP_SECONDS = 15;
  var DEFAULT_SECONDS = 120;

  var decBtn = document.getElementById("decBtn");
  var incBtn = document.getElementById("incBtn");
  var stepperRowEl = document.querySelector(".stepper-row");
  var volumeSlider = document.getElementById("volumeSlider");
  var timeLabel = document.getElementById("timeLabel");
  var restButton = document.getElementById("restButton");
  var keepAliveAudio = document.getElementById("keepAliveAudio");
  var versionTag = document.getElementById("versionTag");

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

  // ---------- Volume ----------
  var MAX_GAIN = 2.0; // slider at 100% == the "+100% volume" boost; 0% == muted
  var VOLUME_STORAGE_KEY = "restTimerVolume";

  function loadStoredVolume() {
    try {
      var stored = parseFloat(localStorage.getItem(VOLUME_STORAGE_KEY));
      if (!isNaN(stored) && stored >= 0 && stored <= 1) return stored;
    } catch (e) { /* localStorage unavailable */ }
    return 1;
  }

  var volumeFraction = loadStoredVolume();

  function applyVolumeToSlider() {
    var percent = Math.round(volumeFraction * 100);
    volumeSlider.value = percent;
    volumeSlider.style.setProperty("--fill", percent + "%");
  }

  function setVolume(fraction) {
    volumeFraction = Math.max(0, Math.min(1, fraction));
    if (masterGain) masterGain.gain.value = volumeFraction * MAX_GAIN;
    try { localStorage.setItem(VOLUME_STORAGE_KEY, String(volumeFraction)); } catch (e) { /* ignore */ }
  }

  applyVolumeToSlider();
  volumeSlider.addEventListener("input", function () {
    setVolume(volumeSlider.value / 100);
    applyVolumeToSlider();
  });

  // ---------- Sound: a pleasant chime to begin, a boxing-style bell to end ----------
  var audioCtx = null;
  var masterGain = null; // makeup gain, scaled by the volume slider (0 = muted)
  var limiter = null; // brick-wall-ish compressor so the extra gain can't clip/distort
  var dryBus = null; // everything feeds this, which feeds the limiter
  var reverbSend = null; // parallel wet path for a touch of natural space
  var reverbNode = null;

  function buildImpulseResponse(duration, decay) {
    var rate = audioCtx.sampleRate;
    var length = Math.floor(rate * duration);
    var impulse = audioCtx.createBuffer(2, length, rate);
    for (var ch = 0; ch < 2; ch++) {
      var data = impulse.getChannelData(ch);
      for (var i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }
    return impulse;
  }

  function buildAudioGraph() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    audioCtx = new Ctx();

    limiter = audioCtx.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 6;
    limiter.ratio.value = 16;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.2;
    limiter.connect(audioCtx.destination);

    masterGain = audioCtx.createGain();
    masterGain.gain.value = volumeFraction * MAX_GAIN; // safe to boost because of the limiter above
    masterGain.connect(limiter);

    dryBus = audioCtx.createGain();
    dryBus.gain.value = 1.0;
    dryBus.connect(masterGain);

    reverbSend = audioCtx.createGain();
    reverbSend.gain.value = 0.32;
    reverbNode = audioCtx.createConvolver();
    reverbNode.buffer = buildImpulseResponse(1.8, 2.4);
    reverbSend.connect(reverbNode);
    reverbNode.connect(masterGain);
  }

  function ensureAudio() {
    // There isn't a way to get both properties at once here: "playback"
    // ignores the phone's physical mute switch but pauses/interrupts other
    // audio (Spotify, YouTube, etc.); "ambient" mixes with other audio
    // instead of interrupting it, but is itself silenced by the mute
    // switch. The web-exposed audioSession API only offers fixed presets,
    // not the independent "ignore mute + mix with others" combination
    // native iOS apps can use - there's no way to combine them from here.
    // Given the choice, letting background music keep playing wins, so
    // this app's own sounds go silent when the phone is muted, same as
    // any other app's sound effects. No-op on browsers that don't support
    // this API.
    if ("audioSession" in navigator) {
      try { navigator.audioSession.type = "ambient"; } catch (e) { /* ignore */ }
    }
    // A context can be permanently "closed" by the browser after a long
    // interruption (a phone call, extended backgrounding, etc.) - resume()
    // can't revive a closed context, so rebuild the whole graph from
    // scratch when that happens instead of silently failing forever after.
    if (audioCtx && audioCtx.state === "closed") {
      audioCtx = null;
    }
    if (!audioCtx) {
      buildAudioGraph();
    }
    // Checking for anything other than "running" (rather than only
    // "suspended") also catches Safari's non-standard "interrupted" state,
    // which resume() can otherwise be silently ignored for.
    if (audioCtx.state !== "running") {
      return audioCtx.resume().catch(function () { /* best effort */ });
    }
    return Promise.resolve();
  }

  function connectVoice(node) {
    node.connect(dryBus);
    node.connect(reverbSend);
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
    connectVoice(gain);
    noise.start(startTime);
  }

  // Two slightly-detuned oscillators per partial (a few cents apart) beat
  // gently against each other, the way real struck metal has a natural
  // shimmer instead of the dead-flat tone of a single pure sine wave.
  function chorusedTone(startTime, freq, peak, attack, decay, stopAt) {
    [-3, 3].forEach(function (cents) {
      var osc = audioCtx.createOscillator();
      var gain = audioCtx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq * Math.pow(2, cents / 1200);
      gain.gain.setValueAtTime(0.0001, startTime);
      gain.gain.exponentialRampToValueAtTime(peak * 0.5, startTime + attack);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + decay);
      osc.connect(gain);
      connectVoice(gain);
      osc.start(startTime);
      osc.stop(startTime + stopAt);
    });
  }

  // Gently detuned overtones read as a soft, pleasant handbell.
  var CHIME_PARTIALS = [1, 2.01, 3.0, 4.16];
  var CHIME_FUNDAMENTAL = 660;

  function playChime() {
    var startTime = audioCtx.currentTime;
    CHIME_PARTIALS.forEach(function (ratio, i) {
      var peak = 0.34 / (i + 1);
      chorusedTone(startTime, CHIME_FUNDAMENTAL * ratio, peak, 0.02, 1.7, 1.8);
    });
    noiseBurst(startTime, 0.03, 0.1, "lowpass", 2200);
  }

  // Inharmonic partial ratios give the metallic, non-musical timbre of a
  // struck bell (as opposed to stacking pure harmonics, which sounds like
  // an organ note) - struck three times fast, like a ringside boxing bell.
  var GONG_PARTIALS = [1, 1.79, 2.76, 3.98, 5.1];
  var GONG_FUNDAMENTAL = 1500;

  function strikeGong(startTime, volume) {
    GONG_PARTIALS.forEach(function (ratio, i) {
      var peak = volume / (i + 1.3);
      chorusedTone(startTime, GONG_FUNDAMENTAL * ratio, peak, 0.004, 0.6, 0.65);
    });
    // Low sub "thud" under the metallic clang for weight/impact.
    var thud = audioCtx.createOscillator();
    var thudGain = audioCtx.createGain();
    thud.type = "sine";
    thud.frequency.setValueAtTime(160, startTime);
    thud.frequency.exponentialRampToValueAtTime(70, startTime + 0.12);
    thudGain.gain.setValueAtTime(0.0001, startTime);
    thudGain.gain.exponentialRampToValueAtTime(volume * 0.8, startTime + 0.006);
    thudGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.22);
    thud.connect(thudGain);
    connectVoice(thudGain);
    thud.start(startTime);
    thud.stop(startTime + 0.25);

    noiseBurst(startTime, 0.06, volume * 0.6, "bandpass", 3200);
  }

  function playBoxingBell() {
    var now = audioCtx.currentTime;
    [0, 0.16, 0.32].forEach(function (offset) {
      strikeGong(now + offset, 0.55);
    });
  }

  // ---------- Keep running (and audible) when the app isn't in focus ----------
  // Two things are needed for a rest to keep counting down - and the finish
  // bell to actually fire - while the screen is locked or another app is in
  // front:
  //  1. requestAnimationFrame is paused whenever the page isn't visible, no
  //     matter what, so the countdown loop below uses setInterval instead -
  //     setInterval keeps firing in the background as long as something
  //     qualifies the page for background audio time, which is...
  //  2. ...this silent, looping <audio> element. iOS only grants a page
  //     background execution time while it has an active audio session, so
  //     playing (inaudible) silence for the duration of the rest is what
  //     keeps the JS above alive long enough to run the countdown and ring
  //     the bell when it's done.
  // This is a mitigation, not a guarantee - iOS can still suspend a
  // sufficiently long-backgrounded tab/PWA - but it covers ordinary rest
  // periods reliably.
  function startKeepAlive() {
    keepAliveAudio.currentTime = 0;
    keepAliveAudio.play().catch(function () { /* ignore - not fatal */ });
    if ("mediaSession" in navigator) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: "Resting…", artist: "Rest Timer" });
        navigator.mediaSession.playbackState = "playing";
      } catch (e) { /* ignore */ }
    }
  }

  function stopKeepAlive() {
    keepAliveAudio.pause();
    keepAliveAudio.currentTime = 0;
    if ("mediaSession" in navigator) {
      try { navigator.mediaSession.playbackState = "none"; } catch (e) { /* ignore */ }
    }
  }

  // ---------- Countdown state machine ----------
  var isRunning = false;
  var endTime = 0;
  var tickIntervalId = null;

  function tick() {
    var remainingMs = endTime - Date.now();
    var remainingSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
    timeLabel.textContent = formatTime(remainingSeconds);

    if (remainingMs <= 0) {
      finishCountdown();
    }
  }

  function startCountdown() {
    isRunning = true;
    endTime = Date.now() + selectedSeconds * 1000;
    restButton.classList.add("is-running");
    stepperRowEl.classList.add("disabled");
    ensureAudio().then(playChime);
    startKeepAlive();
    tick();
    tickIntervalId = setInterval(tick, 250);
  }

  function resetToIdle() {
    isRunning = false;
    if (tickIntervalId) clearInterval(tickIntervalId);
    tickIntervalId = null;
    stopKeepAlive();
    restButton.classList.remove("is-running");
    stepperRowEl.classList.remove("disabled");
    timeLabel.textContent = formatTime(selectedSeconds);
  }

  function finishCountdown() {
    if (tickIntervalId) clearInterval(tickIntervalId);
    tickIntervalId = null;
    isRunning = false;
    stopKeepAlive();
    restButton.classList.remove("is-running");
    stepperRowEl.classList.remove("disabled");
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

  // ---------- Force a refresh when a newer deploy is detected ----------
  // On iOS, opening a home-screen app often resumes a WKWebView that was
  // frozen in the background rather than actually reloading the page, so
  // the network-first service worker above never gets a chance to run.
  // Whenever the app becomes visible again, compare against a version
  // marker (rewritten on every deploy) and force a real reload if it
  // changed - that's the only thing that reliably picks up new code.
  var appVersion = null;

  function checkForNewVersion() {
    fetch("version.json", { cache: "no-store" })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (appVersion === null) {
          appVersion = data.version;
          versionTag.textContent = "v" + String(data.version).slice(0, 7);
        } else if (data.version !== appVersion) {
          window.location.reload();
        }
      })
      .catch(function () { /* offline, or version.json missing - ignore */ });
  }

  checkForNewVersion();
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") checkForNewVersion();
  });
  window.addEventListener("pageshow", checkForNewVersion);
})();
