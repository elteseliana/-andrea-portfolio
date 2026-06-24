# Andrea Pokroy — Architect Portfolio

A bilingual (English / Hebrew) architect portfolio for Andrea Pokroy, based in Israel.

Single-page site featuring a scroll-driven 3D experience: an architectural blueprint
draws itself, builds up into a house, and then walks you through the rooms — all in
an evolving blue palette. Built with vanilla HTML/CSS/JS, [Three.js](https://threejs.org)
for the 3D, and [GSAP ScrollTrigger](https://gsap.com/scroll/) for scroll animation.

## Run locally

It's a static site — no build step. Just open `index.html` in a browser, or serve the
folder:

```bash
npx http-server -p 8123
```

## Files

- `index.html` — the entire site (markup, styles, and scripts)
- `three.min.js`, `gsap.min.js`, `ScrollTrigger.min.js` — bundled locally so it works offline

## Deploy

Hosted on Vercel — every push to `main` deploys automatically.
