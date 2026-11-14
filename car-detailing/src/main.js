import './style.css';
import 'lenis/dist/lenis.css';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
import { FrameSequence, framePath } from './sequence.js';
import { PRICES } from './config.js';

gsap.registerPlugin(ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true }); // iOS toolbar show/hide shouldn't re-layout

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const mobile = matchMedia('(max-width: 820px), (pointer: coarse)').matches;
const root = document.documentElement;
root.classList.add(reduced ? 'is-reduced' : 'is-motion');

const loader = $('.loader');
const hideLoader = () => { root.classList.add('is-loaded'); setTimeout(() => loader.remove(), 900); };

let lenis = null;
let seqTrigger = null;
let chapterWindows = [];

init();

async function init() {
  setupStaticUI();
  let manifest;
  try {
    manifest = await (await fetch('/frames/manifest.json', { cache: 'no-cache' })).json();
  } catch (e) {
    console.error('Could not load /frames/manifest.json — run `npm run frames`.', e);
    root.classList.replace('is-motion', 'is-reduced');
    hideLoader();
    return;
  }
  const set = mobile ? manifest.mobile : manifest.desktop;

  // Before/after images (slider + reduced-motion hero) use the first and last frames.
  // TODO: swap for real photos by setting src directly in index.html and removing data-frame.
  for (const img of $$('img[data-frame]')) img.src = framePath(manifest, manifest.desktop, img.dataset.frame);

  if (reduced) { hideLoader(); return; }

  // ---------- Smooth scroll ----------
  lenis = new Lenis({ lerp: 0.1, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  lenis.stop(); // until first frames are in

  // ---------- Image sequence ----------
  const seq = new FrameSequence($('.seq__canvas'), manifest, set);
  const pct = $('[data-pct]'), bar = $('[data-bar]');
  const ready = seq.load((p) => { pct.textContent = Math.round(p * 100); bar.style.transform = `scaleX(${p})`; });
  seq.resize();
  addEventListener('resize', () => seq.resize());
  gsap.ticker.add(seq.tick); // gsap's ticker is requestAnimationFrame

  // ---------- Chapters timed to the clips ----------
  const chapters = $$('.chapter');
  chapterWindows = chapters.map((_, i) => {
    const c = manifest.clips.length === chapters.length ? manifest.clips[i]
      : { from: i / chapters.length, to: (i + 1) / chapters.length }; // fallback: even spread
    return [c.from, c.to];
  });

  const tl = gsap.timeline({ defaults: { ease: 'none' } });
  chapters.forEach((ch, i) => {
    const [a, b] = chapterWindows[i], w = b - a;
    const parts = $$('.reveal', ch);
    if (i === 0) gsap.set(parts, { autoAlpha: 1, y: 0 });
    else tl.fromTo(parts, { autoAlpha: 0, y: 60 }, { autoAlpha: 1, y: 0, duration: w * 0.2, stagger: w * 0.03 }, a + w * 0.06);
    if (i < chapters.length - 1) tl.to(parts, { autoAlpha: 0, y: -50, duration: w * 0.16, stagger: w * 0.02 }, b - w * 0.24);
  });
  tl.to('.scroll-hint', { autoAlpha: 0, duration: 0.03 }, 0.01);
  tl.set({}, {}, 1); // timeline length = 1 so positions are scroll progress

  const stepEl = $('[data-step]'), stepBar = $('.step-pill__bar');
  let step = -1;
  seqTrigger = ScrollTrigger.create({
    trigger: '.seq',
    start: 'top top',
    end: 'bottom bottom',
    animation: tl,
    scrub: true,
    onUpdate(self) {
      seq.setProgress(self.progress);
      stepBar.style.transform = `scaleX(${self.progress})`;
      const s = Math.max(0, chapterWindows.findLastIndex(([a]) => self.progress >= a - 0.001));
      if (s !== step) {
        step = s;
        stepEl.textContent = `Step ${s + 1} · ${chapters[s].dataset.step}`;
        gsap.fromTo(stepEl, { autoAlpha: 0, y: 6 }, { autoAlpha: 1, y: 0, duration: 0.35 });
      }
    },
    onToggle: (self) => root.classList.toggle('in-seq', self.isActive),
  });
  root.classList.add('in-seq');

  // Booking bar hides while the booking form itself is on screen
  ScrollTrigger.create({ trigger: '#book', start: 'top 85%', end: 'bottom top', onToggle: (s) => root.classList.toggle('bar-hidden', s.isActive) });

  // Section entrance animations
  for (const el of $$('.section__head, .card, .review, .ba, .faq details, .form')) {
    gsap.from(el, { autoAlpha: 0, y: 40, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%' } });
  }

  await ready;
  hideLoader();
  lenis.start();
  ScrollTrigger.refresh();
}

/** Scroll to a target: a chapter index (inside the pinned sequence) or a selector. */
function goTo(target) {
  if (typeof target === 'number' && seqTrigger) {
    const [a, b] = chapterWindows[target];
    const p = a + (b - a) * 0.4;
    const y = seqTrigger.start + p * (seqTrigger.end - seqTrigger.start);
    return lenis ? lenis.scrollTo(y, { duration: 1.6 }) : scrollTo(0, y);
  }
  const el = typeof target === 'string' ? $(target) : null;
  if (!el) return;
  if (lenis) lenis.scrollTo(el, { offset: -20, duration: 1.4 });
  else el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
}

function setupStaticUI() {
  $('[data-year]').textContent = new Date().getFullYear();

  // Nav: Wash / Polish / Pick-up jump to chapters of the wash; anchors elsewhere
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const goto = a.dataset.goto;
    if (goto != null && seqTrigger) { e.preventDefault(); goTo(Number(goto)); return; }
    if (goto != null) { e.preventDefault(); goTo('#services'); return; } // reduced motion: no sequence
    const href = a.getAttribute('href');
    if (href === '#top') { e.preventDefault(); lenis ? lenis.scrollTo(0, { duration: 1.6 }) : scrollTo(0, 0); }
    else if (href.length > 1 && $(href)) { e.preventDefault(); goTo(href); }
  });

  // Prices from config
  for (const el of $$('[data-price]')) el.textContent = `$${PRICES[el.dataset.price].Sedan}`;

  // Floating booking bar → live quote, then prefill the form
  const bar = $('.bookbar'), form = $('.form'), quote = $('[data-quote]');
  const updateQuote = () => { quote.textContent = `· $${PRICES[bar.service.value][bar.vehicle.value]}`; };
  bar.addEventListener('change', updateQuote);
  updateQuote();
  bar.addEventListener('submit', (e) => {
    e.preventDefault();
    form.vehicle.value = bar.vehicle.value;
    form.service.value = bar.service.value;
    goTo('#book');
    setTimeout(() => form.elements.namedItem('name').focus({ preventScroll: true }), 1200);
  });
  // Service cards → preselect service
  for (const b of $$('[data-pick]')) b.addEventListener('click', () => {
    form.service.value = bar.service.value = b.dataset.pick; updateQuote(); goTo('#book');
  });

  // Before/after slider
  const ba = $('.ba');
  $('.ba__range').addEventListener('input', (e) => ba.style.setProperty('--pos', e.target.value + '%'));

  // Booking form
  form.date.min = new Date().toISOString().slice(0, 10);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const msg = $('.form__msg');
    if (!form.checkValidity()) { msg.textContent = 'Please fill in every field.'; form.reportValidity(); return; }
    const data = Object.fromEntries(new FormData(form));
    try {
      await submitBooking(data);
      msg.textContent = `Thanks ${data.name.split(' ')[0]} — we'll call you to confirm your ${data.service.toLowerCase()}.`;
      form.reset();
    } catch {
      msg.textContent = 'Something went wrong. Please call us instead.';
    }
  });
}

// TODO: send bookings somewhere real. Example with Formspree:
//   return fetch('https://formspree.io/f/YOUR_ID', { method: 'POST', headers: { Accept: 'application/json' }, body: JSON.stringify(data) })
//     .then((r) => { if (!r.ok) throw new Error(r.status); });
async function submitBooking(data) {
  console.info('Booking request (not sent anywhere yet):', data);
}
