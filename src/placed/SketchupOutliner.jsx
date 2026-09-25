import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { FocusIcon } from '../features/home-scene/components/editor/focus/FocusIcons';
import { findPart, outlineChildren, outlineGroups, outlinePart, partName, selectedNodes } from './sketchupModel.js';

// «Состав модели» — как «Структура» (Outliner) в SketchUp: компоненты и
// группы деревом, копии одного компонента — одной строкой со счётчиком.
// Строка — выбрать (в сцене рамка), Shift — добавить к выбору, двойной
// щелчок — в кадр, ▸ — зайти внутрь; глаз — скрыть или показать; корзина —
// удалить: удалённое уходит в свой список внизу, оттуда — вернуть. Поиск — по
// имени на любой глубине. Группы (копии и части с частями) — со значком и
// полосой, выбранное внутри открытой группы — голубое, как рамка в сцене.
const FOUND_LIMIT = 200;
// Дети строки считаются один раз на узел модели, а не на каждую перерисовку панели.
const KIDS = new WeakMap();
const childrenOf = (item) => { if (!KIDS.has(item)) KIDS.set(item, outlineChildren(item)); return KIDS.get(item); };
// Высота части — чтобы различать копии с одним именем (клён 6 м и клён 3 м).
const HEIGHTS = new WeakMap();
const box = new THREE.Box3();
const heightOf = (item) => {
    if (!HEIGHTS.has(item)) { box.makeEmpty().setFromObject(item, true); HEIGHTS.set(item, box.isEmpty() ? null : box.max.y - box.min.y); }
    return HEIGHTS.get(item);
};
const metres = (value, ru) => (value > 0.05 ? `${value.toLocaleString(ru ? 'ru-RU' : 'en-GB', { maximumFractionDigits: value < 10 ? 1 : 0 })} ${ru ? 'м' : 'm'}` : null);

function Row({ depth, kind, label, detail = null, count, hidden, selected, open, canOpen, onToggle, onSelect, onFrame, onEye, onRemove, ru, rowRef, removeTitle }) {
    return <div ref={rowRef} className={`placed-outline__row is-${kind}${selected ? ' is-selected' : ''}${hidden ? ' is-hidden' : ''}`} style={{ '--depth': depth }} role="treeitem" aria-selected={selected} aria-expanded={canOpen ? open : undefined}>
        <button type="button" className="placed-outline__open" onClick={onToggle} disabled={!canOpen} aria-label={open ? (ru ? 'Свернуть' : 'Collapse') : (ru ? 'Развернуть' : 'Expand')}>{canOpen ? (open ? '▾' : '▸') : ''}</button>
        <button type="button" className="placed-outline__name" onClick={onSelect} onDoubleClick={onFrame} title={kind === 'copies' ? (ru ? 'Копии одного компонента' : 'Copies of one component') : (ru ? 'Щелчок — выбрать, Shift — добавить к выбору, двойной — в кадр' : 'Click to select, Shift to add, double-click to frame')}>
            {kind === 'part' ? null : <FocusIcon name={kind === 'copies' ? 'copy' : 'box'} />}<span>{label}</span>{detail ? <em>{detail}</em> : null}{count ? <small>{count}</small> : null}
        </button>
        <button type="button" className="placed-outline__icon" onClick={onEye} aria-pressed={hidden} title={hidden ? (ru ? 'Показать' : 'Show') : (ru ? 'Скрыть' : 'Hide')} data-testid="placed-outline-eye"><FocusIcon name={hidden ? 'eyeoff' : 'eye'} /></button>
        <button type="button" className="placed-outline__icon is-danger" onClick={onRemove} title={removeTitle} data-testid="placed-outline-remove"><FocusIcon name="trash" /></button>
    </div>;
}

export function SketchupOutliner({ object, entry, sketchup, placedEditor, layoutEditor, ru }) {
    const root = entry.root;
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(() => new Set());
    const [showRemoved, setShowRemoved] = useState(false);
    const hidden = useMemo(() => new Set(sketchup.hidden), [sketchup.hidden]);
    const removedList = useMemo(() => sketchup.removed ?? [], [sketchup.removed]);
    const removed = useMemo(() => new Set(removedList), [removedList]);
    const groups = useMemo(() => outlineGroups(root), [root]);
    const part = placedEditor.part;
    const chosen = useMemo(() => new Set(selectedNodes(part)), [part]);
    const inside = part ? part.trail.indexOf(part.node) > 0 : false;
    const selectedRow = useRef(null);
    const nodeOf = (item) => item.userData.gltfNode;

    // Выбранное в сцене — раскрыть дорогу к нему и показать его строку.
    const trailKey = part ? `${part.trail.join('.')}:${part.node}` : '';
    useEffect(() => {
        if (!part) return;
        const top = findPart(root, part.trail[0]);
        const group = top ? groups.find((item) => item.items.includes(top)) : null;
        const upTo = part.trail.indexOf(part.node);
        setOpen((current) => new Set([...current, ...(group && group.items.length > 1 ? [`g:${group.name}`] : []), ...part.trail.slice(0, upTo).map((node) => `n:${node}`)]));
    }, [trailKey]); // eslint-disable-line react-hooks/exhaustive-deps -- по выбранной части, не по ссылке
    useEffect(() => { selectedRow.current?.scrollIntoView({ block: 'nearest' }); }, [trailKey]);

    const toggle = (key) => setOpen((current) => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
    const frame = (item) => layoutEditor?.frameObject?.(item);
    const eye = (nodes, shown) => (shown ? placedEditor.hideParts(object.id, nodes) : placedEditor.showParts(object.id, nodes));
    const removeTitle = ru ? 'Удалить — вернуть можно из «Удалённых» или ⌘Z' : 'Delete — bring it back from “Deleted” or with ⌘Z';

    const renderItem = (item, depth, hiddenAbove) => {
        const node = nodeOf(item);
        if (removed.has(node)) return null;
        const key = `n:${node}`, isOpen = open.has(key), inner = childrenOf(item), isHidden = hiddenAbove || hidden.has(node);
        return <React.Fragment key={key}>
            <Row depth={depth} kind={inner.length ? 'group' : 'part'} label={partName(item, ru)} detail={metres(heightOf(item), ru)} hidden={isHidden} selected={chosen.has(node)} open={isOpen} canOpen={inner.length > 0} ru={ru} removeTitle={removeTitle}
                onToggle={() => toggle(key)} onSelect={(event) => placedEditor.selectNode(object.id, node, event.shiftKey)} onFrame={() => frame(item)}
                onEye={() => eye([node], !hidden.has(node))} onRemove={() => placedEditor.removeParts(object.id, [node])} rowRef={part?.node === node ? selectedRow : undefined} />
            {isOpen ? inner.map((child) => renderItem(child, depth + 1, isHidden)) : null}
        </React.Fragment>;
    };

    const words = query.toLocaleLowerCase().trim();
    const found = useMemo(() => {
        if (!words) return null;
        const list = [];
        root.traverse((item) => {
            if (list.length < FOUND_LIMIT && item !== root && outlinePart(item) && !removed.has(nodeOf(item)) && partName(item, ru).toLocaleLowerCase().includes(words)) list.push(item);
        });
        return list;
    }, [root, words, ru, removed]);

    const hiddenCount = sketchup.hidden.length;
    // Найденное целиком: убрать все клёны SketchUp, чтобы поставить свои.
    const foundSet = found ? new Set(found) : null;
    const foundNodes = found ? found.filter((item) => { for (let up = item.parent; up; up = up.parent) if (foundSet.has(up)) return false; return true; }).map(nodeOf) : [];
    return <div className="placed-outline" data-testid="placed-outline">
        <div className="placed-outline__search">
            <FocusIcon name="search" />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ru ? 'Найти в модели: клён, стул…' : 'Find in the model: maple, chair…'} aria-label={ru ? 'Найти часть модели' : 'Find a model part'} data-testid="placed-outline-search" />
        </div>
        {foundNodes.length ? <div className="placed-outline__foot">
            <span>{ru ? 'Найдено' : 'Found'} {foundNodes.length}</span>
            <button type="button" onClick={() => placedEditor.hideParts(object.id, foundNodes)} data-testid="placed-outline-hide-found">{ru ? 'Скрыть все' : 'Hide all'}</button>
            <button type="button" className="is-danger" onClick={() => placedEditor.removeParts(object.id, foundNodes)} data-testid="placed-outline-remove-found">{ru ? 'Удалить все' : 'Delete all'}</button>
        </div> : null}
        <div className={`placed-outline__tree${inside ? ' is-inside' : ''}`} role="tree" aria-multiselectable="true" aria-label={ru ? 'Состав модели' : 'Model outline'}>
            {found ? found.map((item) => renderItem(item, 0, false))
                : groups.map((group) => {
                    if (group.items.length === 1) return renderItem(group.items[0], 0, false);
                    const key = `g:${group.name}`, isOpen = open.has(key);
                    const nodes = group.items.map(nodeOf).filter((node) => !removed.has(node));
                    if (!nodes.length) return null;
                    const allHidden = nodes.every((node) => hidden.has(node));
                    return <React.Fragment key={key}>
                        <Row depth={0} kind="copies" label={group.name} count={nodes.length} hidden={allHidden} selected={false} open={isOpen} canOpen ru={ru}
                            removeTitle={ru ? `Удалить все ${nodes.length} — вернуть можно из «Удалённых» или ⌘Z` : `Delete all ${nodes.length} — bring them back from “Deleted” or with ⌘Z`}
                            onToggle={() => toggle(key)} onSelect={() => toggle(key)} onFrame={() => toggle(key)}
                            onEye={() => eye(nodes, !allHidden)} onRemove={() => placedEditor.removeParts(object.id, nodes)} />
                        {isOpen ? group.items.map((item) => renderItem(item, 1, allHidden)) : null}
                    </React.Fragment>;
                })}
            {found && !found.length ? <p className="placed-outline__empty">{ru ? 'Ничего не нашлось.' : 'Nothing found.'}</p> : null}
            {found?.length === FOUND_LIMIT ? <p className="placed-outline__empty">{ru ? `Показаны первые ${FOUND_LIMIT} — уточните имя.` : `The first ${FOUND_LIMIT} are shown — narrow the name.`}</p> : null}
        </div>
        <div className="placed-outline__foot">
            <span>{ru ? 'Скрыто' : 'Hidden'} {hiddenCount}</span>
            {hiddenCount ? <button type="button" onClick={() => placedEditor.showParts(object.id)} data-testid="placed-sketchup-show">{ru ? 'Показать все скрытые' : 'Show all hidden'}</button> : null}
        </div>
        {removedList.length ? <div className="placed-outline__removed">
            <div className="placed-outline__foot">
                <button type="button" className="placed-outline__fold" onClick={() => setShowRemoved((value) => !value)} aria-expanded={showRemoved}>{showRemoved ? '▾' : '▸'} {ru ? 'Удалённые' : 'Deleted'} {removedList.length}</button>
                <button type="button" onClick={() => placedEditor.restoreParts(object.id)} data-testid="placed-outline-restore-all">{ru ? 'Вернуть все' : 'Restore all'}</button>
            </div>
            {showRemoved ? removedList.map((node) => {
                const item = findPart(root, node);
                return <div key={node} className="placed-outline__gone">
                    <span>{item ? partName(item, ru) : `#${node}`}</span>
                    <button type="button" onClick={() => placedEditor.restoreParts(object.id, [node])}>{ru ? 'Вернуть' : 'Restore'}</button>
                </div>;
            }) : null}
        </div> : null}
    </div>;
}
