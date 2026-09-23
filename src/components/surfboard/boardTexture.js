import * as THREE from 'three';
import { colorPickerToArtisticAlbedo } from '../effects/water/pbrMaterial.js';
import { DEFAULT_SURFBOARD_SETTINGS } from './settings.js';
import { SURFBOARD_UV_ARC, arcAtX, finLayout, halfWidth, sectionCurve } from './boardShape.js';

// The board's paint job, drawn into a canvas in the hull's UV space:
// x = u along the length (0 tail .. 1 nose), y = arc length from the deck
// centre over SURFBOARD_UV_ARC. Both halves share it (the UV is mirrored), which
// is right for a symmetric board. Every feature is placed in metres through the
// shape itself, so a stripe stays 6 cm wide and the carbon stays 1.5 cm in from
// the edge whatever the board's size.
//
// Three steps, so a colour picker dragged in the editor repaints and nothing
// more: the layout (the sections and the rail insets, the costly part, from
// the shape alone), one canvas texture for the model's life, and the paint.

export const BOARD_TEXTURE_SIZE = Object.freeze([2048, 1024]);
const STRIPE_WIDTH = 0.06;
const STRIPE_SPACING = 0.1; // of the length, between stripe centres
const STRIPE_CENTRE = 0.63; // of the length from the nose, the middle of the group
const RAIL_BAND_DECK = 0.015; // carbon seen from above, measured in from the outline
const RAIL_BAND_BOTTOM = 0.012; // how far the wrap reaches onto the bottom
const STRINGER_HALF = 0.002;
const TOW = 0.004; // carbon tow width; a 2×2 twill repeats every four tows

// Stations (u) of the stripe centres: two at 58% and 68% from the nose, one in
// between them, three spread at the same spacing around it.
export function stripeStations(count) {
  const n = Math.max(0, Math.min(3, Math.round(Number(count) || 0)));
  return Array.from({ length: n }, (_, i) => 1 - (STRIPE_CENTRE + (i - (n - 1) / 2) * STRIPE_SPACING));
}

// Picker colours are art-directed linear albedo in this scene (pbrMaterial.js).
// Painting their sRGB encoding into an sRGB texture lands the same albedo.
const paint = (value, fallback) => `#${colorPickerToArtisticAlbedo(value, fallback).getHexString()}`;
const shade = (value, fallback, scale) => `#${colorPickerToArtisticAlbedo(value, fallback).multiplyScalar(scale).getHexString()}`;

function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const [WIDTH, HEIGHT] = BOARD_TEXTURE_SIZE;
const px = (u) => u * WIDTH;
const py = (arc) => (arc / SURFBOARD_UV_ARC) * HEIGHT;
const STATIONS = 400;
const OUTLINE = 700;

// Everything the paint needs from the shape alone. Pure data: node can run it.
export function boardTextureLayout(dims) {
  const { length } = dims;
  // One dense section per station, reused by every feature of the paint.
  const curves = Array.from({ length: STATIONS + 1 }, (_, i) => sectionCurve(dims, i / STATIONS, 48));

  // The carbon rail wrap is everything within 1.5 cm of the outline seen from
  // above and 1.2 cm from below. The inset outline is offset in plan — along
  // the outline's normal, so the band keeps its width round the nose and across
  // the squash — then mapped into UV through the section, in canvas pixels.
  const outline = Array.from({ length: OUTLINE + 1 }, (_, k) => {
    const u = (1 - Math.cos((Math.PI * k) / OUTLINE)) / 2;
    return { z: (u - 0.5) * length, x: halfWidth(dims, u) };
  });
  const inset = (distance, side) => outline.map((point, k) => {
    const before = outline[Math.max(0, k - 1)], after = outline[Math.min(OUTLINE, k + 1)];
    const dz = after.z - before.z, dx = after.x - before.x, norm = Math.hypot(dz, dx) || 1;
    const z = point.z + (distance * dx) / norm;
    const x = Math.max(0, point.x - (distance * dz) / norm);
    const u = Math.min(1, Math.max(0, z / length + 0.5));
    return [px(u), py(arcAtX(sectionCurve(dims, u, 48), x, side))];
  });
  return { dims, curves, deckInset: inset(RAIL_BAND_DECK, 'deck'), bottomInset: inset(RAIL_BAND_BOTTOM, 'bottom') };
}

// The one texture a model paints into, blank; null outside a browser.
export function createBoardTexture() {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.name = 'surfboard-paint';
  return texture;
}

// Paints the whole canvas over (the glass first, opaque), so a repaint in
// place leaves nothing of the last one. The caller flags the texture.
export function paintBoardTexture(canvas, settings, layout) {
  const colour = (key) => settings?.[key] ?? DEFAULT_SURFBOARD_SETTINGS[key];
  const fallback = (key) => DEFAULT_SURFBOARD_SETTINGS[key];
  const width = WIDTH, height = HEIGHT;
  const ctx = canvas.getContext('2d');
  const { dims, curves } = layout;
  const { length } = dims;
  const curveAt = (u) => curves[Math.round(Math.min(1, Math.max(0, u)) * STATIONS)];
  const totalArc = (curve) => curve.arc[curve.arc.length - 1];

  // Glass: the deck colour, never a flat CG white — broad, faint variations of
  // resin thickness and a little warmth where it pooled.
  ctx.fillStyle = paint(colour('surfboardDeckColor'), fallback('surfboardDeckColor'));
  ctx.fillRect(0, 0, width, height);
  const rng = random(0x5eaf);
  for (let i = 0; i < 160; i += 1) {
    const x = rng() * width, y = rng() * height * 0.9, r = 20 + rng() * 150;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    const warm = rng() < 0.55;
    gradient.addColorStop(0, warm ? 'rgba(236, 226, 200, 0.07)' : 'rgba(255, 255, 255, 0.08)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, 2 * r, 2 * r);
  }

  // Stringer, on the deck centre (v = 0) and on the bottom centre; painted past
  // the bottom centre too, so filtering across the mirror seam finds wood.
  const stringer = paint(colour('surfboardStringerColor'), fallback('surfboardStringerColor'));
  const grain = shade(colour('surfboardStringerColor'), fallback('surfboardStringerColor'), 0.72);
  ctx.fillStyle = stringer;
  ctx.fillRect(0, 0, width, py(STRINGER_HALF));
  ctx.beginPath();
  curves.forEach((curve, i) => ctx.lineTo(px(i / STATIONS), py(totalArc(curve) - STRINGER_HALF)));
  for (let i = STATIONS; i >= 0; i -= 1) ctx.lineTo(px(i / STATIONS), py(totalArc(curves[i]) + STRINGER_HALF * 2));
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = grain;
  ctx.globalAlpha = 0.5;
  ctx.fillRect(0, py(STRINGER_HALF * 0.45), width, 1);
  ctx.globalAlpha = 1;

  // Fin plugs: two per fin, faint grey through the deck, the plastic itself on
  // the bottom. The left fin mirrors the right in UV, so it is not drawn twice.
  finLayout(dims).filter((fin) => fin.id !== 'left').forEach((fin) => {
    const chord = new THREE.Vector3(0, 0, 1).applyQuaternion(fin.quaternion);
    [0.22, 0.78].forEach((along) => {
      const z = fin.position.z + chord.z * fin.base * along;
      const x = fin.position.x + chord.x * fin.base * along;
      const curve = curveAt(z / length + 0.5);
      const u = px(z / length + 0.5), du = px(0.026 / length);
      [[arcAtX(curve, x, 'deck'), 'rgba(96, 96, 92, 0.09)', 1.25], [arcAtX(curve, x, 'deck'), 'rgba(96, 96, 92, 0.12)', 0.9],
        [arcAtX(curve, x, 'bottom'), paint(colour('surfboardFinColor'), fallback('surfboardFinColor')), 1]].forEach(([arc, fill, grow]) => {
        const dv = py(0.017) * grow;
        ctx.fillStyle = fill;
        ctx.beginPath();
        ctx.roundRect(u - (du * grow) / 2, py(arc) - dv / 2, du * grow, dv, Math.min(du, dv) * 0.45 * grow);
        ctx.fill();
      });
    });
  });

  // Stripes across the deck, rail apex to rail apex; the carbon covers their ends.
  ctx.fillStyle = paint(colour('surfboardStripeColor'), fallback('surfboardStripeColor'));
  stripeStations(settings?.surfboardStripes ?? DEFAULT_SURFBOARD_SETTINGS.surfboardStripes).forEach((centre) => {
    const half = STRIPE_WIDTH / length / 2;
    const steps = 12;
    ctx.beginPath();
    ctx.moveTo(px(centre - half), -2);
    ctx.lineTo(px(centre + half), -2);
    for (let k = steps; k >= 0; k -= 1) {
      const u = centre - half + (2 * half * k) / steps;
      const curve = curveAt(u);
      ctx.lineTo(px(u), py(curve.arc[curve.apex]));
    }
    ctx.closePath();
    ctx.fill();
  });

  // Carbon rail wrap, filled even-odd: the whole canvas minus the deck and
  // the bottom inside the layout's insets. The tips are left to the band
  // entirely: their end walls are a sliver of u that spans every v, so
  // anything but carbon there would smear across the wall.
  const band = new Path2D();
  band.rect(-4, -4, width + 8, height + 8);
  const hole = (points, edge) => {
    band.moveTo(points[0][0], edge);
    points.forEach(([x, y]) => band.lineTo(x, y));
    band.lineTo(points[points.length - 1][0], edge);
    band.closePath();
  };
  hole(layout.deckInset, -4);
  // Past the bottom centre the canvas is unused; left unbanded it keeps the
  // stringer, which is what filtering across the mirror seam should find.
  hole(layout.bottomInset, height + 4);

  // Twill weave tile at its real size: 2×2 tows over, 2 under, stepping one
  // tow per row — a faint diagonal under the glass, not a pattern shouting.
  const tile = document.createElement('canvas');
  const tileU = Math.max(4, Math.round(px((4 * TOW) / length)));
  const tileV = Math.max(4, Math.round(py(4 * TOW)));
  tile.width = tileU;
  tile.height = tileV;
  const weave = tile.getContext('2d');
  const rail = colour('surfboardRailColor'), railFallback = fallback('surfboardRailColor');
  for (let i = 0; i < 4; i += 1) {
    for (let k = 0; k < 4; k += 1) {
      const over = (i + k) % 4 < 2;
      const x0 = Math.round((i * tileU) / 4), x1 = Math.round(((i + 1) * tileU) / 4);
      const y0 = Math.round((k * tileV) / 4), y1 = Math.round(((k + 1) * tileV) / 4);
      weave.fillStyle = shade(rail, railFallback, over ? 1.07 : 0.93);
      weave.fillRect(x0, y0, x1 - x0, y1 - y0);
      // A tow is a bundle: lighter along its middle, the way it catches light.
      weave.fillStyle = shade(rail, railFallback, over ? 1.13 : 0.97);
      if (over) weave.fillRect(x0, y0 + Math.floor((y1 - y0) / 3), x1 - x0, Math.max(1, Math.floor((y1 - y0) / 3)));
      else weave.fillRect(x0 + Math.floor((x1 - x0) / 3), y0, Math.max(1, Math.floor((x1 - x0) / 3)), y1 - y0);
    }
  }
  ctx.fillStyle = ctx.createPattern(tile, 'repeat');
  ctx.fill(band, 'evenodd');
  // The end walls of the squash and the nose tip span a few centimetres across
  // but only a few texels of u; the weave would stretch there into big chevrons,
  // so the first and last columns are plain carbon.
  ctx.fillStyle = paint(rail, railFallback);
  ctx.fillRect(0, 0, 4, height);
  ctx.fillRect(width - 4, 0, 4, height);
}
