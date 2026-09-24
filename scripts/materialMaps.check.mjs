// Карты материала из альбедо: шов, маска, вклейка, рельеф, нормали, щели.
// Run: node scripts/materialMaps.check.mjs
import assert from 'node:assert/strict';
import {
  aoFrom, blendSeams, compositeBand, heightFrom, luminance, normalFrom, rollHalf, roughnessFrom, seamMask, seamRatio, seamWeight,
} from './materialMaps.mjs';

const W = 64, H = 64;
const image = (fn, channels = 3) => {
  const out = new Uint8Array(W * H * channels);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) fn(x, y).forEach((value, c) => { out[(y * W + x) * channels + c] = value; });
  return out;
};

// Сдвиг на полплитки дважды — та же картинка.
{
  const noise = image((x, y) => [(x * 37 + y * 11) % 256, (x * 5 + y * 71) % 256, (x * y) % 256]);
  assert.deepEqual(rollHalf(rollHalf(noise, W, H, 3), W, H, 3), noise);
  assert.deepEqual(Array.from(rollHalf(noise, W, H, 3).subarray(((H / 2) * W + W / 2) * 3, ((H / 2) * W + W / 2) * 3 + 3)), Array.from(noise.subarray(0, 3)), 'угол ушёл в середину');
}

// Маска: крест посередине прозрачен, углы — нет; вклейка не трогает остальное.
{
  const mask = seamMask(W, H, 8);
  const alpha = (x, y) => mask[(y * W + x) * 4 + 3];
  assert.equal(alpha(W / 2, 3), 0, 'вертикаль креста');
  assert.equal(alpha(3, H / 2), 0, 'горизонталь креста');
  assert.equal(alpha(3, 3), 255, 'угол цел');
  assert.equal(alpha(W / 2 + 9, H / 2 + 9), 255, 'за полосой цело');
  const base = image(() => [10, 20, 30]), patch = image(() => [200, 210, 220]);
  const glued = compositeBand(base, patch, W, H, 3, 8);
  assert.deepEqual(Array.from(glued.subarray(0, 3)), [10, 20, 30], 'вне креста — своё');
  assert.deepEqual(Array.from(glued.subarray(((H / 2) * W + W / 2) * 3, ((H / 2) * W + W / 2) * 3 + 3)), [200, 210, 220], 'на кресте — перерисованное');
  const weight = seamWeight(W, H, 8);
  const edge = weight[5 * W + W / 2 + 7];
  assert.ok(edge > 0 && edge < 1, `край полосы мягкий (${edge.toFixed(2)})`);
}

// Стык: картинка с перепадом яркости слева направо тайлится со швом; после
// сшивания шов не заметнее соседства в середине.
{
  const ramp = image((x, y) => { const v = Math.round((x / (W - 1)) * 200 + (y % 4)); return [v, v, v]; });
  assert.ok(seamRatio(ramp, W, H, 3) > 10, 'у рампы шов');
  const fixed = blendSeams(ramp, W, H, 3, 12);
  assert.ok(seamRatio(fixed, W, H, 3) < 3, `шов сшит (${seamRatio(fixed, W, H, 3).toFixed(2)})`);
}

// Рельеф: крупное пятно света (плитка уже бесшовная — и свет по кругу)
// вычитается, рисунок остаётся.
{
  const lit = image((x, y) => { const v = Math.round(110 + 60 * Math.sin((x / W) * Math.PI * 2) + ((x + y) % 8 < 4 ? 30 : 0)); return [v, v, v]; });
  const height = heightFrom(luminance(lit, W, H, 3), W, H);
  const mean = (x0, x1) => { let s = 0, n = 0; for (let y = 0; y < H; y += 1) for (let x = x0; x < x1; x += 1) { s += height[y * W + x]; n += 1; } return s / n; };
  let spread = 0; for (let x = 8; x < 24; x += 1) spread = Math.max(spread, Math.abs(height[20 * W + x] - height[20 * W + x + 2]));
  assert.ok(spread > 0.3, `полосы рисунка остались рельефом (${spread.toFixed(2)})`);
  // Свет вчетверо сильнее рисунка, а в рельефе его след вдвое слабее рисунка:
  // крупное пятно становится пологим склоном, а не главным рельефом.
  const light = Math.abs(mean(8, 24) - mean(40, 56));
  assert.ok(light < spread / 2, `свет не стал склоном (${light.toFixed(2)} против ${spread.toFixed(2)})`);
}

// Нормали бугра смотрят от него; периодический рельеф через край — те же нормали.
{
  const bump = new Float32Array(W * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) bump[y * W + x] = Math.exp(-(((x - 32) ** 2) + ((y - 32) ** 2)) / 40);
  const normal = normalFrom(bump, W, H, 8);
  const at = (x, y) => Array.from(normal.subarray((y * W + x) * 3, (y * W + x) * 3 + 3));
  assert.ok(at(28, 32)[0] < 120, 'левый склон — нормаль влево');
  assert.ok(at(36, 32)[0] > 136, 'правый склон — вправо');
  assert.ok(at(32, 28)[1] > 136, 'склон выше по картинке — нормаль вверх (OpenGL, как в three.js)');
  assert.ok(at(32, 36)[1] < 120, 'ниже — вниз');
  assert.ok(Math.abs(at(5, 5)[0] - 128) <= 1 && Math.abs(at(5, 5)[1] - 128) <= 1 && at(5, 5)[2] > 250, 'ровное — прямо из поверхности');
  const waves = new Float32Array(W * H);
  for (let y = 0; y < H; y += 1) for (let x = 0; x < W; x += 1) waves[y * W + x] = 0.5 + 0.5 * Math.sin((x / W) * Math.PI * 4);
  const wavy = normalFrom(waves, W, H, 2);
  assert.deepEqual(Array.from(wavy.subarray(0, 3)), Array.from(wavy.subarray((W / 2) * 3, (W / 2) * 3 + 3)), 'через край — как в середине той же фазы');
}

// Щель темнее ровного места, шероховатость в пределах.
{
  const pit = new Float32Array(W * H).fill(0.6);
  for (let y = 30; y < 34; y += 1) for (let x = 30; x < 34; x += 1) pit[y * W + x] = 0.05;
  const ao = aoFrom(pit, W, H);
  assert.ok(ao[32 * W + 32] < 0.8, `щель затенена (${ao[32 * W + 32].toFixed(2)})`);
  assert.ok(ao[5 * W + 5] > 0.99, 'ровное место — без затенения');
  const rough = roughnessFrom(new Float32Array(W * H).fill(0.5), pit);
  assert.ok(Math.min(...rough) >= 0.2 && Math.max(...rough) <= 1);
  assert.ok(rough[32 * W + 32] > rough[5 * W + 5], 'в щели матовее');
}

console.log('materialMaps: сдвиг, маска шва, вклейка, сшивание, рельеф без света, нормали (OpenGL, через край), щели, шероховатость — ok');
