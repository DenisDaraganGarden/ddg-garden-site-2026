import { createContext, useContext } from 'react';

// Folding the inspector's sections. A node's parameters are one flat run of
// headings and rows (a section's heading, its blocks' quieter headings, the
// rows under each), written by some forty section components; so the fold is
// done on that run as it stands on the page, not by restructuring every one of
// them. A heading gets a key from its place among the node's headings —
// «landscape/water#3» — the same in both languages; what follows a folded
// heading is hidden up to the next heading as high or higher, so a folded
// section takes its blocks with it. Which headings are folded is remembered
// in this browser (a preference of the hands, like the inspector's width).

export const SectionFoldContext = createContext(null);
export const useSectionFold = () => useContext(SectionFoldContext);

const STORAGE_KEY = 'ddg.editor.folds.v1';
export function loadFolds() {
    try { return new Set(JSON.parse(globalThis.localStorage?.getItem(STORAGE_KEY) ?? '[]')); } catch { return new Set(); }
}
export function saveFolds(folds) {
    try { globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify([...folds])); } catch { /* a private window: this session only */ }
}

const HEADING = 'home-editor-section-heading';
const isHeading = (element) => element.classList?.contains(HEADING);
const levelOf = (heading) => (heading.classList.contains(`${HEADING}--block`) ? 2 : 1);

// Only what the fold hid is ever shown again by it: an element a section hides
// by itself stays hidden.
function hide(element, hidden) {
    if (hidden) {
        if (!element.hidden) { element.hidden = true; element.dataset.foldedAway = ''; }
    } else if ('foldedAway' in element.dataset) {
        element.hidden = false;
        delete element.dataset.foldedAway;
    }
}

export function applyFolds(root, prefix, folded) {
    const headings = [...root.querySelectorAll(`.${HEADING}`)];
    headings.forEach((heading, n) => {
        const key = `${prefix}#${n}`;
        heading.dataset.foldKey = key;
        heading.dataset.folded = folded.has(key) ? 'true' : 'false';
        heading.setAttribute('aria-expanded', folded.has(key) ? 'false' : 'true');
    });
    for (const parent of new Set(headings.map((heading) => heading.parentElement))) {
        let section = false, block = false;
        for (const child of parent.children) {
            if (isHeading(child)) {
                const closed = child.dataset.folded === 'true';
                if (levelOf(child) === 1) { section = closed; block = false; hide(child, false); } else { block = closed; hide(child, section); }
                continue;
            }
            hide(child, section || block);
        }
    }
}

// The keys to open so that `element` (a row found by search) shows again: the
// block heading and the section heading above it, whichever are folded.
export function foldsHiding(element) {
    const keys = [];
    for (let node = element; node; node = node.parentElement) {
        if (!('foldedAway' in (node.dataset ?? {}))) continue;
        let needBlock = true;
        for (let sibling = node.previousElementSibling; sibling; sibling = sibling.previousElementSibling) {
            if (!isHeading(sibling)) continue;
            if (levelOf(sibling) === 2 && !needBlock) continue;
            if (sibling.dataset.folded === 'true') keys.push(sibling.dataset.foldKey);
            if (levelOf(sibling) === 1) break;
            needBlock = false;
        }
    }
    return keys;
}
