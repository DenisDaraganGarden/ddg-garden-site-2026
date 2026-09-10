import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { FocusIcon } from './FocusIcons';
import './focusContextMenu.css';

// Одно контекстное меню на весь редактор. Поверхность (вьюпорт, лента камер,
// строка параметра) держит у себя только точку клика и цель; список пунктов
// собирается на месте, поэтому ни одна поверхность не знает про другие.
//
// Пункт — { label, icon, checked, disabled, danger, onSelect }. Строка '-' —
// разделитель, false и null выпадают: так список можно писать с условиями,
// а лишние линейки убираются сами.
const normalizeItems = (items) => (items ?? [])
    .filter(Boolean)
    .filter((item, index, list) => item !== '-' || (index > 0 && index < list.length - 1 && list[index - 1] !== '-'));

export function FocusContextMenu({ x, y, title, items, onClose }) {
    const ref = useRef(null);
    const [position, setPosition] = useState(null);
    const list = normalizeItems(items);
    const empty = list.every((item) => item === '-');

    // Меню открывается у курсора, но целиком остаётся в окне: у нижнего края
    // оно поднимается, у правого — сдвигается влево.
    useLayoutEffect(() => {
        if (!ref.current) return;
        const bounds = ref.current.getBoundingClientRect();
        const inset = 8;
        setPosition({
            left: Math.max(inset, Math.min(x, window.innerWidth - bounds.width - inset)),
            top: Math.max(inset, Math.min(y, window.innerHeight - bounds.height - inset)),
        });
    }, [x, y]);

    useEffect(() => {
        ref.current?.querySelector('button:not(:disabled)')?.focus({ preventScroll: true });
    }, [x, y]);

    useEffect(() => {
        const outside = (event) => { if (!ref.current?.contains(event.target)) onClose?.(); };
        const escape = (event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            event.stopImmediatePropagation();
            onClose?.();
        };
        const dismiss = () => onClose?.();
        window.addEventListener('pointerdown', outside, true);
        window.addEventListener('keydown', escape, true);
        window.addEventListener('blur', dismiss);
        window.addEventListener('resize', dismiss);
        return () => {
            window.removeEventListener('pointerdown', outside, true);
            window.removeEventListener('keydown', escape, true);
            window.removeEventListener('blur', dismiss);
            window.removeEventListener('resize', dismiss);
        };
    }, [onClose]);

    if (empty) return null;

    const step = (event, direction) => {
        const buttons = [...(ref.current?.querySelectorAll('button:not(:disabled)') ?? [])];
        const current = buttons.indexOf(event.currentTarget);
        if (current < 0) return;
        event.preventDefault();
        buttons[(current + direction + buttons.length) % buttons.length].focus();
    };

    // Портал в body: у ленты камер backdrop-filter, а он делает из предка систему
    // координат для position:fixed — меню уехало бы вместе с ней.
    return createPortal(
        <div
            ref={ref}
            className="focus-context-menu"
            role="menu"
            aria-label={title || undefined}
            style={{ left: position?.left ?? x, top: position?.top ?? y }}
        >
            {title ? <div className="focus-context-menu__title">{title}</div> : null}
            {list.map((item, index) => item === '-'
                ? <hr key={`separator-${index}`} />
                : <button
                    key={item.label}
                    type="button"
                    role={typeof item.checked === 'boolean' ? 'menuitemcheckbox' : 'menuitem'}
                    aria-checked={typeof item.checked === 'boolean' ? item.checked : undefined}
                    className={item.danger ? 'is-danger' : ''}
                    disabled={item.disabled}
                    onClick={() => { onClose?.(); item.onSelect?.(); }}
                    onKeyDown={(event) => {
                        if (event.key === 'ArrowDown') step(event, 1);
                        if (event.key === 'ArrowUp') step(event, -1);
                    }}
                >
                    <FocusIcon name={item.checked ? 'check' : (item.icon ?? 'box')} className={item.checked || item.icon ? '' : 'is-blank'} />
                    <span>{item.label}</span>
                    {item.hint ? <small>{item.hint}</small> : null}
                </button>)}
        </div>,
        document.body,
    );
}

export default FocusContextMenu;
