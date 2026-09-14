# Handoff: Rest Timer

Status as of this writing: **v1.9.0** (bumped alongside this handoff doc, per
the standing per-change version policy), deployed to GitHub Pages, working.

## What it is

A single-purpose PWA for gym-style interval rest: a full-screen blue app with
three stacked thirds — a big MM:SS countdown, a giant circular button that
fades green→red as a rest period runs out, and a bottom control strip to
adjust the rest duration and sound volume. Installable to an iPhone home
screen as a standalone app (no Safari chrome). No backend, no build tooling —
plain static HTML/CSS/JS deployed via GitHub Pages.

Live at whatever this repo's Pages URL resolves to
(`https://<owner>.github.io/<repo>/`) — Pages must be manually set to
"Source: GitHub Actions" once in repo Settings (already done for this repo).

## How it works, briefly

- Tap the button → starts a countdown from the selected duration (default
  2:00, adjustable 0:15–5:00 in 15s steps), plays a synthesized chime, button
  turns from green to red as time runs out (a CSS `hue-rotate` filter, not a
  separate red asset).
- Countdown hits zero → synthesized "boxing bell" (three struck-gong hits),
  button resets to green.
- Tap again mid-countdown → cancels, resets to idle.
- A volume slider (0–200% internal gain) is persisted across visits.
- A tiny version tag under the volume control shows the current release
  (`v1.9.0`), and the app force-reloads itself automatically shortly after a
  new version is deployed and the app is reopened/refocused (see below).

Full technical rationale for each design choice (why `setInterval` instead of
`requestAnimationFrame`, why there's a silent audio element, the mute-switch
tradeoff, the service worker caching strategy, etc.) lives in **CLAUDE.md** —
that's the file to read before making further changes, this doc is more
narrative/status-oriented.

## Standing policies (already agreed with the user — keep following them)

- Commit and push straight to `main`. No branches, no PRs, no "merged" PR
  badges the user has to see.
- Every shipped change bumps `VERSION`'s minor number by one (e.g. `1.8.0` →
  `1.9.0`), patch always `0`.

## Known tradeoffs (deliberate, not bugs)

- **Mute switch silences the app's own sounds.** Chosen on purpose: the
  alternative (`audioSession.type = "playback"`) would let the app bypass
  the phone's mute switch, but would also pause/interrupt whatever the user
  is listening to (Spotify, YouTube, etc.) the moment the app is focused.
  The user explicitly prioritized letting background music keep playing
  over bypassing mute. This has been flip-flopped on a few times during
  development — if it comes up again, that's the tradeoff being reconsidered,
  not a new problem.
- **Background/lock-screen reliability is a mitigation, not a guarantee.**
  A silent looping audio element plus MediaSession action-handler
  registration keep the countdown/bell alive when the app is backgrounded or
  the phone is locked, by giving iOS a reason to keep the page's JS running.
  Very long backgrounding can still get the page suspended by the OS; this
  is a platform limitation, not something more code can fully close.

## Open question / not yet confirmed

The most recent user-facing ask before this handoff was written was whether
audio/countdown reliability holds up **with the screen fully off** (not just
backgrounded to another app). The last change made in response
(`MediaSession` action handlers, registering the page's audio as a real
media session rather than a one-off sound effect) was shipped, but the user
had not yet confirmed whether it actually fixed screen-off reliability. If
this comes up again and it's still unreliable, the next lever to pull is
revisiting `"ambient"` vs `"playback"` specifically for that scenario — see
CLAUDE.md's audioSession section.

## Where things live

- Everything is at the repo root, single-page app — no routing, no subpages.
- `assets/*.png` and `icons/*.png` were generated procedurally (Python +
  Pillow/numpy) rather than downloaded, since the dev sandbox has no general
  internet access for fetching stock art. If they ever need to change,
  expect to write a small generation script again rather than sourcing files.
- All sound is synthesized in `app.js` via the Web Audio API — there are no
  `.mp3`/`.wav` sound-effect files to swap out; tuning a sound means editing
  oscillator/partial/envelope values in `app.js`.
- The GitHub Actions workflow (`.github/workflows/pages.yml`) is the only CI.
  It writes `version.json` fresh (commit SHA + the `VERSION` file's contents)
  on every push to `main`, then deploys via `actions/deploy-pages@v4`.

## Testing without a test suite

There's no automated test suite. Past verification of tricky bugs (a stale
service-worker cache serving mismatched HTML/JS, a Safari media-API
exception silently killing the countdown) was done by serving the repo
locally with `python3 -m http.server` and driving headless Chromium via
Playwright, reproducing the exact failure before confirming the fix. Worth
doing the same for any change to the countdown, audio, or service-worker
logic rather than reasoning about it purely by reading the code.
