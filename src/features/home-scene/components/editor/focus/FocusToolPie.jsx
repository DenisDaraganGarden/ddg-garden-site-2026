import React, { useEffect, useRef, useState } from 'react';
import { FocusIcon } from './FocusIcons';

// Круговое меню инструментов на пробеле, как в Blender: зажал пробел —
// вокруг курсора кольцо инструментов, повёл мышь в сторону нужного и
// отпустил — он выбран. Короткое нажатие остаётся паузой анимации. Клик по
// пункту тоже выбирает; Esc или отпустить в середине — ничего.
//
// Пункт с `children` — свиток: навёл — наружу, в ту же сторону от центра,
// раскрывается список (озеленение: цветник, посадить, лиана, изгородь). Мышь
// идёт к списку по тому же лучу, поэтому кольцо не перескакивает на соседа;
// над списком угол не считается. Отпустил на строке — она; на самом пункте —
// его главное действие (main, у «Прогулки» — идти), иначе последний
// выбранный из свитка.
const HOLD_MS = 170;
const RADIUS = 96;
const DEAD_ZONE = 26;
const FLYOUT_GAP = 44;
// Пробел не трогает только набор текста и открытые окна. Кнопка в фокусе
// (после любого клика по панели) пробелом не нажимается — иначе круг не
// открывался бы через раз; кнопки жмутся мышью и Enter.
const TEXT = (target) => target?.closest?.('textarea,select,[contenteditable=true],dialog')
    || (target?.tagName === 'INPUT' && !['range', 'checkbox', 'button'].includes(target.type));
const inside = (rect, x, y, margin = 14) => rect && x >= rect.left - margin && x <= rect.right + margin && y >= rect.top - margin && y <= rect.bottom + margin;

export default function FocusToolPie({ tools, current, enabled, onChoose, onTap, language, fill = true, outline = true }) {
    const [pie, setPie] = useState(null);
    const [hover, setHover] = useState(-1);
    const [child, setChild] = useState(-1);
    const [last, setLast] = useState({});
    const flyout = useRef(null);
    const pointer = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    const live = useRef();
    live.current = { tools, onChoose, onTap, pie, hover, child, last, current };

    // Свиток: что выбрать, если отпустили на самом пункте.
    const fallback = (item) => {
        const { last: remembered, current: now } = live.current;
        return item.main ?? item.children.find((tool) => tool.id === now)?.id ?? remembered[item.id] ?? item.children[0].id;
    };
    const choose = (item, id = item.children ? fallback(item) : item.id) => {
        if (item.children) setLast((value) => ({ ...value, [item.id]: id }));
        live.current.onChoose(id);
        setPie(null); setHover(-1); setChild(-1);
    };

    useEffect(() => {
        if (!enabled) return undefined;
        let timer = 0, held = false;
        const pick = (x, y, center) => {
            const dx = x - center.x, dy = y - center.y;
            if (Math.hypot(dx, dy) < DEAD_ZONE) return -1;
            const count = live.current.tools.length;
            const index = Math.round(((Math.atan2(dx, -dy) + 2 * Math.PI) % (2 * Math.PI)) / ((2 * Math.PI) / count)) % count;
            return live.current.tools[index]?.disabled ? -1 : index;
        };
        const move = (event) => {
            pointer.current = { x: event.clientX, y: event.clientY };
            const open = live.current.pie;
            if (!open) return;
            // Над открытым свитком кольцо не пересчитывается.
            if (live.current.tools[live.current.hover]?.children && inside(flyout.current?.getBoundingClientRect(), event.clientX, event.clientY)) return;
            const next = pick(event.clientX, event.clientY, open);
            if (next !== live.current.hover) { setHover(next); setChild(-1); }
        };
        const close = (commit) => {
            const { pie: open, hover: index, child: row, tools: list } = live.current;
            const item = list[index];
            if (commit && open && item) {
                choose(item, item.children && row >= 0 ? item.children[row].id : undefined);
                return;
            }
            setPie(null); setHover(-1); setChild(-1);
        };
        const down = (event) => {
            if (event.code === 'Escape' && live.current.pie) { event.preventDefault(); event.stopPropagation(); close(false); return; }
            if (event.code !== 'Space' || event.metaKey || event.ctrlKey || event.altKey || TEXT(event.target)) return;
            event.preventDefault();
            if (event.repeat || held) return;
            held = true;
            timer = window.setTimeout(() => {
                timer = 0;
                const { x, y } = pointer.current;
                setPie({ x: Math.min(window.innerWidth - RADIUS - 44, Math.max(RADIUS + 44, x)), y: Math.min(window.innerHeight - RADIUS - 44, Math.max(RADIUS + 44, y)) });
                setHover(-1); setChild(-1);
            }, HOLD_MS);
        };
        const up = (event) => {
            if (event.code !== 'Space' || !held) return;
            held = false;
            event.preventDefault();
            if (timer) { window.clearTimeout(timer); timer = 0; live.current.onTap(); return; }
            close(true);
        };
        const blur = () => { held = false; if (timer) { window.clearTimeout(timer); timer = 0; } close(false); };
        window.addEventListener('pointermove', move, true);
        window.addEventListener('keydown', down, true);
        window.addEventListener('keyup', up, true);
        window.addEventListener('blur', blur);
        return () => {
            window.removeEventListener('pointermove', move, true);
            window.removeEventListener('keydown', down, true);
            window.removeEventListener('keyup', up, true);
            window.removeEventListener('blur', blur);
            if (timer) window.clearTimeout(timer);
        };
    // choose читает всё из live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [enabled]);

    if (!pie) return null;
    const ru = language === 'ru';
    const all = tools.flatMap((tool) => [tool, ...(tool.children ?? [])]);
    const group = hover >= 0 && tools[hover].children ? tools[hover] : null;
    const shown = group && child >= 0 ? group.children[child] : hover >= 0 ? tools[hover] : all.find((tool) => tool.id === current);
    const angleOf = (index) => (index / tools.length) * 2 * Math.PI;
    // Свиток — наружу от пункта: слева от кольца прижат правым краем, справа
    // левым, сверху и снизу — посередине.
    const flyoutStyle = (index) => {
        const angle = angleOf(index), sin = Math.sin(angle), cos = -Math.cos(angle);
        const x = sin * (RADIUS + FLYOUT_GAP), y = cos * (RADIUS + FLYOUT_GAP);
        const tx = sin < -0.3 ? '-100%' : sin > 0.3 ? '0%' : '-50%';
        const ty = Math.abs(sin) <= 0.3 ? (cos < 0 ? '-100%' : '0%') : '-50%';
        return { left: x, top: y, transform: `translate(${tx}, ${ty})` };
    };
    return <div className={`focus-pie${fill ? '' : ' no-fill'}${outline ? '' : ' no-outline'}`} role="menu" aria-label={ru ? 'Инструменты' : 'Tools'} style={{ left: pie.x, top: pie.y }}>
        <svg className="focus-pie__pointer" viewBox="-120 -120 240 240" aria-hidden="true">
            <circle r={DEAD_ZONE} />
            {hover >= 0 ? <path d={`M0 0 L${Math.sin(angleOf(hover)) * 70} ${-Math.cos(angleOf(hover)) * 70}`} /> : null}
        </svg>
        <div className="focus-pie__center">{shown ? <><b>{ru ? shown.ru : shown.en}</b><small>{shown.key}</small></> : null}</div>
        {tools.map((tool, index) => {
            const angle = angleOf(index);
            const active = tool.id === current || Boolean(tool.children?.some((item) => item.id === current));
            return <button key={tool.id} type="button" role={tool.children ? 'menuitem' : 'menuitemradio'} aria-haspopup={tool.children ? 'menu' : undefined} aria-expanded={tool.children ? index === hover : undefined} aria-checked={tool.children ? undefined : active} disabled={tool.disabled}
                className={`${index === hover ? 'is-hover' : ''} ${active ? 'is-current' : ''} ${tool.group ? `is-${tool.group}` : ''} ${tool.children ? 'is-group' : ''}`}
                style={{ transform: `translate(${Math.sin(angle) * RADIUS}px, ${-Math.cos(angle) * RADIUS}px)` }}
                onPointerEnter={() => { if (!tool.disabled && index !== hover) { setHover(index); setChild(-1); } }}
                onClick={() => (tool.children ? setHover(index) : choose(tool))} data-testid={`focus-pie-${tool.id}`}>
                <FocusIcon name={tool.icon} /><span>{ru ? tool.ru : tool.en}</span>
            </button>;
        })}
        {group ? <div ref={flyout} className="focus-pie__flyout" role="menu" aria-label={ru ? group.ru : group.en} style={flyoutStyle(hover)}>
            <header>{ru ? group.ru : group.en}</header>
            {group.children.map((tool, row) => <button key={tool.id} type="button" role="menuitemradio" aria-checked={tool.id === current}
                className={`${row === child ? 'is-hover' : ''} ${tool.id === current ? 'is-current' : ''}`}
                onPointerEnter={() => setChild(row)} onClick={() => choose(group, tool.id)} data-testid={`focus-pie-${tool.id}`}>
                <FocusIcon name={tool.icon} /><span>{ru ? tool.ru : tool.en}</span><kbd>{tool.key}</kbd>
            </button>)}
        </div> : null}
    </div>;
}
