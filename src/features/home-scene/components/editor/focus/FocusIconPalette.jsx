import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './focusIconPalette.css';

export const FOCUS_ICON_COLORS = [
    ['Мел', 'Chalk', '#dddcd4'], ['Серый', 'Grey', '#a0a5aa'], ['Песок', 'Sand', '#c4b293'],
    ['Охра', 'Ochre', '#cbb26b'], ['Янтарь', 'Amber', '#e4b45b'], ['Оранжевый', 'Orange', '#e49b69'],
    ['Коралл', 'Coral', '#df887b'], ['Красный', 'Red', '#d76b72'], ['Розовый', 'Pink', '#d994bb'],
    ['Сиреневый', 'Lilac', '#bd92d7'], ['Фиолетовый', 'Violet', '#9d8bd8'], ['Индиго', 'Indigo', '#899ddd'],
    ['Голубой', 'Blue', '#7fbbdf'], ['Бирюзовый', 'Teal', '#70c3be'], ['Зелёный', 'Green', '#9cbf86'],
];

const STORAGE_KEY = 'ddg_focus_ui_colors_v1';
const PALETTE_VALUES = new Set(FOCUS_ICON_COLORS.map(([, , color]) => color));
const readColors = () => {
    if (typeof window === 'undefined') return {};
    try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
        return Object.fromEntries(Object.entries(parsed).filter(([, color]) => PALETTE_VALUES.has(color)));
    } catch { return {}; }
};

// Paths are stable `group/node` editor paths. A node label inherits its group
// colour until it gets an explicit `node:path` override.
export function useFocusIconColors() {
    const [colors, setColors] = useState(readColors);
    useEffect(() => {
        try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(colors)); } catch { /* memory fallback */ }
    }, [colors]);
    const groupColor = useCallback((groupId) => colors[`group:${groupId}`], [colors]);
    const colorFor = useCallback((path) => {
        const groupId = String(path ?? '').split('/')[0];
        return colors[`node:${path}`] ?? colors[`group:${groupId}`];
    }, [colors]);
    const setGroupColor = useCallback((groupId, color) => setColors((current) => ({ ...current, [`group:${groupId}`]: color })), []);
    const setNodeColor = useCallback((path, color) => setColors((current) => ({ ...current, [`node:${path}`]: color })), []);
    const clearGroupColor = useCallback((groupId) => setColors((current) => {
        const next = { ...current }; delete next[`group:${groupId}`]; return next;
    }), []);
    const clearNodeColor = useCallback((path) => setColors((current) => {
        const next = { ...current }; delete next[`node:${path}`]; return next;
    }), []);
    return { colorFor, groupColor, setGroupColor, setNodeColor, clearGroupColor, clearNodeColor };
}

export function FocusColorPalette({ target, anchor, colors, onClose, language = 'ru' }) {
    const ref = useRef(null);
    const targetIsGroup = target?.kind === 'group';
    const activeColor = targetIsGroup ? colors.groupColor(target.groupId) : colors.colorFor(target?.path);
    const select = (color) => {
        if (targetIsGroup) colors.setGroupColor(target.groupId, color);
        else colors.setNodeColor(target.path, color);
        onClose?.();
    };
    const reset = () => {
        if (targetIsGroup) colors.clearGroupColor(target.groupId);
        else colors.clearNodeColor(target.path);
        onClose?.();
    };
    useEffect(() => {
        const close = (event) => { if (!ref.current?.contains(event.target)) onClose?.(); };
        const escape = (event) => { if (event.key === 'Escape') onClose?.(); };
        window.addEventListener('pointerdown', close, true); window.addEventListener('keydown', escape);
        return () => { window.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', escape); };
    }, [onClose]);
    if (!target || !anchor) return null;
    return (
        <div ref={ref} className="focus-color-palette" role="dialog" aria-label={`${language === 'ru' ? 'Цвет значка' : 'Icon color'}: ${target.label}`} style={{ left: anchor.x, top: anchor.y }}>
            <div className="focus-color-palette__title">{target.label}</div>
            <div className="focus-color-palette__grid" role="group" aria-label={language === 'ru' ? '15 цветов' : '15 colors'}>
                {FOCUS_ICON_COLORS.map(([ru, en, color]) => <button key={color} type="button" className="focus-color-palette__swatch" style={{ '--focus-swatch': color }} aria-label={language === 'ru' ? ru : en} aria-pressed={activeColor === color} onClick={() => select(color)}><span /></button>)}
            </div>
            <button type="button" className="focus-color-palette__reset" onClick={reset}>{targetIsGroup ? (language === 'ru' ? 'Без метки' : 'No label') : (language === 'ru' ? 'Цвет группы' : 'Group color')}</button>
            <small>{targetIsGroup ? (language === 'ru' ? 'Наследуется значками объектов' : 'Inherited by object icons') : (language === 'ru' ? 'Один цвет в списке и инспекторе' : 'Same colour in list and inspector')}</small>
        </div>
    );
}

// Use this wrapper for LMB and the browser context menu. It passes placement
// and identity upward so the panel owns one palette at a time.
export function useFocusColorPalette() {
    const [popup, setPopup] = useState(null);
    const open = useCallback((event, target) => {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        setPopup({ target, anchor: { x: event.type === 'contextmenu' ? event.clientX : rect.left, y: event.type === 'contextmenu' ? event.clientY : rect.bottom + 5 } });
    }, []);
    const close = useCallback(() => setPopup(null), []);
    return useMemo(() => ({ popup, open, close }), [popup, open, close]);
}
