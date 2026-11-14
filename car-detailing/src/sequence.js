import { SEQUENCE } from './config.js';

const pad = (n) => String(n).padStart(4, '0');
const BG = '#07080a';

/**
 * Scroll-scrubbed image sequence on a single <canvas>.
 * - Loads first frames + a coarse spread first (so any scroll position has a nearby frame),
 *   then fills the gaps, nearest-to-the-current-scroll-position first.
 * - Never shows a blank: if the wanted frame isn't decoded yet, the nearest decoded one is drawn.
 * - tick() is called once per animation frame and draws only when the visible frame changes.
 */
export class FrameSequence {
  constructor(canvas, manifest, set) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.set = set;
    this.version = manifest.version;
    this.count = set.count;
    this.frames = new Array(this.count).fill(null);
    this.state = new Uint8Array(this.count); // 0 idle, 1 loading, 2 ready, 3 failed
    this.target = 0;      // wanted frame (float index)
    this.drawn = -1;      // frame index currently on the canvas
    this.dirty = true;    // force a redraw (resize)
    this.critical = this.#criticalOrder();
    this.criticalSet = new Set(this.critical);
    this.queue = [...this.critical];
  }

  url(i) { return `/${this.set.path}${pad(i + 1)}.webp?v=${this.version}`; }

  #criticalOrder() {
    const seen = new Set(), order = [];
    const push = (i) => { if (i >= 0 && i < this.count && !seen.has(i)) { seen.add(i); order.push(i); } };
    for (let i = 0; i < SEQUENCE.firstFrames; i++) push(i);
    push(this.count - 1);
    for (let i = 0; i < this.count; i += SEQUENCE.criticalStride) push(i);
    return order;
  }

  /** Next frame to fetch: critical list first, then the unloaded frame nearest the scroll position. */
  #next() {
    while (this.queue.length) { const i = this.queue.shift(); if (this.state[i] === 0) return i; }
    const t = Math.round(this.target);
    for (let d = 0; d < this.count; d++) {
      if (t + d < this.count && this.state[t + d] === 0) return t + d;
      if (t - d >= 0 && this.state[t - d] === 0) return t - d;
    }
    return -1;
  }

  async #load(i) {
    this.state[i] = 1;
    const img = new Image();
    img.decoding = 'async';
    img.src = this.url(i);
    try { await img.decode(); this.frames[i] = img; this.state[i] = 2; }
    catch { this.state[i] = 3; }
  }

  /** Starts loading. Resolves when the critical set is in (page can be shown). */
  load(onProgress) {
    return new Promise((resolve) => {
      let done = 0, resolved = false;
      const worker = async () => {
        for (let i = this.#next(); i !== -1; i = this.#next()) {
          const wasCritical = this.criticalSet.has(i);
          await this.#load(i);
          if (wasCritical) {
            done++;
            onProgress?.(done / this.critical.length);
            if (done === this.critical.length && !resolved) { resolved = true; resolve(); }
          }
        }
        if (!resolved) { resolved = true; resolve(); }
      };
      for (let k = 0; k < SEQUENCE.concurrency; k++) worker();
    });
  }

  setProgress(p) { this.target = Math.min(1, Math.max(0, p)) * (this.count - 1); }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, SEQUENCE.maxDpr);
    const r = this.canvas.getBoundingClientRect();
    const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
    if (w === this.canvas.width && h === this.canvas.height) return;
    this.canvas.width = w; this.canvas.height = h; // this clears the canvas…
    this.dirty = true;
    this.tick();                                    // …so redraw immediately: no blank frame
  }

  #nearestReady(i) {
    if (this.state[i] === 2) return i;
    for (let d = 1; d < this.count; d++) {
      if (i - d >= 0 && this.state[i - d] === 2) return i - d;   // prefer the earlier frame
      if (i + d < this.count && this.state[i + d] === 2) return i + d;
    }
    return -1;
  }

  tick = () => {
    const i = this.#nearestReady(Math.round(this.target));
    if (i === -1 || (i === this.drawn && !this.dirty)) return; // never redraw the same frame
    this.#draw(this.frames[i]);
    this.drawn = i;
    this.dirty = false;
  };

  #draw(img) {
    const { width: cw, height: ch } = this.canvas, ctx = this.ctx;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    let s = Math.max(cw / iw, ch / ih); // "cover"
    // Tall phone screens: cover would crop most of a landscape clip, so allow letterboxing
    // to keep at least `portraitMinVisible` of the footage width on screen.
    if (ch > cw) s = Math.min(s, cw / (iw * SEQUENCE.portraitMinVisible));
    const dw = iw * s, dh = ih * s;
    const letterbox = dh < ch;
    const dx = (cw - dw) / 2, dy = letterbox ? (ch - dh) * 0.62 : (ch - dh) / 2; // sit below the headline
    if (letterbox || dw < cw) { ctx.fillStyle = BG; ctx.fillRect(0, 0, cw, ch); }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, dx, dy, dw, dh);
    if (letterbox) { // feather the top/bottom edges into the page background
      const f = dh * 0.18;
      for (const [y0, y1] of [[dy, dy + f], [dy + dh, dy + dh - f]]) {
        const g = ctx.createLinearGradient(0, y0, 0, y1);
        g.addColorStop(0, BG); g.addColorStop(1, 'rgba(7,8,10,0)');
        ctx.fillStyle = g; ctx.fillRect(0, Math.min(y0, y1), cw, f);
      }
    }
  }
}

export const framePath = (manifest, set, which) =>
  `/${set.path}${pad(which === 'last' ? set.count : 1)}.webp?v=${manifest.version}`;
