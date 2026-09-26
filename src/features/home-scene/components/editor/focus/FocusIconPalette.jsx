/* eslint-disable react-refresh/only-export-components -- Palette hooks and shared colour tokens form one editor API. */
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FOCUS_ICON_COLORS, FOCUS_ICON_GRADIENTS, FOCUS_ICON_PALETTE } from './focusIconColors';
import './focusIconPalette.css';

// Прежние пятнадцать приглушённых — к ближайшим новым, чтобы выбранное не пропало.
const LEGACY_COLORS = {
    '#dddcd4': '#f1eee6', '#a0a5aa': '#aab2ba', '#c4b293': '#dcc49a', '#cbb26b': '#b9b35a', '#e4b45b': '#ffb22e',
    '#e49b69': '#ff8740', '#df887b': '#e0714f', '#d76b72': '#ff5454', '#d994bb': '#ff4f8e', '#bd92d7': '#c49aff',
    '#9d8bd8': '#9a77ff', '#899ddd': '#6f8cff', '#7fbbdf': '#40b4ff', '#70c3be': '#2fd4c6', '#9cbf86': '#34d27f',
};

const STORAGE_KEY = 'ddg_focus_ui_colors_v1';
const PALETTE_VALUES = new Set(FOCUS_ICON_PALETTE.map(([, , color]) => color));
const PALETTE_COLUMNS = 8;
const readColors = () => {
    if (typeof window === 'undefined') return {};
    try {
        const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
        return Object.fromEntries(Object.entries(parsed).map(([key, color]) => [key, LEGACY_COLORS[color] ?? color]).filter(([, color]) => PALETTE_VALUES.has(color)));
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
    const [position, setPosition] = useState(null);
    const targetIsGroup = target?.kind === 'group';
    const activeColor = targetIsGroup ? colors.groupColor(target.groupId) : colors.colorFor(target?.path);
    const selectedIndex = Math.max(0, FOCUS_ICON_PALETTE.findIndex(([, , color]) => color === activeColor));
    const close = useCallback((restoreFocus = false) => {
        if (restoreFocus && anchor?.trigger?.isConnected) {
            anchor.trigger.focus();
        }
        onClose?.();
    }, [anchor, onClose]);

    // The palette can originate on either edge of a wide editor. Size it after
    // mount, then keep the expanded palette inside the visible window.
    useLayoutEffect(() => {
        if (!ref.current || !anchor) return;
        const place = () => {
            const bounds = ref.current.getBoundingClientRect();
            const inset = 8;
            setPosition({
                left: Math.max(inset, Math.min(anchor.x, window.innerWidth - bounds.width - inset)),
                top: Math.max(inset, Math.min(anchor.y, window.innerHeight - bounds.height - inset)),
            });
        };
        place();
        window.addEventListener('resize', place);
        return () => window.removeEventListener('resize', place);
    }, [anchor]);

    useEffect(() => {
        const selected = ref.current?.querySelector('[aria-pressed="true"]')
            ?? ref.current?.querySelector('[data-focus-swatch]');
        selected?.focus();
    }, [activeColor, target]);

    const select = (color) => {
        if (targetIsGroup) colors.setGroupColor(target.groupId, color);
        else colors.setNodeColor(target.path, color);
        close(true);
    };
    const reset = () => {
        if (targetIsGroup) colors.clearGroupColor(target.groupId);
        else colors.clearNodeColor(target.path);
        close(true);
    };
    useEffect(() => {
        const closeOutside = (event) => { if (!ref.current?.contains(event.target)) close(false); };
        const escape = (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopImmediatePropagation();
            close(true);
        };
        const blur = () => close(false);
        window.addEventListener('pointerdown', closeOutside, true);
        window.addEventListener('keydown', escape, true);
        window.addEventListener('blur', blur);
        return () => {
            window.removeEventListener('pointerdown', closeOutside, true);
            window.removeEventListener('keydown', escape, true);
            window.removeEventListener('blur', blur);
        };
    }, [close]);
    const handleGridKeyDown = (event) => {
        const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -PALETTE_COLUMNS, ArrowDown: PALETTE_COLUMNS };
        if (!(event.key in offsets)) return;
        const swatches = [...(ref.current?.querySelectorAll('[data-focus-swatch]') ?? [])];
        const current = swatches.indexOf(event.currentTarget);
        if (current < 0) return;
        event.preventDefault();
        event.stopPropagation();
        const next = (current + offsets[event.key] + swatches.length) % swatches.length;
        event.currentTarget.tabIndex = -1;
        swatches[next].tabIndex = 0;
        swatches[next].focus();
    };
    const swatch = ([ru, en, color, start, end], index) => <button key={color} type="button" className="focus-color-palette__swatch" data-focus-swatch style={{ '--focus-swatch': start ? `linear-gradient(135deg, ${start}, ${end})` : color, '--focus-swatch-edge': start ?? color }} aria-label={language === 'ru' ? ru : en} title={language === 'ru' ? ru : en} aria-pressed={activeColor === color} tabIndex={index === selectedIndex ? 0 : -1} onKeyDown={handleGridKeyDown} onClick={() => select(color)}><span /></button>;
    if (!target || !anchor) return null;
    return (
        <div ref={ref} className="focus-color-palette" data-focus-color-palette role="dialog" aria-label={`${language === 'ru' ? 'Цвет значка' : 'Icon color'}: ${target.label}`} style={{ left: position?.left ?? anchor.x, top: position?.top ?? anchor.y }}>
            <div className="focus-color-palette__title">{target.label}</div>
            <div className="focus-color-palette__grid" role="group" aria-label={`${FOCUS_ICON_COLORS.length} ${language === 'ru' ? 'цветов' : 'colors'}`}>
                {FOCUS_ICON_COLORS.map(swatch)}
            </div>
            <div className="focus-color-palette__section">{language === 'ru' ? 'Градиенты' : 'Gradients'}</div>
            <div className="focus-color-palette__grid" role="group" aria-label={`${FOCUS_ICON_GRADIENTS.length} ${language === 'ru' ? 'градиентов' : 'gradients'}`}>
                {FOCUS_ICON_GRADIENTS.map((entry, index) => swatch(entry, FOCUS_ICON_COLORS.length + index))}
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
        setPopup({ target, anchor: { trigger: event.currentTarget, x: event.type === 'contextmenu' ? event.clientX : rect.left, y: event.type === 'contextmenu' ? event.clientY : rect.bottom + 5 } });
    }, []);
    const close = useCallback(() => setPopup(null), []);
    return useMemo(() => ({ popup, open, close }), [popup, open, close]);
}
