# Car detailing site — scroll washes the car

Vite + vanilla JS, GSAP ScrollTrigger and Lenis. A full-screen `<canvas>` stays pinned for 700vh
while scroll position scrubs through an image sequence made from the clips in `/footage`.

> The clips in `/footage` are currently generated from 3 stills in `/stills` (foamed → rinse → clean)
> with crossfades and a slow push-in (`npm run stills`). Swap in real video any time (see below).

## Run locally
```bash
cd car-detailing
npm install
npm run dev          # http://localhost:5173
npm run build && npm run preview   # production build check
```

## Where to edit
| What | Where |
|---|---|
| Business name, city, phone, site URL (SEO/OG) | `.env` |
| Prices (cards + booking bar quote) | `src/config.js` → `PRICES` |
| Chapter copy, services, reviews, FAQ | `index.html` (search `TODO`) |
| Where bookings are sent | `src/main.js` → `submitBooking()` |
| Scroll length of the wash | `src/style.css` → `--seq-length` |
| Loading/quality tuning | `src/config.js` → `SEQUENCE` |

## Swap in new footage
1. Delete the old clips: `rm footage/*`
2. Copy your clips into `footage/`, named in order: `01-dirty.mp4`, `02-foam.mp4`, `03-rinse.mp4`,
   `04-polish.mp4`, `05-reveal.mp4` (any of .mp4 .mov .m4v .webm works; only the number order matters).
3. Run `npm run frames`. This rebuilds `public/frames/` (desktop and mobile sets),
   `public/frames/manifest.json` and `public/og-image.jpg`.
   The npm script uses `--fps 16 --quality 65`: photo-real foam/spray frames are ~200 KB each, so
   this keeps the desktop set around 50 MB (the page appears after ~5 MB; the rest streams in).
   For fast real camera motion use more frames: `node scripts/extract-frames.mjs --fps 24 --quality 70`.
   All options: `--fps --quality --width --mobile-width --mobile-step`
4. `npm run dev`, scroll through, then commit and push. Vercel redeploys automatically.

Notes:
- Each of the 5 chapters is timed to the matching clip (clip 1 = Arrive … clip 5 = Reveal). With a
  different number of clips, chapters spread evenly across the scroll.
- Aim for **10–20 s total**. At 24 fps that's 240–480 frames; much more means heavy downloads.
  Shorten long clips first: `ffmpeg -ss 2 -t 4 -i in.mov -an out.mp4`
- Shoot landscape with a locked-off or slow, steady camera. Shaky handheld footage looks jittery when scrubbed.
- A new `version` is written to the manifest on every run, so browsers never show stale frames.
- No ffmpeg? `brew install ffmpeg` (macOS), `sudo apt-get install -y ffmpeg` (Linux), `winget install Gyan.FFmpeg` (Windows).
- Only have stills? Put exactly 3 same-angle images in `stills/` named `01-…`, `02-…`, `03-…`
  (dirty/foamed → rinse → clean), then `npm run stills && npm run frames`.

## Deploy free on Vercel
1. Push this repo to GitHub (the generated frames in `public/frames` are committed; Vercel has no ffmpeg).
2. Go to vercel.com → **Add New… → Project** → import the repo.
3. Set **Root Directory** to `car-detailing`. Vercel auto-detects Vite
   (build `npm run build`, output `dist`).
4. Deploy. Then set `VITE_SITE_URL` in `.env` (or in Vercel → Settings → Environment Variables)
   to your real domain and redeploy, so canonical and Open Graph URLs are correct.
5. Optional: add a custom domain under Settings → Domains.

`vercel.json` caches frames for a year (they're versioned) and never caches the manifest.

## How it works
- `scripts/extract-frames.mjs`: ffmpeg turns the clips into one continuous WebP sequence plus a manifest.
- `src/sequence.js`: loads the first 10 frames, the last frame and every 16th frame first (this is what the
  loading % tracks), then fills the remaining frames nearest the current scroll position first. If a frame
  isn't ready yet it draws the nearest loaded one, so there's never a blank frame. It draws once per
  rAF and only when the frame changes. Uses cover scaling and devicePixelRatio (capped at 2).
- Phones get the 900px set with every other frame. Pinning uses CSS `position: sticky` in a `100lvh`
  box, which holds up on iOS Safari better than JS pinning. Tall screens letterbox a little so a
  landscape clip isn't cropped to a sliver.
- `prefers-reduced-motion`: no scrub and no smooth scroll; shows a static before/after instead.
