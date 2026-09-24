// Текстуры по ИИ без денег: поддельный OpenAI на локальном порту, библиотека
// во временной папке. Задание модели, варианты, шов крестом, карты, запись
// библиотеки, «только карты»; на стороне сцены — масштаб координат SketchUp,
// проекция там, где их нет, и настройки проекта.
// Run: node scripts/materials.check.mjs
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import * as THREE from 'three';

const near = (actual, expected, tolerance, message) => assert.ok(Math.abs(actual - expected) <= tolerance, `${message}: ${actual} ≠ ${expected}`);
const home = await fs.mkdtemp(path.join(os.tmpdir(), 'ddg-materials-'));
const N = 256;
const calls = [];

// Поддельный OpenAI: генерация — картинка со швом (перепад яркости слева
// направо, по краю — скачок); правка по маске — то же, но размытое: крест
// посередине гладкий, как если бы модель его перерисовала.
const ramp = () => {
  const pixels = Buffer.alloc(N * N * 3);
  for (let y = 0; y < N; y += 1) for (let x = 0; x < N; x += 1) {
    const v = Math.round(40 + (x / (N - 1)) * 160 + ((x * 7 + y * 13) % 9));
    pixels.set([v, Math.round(v * 0.8), Math.round(v * 0.6)], (y * N + x) * 3);
  }
  return sharp(pixels, { raw: { width: N, height: N, channels: 3 } }).png().toBuffer();
};
const server = http.createServer(async (request, response) => {
  try {
    const route = request.url;
    const auth = request.headers.authorization;
    let payload;
    if (route === '/models') payload = { data: [{ id: 'gpt-image-2.5-sunburst' }, { id: 'gpt-image-2.5-flare' }, { id: 'gpt-4o' }] };
    else if (route === '/images/generations') {
      const body = JSON.parse(await new Response(Readable.toWeb(request)).text());
      calls.push({ route, auth, body });
      payload = { data: await Promise.all(Array.from({ length: body.n }, async () => ({ b64_json: (await ramp()).toString('base64') }))) };
    } else if (route === '/images/edits') {
      const form = await new Request('http://mock', { method: 'POST', headers: request.headers, body: Readable.toWeb(request), duplex: 'half' }).formData();
      const image = form.get('image') ?? form.getAll('image[]')[0];
      calls.push({ route, auth, fields: Object.fromEntries([...form.keys()].map((key) => [key, form.getAll(key).length])), mask: Boolean(form.get('mask')), prompt: form.get('prompt') });
      const blurred = await sharp(Buffer.from(await image.arrayBuffer())).blur(24).png().toBuffer();
      payload = { data: [{ b64_json: blurred.toString('base64') }] };
    } else {
      response.statusCode = 404;
      response.end('{}');
      return;
    }
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(payload));
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
  const { texturePrompt, requestSize, requestQuality, generateDraft, finishDraft, mapsFromTexture, listMaterials, imageModels, libraryPatch, MATERIALS_DIR } = await import('./materials.mjs');
  const { isApiKey, keyHint } = await import('./openaiKey.mjs');
  const { seamRatio } = await import('./materialMaps.mjs');

  // Ключ и модели.
  assert.ok(isApiKey('sk-proj-AbC_123-xyz0123456789'));
  assert.ok(!isApiKey('sk-"; rm -rf ~'), 'в команду связки ключей не попадёт ничего, кроме ключа');
  assert.equal(keyHint('sk-abcdefghijklmnop1234'), 'sk-…1234');
  assert.deepEqual(await imageModels(), ['gpt-image-2.5-sunburst', 'gpt-image-2.5-flare'], 'только модели картинок, новые первыми');
  assert.equal(requestSize('gpt-image-2.5-sunburst', 2048), 2048);
  assert.equal(requestSize('gpt-image-1', 2048), 1024, 'прежние модели — квадрат только 1024');
  assert.equal(requestQuality('gpt-image-2', 'max'), 'high', 'max есть только у 2.5');
  assert.equal(requestQuality('gpt-image-2.5-flare', 'max'), 'max');

  // Задание модели: бесшовность, ровный свет и масштаб — всегда; картинки по номерам.
  const improve = texturePrompt({ mode: 'improve', description: 'теплее', tile: 1.2, references: 2, context: true });
  assert.match(improve, /Image 1 is the current texture/);
  assert.match(improve, /Images 2–3 are references/);
  assert.match(improve, /Image 4 shows where this material is used/);
  assert.match(improve, /seamless, tileable/);
  assert.match(improve, /1\.2 × 1\.2 m/);
  assert.match(texturePrompt({ description: 'дуб' }), /texture of: дуб/);

  // Варианты с нуля: генерация без картинок, два варианта, черновик с превью.
  const draft = await generateDraft({ mode: 'create', description: 'планкен', n: 2, size: 1024, quality: 'high', model: 'gpt-image-2.5-sunburst', tile: 1.5 });
  assert.equal(draft.previews.length, 2);
  assert.equal(calls[0].route, '/images/generations');
  assert.equal(calls[0].auth, 'Bearer sk-test-0123456789abcdefghij', 'ключ уходит только в заголовок OpenAI');
  assert.equal(calls[0].body.size, '1024x1024');

  // С аналогом — правка с картинками (image[] при двух и больше).
  const png = await ramp();
  const dataUrl = `data:image/png;base64,${png.toString('base64')}`;
  await generateDraft({ mode: 'create', description: 'кирпич', n: 1, model: 'gpt-image-2.5-sunburst', references: [dataUrl, dataUrl], context: dataUrl });
  assert.equal(calls[1].route, '/images/edits');
  assert.equal(calls[1].fields['image[]'], 3, 'два аналога и кадр сцены');

  // Выбранный вариант: шов перерисован крестом (правка с маской), карты, библиотека.
  const entry = await finishDraft({ draft: draft.draft, variant: 1, name: 'Планкен · проба' });
  const seamCall = calls.at(-1);
  assert.equal(seamCall.route, '/images/edits');
  assert.ok(seamCall.mask, 'шов — правка по маске');
  assert.match(seamCall.prompt, /transparent cross/);
  assert.equal(entry.tile, 1.5);
  assert.equal(entry.seam, 'ai');
  const dir = path.join(MATERIALS_DIR, entry.id);
  for (const file of ['albedo.webp', 'normal.png', 'roughness.webp', 'ao.webp', 'height.png', 'preview.webp', 'material.json']) await fs.access(path.join(dir, file));
  const albedo = await sharp(path.join(dir, 'albedo.webp')).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  assert.equal(albedo.info.width, N);
  const before = seamRatio(await sharp(png).removeAlpha().raw().toBuffer(), N, N, 3);
  const after = seamRatio(albedo.data, N, N, 3);
  assert.ok(before > 8 && after < before / 4, `шов исчез: было ${before.toFixed(1)}, стало ${after.toFixed(1)}`);
  const normal = await sharp(path.join(dir, 'normal.png')).raw().toBuffer({ resolveWithObject: true });
  assert.equal(normal.info.width, N, 'карты того же размера, что цвет');

  // Только карты: текстура SketchUp как есть, плитка как в SketchUp.
  const maps = await mapsFromTexture({ image: dataUrl, name: 'Кирпич · карты' });
  assert.equal(maps.tile, null);
  assert.equal(maps.mode, 'maps');
  assert.deepEqual((await listMaterials()).map((item) => item.id).sort(), [entry.id, maps.id].sort(), 'черновики в библиотеку не попадают');

  // Умолчания из лаборатории «Материалы»: в пределах ползунков; у «только карт» плитки нет.
  assert.deepEqual(libraryPatch(entry, { name: '  Планкен  ', tile: 999, normal: 1.5, roughness: -1, extra: 1 }), { name: 'Планкен', tile: 50, normal: 1.5, roughness: 0 });
  assert.deepEqual(libraryPatch(maps, { tile: 2, normal: 'x', roughness: null }), {}, '«только карты» лежат как в SketchUp');

  // Сцена: сколько метров в единице координат SketchUp — по u и по v отдельно.
  const { uvScale, boxUvGeometry } = await import('../src/materials/modelMaterials.js');
  const root = new THREE.Group();
  const plane = new THREE.PlaneGeometry(2, 1); // UV 0…1 на 2 × 1 м
  const mesh = new THREE.Mesh(plane);
  root.add(mesh);
  const [mu, mv] = uvScale([mesh], root);
  assert.ok(Math.abs(mu - 2) < 1e-6 && Math.abs(mv - 1) < 1e-6, `2 м на u, 1 м на v (${mu}, ${mv})`);
  mesh.scale.set(3, 3, 3);
  assert.ok(Math.abs(uvScale([mesh], root)[0] - 6) < 1e-6, 'масштаб компонента в модели учитывается');
  // Грань без координат: стена по X — u вдоль Z, v вверх (картинка головой вверх).
  const wall = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 2, 0, 3, 2], 3));
  const mapped = boxUvGeometry(wall, new THREE.Matrix4(), [1, 1]);
  assert.deepEqual(Array.from(mapped.attributes.uv.array), [0, -0, 2, -0, 2, -3], 'стена: u — вдоль, v — минус высота');
  const floor = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0, 0, 2, 4, 0, 0], 3));
  assert.deepEqual(Array.from(boxUvGeometry(floor, new THREE.Matrix4(), [2, 2]).attributes.uv.array), [0, 0, 0, 1, 2, 0], 'пол: как план, в масштабе SketchUp');

  // Стекло: серое прозрачное окно — стекло; цветной кружок кроны и плоский
  // знак на плане — нет; своё слово в окне материала — главнее.
  const { looksLikeGlass, glassDefaults, tuneGlass, unmakeGlass, setGlassProbe } = await import('../src/materials/glass.js');
  const scene = new THREE.Group();
  const pane = (color, opacity, vertical = true, name = 'Материал') => {
    const material = new THREE.MeshStandardMaterial({ name, color, transparent: opacity < 1, opacity });
    const geometry = new THREE.PlaneGeometry(1, 1);
    if (!vertical) geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.castShadow = true; // как у сеток модели в сцене (prepareModel)
    scene.add(mesh);
    return { material, mesh };
  };
  const window = pane('#1e1e1e', 0.58, true, '[Color H08]1');
  assert.ok(looksLikeGlass(window.material, [window.mesh], scene), 'серое окно 58 % — стекло');
  const cap = pane('#bf6d3f', 0.61, true, '*5');
  assert.ok(!looksLikeGlass(cap.material, [cap.mesh], scene), 'цвет легенды — не стекло');
  const disc = pane('#ffffff', 0.61, false, '*62');
  assert.ok(!looksLikeGlass(disc.material, [disc.mesh], scene), 'белый плоский знак на плане — не стекло');
  const named = pane('#8fb3c9', 1, false, 'Glass_Blue');
  assert.ok(looksLikeGlass(named.material, [named.mesh], scene), '«glass» в имени — стекло, даже голубое и плашмя');
  const crown = pane('#888888', 0.6);
  crown.mesh.userData.crownPlan = true;
  assert.ok(!looksLikeGlass(crown.material, [crown.mesh], scene), 'круг кроны SketchUp — не стекло');
  near(glassDefaults(window.material).clarity, 0.42, 1e-6, 'насквозь видно столько, сколько окно прозрачно');

  const { material: glassy, mesh: glassMesh } = window;
  glassy.onBeforeCompile = (shader) => { shader.fragmentShader = `// wet\n${shader.fragmentShader}`; };
  tuneGlass(glassy, [glassMesh], { ...glassDefaults(glassy), reflect: 2 });
  assert.ok(glassy.premultipliedAlpha && !glassy.depthWrite && glassy.transparent, 'стекло смешивается с предумноженной альфой');
  assert.ok(!glassMesh.castShadow, 'стекло не бросает чёрной тени');
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  glassy.onBeforeCompile(shader);
  assert.match(shader.fragmentShader, /glassFresnel/);
  assert.match(shader.fragmentShader, /\/\/ wet/, 'прежняя правка шейдера (мокрая линия) остаётся');
  assert.ok(!shader.fragmentShader.includes('premultiplied_alpha_fragment'), 'отражение не гасится прозрачностью');
  assert.match(shader.fragmentShader, /if \( uGlassBox > 0\.5 \) reflectVec = glassBox\( reflectVec \);/, 'снимок окружения сдвинут на коробку участка (строка three нашлась)');
  assert.match(shader.fragmentShader, /radiance \*= mix\( uGlassReflect/, 'отражение — сила напыления, и со светом сцены тоже');
  assert.match(shader.vertexShader, /vGlassWorld = \( modelMatrix \* glassWorld \)\.xyz;/);
  near(shader.uniforms.uGlassAbsorb.value, 0.58, 1e-6, 'в упор закрыто 58 %');
  assert.equal(shader.uniforms.uGlassReflect.value, 2, '«Отражение» доходит до шейдера (envMapIntensity three при небе сцены не берёт)');
  assert.match(glassy.customProgramCacheKey(), /placed-glass/);
  const shot = { texture: new THREE.CubeTexture(), center: new THREE.Vector3(1, 2, 3), box: new THREE.Box3(new THREE.Vector3(-20, 0, -20), new THREE.Vector3(20, 30, 20)) };
  setGlassProbe(glassy, shot);
  assert.ok(glassy.envMap === shot.texture && shader.uniforms.uGlassBox.value === 1 && shader.uniforms.uGlassProbe.value.y === 2 && shader.uniforms.uGlassBoxMax.value.y === 30, 'снимок окружения — отражение стекла');
  setGlassProbe(glassy, null);
  assert.ok(glassy.envMap === null && shader.uniforms.uGlassBox.value === 0, 'без снимка — небо сцены');
  setGlassProbe(glassy, shot);
  unmakeGlass(glassy, [glassMesh]);
  assert.ok(!glassy.premultipliedAlpha && glassy.opacity === 0.58 && glassMesh.castShadow && glassy.envMap === null, 'снял «стекло» — всё как было');
  const plain = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader };
  glassy.onBeforeCompile(plain);
  assert.ok(!/glassFresnel/.test(plain.fragmentShader) && !/placed-glass/.test(glassy.customProgramCacheKey()), 'без стекла шейдер свой');
  // three, вернувшись к собранной программе, onBeforeCompile не зовёт и берёт
  // юниформы последней сборки: они должны быть те же, что крутят ползунки.
  assert.equal(plain.uniforms.uGlassAbsorb, shader.uniforms.uGlassAbsorb, 'юниформы стекла — в каждой сборке, одни и те же');
  tuneGlass(glassy, [glassMesh], { ...glassDefaults(glassy), clarity: 0.9 });
  near(plain.uniforms.uGlassAbsorb.value, 0.1, 1e-6, 'снял и поставил снова — ползунок доходит до собранной раньше программы');
  assert.ok(glassy.premultipliedAlpha && /placed-glass/.test(glassy.customProgramCacheKey()), 'поставил снова — снова стекло');

  // Настройки проекта: чужое отбрасывается, «как в SketchUp» (null) остаётся.
  const { normalizeMaterialSettings } = await import('../src/materials/settings.js');
  const normalized = normalizeMaterialSettings({ modelMaterials: {
    'placed-1': { 'Дерево_фасад': { material: 'planken-abc', tile: 999, normal: 1.5, projection: 'box' }, bad: { material: '../../etc' }, maps: { material: 'kirpich-1', tile: null, projection: 'sideways' } },
    '../x': { a: { material: 'm' } },
    'placed-2': { '[Color H08]1': { glass: { clarity: 0.7, tint: '#AABBCC' } }, '<auto>': { glass: { on: false } } },
  } });
  assert.deepEqual(normalized, { modelMaterials: { 'placed-1': {
    'Дерево_фасад': { material: 'planken-abc', tile: 50, normal: 1.5, roughness: 1, projection: 'box' },
    maps: { material: 'kirpich-1', tile: null, normal: 1, roughness: 1 },
  }, 'placed-2': {
    '[Color H08]1': { glass: { on: true, clarity: 0.7, frost: 0.03, reflect: 2, tint: '#aabbcc' } },
    '<auto>': { glass: { on: false, clarity: 0.6, frost: 0.03, reflect: 2, tint: null } },
  } } }, 'запись только про стекло держится; «не стекло» — тоже слово');
  assert.deepEqual(normalizeMaterialSettings(normalized), normalized, 'нормализация неподвижна');

  console.log(`materials: ключ, модели, задание, варианты, аналоги, шов крестом (${before.toFixed(1)} → ${after.toFixed(1)}), карты, библиотека, «только карты», масштаб SketchUp, проекция, стекло, настройки, умолчания библиотеки — ok`);
} finally {
  server.close();
  await fs.rm(home, { recursive: true, force: true });
}
