import assert from 'node:assert/strict';
import {
  boardDimensions, boardStation, bottomHeight, buildBoardGeometry, buildBoardHull, buildFinGeometries,
  deckHeight, foilThickness, halfWidth, lowerY, rockerHeight, SURFBOARD_UV_ARC,
} from './boardShape.js';
import { stripeStations } from './boardTexture.js';

// The board is a set of formulas; hold the default 5'10" to the numbers of the
// real board it copies, and the mesh and the float points to the formulas.
const dims = boardDimensions({});
const { length: L, width: W, thickness: T } = dims;
const inch12 = 0.305;
const near = (a, b, tolerance, message) => assert.ok(Math.abs(a - b) <= tolerance, `${message}: ${a.toFixed(4)} vs ${b.toFixed(4)}`);

// Outline.
const noseWidth = 2 * halfWidth(dims, 1 - inch12 / L);
const tailWidth = 2 * halfWidth(dims, inch12 / L);
assert.ok(noseWidth > 0.31 && noseWidth < 0.35, `12" from the nose ≈ 0.33 m (${noseWidth.toFixed(3)})`);
assert.ok(tailWidth > 0.35 && tailWidth < 0.39, `12" from the tail ≈ 0.37 m (${tailWidth.toFixed(3)})`);
let widest = 0, widestU = 0;
for (let u = 0; u <= 1; u += 0.0005) if (halfWidth(dims, u) > widest) [widest, widestU] = [halfWidth(dims, u), u];
near(widestU, 0.52, 0.01, 'wide point just forward of centre');
near(2 * widest, W, 1e-6, 'the wide point is the width');
// Squash: flat across the end, a few-centimetre corner, 24–28 cm across.
const at = (s) => 2 * halfWidth(dims, s / L);
assert.ok(at(0.03) > 0.24 && at(0.03) < 0.28, `the squash is 24–28 cm across (${at(0.03).toFixed(3)})`);
assert.ok(at(0.003) > 0.5 * at(0.05), 'the end is straight across, not a round tail');
assert.ok(at(0.03) > 0.9 * at(0.05), 'the corners are rounded within ~3 cm');
// Nose: pointed, but the tip has a 1–2 cm radius (w² → 2 r s at the tip).
const s = 1e-5, tipRadius = halfWidth(dims, 1 - s / L) ** 2 / (2 * s);
assert.ok(tipRadius > 0.01 && tipRadius < 0.02, `nose tip radius 1–2 cm (${tipRadius.toFixed(4)})`);
assert.ok(2 * halfWidth(dims, 1 - 0.05 / L) < 0.1, 'pointed: under 10 cm wide 5 cm from the tip');
assert.equal(halfWidth(dims, 0), 0);
assert.equal(halfWidth(dims, 1), 0);

// Rocker: flat spot at u = 0.4, the tips lifted by the settings, no crease.
near(rockerHeight(dims, 0.4), 0, 1e-12, 'lowest point');
near(rockerHeight(dims, 1), dims.noseRocker, 1e-12, 'nose rocker');
near(rockerHeight(dims, 0), dims.tailRocker, 1e-12, 'tail rocker');
const slope = (u, h = 1e-4) => (rockerHeight(dims, u + h) - rockerHeight(dims, u - h)) / (2 * h * L);
near(slope(0.4), 0, 1e-5, 'the rocker is flat through its low point');
near(slope(0.4 + 1e-3), slope(0.4 - 1e-3), 1e-3, 'no kink either side of it');
for (let u = 0.01; u < 1; u += 0.01) assert.ok(rockerHeight(dims, u) >= 0, 'the bottom never dips below its low point');

// Foil and section.
near(foilThickness(dims, 0.45), T, 1e-12, 'thickest at 45%');
near(foilThickness(dims, 1) / T, 0.35, 1e-9, 'nose 35% of the thickness');
assert.ok(foilThickness(dims, 0) / T >= 0.45 && foilThickness(dims, 0) / T <= 0.5, 'tail 45–50% of the thickness');
for (let u = 0; u <= 1; u += 0.01) assert.ok(foilThickness(dims, u) <= T + 1e-12, 'never thicker than the thickness');
const apexFraction = (u) => { const st = boardStation(dims, u); return (st.apex - st.floor) / st.h; };
assert.ok(apexFraction(0.08) > 0.3 && apexFraction(0.08) < 0.36, `tucked rail in the tail (${apexFraction(0.08).toFixed(2)})`);
near(apexFraction(0.97), 0.5, 0.01, 'soft 50/50 rail in the nose');
let concave = 0;
for (let u = 0; u <= 1; u += 0.01) {
  const st = boardStation(dims, u);
  for (let xn = 0; xn <= 1; xn += 0.02) concave = Math.max(concave, lowerY(st, xn) - st.floor - (st.bottom - st.bottom * (1 - xn ** st.lowerPower) ** (1 / st.lowerPower)));
}
assert.ok(concave > 0.001 && concave <= 0.0031, `concave up to 3 mm (${(concave * 1000).toFixed(2)} mm)`);
near(deckHeight(dims, 0, 0.05 * L) - bottomHeight(dims, 0, 0.05 * L), foilThickness(dims, 0.55) - boardStation(dims, 0.55).concave, 1e-9, 'deck minus bottom on the stringer');

// Volume and area: a real 5'10" × 19¾" × 2⅜" floats about 29–31 L.
const hull = buildBoardHull(dims);
const litres = hull.volume * 1000;
assert.ok(litres > 26 && litres < 33, `volume 26–33 L (${litres.toFixed(1)})`);
assert.ok(hull.planformArea > 0.6 && hull.planformArea < 0.72, `plan area (${hull.planformArea.toFixed(3)})`);

// Float points: they tile the planform, so they sum to the board.
assert.ok(hull.points.length >= 20 && hull.points.length <= 25, `about 23 points (${hull.points.length})`);
const areaSum = hull.points.reduce((sum, p) => sum + p.area, 0);
const volumeSum = hull.points.reduce((sum, p) => sum + p.volume, 0);
near(areaSum / hull.planformArea, 1, 0.02, 'Σ area ≈ plan area');
near(volumeSum / hull.volume, 1, 0.02, 'Σ volume ≈ volume');
for (const p of hull.points) {
  assert.ok([p.x, p.y, p.z, p.area, p.volume, p.height].every(Number.isFinite), 'finite point');
  near(p.y, bottomHeight(dims, p.x, p.z), 1e-12, 'points lie on the bottom');
  near(p.height, p.volume / p.area, 1e-9, 'height is the mean column');
  assert.ok(p.height > 0.01 && p.height < T, 'a column is thinner than the board');
  if (p.kind === 'rail') assert.ok(hull.points.some((q) => q.kind === 'rail' && Math.abs(q.x + p.x) < 1e-12 && Math.abs(q.z - p.z) < 1e-12), 'rails mirror');
}
assert.deepEqual([...new Set(hull.points.map((p) => p.kind))].sort(), ['bottom', 'nose', 'rail', 'tail']);

// Mesh: closed, outward, no NaN, no slivers, mirrored, UV in range.
const checkMesh = (geometry, label) => {
  const position = geometry.getAttribute('position').array;
  const normal = geometry.getAttribute('normal').array;
  const index = geometry.index.array;
  assert.ok(position.every(Number.isFinite) && normal.every(Number.isFinite), `${label}: no NaN`);
  let volume = 0, smallest = Infinity;
  for (let i = 0; i < index.length; i += 3) {
    const [a, b, c] = [index[i] * 3, index[i + 1] * 3, index[i + 2] * 3];
    const ab = [position[b] - position[a], position[b + 1] - position[a + 1], position[b + 2] - position[a + 2]];
    const ac = [position[c] - position[a], position[c + 1] - position[a + 1], position[c + 2] - position[a + 2]];
    const cross = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]];
    smallest = Math.min(smallest, Math.hypot(...cross) / 2);
    volume += (position[a] * cross[0] + position[a + 1] * cross[1] + position[a + 2] * cross[2]) / 6;
  }
  assert.ok(smallest > 1e-10, `${label}: no degenerate triangle (${smallest.toExponential(2)} m²)`);
  return volume;
};
const geometry = buildBoardGeometry(dims);
const meshVolume = checkMesh(geometry, 'hull');
near(meshVolume / hull.volume, 1, 0.02, 'the closed mesh holds the integrated volume');
const position = geometry.getAttribute('position').array;
const uv = geometry.getAttribute('uv').array;
const ringSize = 56;
assert.equal(position.length / 3, 161 * ringSize, 'ring layout');
for (let v = 0; v < position.length / 3; v += 1) {
  const j = v % ringSize, mirror = v - j + ((ringSize - j) % ringSize);
  near(position[v * 3], -position[mirror * 3], 1e-7, 'port mirrors starboard');
  near(uv[v * 2 + 1], uv[mirror * 2 + 1], 1e-7, 'the texture is mirrored');
  assert.ok(uv[v * 2] >= 0 && uv[v * 2] <= 1 && uv[v * 2 + 1] >= 0 && uv[v * 2 + 1] <= 1, 'UV in range');
}
const midRing = 80 * ringSize;
for (let j = 1; j <= ringSize / 2; j += 1) assert.ok(uv[(midRing + j) * 2 + 1] > uv[(midRing + j - 1) * 2 + 1], 'v runs round the section');
near(uv[(midRing + ringSize / 2) * 2 + 1] * SURFBOARD_UV_ARC, 2 * halfWidth(dims, 0.5) + T, 0.08, 'v is metres of arc');

// Fins: an FCS thruster in the right boxes, closed foils.
const [right, left, centre] = buildFinGeometries(dims);
// The layout's position is the trailing edge of the base; the chord runs along the toe.
const chord = (fin) => ({
  trailZ: fin.position.z,
  leadZ: fin.position.z + fin.base * Math.cos(fin.toe),
  leadX: fin.position.x + fin.base * Math.sin(fin.toe),
});
near(chord(right).leadZ + L / 2, 0.28, 0.005, 'side fin leading edge 28 cm from the tail');
near(chord(centre).trailZ + L / 2, 0.09, 1e-9, 'centre fin trailing edge 9 cm from the tail');
near(right.toe, -3 * Math.PI / 180, 1e-12, 'right fin toed in (leading edge toward the stringer)');
near(right.cant, 6 * Math.PI / 180, 1e-12, 'right fin canted out');
near(left.toe, -right.toe, 1e-12, 'fins mirror');
near(left.position.x, -right.position.x, 1e-12, 'fins mirror');
const railGap = (x, z) => halfWidth(dims, z / L + 0.5) - Math.abs(x);
assert.ok(railGap(right.position.x, right.position.z) > 0.01, 'the side fin trailing edge keeps a centimetre of bottom outboard');
assert.ok(railGap(chord(right).leadX, chord(right).leadZ) > 0.03, 'side fin leading edge ~3–4 cm in from the rail');
for (const fin of [right, left, centre]) {
  assert.ok(checkMesh(fin.geometry, fin.name) > 0, `${fin.name}: closed with outward faces`);
  assert.ok(fin.area > 0.006 && fin.area < 0.011, `${fin.name}: one side ${(fin.area * 1e4).toFixed(0)} cm²`);
  assert.ok(fin.pressure.y < bottomHeight(dims, fin.pressure.x, fin.pressure.z) - 0.03, `${fin.name}: pressure centre below the bottom`);
}
assert.ok(centre.area < right.area, 'the centre fin is a little smaller');
const hullFin = hull.fins.find((fin) => fin.id === 'right');
near(hullFin.y, right.pressure.y, 1e-12, 'the hull reports the same fins');
assert.ok(hullFin.normal.x > 0.95, 'the fin face normal points across the board');

// Stripes: two at 58% and 68% from the nose, the others spread around them.
assert.deepEqual(stripeStations(2).map((u) => +(1 - u).toFixed(4)), [0.58, 0.68]);
assert.deepEqual(stripeStations(1).map((u) => +(1 - u).toFixed(4)), [0.63]);
assert.deepEqual(stripeStations(3).map((u) => +(1 - u).toFixed(4)), [0.53, 0.63, 0.73]);
assert.deepEqual(stripeStations(0), []);

// Everything scales: a 10' longboard is bigger and still clean.
const big = boardDimensions({ surfboardLength: 3.05, surfboardWidth: 0.58, surfboardThickness: 0.075 });
const bigHull = buildBoardHull(big);
assert.ok(bigHull.volume > 2.2 * hull.volume, 'a longboard floats far more');
near(checkMesh(buildBoardGeometry(big), 'longboard') / bigHull.volume, 1, 0.02, 'longboard mesh volume');

console.log(`surfboard shape: ${litres.toFixed(1)} L, ${hull.planformArea.toFixed(3)} m² plan, 12" widths ${noseWidth.toFixed(3)} / ${tailWidth.toFixed(3)} m, mesh within ${(Math.abs(meshVolume / hull.volume - 1) * 100).toFixed(2)}% of the integrated volume, ${hull.points.length} float points summing to it`);
