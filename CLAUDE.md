# CLAUDE.md

Guidance for Claude Code (or any future contributor) working in this repo.

## What this is

A static, no-build PWA rest timer: big button, countdown, green→red fade,
synthesized bell sounds, adjustable rest duration, installable to an iPhone
home screen. Plain HTML/CSS/JS — no framework, no bundler, no `node_modules`.

- `index.html` — markup (three flex thirds: display / button / controls)
- `style.css` — all styling, including the hand-tuned responsive sizing
- `app.js` — everything else (IIFE, no modules): stepper, volume, Web Audio
  synthesis, countdown state machine, keep-alive/MediaSession, service
  worker registration, update detection
- `sw.js` — service worker (network-first, see caching note below)
- `manifest.json` — PWA manifest
- `assets/` — procedurally generated PNGs (button sphere, background) +
  `silence.wav` (background keep-alive)
- `icons/` — procedurally generated app icons
- `VERSION` / `version.json` — see versioning policy below
- `.github/workflows/pages.yml` — deploy to GitHub Pages on every push to `main`

## Standing workflow policies (do not deviate without being asked)

1. **Everything goes to `main`.** No feature branches, no pull requests.
   Commit and push directly to `main` for every change.
2. **Bump the minor version on every shipped change.** `VERSION` is a plain
   semantic version (e.g. `1.8.0`); after any change, increment the minor
   digit by one and reset patch to `0` (e.g. `1.8.0` → `1.9.0`). Also update
   the `display` field in the local `version.json` to match (CI regenerates
   `version.json` on deploy anyway, but keep the checked-in copy consistent).
3. Every commit should actually deploy successfully — after pushing, it's
   worth assuming the GitHub Actions workflow will run and checking back if
   asked to verify.

## Versioning mechanics (don't confuse these two numbers)

- `VERSION` — a human-maintained semantic version, bumped per the policy
  above. Shown to the user in the small `#versionTag` under the volume
  control (`v1.8.0`, etc.). Purely cosmetic/informational.
- `version.json`'s `build` field — the deploy commit SHA, written fresh by
  the "Write version marker" step in `pages.yml` on every push to `main`.
  This is what `app.js`'s `checkForNewVersion()` actually compares to detect
  a new deploy and force-reload the page. Never hand-edit `build` — it's
  meaningless locally (`"dev"`) and is only correct once CI writes it.

## Key architectural decisions and why

- **No build step, on purpose.** Keep it this way unless there's a real
  reason to add one — the whole point was a small static site that's simple
  to reason about and deploy.
- **Service worker caches network-first, with `cache: "no-store"` for the
  app shell** (`.html/.js/.css/.json`, matched via `APP_SHELL_PATTERN` in
  `sw.js`). This exists specifically to prevent a mismatched-version bug
  that happened once: a stale cached `app.js` referencing a DOM element that
  new `index.html` had removed threw and silently killed the click handler.
  Images/audio in `assets/`/`icons/` stay normally cacheable. Don't relax
  this without understanding that history.
- **Countdown uses `setInterval`, not `requestAnimationFrame`.** rAF is
  guaranteed to pause when the page isn't visible; `setInterval` keeps firing
  as long as the page has an active background reason to run, which brings
  us to:
- **Silent looping `<audio id="keepAliveAudio">` (`assets/silence.wav`).**
  iOS only grants background execution time to a page with an active audio
  session. This keeps the JS alive long enough to finish the countdown and
  ring the end bell while backgrounded. It's a mitigation, not a guarantee —
  iOS can still suspend a long-backgrounded tab.
- **`MediaSession` metadata + action handlers** (`play`/`pause`/`stop`,
  registered once at top level, not per-rest) make iOS treat the keep-alive
  audio as a legitimate ongoing media session rather than a one-off sound
  effect. This is aimed at lock-screen/screen-off survival specifically, as
  opposed to just backgrounded-app survival. As of the last update, it was
  unconfirmed whether this fully solved screen-off reliability — if the user
  reports it's still flaky with the screen off, that's the next thread to
  pull, likely by revisiting the audioSession type tradeoff below for that
  specific case.
- **`navigator.audioSession.type = "ambient"`.** There is no combination
  available through the web API that both ignores the phone's mute switch
  *and* mixes with other apps' audio — it's one or the other:
  - `"playback"` — ignores mute switch, but pauses/interrupts other apps'
    audio (Spotify, YouTube, etc.)
  - `"ambient"` — mixes with other apps' audio, but is itself silenced by
    the mute switch
  The user explicitly chose `"ambient"` (letting background music keep
  playing matters more than bypassing the mute switch). Don't flip this
  without the user re-opening that tradeoff — it's been gone back and forth
  on before.
- **All sounds are synthesized via Web Audio**, not audio files (oscillators
  + noise bursts through a limiter/compressor + a convolver reverb send).
  There's a volume slider (`0`–`2x` gain via `MAX_GAIN`) persisted to
  `localStorage`. If sounds seem "broken," check the obvious mundane causes
  first — phone mute switch (see above), phone volume, the in-app slider
  position — before assuming a code regression. That's been the actual cause
  more than once.
- **No text label on the button; +/- stepper icons are inline hand-drawn
  SVGs**, not font glyphs — different typefaces don't share vertical metrics
  for `+`/`−`, which broke pixel-perfect centering when they were font
  characters.
- **Button and background art are procedurally generated PNGs** (there's no
  general internet access in the dev sandbox to fetch stock assets). If they
  ever need regenerating, that means writing a small Python/Pillow/numpy
  script, not fetching files.

## Testing methodology

There's no test suite. Verification has been done manually via Playwright
against a local static server:

```bash
python3 -m http.server 8000   # from the repo root
```

then drive headless Chromium at
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome` via the Playwright node
module at `/opt/node22/lib/node_modules/playwright`. This has been used to:
reproduce the stale-cache button bug, simulate Safari's `currentTime` setter
throwing `InvalidStateError` to verify the countdown survives it, and count
active oscillators to sanity-check audio behavior instead of guessing.

If you change countdown, audio, or service-worker logic, prefer reproducing
the failure mode locally before and after your fix, the way past sessions
did, rather than reasoning about it in the abstract.
