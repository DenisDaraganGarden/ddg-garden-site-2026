import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isSeasonSheet, plantCardUrl, plantName, plantPhotoUrl } from '../plantLibrary.js';
import { byCategory, CATEGORY_LABELS, CATEGORY_ORDER } from '../insights.js';

// Превью растения: картинка Дениса, если он её приложил, иначе карточка из
// SketchUp на светлом фоне. Лист «весна · лето · осень · зима» показывается
// одним сезоном (season: 0…3, по умолчанию лето).
export function PlantThumb({ plant, size = 32, season = 1, className = '' }) {
    const photo = plantPhotoUrl(plant);
    const sheet = photo && isSeasonSheet(plant.photoSize);
    const style = { width: size, height: size };
    if (sheet) return <span className={`plant-thumb ${className}`} style={{ ...style, backgroundImage: `url("${photo}")`, backgroundSize: '400% auto', backgroundPosition: `${(season / 3) * 100}% center` }} />;
    const src = photo ?? (plant?.cardVersion ? plantCardUrl(plant) : null);
    return <span className={`plant-thumb ${className}`} style={style}>{src ? <img src={src} alt="" loading="lazy" draggable={false} /> : null}</span>;
}

const FILTERS = ['all', ...CATEGORY_ORDER];

// Выбор растения по картинкам: Денис узнаёт растение по виду, а не по
// латыни. Поповер над панелью, у кнопки, которая его открыла. kinds — какие
// группы показывать; без него — всё, кроме лиан: лиана растёт по стене, а не
// в цветнике.
const allowedIn = (kinds) => (plant) => (kinds ? kinds.includes(plant.category) : plant.category !== 'climber');
export function PlantPicker({ library, value, exclude = [], kinds = null, anchor, onChoose, onClose, ru = true, title }) {
    const [query, setQuery] = useState('');
    const [filter, setFilter] = useState('all');
    const ref = useRef(null);
    const [place, setPlace] = useState({ left: 0, top: 0 });
    const kindsKey = kinds?.join(',') ?? '';
    const plants = useMemo(() => [...library.values()].filter(allowedIn(kindsKey ? kindsKey.split(',') : null)).sort(byCategory), [library, kindsKey]);
    const hidden = useMemo(() => new Set(exclude), [exclude]);
    const shown = plants.filter((plant) => (filter === 'all' || plant.category === filter)
        && (plant.id === value || !hidden.has(plant.id))
        && `${plant.ru} ${plant.en} ${plant.latin}`.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim()));
    const present = new Set(plants.map((plant) => plant.category));

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

    return createPortal(<div ref={ref} className="plant-picker" style={place} role="dialog" aria-label={title ?? (ru ? 'Выбор растения' : 'Choose a plant')}>
        <header>
            <span>{title ?? (ru ? 'Растение' : 'Plant')}</span>
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder={ru ? 'Название…' : 'Name…'} aria-label={ru ? 'Найти растение' : 'Find a plant'} />
        </header>
        <div className="plant-chips">
            {FILTERS.filter((id) => id === 'all' || present.has(id)).map((id) => <button key={id} type="button" className={filter === id ? 'is-active' : ''} onClick={() => setFilter(id)}>
                {id === 'all' ? (ru ? 'Все' : 'All') : CATEGORY_LABELS[id][ru ? 0 : 1]}
            </button>)}
        </div>
        <div className="plant-picker__grid">
            {shown.map((plant) => <button key={plant.id} type="button" className={plant.id === value ? 'is-active' : ''} onClick={() => onChoose(plant.id)} title={plant.latin} data-testid={`plant-pick-${plant.id}`}>
                <PlantThumb plant={plant} size={64} />
                <span>{plantName(plant, ru)}</span>
                <small>{CATEGORY_LABELS[plant.category]?.[ru ? 0 : 1]} · {plant.height} м</small>
            </button>)}
            {!shown.length ? <p>{ru ? 'Ничего не нашлось' : 'Nothing found'}</p> : null}
        </div>
    </div>, document.body);
}

// Кнопка, открывающая выбор: превью и имя выбранного растения.
export function PlantChoice({ library, value, onChoose, exclude, kinds, ru = true, title, testId }) {
    const [anchor, setAnchor] = useState(null);
    const plant = library.get(value);
    return <>
        <button type="button" className="plant-choice" onClick={(event) => setAnchor(event.currentTarget.getBoundingClientRect())} data-testid={testId} title={plant?.latin}>
            <PlantThumb plant={plant} size={26} />
            <span>{plant ? plantName(plant, ru) : value || (ru ? 'Выбрать растение' : 'Choose a plant')}</span>
            <svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2 3.5 5 6.5 8 3.5" fill="none" stroke="currentColor" strokeWidth="1.3" /></svg>
        </button>
        {anchor ? <PlantPicker library={library} value={value} exclude={exclude} kinds={kinds} anchor={anchor} ru={ru} title={title} onClose={() => setAnchor(null)} onChoose={(id) => { setAnchor(null); onChoose(id); }} /> : null}
    </>;
}
