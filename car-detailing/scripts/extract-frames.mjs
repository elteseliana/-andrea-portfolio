// Turns every clip in /footage (sorted by name: 01-, 02-, 03- ...) into ONE continuous,
// numbered WebP image sequence + a manifest the site reads at runtime.
//
//   npm run frames                       (defaults below)
//   npm run frames -- --fps 30 --quality 75 --width 1920 --mobile-width 900
//
// Output:
//   public/frames/desktop/0001.webp ...  (~1920px wide, every frame)
//   public/frames/mobile/0001.webp  ...  (~900px wide, every other frame)
//   public/frames/manifest.json          (counts, sizes, clip boundaries, cache-busting version)
//   public/og-image.jpg                  (1200x630 Open Graph image from the final "reveal" frame)
import { execFileSync, spawnSync } from 'node:child_process';
import { readdirSync, mkdirSync, rmSync, renameSync, writeFileSync, statSync } from 'node:fs';
import { join, dirname, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (name, def) => {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? Number(process.argv[i + 1]) : def;
};
const FPS = arg('fps', 24);
const WIDTH = arg('width', 1920);
const MOBILE_WIDTH = arg('mobile-width', 900);
const QUALITY = arg('quality', 80);
const MOBILE_STEP = arg('mobile-step', 2); // keep every Nth frame on mobile

if (spawnSync('ffmpeg', ['-version']).error) {
  console.error(`\nffmpeg is not installed. Install it, then re-run "npm run frames":
  macOS:          brew install ffmpeg
  Ubuntu/Debian:  sudo apt-get install -y ffmpeg
  Windows:        winget install Gyan.FFmpeg\n`);
  process.exit(1);
}

const footageDir = join(root, 'footage');
const clips = readdirSync(footageDir)
  .filter((f) => /\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(f))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
if (!clips.length) { console.error('No video clips found in /footage'); process.exit(1); }

const outRoot = join(root, 'public', 'frames');
const outDesk = join(outRoot, 'desktop');
const outMob = join(outRoot, 'mobile');
rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outDesk, { recursive: true });
mkdirSync(outMob, { recursive: true });

const pad = (n) => String(n).padStart(4, '0');
const tmp = join(tmpdir(), 'frames-' + Date.now());

function extract(clip, width, dir) {
  mkdirSync(dir, { recursive: true });
  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-i', join(footageDir, clip), '-an',
    '-vf', `fps=${FPS},scale=${width}:-2:flags=lanczos`,
    '-c:v', 'libwebp', '-quality', String(QUALITY), '-compression_level', '4',
    join(dir, '%05d.webp'),
  ], { stdio: 'inherit' });
  return readdirSync(dir).filter((f) => f.endsWith('.webp')).sort();
}

const clipInfo = [];
let g = 0;  // global desktop frame index (0-based)
let m = 0;  // global mobile frame counter
for (const clip of clips) {
  console.log(`→ ${clip}`);
  const d = extract(clip, WIDTH, join(tmp, clip, 'd'));
  const mm = extract(clip, MOBILE_WIDTH, join(tmp, clip, 'm'));
  const start = g;
  d.forEach((f, i) => {
    renameSync(join(tmp, clip, 'd', f), join(outDesk, pad(g + 1) + '.webp'));
    if (g % MOBILE_STEP === 0 && mm[i]) renameSync(join(tmp, clip, 'm', mm[i]), join(outMob, pad(++m) + '.webp'));
    g++;
  });
  clipInfo.push({ name: basename(clip, extname(clip)), start, count: g - start });
}
rmSync(tmp, { recursive: true, force: true });

const probe = (file) => execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
  'stream=width,height', '-of', 'csv=p=0', file]).toString().trim().split(',').map(Number);
const [dw, dh] = probe(join(outDesk, pad(1) + '.webp'));
const [mw, mh] = probe(join(outMob, pad(1) + '.webp'));

const manifest = {
  version: Date.now().toString(36),  // appended as ?v= so browsers/CDN never show stale frames
  fps: FPS,
  desktop: { count: g, width: dw, height: dh, path: 'frames/desktop/' },
  mobile: { count: m, width: mw, height: mh, path: 'frames/mobile/', step: MOBILE_STEP },
  // Clip boundaries as 0..1 progress — the site times chapters to these.
  clips: clipInfo.map((c) => ({ name: c.name, from: +(c.start / g).toFixed(4), to: +((c.start + c.count) / g).toFixed(4) })),
};
writeFileSync(join(outRoot, 'manifest.json'), JSON.stringify(manifest, null, 2));

// Open Graph image from the final (glossy) frame.
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', join(outDesk, pad(g) + '.webp'),
  '-vf', 'scale=1200:630:force_original_aspect_ratio=increase,crop=1200:630', '-q:v', '3',
  join(root, 'public', 'og-image.jpg')]);

const size = (dir) => readdirSync(dir).reduce((s, f) => s + statSync(join(dir, f)).size, 0) / 1e6;
console.log(`\n✓ ${g} desktop frames (${dw}x${dh}, ${size(outDesk).toFixed(1)} MB)`);
console.log(`✓ ${m} mobile frames (${mw}x${mh}, ${size(outMob).toFixed(1)} MB)`);
console.log(`✓ clips: ${manifest.clips.map((c) => `${c.name} ${c.from}–${c.to}`).join(' | ')}`);
