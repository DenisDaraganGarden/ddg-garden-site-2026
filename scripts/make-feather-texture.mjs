// Run: S=<preview dir> node scripts/make-feather-texture.mjs
// Draws the seagull feather sprite as SVG strokes and writes it as lossless
// WebP with alpha (lossy WebP is 4:2:0 and would smear the barbs). Seeded, so
// the same file comes out every time; change the seed for a different feather.
import sharp from 'sharp';
const W = 256, H = 720;
let s = 11;
const rnd = () => { s |= 0; s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const shaft = (t) => ({ x: 132 - 16 * t + 9 * Math.sin(t * Math.PI), y: 702 - 680 * t });
const shaftDir = (t) => { const a = shaft(Math.max(0, t - 0.01)), b = shaft(Math.min(1, t + 0.01)); const l = Math.hypot(b.x - a.x, b.y - a.y); return { x: (b.x - a.x) / l, y: (b.y - a.y) / l }; };
const halfWidth = (t) => 26 + 78 * Math.pow(Math.sin(Math.PI * Math.pow(t, 0.9)), 0.9);
const smooth = (a, b, v) => { const x = Math.min(1, Math.max(0, (v - a) / (b - a))); return x * x * (3 - 2 * x); };
const f = (v) => v.toFixed(1);
const parts = [];
// Soft vane fill under the upper barbs only.
const left = [], right = [];
for (let i = 0; i <= 40; i += 1) { const t = 0.34 + (0.63 * i) / 40; const p = shaft(t), d = shaftDir(t), w = halfWidth(t) * (0.55 + 0.1 * Math.sin(i)); left.push(`${f(p.x - d.y * w)},${f(p.y + d.x * w)}`); right.push(`${f(p.x + d.y * w)},${f(p.y - d.x * w)}`); }
parts.push(`<polygon points="${[...left, ...right.reverse()].join(' ')}" fill="#e6e6e2" fill-opacity="0.14"/>`);
const barb = (t, side, thin) => {
  const p = shaft(t), d = shaftDir(t);
  // Downiness fades in smoothly toward the quill instead of switching on.
  const dn = smooth(0.42, 0.1, t);
  const nx = -d.y * side, ny = d.x * side;
  // Angle from the shaft toward the tip: ~36deg at the tip, ~46 mid, ~66 at the base.
  const fromShaft = 0.62 + 0.55 * Math.pow(1 - t, 1.3) + (rnd() - 0.5) * 0.2 + dn * rnd() * 0.35;
  const dirX = d.x * Math.cos(fromShaft) + nx * Math.sin(fromShaft), dirY = d.y * Math.cos(fromShaft) + ny * Math.sin(fromShaft);
  const len = halfWidth(t) * (0.65 + rnd() * 0.45) * (1 + dn * rnd() * 0.3) * (thin ? 0.85 : 1);
  const wob = 4 + dn * 10 + len * 0.08;
  const w1 = (rnd() - 0.5) * wob, w2 = (rnd() - 0.5) * wob * 1.6, w3 = (rnd() - 0.5) * wob;
  // Barbs sag back toward the base along their length.
  const sag = len * (0.06 + rnd() * 0.1) * (1 - dn);
  const c1x = p.x + dirX * len * 0.35 + nx * w1, c1y = p.y + dirY * len * 0.35 + ny * w1;
  const c2x = p.x + dirX * len * 0.7 + nx * w2 - d.x * sag * 0.5, c2y = p.y + dirY * len * 0.7 + ny * w2 - d.y * sag * 0.5;
  const ex = p.x + dirX * len + nx * w3 - d.x * sag, ey = p.y + dirY * len + ny * w3 - d.y * sag;
  const g = 200 + Math.round(rnd() * 55);
  const op = (thin ? 0.16 + rnd() * 0.3 : 0.4 + rnd() * 0.45) * (1 - 0.4 * dn);
  const sw = (thin ? 0.45 + rnd() * 0.4 : 0.85 + rnd() * 0.6) * (1 - 0.2 * dn);
  return `<path d="M${f(p.x)},${f(p.y)} C${f(c1x)},${f(c1y)} ${f(c2x)},${f(c2y)} ${f(ex)},${f(ey)}" stroke="rgb(${g},${g},${g - 3})" stroke-opacity="${op.toFixed(2)}" stroke-width="${sw.toFixed(2)}" fill="none" stroke-linecap="round"/>`;
};
for (let side = -1; side <= 1; side += 2) {
  let split = 0;
  for (let t = 0.04; t < 0.99; t += 0.0022 + rnd() * 0.0012) {
    if (split <= 0 && rnd() < 0.05) split = 3 + Math.floor(rnd() * 5);
    if (split > 0) { split -= 1; if (rnd() < 0.6) continue; }
    parts.push(barb(t, side, false));
    if (rnd() < 0.7) parts.push(barb(t + rnd() * 0.002, side, true));
  }
}
const spine = []; for (let i = 0; i <= 24; i += 1) { const p = shaft(i / 24); spine.push(`${f(p.x)},${f(p.y)}`); }
parts.push(`<polyline points="${spine.join(' ')}" stroke="#f3f3ef" stroke-opacity="0.9" stroke-width="2.6" fill="none" stroke-linecap="round"/>`);
parts.push(`<polyline points="${spine.slice(0, 8).join(' ')}" stroke="#ffffff" stroke-opacity="0.9" stroke-width="4.6" fill="none" stroke-linecap="round"/>`);
parts.push(`<polyline points="${spine.slice(7).join(' ')}" stroke="#ffffff" stroke-opacity="0.55" stroke-width="1.2" fill="none" stroke-linecap="round"/>`);
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${parts.join('')}</svg>`;
const rgba = await sharp(Buffer.from(svg)).ensureAlpha().blur(0.8).png().toBuffer();
const out = 'public/models/seagull/textures/seagull_feather.webp';
await sharp(rgba).webp({ lossless: true, effort: 6 }).toFile(out);
const S = process.env.S;
if (S) await sharp({ create: { width: W, height: H, channels: 3, background: '#000' } }).composite([{ input: rgba }]).png().toFile(`${S}/feather-preview.png`);
console.log(out, (await sharp(out).toBuffer()).length, 'bytes');
