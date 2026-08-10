# Rest Timer

A dead-simple, full-screen rest timer for between sets. No build step, no
dependencies — just static HTML/CSS/JS.

- **Top third:** huge countdown display (MM:SS)
- **Middle third:** one giant button — tap to start, tap again to cancel.
  It fades from green to red as the rest period runs out.
- **Bottom third:** a scrollable wheel to pick the rest duration
  (defaults to **2:00**)
- When the countdown hits zero, a synthesized bell rings and the button
  resets to green.

## Running it locally

It's just static files — open `index.html` in a browser, or serve the
folder with any static file server, e.g.:

```bash
python3 -m http.server 8000
```

then visit `http://localhost:8000`.

## Deploying to GitHub Pages

A workflow at `.github/workflows/pages.yml` deploys the site automatically
on every push to `main`. One-time setup (only needs to be done once):

1. On GitHub, go to **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Push (or merge) to `main` — the workflow will publish the site.

Your app will then be live at:

```
https://<your-github-username>.github.io/<repo-name>/
```

## Installing on an iPhone as an app

1. Open the deployed Pages URL in **Safari** on the iPhone.
2. Tap the **Share** icon.
3. Tap **Add to Home Screen**.

It will appear on the home screen with its own icon and open full-screen,
without Safari's address bar, just like a native app.
