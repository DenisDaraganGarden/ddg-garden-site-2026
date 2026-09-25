// Сезоны растений по ИИ без денег: поддельный OpenAI рисует «голое дерево»
// меньше и в стороне — картинка сезона ложится на холст карточки основанием
// на её основание и в её высоту; задание модели — по типу листвы записи.
// Run: node scripts/plantSeasons.check.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import sharp from 'sharp';

const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ddg-seasons-'));
const calls = [];

// Растение: ствол и крона на прозрачном. x, y — основание ствола, h — высота.
async function tree(width, height, x, y, h, crown = '#4f7a34') {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
    <rect x="${x - h * 0.03}" y="${y - h * 0.45}" width="${h * 0.06}" height="${h * 0.45}" fill="#5b4f45"/>
    <ellipse cx="${x}" cy="${y - h * 0.7}" rx="${h * 0.35}" ry="${h * 0.3}" fill="${crown}"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

const server = http.createServer(async (request, response) => {
  try {
    const form = await new Request('http://mock', { method: 'POST', headers: request.headers, body: Readable.toWeb(request), duplex: 'half' }).formData();
    const [width, height] = String(form.get('size')).split('x').map(Number);
    const input = await sharp(Buffer.from(await form.get('image').arrayBuffer())).metadata();
    calls.push({ route: request.url, prompt: form.get('prompt'), size: form.get('size'), background: form.get('background'), model: form.get('model'), input: [input.width, input.height, input.hasAlpha] });
    // Модель «отодвинула» дерево: на 60 px правее и чуть мельче.
    const png = await tree(width, height, width * 0.45 + 60, height - 20, height * 0.72, '#6d5a48');
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify({ data: [{ b64_json: png.toString('base64') }] }));
  } catch (error) {
    response.statusCode = 500;
    response.end(JSON.stringify({ error: { message: error.message } }));
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
process.env.DDG_PROJECTS_DIR = home;
process.env.DDG_OPENAI_BASE_URL = `http://127.0.0.1:${server.address().port}`;
process.env.OPENAI_API_KEY = 'sk-test-0123456789abcdefghij';

try {
  const { PLANTS_DIR, listPlants } = await import('./plantLibrary.mjs');
  const { colourWords, footprint, generatePlantSeasons, removePlantSeason, seasonPrompt, seasonSize } = await import('./plantSeasons.mjs');

  // Задание: у листопадного зимой — голые ветки цвета коры, осенью — его цвет.
  const cornus = { id: 'cornus-alba', latin: 'Cornus alba', en: 'Red-barked dogwood', category: 'shrub', foliage: 'deciduous', autumnColor: '#b0433a', twigColor: '#a3322a', height: 2 };
  assert.match(seasonPrompt(cornus, 'winter'), /leafless/);
  assert.match(seasonPrompt(cornus, 'winter'), /red \(#a3322a\) bark/);
  assert.match(seasonPrompt(cornus, 'autumn'), /turned red \(#b0433a\)/);
  assert.match(seasonPrompt(cornus, 'spring'), /leaf-out/);
  assert.match(seasonPrompt({ ...cornus, category: 'grass', foliage: 'grass' }, 'winter'), /straw/);
  assert.match(seasonPrompt({ ...cornus, category: 'perennial', foliage: 'herbaceous' }, 'leaf'), /not in flower/);
  assert.match(seasonPrompt(cornus, 'leaf'), /same size in the frame, the same position/);
  assert.equal(colourWords('#d98a2e'), 'orange');
  assert.equal(colourWords('#6b5a4a'), 'russet brown');
  assert.deepEqual(seasonSize('gpt-image-2.5-sunburst', 859, 712), [1024, 848], 'пропорции карточки, стороны кратны 16');
  assert.deepEqual(seasonSize('gpt-image-1', 400, 900), [1024, 1536]);

  // Библиотека: запись и карточка 600 × 800, основание ствола в (300, 780).
  await fs.mkdir(path.join(PLANTS_DIR, cornus.id), { recursive: true });
  await fs.writeFile(path.join(PLANTS_DIR, `${cornus.id}.json`), JSON.stringify(cornus));
  await fs.writeFile(path.join(PLANTS_DIR, cornus.id, 'card.webp'), await sharp(await tree(600, 800, 300, 780, 700)).webp({ lossless: true }).toBuffer());
  const card = await sharp(path.join(PLANTS_DIR, cornus.id, 'card.webp')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const cardAt = footprint(card.data, card.info.width, card.info.height);

  const results = await generatePlantSeasons(cornus.id, { phases: ['winter', 'autumn', 'nonsense'], model: 'gpt-image-2.5-sunburst', quality: 'medium' });
  assert.deepEqual(Object.keys(results).sort(), ['autumn', 'winter'], 'чужие фазы не рисуются');
  assert.ok(results.winter.ok && results.autumn.ok, JSON.stringify(results));
  assert.equal(calls.length, 2);
  assert.equal(calls[0].route, '/images/edits');
  assert.equal(calls[0].background, 'transparent', 'ответ — с прозрачным фоном');
  assert.equal(calls[0].size, '768x1024', 'запрос в пропорциях карточки');
  assert.deepEqual(calls[0].input.slice(0, 2), [768, 1024], 'карточка уходит в размер запроса');
  assert.equal(calls[0].input[2], false, 'на белом, без альфы: прозрачное модель не приняла бы за место правки');
  assert.equal(calls.find((call) => /leafless/.test(call.prompt))?.model, 'gpt-image-2.5-sunburst');

  // Картинка сезона — холст карточки; растение стоит там же и той же высоты.
  const winter = await sharp(path.join(PLANTS_DIR, cornus.id, 'season-winter.webp')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.deepEqual([winter.info.width, winter.info.height], [600, 800]);
  const at = footprint(winter.data, winter.info.width, winter.info.height);
  assert.ok(Math.abs(at.baseX - cardAt.baseX) <= 2 && Math.abs(at.baseY - cardAt.baseY) <= 2, `основание на месте: ${at.baseX.toFixed(1)},${at.baseY} против ${cardAt.baseX.toFixed(1)},${cardAt.baseY}`);
  const ratio = (at.baseY - at.minY) / (cardAt.baseY - cardAt.minY);
  assert.ok(Math.abs(ratio - 1) < 0.03, `в рост карточки: ${ratio.toFixed(3)}`);

  // Библиотека отдаёт версии сезонов; снятый сезон пропадает.
  const listed = (await listPlants()).find((plant) => plant.id === cornus.id);
  assert.deepEqual(Object.keys(listed.seasons).sort(), ['autumn', 'winter']);
  const meta = JSON.parse(await fs.readFile(path.join(PLANTS_DIR, cornus.id, 'seasons.json'), 'utf8'));
  assert.equal(meta.winter.quality, 'medium');
  assert.ok(await removePlantSeason(cornus.id, 'autumn'));
  assert.deepEqual(Object.keys((await listPlants()).find((plant) => plant.id === cornus.id).seasons), ['winter']);
  assert.equal(await removePlantSeason(cornus.id, '../card'), false, 'чужие файлы не трогаются');

  console.log('plant seasons: задание по листве, размер запроса, прозрачный фон, основание и рост на месте карточки, версии, снятие — ok');
} finally {
  server.close();
  await fs.rm(home, { recursive: true, force: true });
}
