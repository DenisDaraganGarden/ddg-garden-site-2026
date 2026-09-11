import { useCallback, useEffect, useRef, useState } from 'react';

export const GIZMO_MODES = ['translate', 'rotate', 'scale'];
export const EDITOR_TOOLS = ['select', ...GIZMO_MODES, 'hand'];

// Одна линейка инструментов, как в 3ds Max: в каждый момент активен ровно один.
//
//   select     V   клик выбирает объект, протяжка крутит камеру — инструмент по умолчанию
//   translate  G ┐
//   rotate     R ├ манипулятор в этом режиме; клик по-прежнему выбирает
//   scale      S ┘
//   hand       H   только обзор: манипулятор спрятан, клики ничего не выбирают
//
// Клавиши — Blender'овские G/R/S, потому что манипулятор с него и списан.
// W/E как псевдонимы больше не принимаются: W/A/S/D/Q/E — полёт камеры, и
// буква, которая значит разное в зависимости от того, куда упал фокус, хуже
// буквы с одним значением. Esc возвращает к выбору и прячет манипулятор.
const TOOL_KEYS = {
    v: 'select',
    g: 'translate',
    r: 'rotate',
    s: 'scale',
    h: 'hand',
};

const isTypingTarget = (target) => {
    if (!target) {
        return false;
    }

    const tag = target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
};

// Выбор объекта приходит из дерева редактора — второго источника истины нет.
// Здесь только инструмент: какой активен и какой из трёх трансформаций был
// последним, чтобы выбранный объект сразу получал привычный манипулятор.
export function useEditorTool(enabled = true) {
    const [tool, setToolState] = useState('translate');
    const lastTransform = useRef('translate');

    const setTool = useCallback((next) => {
        if (!EDITOR_TOOLS.includes(next)) return;
        if (GIZMO_MODES.includes(next)) lastTransform.current = next;
        setToolState(next);
    }, []);

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') {
            return undefined;
        }

        const handleKeyDown = (event) => {
            // Ползунок держит фокус большую часть сессии, а G/R/S — обычные
            // буквы: у поля их не отнимать.
            if (event.defaultPrevented || event.target?.closest?.('dialog') || isTypingTarget(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
                return;
            }

            if (event.key === 'Escape') {
                setTool('select');
                return;
            }

            const next = TOOL_KEYS[event.key.toLowerCase()];
            if (next) {
                event.preventDefault();
                setTool(next);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [enabled, setTool]);

    return { tool, setTool, lastTransform: lastTransform.current };
}

export default useEditorTool;
