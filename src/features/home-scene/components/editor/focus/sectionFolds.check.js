// Run: node src/features/home-scene/components/editor/focus/sectionFolds.check.js
import assert from 'node:assert/strict';
import { applyFolds, foldsHiding } from './sectionFolds.js';

// On a stand-in for the inspector's run of headings and rows: a folded block
// hides its rows only; a folded section hides its rows and its blocks; opening
// again shows only what the fold hid; a row found by search names the folds
// that hide it; the keys do not depend on the labels' language.

function element(className = '', label = '') {
    const node = {
        className, label, hidden: false, dataset: {}, attributes: {}, children: [], parentElement: null, previousElementSibling: null,
        classList: { contains: (name) => className.split(' ').includes(name) },
        setAttribute(name, value) { this.attributes[name] = value; },
        querySelectorAll(selector) {
            const name = selector.slice(1), out = [];
            const walk = (n) => n.children.forEach((child) => { if (child.classList.contains(name)) out.push(child); walk(child); });
            walk(this);
            return out;
        },
    };
    return node;
}
function append(parent, ...children) {
    for (const child of children) {
        child.parentElement = parent;
        child.previousElementSibling = parent.children.at(-1) ?? null;
        parent.children.push(child);
    }
    return parent;
}
const heading = (label, block = false) => element(`home-editor-section-heading${block ? ' home-editor-section-heading--block' : ''}`, label);
const row = (label) => element('focus-control-row', label);

// «Геометрия» › «Сетка» (2 rows) · «Волны» (2 rows) · «Прибой» › «Обрушение» (1 row); a row hidden by its own section.
const root = element();
const geometry = heading('Геометрия'), mesh = heading('Сетка', true), waves = heading('Волны', true), surf = heading('Прибой'), breaking = heading('Обрушение', true);
const rings = row('Кольца'), segments = row('Сегменты'), length = row('Длина'), height = row('Высота'), phase = row('Фаза');
const own = row('Скрытая самим разделом'); own.hidden = true;
append(root, row('Вода'), geometry, mesh, rings, segments, waves, length, height, own, surf, breaking, phase);
const shown = () => root.children.filter((child) => !child.hidden).map((child) => child.label);

applyFolds(root, 'landscape/water', new Set());
assert.deepEqual(shown(), ['Вода', 'Геометрия', 'Сетка', 'Кольца', 'Сегменты', 'Волны', 'Длина', 'Высота', 'Прибой', 'Обрушение', 'Фаза'], 'nothing folded: all shown, the self-hidden row stays hidden');
assert.deepEqual([geometry, mesh, waves, surf, breaking].map((h) => h.dataset.foldKey), ['landscape/water#0', 'landscape/water#1', 'landscape/water#2', 'landscape/water#3', 'landscape/water#4'], 'keys by place, not by label');

applyFolds(root, 'landscape/water', new Set(['landscape/water#1']));
assert.deepEqual(shown(), ['Вода', 'Геометрия', 'Сетка', 'Волны', 'Длина', 'Высота', 'Прибой', 'Обрушение', 'Фаза'], 'a folded block hides its rows only');
assert.equal(mesh.attributes['aria-expanded'], 'false');

applyFolds(root, 'landscape/water', new Set(['landscape/water#0']));
assert.deepEqual(shown(), ['Вода', 'Геометрия', 'Прибой', 'Обрушение', 'Фаза'], 'a folded section hides its blocks and their rows');

applyFolds(root, 'landscape/water', new Set(['landscape/water#0', 'landscape/water#2']));
assert.deepEqual(foldsHiding(height).sort(), ['landscape/water#0', 'landscape/water#2'], 'a row names the section and the block that hide it');
assert.deepEqual(foldsHiding(rings), ['landscape/water#0'], 'and only folded ones');

applyFolds(root, 'landscape/water', new Set());
assert.equal(own.hidden, true, 'opening again shows only what the fold hid');
assert.deepEqual(shown().length, 11);

console.log('sectionFolds: blocks fold their rows, sections fold their blocks, opening shows only what was folded, a found row names its folds');
