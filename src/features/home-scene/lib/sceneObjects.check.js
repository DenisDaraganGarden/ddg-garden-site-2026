import assert from 'node:assert/strict';
import { SCENE_OBJECTS, sceneNodeForObject3D, sceneObjectsForNode } from './sceneObjects.js';

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

console.log('sceneObjects: разбор попаданий по именам сцены — ок');
