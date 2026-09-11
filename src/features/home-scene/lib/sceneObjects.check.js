import assert from 'node:assert/strict';
import {
  SCENE_OBJECTS, audioSettingsForScene, newProjectObjectSettings, sceneHitForObject3D, sceneNodeForObject3D,
  sceneObjectBlockedBy, sceneObjectForName, sceneObjectOn, sceneObjectsForNode, silencedSoundTracks, technicalFrameAvailable,
} from './sceneObjects.js';

// Клик по сцене разбирается по именам, под которыми объекты в ней лежат.
// Проверяется на выдуманных узлах: сама функция ходит только по name и parent.
const node = (name, parent = null) => ({ name, parent });

// Точное имя выигрывает у префикса. Без этого «shore-water» досталось бы
// берегу, и клик по воде выбирал бы не то.
assert.equal(sceneNodeForObject3D(node('shore-water')), 'landscape/water');
assert.equal(sceneNodeForObject3D(node('shore-driftwood')), 'landscape/shore');
assert.equal(sceneNodeForObject3D(node('coastal-shore-finds')), 'landscape/shore');

// Кластеры именуются с видом на конце — их ловит префикс.
assert.equal(sceneNodeForObject3D(node('coastal-trees-oleaster')), 'greenery/trees');
assert.equal(sceneNodeForObject3D(node('coastal-grass-carpet')), 'greenery/grass');
assert.equal(sceneNodeForObject3D(node('coastal-oleaster')), 'greenery/shrubs');
assert.equal(sceneNodeForObject3D(node('coast-rocks-2')), 'landscape/rocks');
assert.equal(sceneNodeForObject3D(node('coast-debris-0')), 'landscape/rocks');
assert.equal(sceneNodeForObject3D(node('coast-pebbles')), 'landscape/pebbles');

// Попадание приходит в лист, а узел редактора — на предке.
const boatMesh = node('hull', node('boat', node('boat-anchor')));
assert.equal(sceneNodeForObject3D(boatMesh), 'objects/boat');
assert.equal(sceneNodeForObject3D(node('boat-cockpit-seal')), 'objects/boat');
assert.equal(sceneNodeForObject3D(node('unnamed-part', node('tanker-anchor'))), 'objects/tanker');

// Служебное и неизвестное не выбирается — луч идёт сквозь него дальше.
assert.equal(sceneNodeForObject3D(node('water-interaction-plane')), null);
assert.equal(sceneNodeForObject3D(node('pointer-debug')), null);
assert.equal(sceneNodeForObject3D(node('')), null);
assert.equal(sceneNodeForObject3D(node(undefined)), null);

// Контекстное меню наводит камеру на то же попадание, поэтому вместе с узлом
// возвращается имя предка — то, которое понимает scene.getObjectByName.
assert.deepEqual(sceneHitForObject3D(boatMesh), { node: 'objects/boat', root: 'boat' });
assert.deepEqual(sceneHitForObject3D(node('coast-rocks-2')), { node: 'landscape/rocks', root: 'coast-rocks-2' });
assert.equal(sceneHitForObject3D(node('water-interaction-plane')), null);

// Каждый корень ведёт в существующий узел дерева редактора.
for (const object of SCENE_OBJECTS) {
  for (const root of object.roots ?? []) {
    const resolved = sceneNodeForObject3D(node(root));
    assert.ok(resolved, `корень ${root} никуда не ведёт`);
    assert.ok(
      sceneObjectsForNode(resolved).length > 0,
      `узел ${resolved} для корня ${root} не значится ни за одним объектом`,
    );
  }
}

// Связи. Выключенный объект пропадает отовсюду, кроме списка: его дорожка
// молчит и не показывается, его ракурс не предлагается. Сама настройка дорожки
// при этом не трогается — включил объект обратно, дорожка как была.
const scene = { tankerVisible: false, seagullsEnabled: true, boatVisible: true, audio: { tracks: { tanker: { enabled: true, gain: 0.65 }, birds: { enabled: true, gain: 0.8 }, water: { enabled: true, gain: 0.3 } } } };
assert.deepEqual([...silencedSoundTracks(scene)], ['tanker']);
const derived = audioSettingsForScene(scene);
assert.equal(derived.tracks.tanker.enabled, false, 'дизель танкера молчит, когда танкера нет');
assert.equal(derived.tracks.tanker.gain, 0.65, 'громкость дорожки не тронута');
assert.equal(derived.tracks.birds.enabled, true);
assert.equal(scene.audio.tracks.tanker.enabled, true, 'исходные настройки не мутируются');
assert.equal(audioSettingsForScene({ ...scene, tankerVisible: true }), scene.audio, 'всё включено — тот же объект, без копии');

assert.equal(technicalFrameAvailable({ id: 'tanker', object: 'tanker-anchor' }, scene), false);
assert.equal(technicalFrameAvailable({ id: 'boat', object: 'boat-anchor' }, scene), true);
assert.equal(technicalFrameAvailable({ id: 'coast', pose: () => null }, scene), true, 'ракурс без объекта — всегда');
assert.equal(sceneObjectForName('surface-vegetation')?.key, 'liliesVisible');

// Без чего объекта не бывает: выключил воду — чаек, рыб, кувшинок и водорослей
// нет, хотя их выключатели включены; их дорожки молчат, ракурсы уходят.
const desert = { waterVisible: false, seagullsEnabled: true, fishEnabled: true, liliesVisible: true, audio: { tracks: { birds: { enabled: true, gain: 1 } } } };
assert.equal(sceneObjectOn(desert, 'seagulls'), false, 'пустыня — чаек нет');
assert.equal(sceneObjectOn(desert, 'fish'), false);
assert.equal(sceneObjectOn(desert, 'lilies'), false);
assert.equal(sceneObjectOn(desert, 'terrain'), true, 'суша воды не требует');
assert.equal(sceneObjectOn({ ...desert, waterVisible: true }, 'seagulls'), true, 'вернул воду — чайки вернулись');
assert.deepEqual(sceneObjectBlockedBy(desert, SCENE_OBJECTS.find((o) => o.id === 'seagulls')).map((o) => o.id), ['water']);
assert.deepEqual(sceneObjectBlockedBy({ ...desert, waterVisible: true }, SCENE_OBJECTS.find((o) => o.id === 'seagulls')), []);
assert.deepEqual([...silencedSoundTracks(desert)], ['birds']);
assert.equal(technicalFrameAvailable({ id: 'lilies', object: 'surface-vegetation' }, desert), false);
for (const object of SCENE_OBJECTS) {
  for (const id of object.requires ?? []) assert.ok(SCENE_OBJECTS.some((o) => o.id === id), `${object.id} требует неизвестное «${id}»`);
}

// Заводской проект: вещи сайта и живность выключены, берег и вода — нет.
const fresh = newProjectObjectSettings();
assert.deepEqual(Object.keys(fresh).sort(), ['algaeVisible', 'boatVisible', 'fishEnabled', 'liliesVisible', 'sculptureVisible', 'seagullsEnabled', 'shoreEnabled', 'tankerVisible'].sort());
assert.ok(Object.values(fresh).every((value) => value === false));
assert.equal(fresh.terrainEnabled, undefined, 'суша в новом проекте не трогается');

// У каждой звуковой связи есть дорожка с таким именем в настройках звука.
for (const object of SCENE_OBJECTS) {
  if (object.sound) assert.ok(['tanker', 'water', 'shore', 'boat', 'birds', 'wind', 'thunder', 'ui'].includes(object.sound), `дорожка ${object.sound} неизвестна`);
}

console.log('sceneObjects: разбор попаданий, связи звука и ракурсов, заводской проект — ок');
