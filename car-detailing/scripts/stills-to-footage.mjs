// Turns 3 matching stills (same camera angle) into the 5 wash clips in /footage:
//   stills/01-*.jpg (foamed/dirty) → stills/02-*.jpg (rinse) → stills/03-*.jpg (clean)
// with slow crossfades and one continuous camera push-in, so the clips join seamlessly.
//   npm run stills && npm run frames
// If you get real video later, skip this: put the clips in /footage and run `npm run frames`.
import { execFileSync } from 'node:child_process';
import { readdirSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stills = readdirSync(join(root, 'stills')).filter((f) => /\.(jpe?g|png|webp)$/i.test(f)).sort();
if (stills.length !== 3) { console.error('Expected exactly 3 images in /stills (foam, rinse, clean).'); process.exit(1); }

const FPS = 24, TOTAL = 15;            // 15 s → 360 frames
// Timeline: foam hold 0–3.5 | fade to rinse 3.5–5.5 | rinse hold | fade to clean 9.5–11.5 | clean hold → 15
const [A, B, C] = [5.5, 8, 5.5];        // input lengths so the xfades land at 3.5 s and 9.5 s
const N = FPS * TOTAL;
const master = join(tmpdir(), 'wash-master.mp4');

const inputs = stills.flatMap((f, i) => ['-loop', '1', '-framerate', String(FPS), '-t', String([A, B, C][i]), '-i', join(root, 'stills', f)]);
// Upscale 2x first so zoompan moves in sub-pixel steps (no jitter); ease the push-in, extra push at the reveal.
const prep = (i) => `[${i}:v]scale=3840:2160:force_original_aspect_ratio=increase:flags=lanczos,crop=3840:2160,setsar=1,format=yuv420p[v${i}]`;
const z = `1+0.10*(on/${N})+0.06*pow(max(0,(on-${N * 0.8})/${N * 0.2}),2)`;
const filter = [prep(0), prep(1), prep(2),
  `[v0][v1]xfade=transition=fade:duration=2:offset=3.5[ab]`,
  `[ab][v2]xfade=transition=fade:duration=2:offset=9.5[abc]`,
  `[abc]zoompan=z='${z}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1920x1080:fps=${FPS}[out]`].join(';');

console.log('rendering master…');
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '[out]',
  '-frames:v', String(N), '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', master], { stdio: 'inherit' });

const footage = join(root, 'footage');
rmSync(footage, { recursive: true, force: true }); mkdirSync(footage);
const names = ['01-arrive', '02-wash', '03-inspect', '04-polish', '05-reveal'];
names.forEach((name, i) => {
  // frame-accurate split: 72 frames each
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', master, '-vf', `select='between(n,${i * 72},${i * 72 + 71})',setpts=N/${FPS}/TB`,
    '-r', String(FPS), '-c:v', 'libx264', '-crf', '16', '-pix_fmt', 'yuv420p', join(footage, name + '.mp4')]);
  console.log('wrote footage/' + name + '.mp4');
});
rmSync(master, { force: true });
