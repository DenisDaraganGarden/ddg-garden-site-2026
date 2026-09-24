import * as THREE from 'three';

// Bikini Point's signs as painted canvases, after Denis's photos: the
// bikini-shaped BIKINI POINT, a painted board NO BAD DAYS, JUST FLAT DAYS.
// with the glum surfer on his board, the whitewashed planks of SURFING IS MY
// FULL-TIME JOB (UNPAID), a rusty yellow diamond NAKED SURFING and a round
// CHILL. Each is drawn in its plate's own metres — `bounds` [x0, y0, x1, y1]
// of the shape whose uv is (x, y) — or over a board face's 0…1, and knocked
// about a little: scuffs, grime, rust from the bolts. Browser only.

const HAND = '"Marker Felt", "Chalkboard SE", "Comic Sans MS", cursive';
const COMIC = '"Comic Sans MS", "Chalkboard SE", "Marker Felt", cursive';
const BOLD = '"Arial Black", "Helvetica Neue", Arial, sans-serif';
const STENCIL = 'Stencil, "Stencil Std", Impact, "Arial Black", sans-serif';

function seeded(seed) {
  let state = seed % 2147483647 || 1;
  return () => (state = (state * 16807) % 2147483647) / 2147483647;
}
function texture(width, height, draw) {
  const canvas = Object.assign(document.createElement('canvas'), { width, height });
  draw(canvas.getContext('2d'), width, height);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  return map;
}
// A shape's texture: uv (x, y) in metres onto the canvas.
function fitTo(map, [x0, y0, x1, y1]) {
  map.repeat.set(1 / (x1 - x0), 1 / (y1 - y0));
  map.offset.set(-x0 / (x1 - x0), -y0 / (y1 - y0));
  return map;
}
// Wear on any face: flecks of dirt and of chipped paint, a darker rim.
function scuff(context, width, height, random, amount = 1, rim = 0.12) {
  for (let k = 0; k < 140 * amount; k += 1) {
    context.fillStyle = `rgba(${random() < 0.6 ? '60, 45, 30' : '255, 250, 240'}, ${0.05 + random() * 0.14})`;
    context.fillRect(random() * width, random() * height, 1 + random() * width * 0.012, 1 + random() * height * 0.006);
  }
  const edge = context.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.3, width / 2, height / 2, Math.max(width, height) * 0.75);
  edge.addColorStop(0, 'rgba(60, 45, 30, 0)');
  edge.addColorStop(1, `rgba(60, 45, 30, ${rim})`);
  context.fillStyle = edge;
  context.fillRect(0, 0, width, height);
}
const line = (context, points, width, colour) => {
  context.strokeStyle = colour;
  context.lineWidth = width;
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.beginPath();
  points.forEach(([x, y], i) => (i ? context.lineTo(x, y) : context.moveTo(x, y)));
  context.stroke();
};

// BIKINI / POINT on red, both sides of the cut-out plates.
export function bikiniFace(text, bounds, textY) {
  const [x0, y0, x1, y1] = bounds, perMetre = 1400;
  const width = Math.round((x1 - x0) * perMetre), height = Math.round((y1 - y0) * perMetre);
  return fitTo(texture(width, height, (context) => {
    context.fillStyle = '#c8352a';
    context.fillRect(0, 0, width, height);
    let size = 0.13 * perMetre;
    context.font = `900 ${size}px ${BOLD}`;
    size *= Math.min(1, (0.62 * perMetre) / context.measureText(text).width);
    context.font = `900 ${size}px ${BOLD}`;
    context.fillStyle = '#f4efe6';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(text, -x0 * perMetre, (y1 - textY) * perMetre);
    scuff(context, width, height, seeded(text.length * 97), 0.7, 0.1);
  }), bounds);
}

// NO BAD DAYS, / JUST FLAT DAYS. — hand lettering over a painted flat sea,
// the surfer sitting on his yellow board hugging his knees, long hair, glum.
export function noBadDaysFace() {
  return texture(1024, 456, (context, width, height) => {
    const random = seeded(11);
    context.fillStyle = '#efe7d2';
    context.fillRect(0, 0, width, height);
    const sea = height * 0.72;
    const water = context.createLinearGradient(0, sea, 0, height);
    water.addColorStop(0, '#4a9bb8');
    water.addColorStop(1, '#2d7593');
    context.fillStyle = water;
    context.fillRect(0, sea, width, height - sea);
    for (let k = 0; k < 26; k += 1) {
      const x = random() * width, y = sea + 14 + random() * (height - sea - 24), w = 16 + random() * 22;
      line(context, [[x, y], [x + w * 0.25, y - 4], [x + w * 0.5, y], [x + w * 0.75, y - 4], [x + w, y]], 3, '#1f5f79');
    }
    // The board, then the surfer on it.
    const bx = width * 0.8, by = sea + 10;
    context.fillStyle = '#f0c43a';
    context.strokeStyle = '#2a2a24';
    context.lineWidth = 4;
    context.beginPath();
    context.ellipse(bx, by, width * 0.12, 11, -0.03, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    const skin = '#eab48d', ink = '#232220';
    // Back and seat, shorts, the thighs up to the knees, the shins down.
    context.fillStyle = '#39523f';
    context.beginPath();
    context.ellipse(bx - 34, by - 22, 34, 20, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    line(context, [[bx - 60, by - 30], [bx - 70, by - 110], [bx - 58, by - 150]], 34, ink);
    line(context, [[bx - 60, by - 30], [bx - 70, by - 110], [bx - 58, by - 150]], 27, skin);
    line(context, [[bx - 20, by - 30], [bx + 18, by - 104]], 30, ink);
    line(context, [[bx - 20, by - 30], [bx + 18, by - 104]], 23, skin);
    line(context, [[bx + 18, by - 104], [bx + 24, by - 8]], 26, ink);
    line(context, [[bx + 18, by - 104], [bx + 24, by - 8]], 19, skin);
    line(context, [[bx + 14, by - 6], [bx + 40, by - 6]], 12, ink);
    // Arms round the knees.
    line(context, [[bx - 56, by - 128], [bx - 8, by - 96], [bx + 22, by - 82]], 18, ink);
    line(context, [[bx - 56, by - 128], [bx - 8, by - 96], [bx + 22, by - 82]], 12, skin);
    // Head, the long fair hair down the back, a glum face.
    const hx = bx - 44, hy = by - 184;
    context.fillStyle = skin;
    context.beginPath();
    context.arc(hx, hy, 30, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = '#e6c46c';
    context.beginPath();
    context.moveTo(hx - 34, hy - 6);
    context.quadraticCurveTo(hx - 30, hy - 40, hx + 6, hy - 34);
    context.quadraticCurveTo(hx + 30, hy - 26, hx + 24, hy - 8);
    context.lineTo(hx + 4, hy - 16);
    context.quadraticCurveTo(hx - 12, hy + 40, hx - 40, hy + 76);
    context.quadraticCurveTo(hx - 52, hy + 30, hx - 34, hy - 6);
    context.fill();
    context.stroke();
    context.fillStyle = ink;
    context.fillRect(hx + 6, hy - 4, 5, 5);
    context.fillRect(hx + 20, hy - 3, 5, 5);
    line(context, [[hx + 4, hy - 12], [hx + 14, hy - 9]], 3, ink);
    line(context, [[hx + 19, hy - 9], [hx + 28, hy - 12]], 3, ink);
    line(context, [[hx + 8, hy + 16], [hx + 16, hy + 12], [hx + 24, hy + 16]], 3, ink);
    // The lettering.
    context.fillStyle = '#1b1a18';
    context.font = `bold ${height * 0.17}px ${HAND}`;
    context.textBaseline = 'alphabetic';
    context.fillText('NO BAD DAYS,', width * 0.06, height * 0.3);
    context.fillText('JUST FLAT DAYS.', width * 0.06, height * 0.55);
    scuff(context, width, height, random, 1.2, 0.22);
  });
}

// Surfing Is My / Full-Time Job / (Unpaid) ☹ — hand lettering on
// whitewashed planks, the whitewash worn to grey wood at the ends, a little
// surfer riding a curl in the corner.
export function unpaidFace() {
  return texture(800, 600, (context, width, height) => {
    const random = seeded(23), planks = 5, plank = height / planks;
    for (let p = 0; p < planks; p += 1) {
      const y = p * plank;
      context.fillStyle = '#8b857a';
      context.fillRect(0, y, width, plank);
      for (let g = 0; g < 18; g += 1) {
        context.fillStyle = `rgba(${random() < 0.5 ? '60, 55, 48' : '170, 165, 150'}, 0.25)`;
        context.fillRect(0, y + random() * plank, width, 1 + random() * 2);
      }
      // Whitewash, thinner towards the ends of each plank.
      const wash = context.createLinearGradient(0, 0, width, 0);
      const a = 0.72 + random() * 0.15;
      wash.addColorStop(0, `rgba(236, 232, 222, ${a * 0.45})`);
      wash.addColorStop(0.15 + random() * 0.1, `rgba(236, 232, 222, ${a})`);
      wash.addColorStop(0.8 + random() * 0.1, `rgba(236, 232, 222, ${a})`);
      wash.addColorStop(1, `rgba(236, 232, 222, ${a * 0.4})`);
      context.fillStyle = wash;
      context.fillRect(0, y + 2, width, plank - 4);
      context.fillStyle = 'rgba(40, 34, 28, 0.7)';
      context.fillRect(0, y + plank - 3, width, 3);
    }
    // The curl and its rider.
    const wx = width * 0.2, wy = height * 0.74;
    context.fillStyle = '#4b8fc8';
    context.beginPath();
    context.moveTo(wx - 80, wy + 50);
    context.quadraticCurveTo(wx - 60, wy - 30, wx + 10, wy - 20);
    context.quadraticCurveTo(wx - 30, wy - 4, wx - 10, wy + 26);
    context.quadraticCurveTo(wx + 40, wy + 40, wx + 90, wy + 50);
    context.closePath();
    context.fill();
    line(context, [[wx - 70, wy + 44], [wx - 40, wy + 20], [wx + 20, wy + 36]], 3, '#e8f2f8');
    context.save();
    context.translate(wx + 20, wy + 6);
    context.rotate(-0.25);
    context.fillStyle = '#f2c630';
    context.strokeStyle = '#2a2622';
    context.lineWidth = 3;
    context.beginPath();
    context.ellipse(0, 0, 58, 9, 0, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.restore();
    const ink = '#262320', skin = '#f0bf98';
    line(context, [[wx + 6, wy - 8], [wx + 14, wy - 40], [wx + 36, wy - 14]], 9, skin);
    context.fillStyle = '#3f6fae';
    context.fillRect(wx + 4, wy - 52, 22, 16);
    line(context, [[wx + 12, wy - 52], [wx + 16, wy - 86]], 13, skin);
    line(context, [[wx + 14, wy - 76], [wx - 14, wy - 88], [wx - 30, wy - 80]], 6, skin);
    line(context, [[wx + 16, wy - 78], [wx + 44, wy - 70], [wx + 58, wy - 84]], 6, skin);
    context.fillStyle = skin;
    context.beginPath();
    context.arc(wx + 18, wy - 100, 13, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#f1cf54';
    for (let k = 0; k < 7; k += 1) {
      context.beginPath();
      context.moveTo(wx + 8 + k * 3, wy - 110);
      context.lineTo(wx + 2 + k * 5, wy - 124 - random() * 6);
      context.lineTo(wx + 14 + k * 3, wy - 110);
      context.fill();
    }
    line(context, [[wx + 14, wy - 98], [wx + 20, wy - 96]], 2, ink);
    // The lettering and a sad face.
    context.fillStyle = '#1f1d1b';
    context.textBaseline = 'alphabetic';
    context.textAlign = 'center';
    context.font = `${height * 0.13}px ${COMIC}`;
    context.fillText('Surfing Is My', width * 0.5, height * 0.25);
    context.fillText('Full-Time Job', width * 0.58, height * 0.46);
    context.font = `${height * 0.11}px ${COMIC}`;
    context.fillText('(Unpaid)', width * 0.49, height * 0.67);
    const fx = width * 0.8, fy = height * 0.63, r = height * 0.058;
    context.fillStyle = '#f2cf3a';
    context.strokeStyle = ink;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(fx, fy, r, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillStyle = ink;
    context.fillRect(fx - r * 0.4, fy - r * 0.35, 5, 7);
    context.fillRect(fx + r * 0.25, fy - r * 0.35, 5, 7);
    context.beginPath();
    context.arc(fx, fy + r * 0.62, r * 0.4, Math.PI * 1.15, Math.PI * 1.85);
    context.stroke();
    scuff(context, width, height, random, 1.4, 0.28);
  });
}

// NAKED / SURFING stencilled on a faded yellow diamond, rust bleeding down
// from its four bolts.
export const DIAMOND_BOUNDS = [-0.42, -0.42, 0.42, 0.42];
export const DIAMOND_BOLTS = [[0, 0.33], [0.33, 0], [0, -0.33], [-0.33, 0]];
export function nakedSurfingFace() {
  const [x0, , x1, y1] = DIAMOND_BOUNDS, size = 900, scale = size / (x1 - x0);
  const at = ([x, y]) => [(x - x0) * scale, (y1 - y) * scale];
  return fitTo(texture(size, size, (context) => {
    const random = seeded(31);
    context.fillStyle = '#d8c26b';
    context.fillRect(0, 0, size, size);
    for (let k = 0; k < 40; k += 1) {
      const x = random() * size, y = random() * size, r = 20 + random() * 90;
      const blot = context.createRadialGradient(x, y, 0, x, y, r);
      blot.addColorStop(0, `rgba(${random() < 0.5 ? '160, 140, 80' : '240, 225, 160'}, 0.25)`);
      blot.addColorStop(1, 'rgba(0, 0, 0, 0)');
      context.fillStyle = blot;
      context.fillRect(x - r, y - r, 2 * r, 2 * r);
    }
    for (const bolt of DIAMOND_BOLTS) {
      const [x, y] = at(bolt);
      const drip = context.createLinearGradient(x, y, x, y + 160 + random() * 120);
      drip.addColorStop(0, 'rgba(150, 70, 25, 0.85)');
      drip.addColorStop(1, 'rgba(150, 70, 25, 0)');
      context.fillStyle = drip;
      context.beginPath();
      context.moveTo(x - 16, y);
      context.quadraticCurveTo(x - 8, y + 140, x - 3 + random() * 6, y + 170 + random() * 120);
      context.quadraticCurveTo(x + 8, y + 140, x + 16, y);
      context.fill();
      const halo = context.createRadialGradient(x, y, 8, x, y, 40);
      halo.addColorStop(0, 'rgba(160, 75, 30, 0.9)');
      halo.addColorStop(1, 'rgba(160, 75, 30, 0)');
      context.fillStyle = halo;
      context.fillRect(x - 40, y - 40, 80, 80);
    }
    context.fillStyle = '#1c1b18';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    const word = (text, y, height) => {
      context.font = `bold ${height}px ${STENCIL}`;
      const widths = [...text].map((letter) => context.measureText(letter).width), total = widths.reduce((a, b) => a + b, 0) + 6 * (text.length - 1);
      let x = size / 2 - total / 2;
      [...text].forEach((letter, i) => {
        context.save();
        context.translate(x + widths[i] / 2, y + (random() - 0.5) * 8);
        context.rotate((random() - 0.5) * 0.08);
        context.fillText(letter, 0, 0);
        context.restore();
        x += widths[i] + 6;
      });
    };
    word('NAKED', size * 0.42, size * 0.155);
    word('SURFING', size * 0.6, size * 0.155);
    scuff(context, size, size, random, 1.3, 0.3);
  }), DIAMOND_BOUNDS);
}

// CHILL: a no-entry roundel turned round — the red ring, a man laid back
// with an arm behind his head and a knee up, CHILL in red beneath him.
export const ROUND_BOUNDS = [-0.3, -0.3, 0.3, 0.3];
export function chillFace() {
  const size = 800, R = size / 2;
  return fitTo(texture(size, size, (context) => {
    const random = seeded(47);
    context.fillStyle = '#f2eee5';
    context.fillRect(0, 0, size, size);
    context.strokeStyle = '#cf3a2b';
    context.lineWidth = R * 0.2;
    context.beginPath();
    context.arc(R, R, R * 0.88, 0, Math.PI * 2);
    context.stroke();
    context.strokeStyle = '#6d5d4c';
    context.lineWidth = R * 0.03;
    context.beginPath();
    context.arc(R, R, R * 0.985, 0, Math.PI * 2);
    context.stroke();
    // The man, as a silhouette.
    const ink = '#161514', s = R;
    const px = (x) => R + x * s, py = (y) => R - y * s;
    line(context, [[px(0.17), py(0.13)], [px(-0.18), py(0.02)]], s * 0.14, ink);
    line(context, [[px(-0.18), py(0.02)], [px(-0.33), py(0.2)], [px(-0.43), py(0.02)]], s * 0.09, ink);
    line(context, [[px(-0.18), py(0.0)], [px(-0.47), py(0.05)]], s * 0.08, ink);
    line(context, [[px(0.14), py(0.16)], [px(0.1), py(0.32)], [px(0.27), py(0.3)]], s * 0.06, ink);
    context.fillStyle = ink;
    context.beginPath();
    context.arc(px(0.3), py(0.24), s * 0.1, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#cf3a2b';
    context.font = `900 ${s * 0.26}px ${BOLD}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('CHILL', R, R + s * 0.28);
    scuff(context, size, size, random, 1.1, 0.18);
  }), ROUND_BOUNDS);
}

// The drinks machine's front, orange round a lit window of cans and beer
// bottles on six shelves, a cream panel of buttons, a coin slot and a small
// green display, ICE COLD BEER along the top, the flap below. `glow` is its
// lit parts alone, for the emissive map: the window and the display.
export function vendingFaces(front = '#e8692e') {
  const width = 450, height = 925, random = seeded(59);
  const glass = [width * 0.06, height * 0.11, width * 0.6, height * 0.66];
  const display = [width * 0.73, height * 0.16, width * 0.2, height * 0.05];
  const face = texture(width, height, (context) => {
    context.fillStyle = front;
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#efe6d2';
    context.fillRect(0, 0, width, height * 0.085);
    context.fillStyle = '#c8352a';
    context.font = `900 ${height * 0.045}px ${BOLD}`;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('ICE COLD BEER', width / 2, height * 0.045);
    const [gx, gy, gw, gh] = glass;
    const inside = context.createLinearGradient(0, gy, 0, gy + gh);
    inside.addColorStop(0, '#f4ecd8');
    inside.addColorStop(1, '#d9cdb2');
    context.fillStyle = inside;
    context.fillRect(gx, gy, gw, gh);
    const cans = ['#c8352a', '#2d62b8', '#f0c43a', '#3f9a58', '#c9ccd0', '#e8863a', '#1d1d1f', '#e4e0d4'];
    for (let row = 0; row < 6; row += 1) {
      const shelf = gy + ((row + 1) * gh) / 6.2;
      for (let x = gx + 8; x < gx + gw - 26;) {
        const bottle = random() < 0.35, w = bottle ? 18 : 24, h = bottle ? 62 : 44;
        context.fillStyle = bottle ? (random() < 0.6 ? '#5a3418' : '#2f5a2c') : cans[Math.floor(random() * cans.length)];
        if (bottle) {
          context.fillRect(x, shelf - h, w, h * 0.7);
          context.fillRect(x + w * 0.32, shelf - h - 12, w * 0.36, h * 0.35);
          context.fillStyle = '#efe4c8';
          context.fillRect(x, shelf - h * 0.55, w, h * 0.22);
        } else {
          context.fillRect(x, shelf - h, w, h);
          context.fillStyle = 'rgba(255, 255, 255, 0.35)';
          context.fillRect(x + 4, shelf - h + 3, 4, h - 6);
        }
        x += w + 5;
      }
      context.fillStyle = '#f7f3ea';
      context.fillRect(gx, shelf, gw, 6);
    }
    const shine = context.createLinearGradient(gx, gy, gx + gw, gy + gh);
    shine.addColorStop(0.2, 'rgba(255, 255, 255, 0)');
    shine.addColorStop(0.3, 'rgba(255, 255, 255, 0.28)');
    shine.addColorStop(0.36, 'rgba(255, 255, 255, 0)');
    context.fillStyle = shine;
    context.fillRect(gx, gy, gw, gh);
    context.strokeStyle = '#3a2a20';
    context.lineWidth = 6;
    context.strokeRect(gx, gy, gw, gh);
    // The panel.
    context.fillStyle = '#efe6d2';
    context.fillRect(width * 0.7, height * 0.12, width * 0.26, height * 0.5);
    const [dx, dy, dw, dh] = display;
    context.fillStyle = '#10261a';
    context.fillRect(dx, dy, dw, dh);
    context.fillStyle = '#7dff9a';
    context.font = `bold ${dh * 0.7}px monospace`;
    context.fillText('1.50', dx + dw / 2, dy + dh / 2);
    for (let k = 0; k < 8; k += 1) {
      context.fillStyle = '#b9b2a2';
      context.fillRect(width * (0.745 + (k % 2) * 0.1), height * (0.25 + Math.floor(k / 2) * 0.05), width * 0.07, height * 0.03);
    }
    context.fillStyle = '#2a2622';
    context.fillRect(width * 0.8, height * 0.48, width * 0.06, height * 0.04);
    context.fillRect(width * 0.75, height * 0.55, width * 0.16, height * 0.015);
    // The flap.
    context.fillStyle = '#2a211b';
    context.fillRect(width * 0.1, height * 0.82, width * 0.52, height * 0.09);
    context.fillStyle = '#e9dcc4';
    context.font = `bold ${height * 0.022}px ${BOLD}`;
    context.fillText('PUSH', width * 0.36, height * 0.865);
    scuff(context, width, height, random, 0.8, 0.2);
  });
  const glow = texture(width, height, (context) => {
    context.fillStyle = '#000';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#fff3dc';
    context.fillRect(...glass);
    context.fillStyle = '#6dff90';
    context.fillRect(...display);
  });
  return { face, glow };
}
