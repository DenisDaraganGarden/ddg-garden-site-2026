import { useCallback, useRef, useState } from 'react';
import { ANNOTATION_LIMITS, normalizeAnnotationMark } from './settings.js';

export const ANNOTATIONS_NODE = 'annotations/levels';
const newId = () => `mark-${crypto.randomUUID().slice(0, 12)}`;

// Правки отметок идут через историю редактора (⌘Z): поставить щелчком
// (инструмент «Отметка», M), назначить нулём, удалить. Высоты, которые слой
// нашёл заново на изменившейся поверхности, пишутся мимо истории — это не
// правка Дениса, а сама поверхность.
export function useAnnotationEditor({ settings, history, setSettings, setActiveTab, setTool }) {
    const [selectedId, setSelectedId] = useState(null);
    const live = useRef();
    live.current = { settings, history };
    const marks = settings.annotationMarks ?? [];
    const apply = useCallback((next) => {
        // Ноль один; ушёл — нулём становится первая оставшаяся.
        const list = next.map((mark) => ({ ...mark }));
        if (list.length && !list.some((mark) => mark.zero)) list[0].zero = true;
        live.current.history.applySettings({ annotationsEnabled: true, annotationMarks: list });
    }, []);

    const onMark = useCallback(([x, y, z], { onModel = true } = {}) => {
        const list = live.current.settings.annotationMarks ?? [];
        if (list.length >= ANNOTATION_LIMITS.marks) return;
        const mark = normalizeAnnotationMark({ id: newId(), x, y, z, zero: !list.length, ground: !onModel });
        apply([...list, mark]);
        setSelectedId(mark.id);
    }, [apply]);
    const select = useCallback((id) => { setSelectedId(id); setActiveTab(ANNOTATIONS_NODE); setTool('select'); }, [setActiveTab, setTool]);
    const deselect = useCallback(() => setSelectedId(null), []);
    const remove = useCallback((id) => {
        apply((live.current.settings.annotationMarks ?? []).filter((mark) => mark.id !== id));
        setSelectedId(null);
    }, [apply]);
    const setZero = useCallback((id) => {
        apply((live.current.settings.annotationMarks ?? []).map(({ zero: _zero, ...mark }) => (mark.id === id ? { ...mark, zero: true } : mark)));
    }, [apply]);
    const onResnap = useCallback((updates) => {
        setSettings((previous) => ({ ...previous, annotationMarks: (previous.annotationMarks ?? []).map((mark) => (updates.has(mark.id) ? { ...mark, y: updates.get(mark.id) } : mark)) }));
    }, [setSettings]);

    return {
        selectedId: marks.some((mark) => mark.id === selectedId) ? selectedId : null,
        onMark, select, deselect, remove, setZero, onResnap,
        begin: () => { setActiveTab(ANNOTATIONS_NODE); setTool('mark'); },
    };
}
