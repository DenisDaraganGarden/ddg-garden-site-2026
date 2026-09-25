import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { LUMINAIRE_KINDS } from '../fixtures.js';
import { byKind, kindLabel, luminairePhotoUrl, makerOf, shortName, specLine } from '../luminaireLibrary.js';

// Превью светильника: фото изделия, если оно есть, иначе схема корпуса по
// числам записи — форма, высота, угол и наклон луча, цвет корпуса, цвет
// света. Узкий спот и широкая заливка различаются с первого взгляда.
// Цвет света по температуре: 2200 K — янтарь, 3000 K — тёплый белый.
const beamColor = (cct = 3000) => (cct <= 2300 ? '#ffae4a' : cct <= 2800 ? '#ffc978' : cct <= 3300 ? '#ffdca0' : '#fff0d6');
const rad = (deg) => (deg * Math.PI) / 180;
// Конус из точки (x, y) по оси angle (от вертикали вверх, по часовой),
// половина угла half, длина length.
const cone = (x, y, angle, half, length) => {
    const edge = (a) => [x + Math.sin(rad(a)) * length, y - Math.cos(rad(a)) * length];
    return [[x, y], edge(angle - half), edge(angle + half)].map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ');
};

export function LuminaireGlyph({ type }) {
    const uid = useId().replace(/:/g, '');
    const shape = type?.housing?.shape;
    const body = type?.housing?.color ?? '#2b2d2f';
    const half = Math.max(4, Math.min(75, (type?.optics?.beam ?? 60) / 2));
    const light = `url(#b${uid})`;
    const beams = [], parts = [];
    const ground = <line key="ground" x1="2" x2="62" y1="52" y2="52" stroke="#8c8a82" strokeWidth="1" />;
    if (shape === 'inground') {
        const tilt = Math.max(0, Math.min(30, type?.optics?.tilt ?? 0));
        beams.push(cone(32, 46, tilt, half, 44));
        parts.push(<line key="g" x1="2" x2="62" y1="46" y2="46" stroke="#8c8a82" strokeWidth="1" />,
            <rect key="c" x="27" y="46" width="10" height="9" rx="1" fill={body} opacity=".55" />,
            <rect key="r" x="24" y="44.6" width="16" height="2.4" rx="1" fill={body} />);
    } else if (shape === 'spike') {
        const pitch = type?.pitch ?? 35, axis = 90 - pitch;
        beams.push(cone(24, 38, axis, half, 46));
        parts.push(ground, <line key="s" x1="24" x2="24" y1="40" y2="58" stroke={body} strokeWidth="1.6" />,
            <rect key="h" x="19" y="35" width="10" height="6" rx="1.5" fill={body} transform={`rotate(${axis - 90} 24 38)`} />);
    } else if (shape === 'wall' || shape === 'step') {
        const step = shape === 'step', y = step ? 42 : 26;
        if (step) beams.push(cone(12, y, 120, half * 0.8, 34));
        else if (type?.optics?.profile === 'updown') beams.push(cone(13, y - 5, 8, half, 30), cone(13, y + 5, 172, half, 30));
        else beams.push(cone(13, y + 3, 160, half * 0.7, 34));
        parts.push(<rect key="w" x="2" y="6" width="7" height="46" fill="#b9b6ac" />, ground,
            step ? <rect key="f" x="9" y={y - 3} width="3" height="6" rx=".6" fill={body} /> : <rect key="f" x="9" y={y - 7} width="6" height="14" rx="1" fill={body} />);
    } else {
        // Боллард и фонарь: свет из головы вниз и в стороны.
        const post = shape === 'post', top = post ? 10 : 52 - Math.max(16, Math.min(34, (type?.housing?.h ?? 0.8) * 38));
        const width = post ? 3 : 8, head = post ? 7 : 0;
        beams.push(cone(32, top + 3, 180 - Math.min(half, 70) * 0.55, Math.min(half, 70) * 0.45, 52), cone(32, top + 3, 180 + Math.min(half, 70) * 0.55, Math.min(half, 70) * 0.45, 52));
        parts.push(ground, <rect key="p" x={32 - width / 2} y={top} width={width} height={52 - top} rx="1" fill={body} />,
            post ? <rect key="h" x={32 - head} y={top - 3} width={head * 2} height="6" rx="1.5" fill={body} /> : <rect key="l" x="28" y={top + 2} width="8" height="2.5" fill={beamColor(type?.optics?.cct)} />);
    }
    return <svg className="lum-glyph" viewBox="0 0 64 64" aria-hidden="true">
        <defs><radialGradient id={`b${uid}`} cx="0.5" cy="0.5" r="0.7">
            <stop offset="0" stopColor={beamColor(type?.optics?.cct)} stopOpacity=".95" />
            <stop offset="1" stopColor={beamColor(type?.optics?.cct)} stopOpacity=".12" />
        </radialGradient><clipPath id={`c${uid}`}><rect width="64" height="64" /></clipPath></defs>
        <g clipPath={`url(#c${uid})`}>{beams.map((points) => <polygon key={points} points={points} fill={light} />)}</g>
        {parts}
    </svg>;
}

export function LuminaireThumb({ type, size = 32, className = '' }) {
    const photo = luminairePhotoUrl(type);
    return <span className={`lum-thumb ${photo ? 'has-photo' : ''} ${className}`} style={{ width: size, height: size }}>
        {photo ? <img src={photo} alt="" loading="lazy" draggable={false} /> : <LuminaireGlyph type={type} />}
    </span>;
}

// Выбор светильника по картинкам — поповер над панелью, у кнопки, которая
// его открыла (как выбор растения).
export function LuminairePicker({ types, value, anchor, onChoose, onClose, ru = true, title }) {
    const [query, setQuery] = useState('');
    const [kind, setKind] = useState('all');
    const ref = useRef(null);
    const [place, setPlace] = useState({ left: 0, top: 0 });
    const all = useMemo(() => [...types.values()].sort(byKind), [types]);
    const words = query.toLocaleLowerCase().trim();
    const shown = all.filter((type) => (kind === 'all' || type.housing?.shape === kind)
        && `${type.ru} ${type.en} ${type.maker ?? ''} ${type.article ?? ''}`.toLocaleLowerCase().includes(words));
    const present = new Set(all.map((type) => type.housing?.shape));

    useLayoutEffect(() => {
        const box = ref.current?.getBoundingClientRect();
        if (!box || !anchor) return;
        const left = Math.max(8, Math.min(window.innerWidth - box.width - 8, anchor.right - box.width));
        const below = anchor.bottom + 6, above = anchor.top - box.height - 6;
        setPlace({ left, top: below + box.height > window.innerHeight - 8 && above > 8 ? above : Math.max(8, Math.min(below, window.innerHeight - box.height - 8)) });
    }, [anchor, shown.length]);
    useEffect(() => {
        const away = (event) => { if (!ref.current?.contains(event.target)) onClose(); };
        const key = (event) => { if (event.key === 'Escape') { event.stopPropagation(); onClose(); } };
        document.addEventListener('pointerdown', away, true);
        document.addEventListener('keydown', key, true);
        return () => { document.removeEventListener('pointerdown', away, true); document.removeEventListener('keydown', key, true); };
    }, [onClose]);

    return createPortal(<div ref={ref} className="plant-picker lum-picker" style={place} role="dialog" aria-label={title ?? (ru ? 'Выбор светильника' : 'Choose a luminaire')}>
        <header>
            <span>{title ?? (ru ? 'Светильник' : 'Luminaire')}</span>
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ru ? 'Название, артикул…' : 'Name, article…'} aria-label={ru ? 'Найти светильник' : 'Find a luminaire'} />
        </header>
        <div className="plant-chips">
            {['all', ...LUMINAIRE_KINDS.map((item) => item.id).filter((id) => present.has(id))].map((id) => <button key={id} type="button" className={kind === id ? 'is-active' : ''} onClick={() => setKind(id)}>
                {id === 'all' ? (ru ? 'Все' : 'All') : kindLabel(id, ru)}
            </button>)}
        </div>
        <div className="plant-picker__grid">
            {shown.map((type) => <button key={type.id} type="button" className={type.id === value ? 'is-active' : ''} onClick={() => onChoose(type.id)} title={type.ru} data-testid={`lum-pick-${type.id}`}>
                <LuminaireThumb type={type} size={64} />
                <span>{shortName(type, ru)}</span>
                <small>{makerOf(type) === 'generic' ? (ru ? 'заготовка' : 'generic') : makerOf(type)} · {specLine(type, ru)}</small>
            </button>)}
            {!shown.length ? <p>{ru ? 'Ничего не нашлось' : 'Nothing found'}</p> : null}
        </div>
    </div>, document.body);
}

// Кнопка, открывающая выбор: превью и имя выбранного светильника.
export function LuminaireChoice({ types, value, onChoose, ru = true, title, testId }) {
    const [anchor, setAnchor] = useState(null);
    const type = types.get(value);
    return <>
        <button type="button" className="plant-choice" onClick={(event) => setAnchor(event.currentTarget.getBoundingClientRect())} data-testid={testId} title={type?.ru}>
            <LuminaireThumb type={type} size={26} />
            <span>{type ? shortName(type, ru) : value || (ru ? 'Выбрать светильник' : 'Choose a luminaire')}</span>
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
        </button>
        {anchor ? <LuminairePicker types={types} value={value} anchor={anchor} ru={ru} title={title} onClose={() => setAnchor(null)} onChoose={(id) => { setAnchor(null); onChoose(id); }} /> : null}
    </>;
}
