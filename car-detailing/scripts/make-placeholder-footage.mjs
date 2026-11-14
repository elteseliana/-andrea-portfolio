// Generates 5 DEMO clips in /footage so the pipeline can be tested without real video.
// Delete /footage/*.mp4 and drop in your real clips when you have them.
//   node scripts/make-placeholder-footage.mjs
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const names = ['01-dirty', '02-foam', '03-rinse', '04-polish', '05-reveal'];
const FPS = 24, SECONDS = 3, PER = FPS * SECONDS;
const tmp = join(tmpdir(), 'placeholder-footage');
rmSync(tmp, { recursive: true, force: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto('file://' + join(root, 'scripts/placeholder-scene.html'));
mkdirSync(join(root, 'footage'), { recursive: true });

for (let ci = 0; ci < names.length; ci++) {
  const dir = join(tmp, names[ci]); mkdirSync(dir, { recursive: true });
  for (let f = 0; f < PER; f++) {
    const T = (ci + f / PER) / names.length;
    const url = await page.evaluate((t) => window.render(t), T);
    writeFileSync(join(dir, String(f).padStart(4, '0') + '.jpg'), Buffer.from(url.split(',')[1], 'base64'));
  }
  const out = join(root, 'footage', names[ci] + '.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', join(dir, '%04d.jpg'),
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', out]);
  console.log('wrote', out);
}
await browser.close();
rmSync(tmp, { recursive: true, force: true });
