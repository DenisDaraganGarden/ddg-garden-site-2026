import React, { useMemo, useRef, useState } from 'react';
import { isSeasonSheet, plantCardUrl, plantName, plantPhotoUrl, removePlantPhoto, uploadPlantPhoto } from '../plantLibrary.js';
import { bloomMonths, byCategory, CATEGORY_LABELS, CATEGORY_ORDER } from '../insights.js';
import { spacingFor } from '../fillBed.js';
import { PlantThumb } from './PlantPicker.jsx';
import PlantSeasons from './PlantSeasons.jsx';

const MONTHS_RU = ['Я', 'Ф', 'М', 'А', 'М', 'И', 'И', 'А', 'С', 'О', 'Н', 'Д'];
const SEASONS_RU = ['весна', 'лето', 'осень', 'зима'];
const SEASONS_EN = ['spring', 'summer', 'autumn', 'winter'];
const FOLIAGE = { evergreen: ['вечнозелёное', 'evergreen'], deciduous: ['листопадное', 'deciduous'], herbaceous: ['травянистое', 'herbaceous'], grass: ['злак', 'grass'] };
const WINTER = { stands: ['стоит сухим до весны', 'stands dry till spring'], gone: ['уходит под землю', 'dies back'], bare: ['голые ветки', 'bare twigs'], evergreen: ['как летом', 'as in summer'] };
const MONTH_NAMES = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];

// Картинка растения: своя (его «как в питомнике» или лист четырёх сезонов)
// или карточка SketchUp. Картинку можно бросить сюда или выбрать файлом.
function PlantPicture({ plant, ru }) {
    const [busy, setBusy] = useState(''), [over, setOver] = useState(false);
    const input = useRef(null);
    const photo = plantPhotoUrl(plant), sheet = photo && isSeasonSheet(plant.photoSize);
    const send = async (file) => {
        if (!file) return;
        setBusy(ru ? 'Загружаю…' : 'Uploading…');
        try { await uploadPlantPhoto(plant.id, file); setBusy(''); } catch (error) { setBusy(error.message); }
    };
    return <div className={`plant-picture ${over ? 'is-over' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(event) => { event.preventDefault(); setOver(false); void send(event.dataTransfer.files?.[0]); }}>
        {photo ? <div className={`plant-picture__image ${sheet ? 'is-sheet' : ''}`}><img src={photo} alt={plantName(plant, ru)} />
            {sheet ? <div className="plant-picture__seasons">{(ru ? SEASONS_RU : SEASONS_EN).map((season) => <span key={season}>{season}</span>)}</div> : null}</div>
            : <div className="plant-picture__image is-card"><img src={plantCardUrl(plant)} alt={plantName(plant, ru)} /></div>}
        <div className="plant-picture__actions">
            <span>{busy || (photo ? (ru ? 'Своя картинка' : 'Own picture') : (ru ? 'Картинка из SketchUp · бросьте свою сюда' : 'SketchUp card · drop your own here'))}</span>
            <button type="button" onClick={() => input.current?.click()}>{photo ? (ru ? 'Заменить' : 'Replace') : (ru ? 'Приложить картинку' : 'Attach a picture')}</button>
            {photo ? <button type="button" onClick={() => removePlantPhoto(plant.id)}>{ru ? 'Убрать' : 'Remove'}</button> : null}
            <input ref={input} type="file" accept="image/*" hidden onChange={(event) => { void send(event.target.files?.[0]); event.target.value = ''; }} />
        </div>
    </div>;
}

function PlantCard({ plant, ru, onBack, onPlantWith, onAddToBed, bedName }) {
    const months = bloomMonths(plant);
    const step = plant.density ? Math.round(spacingFor(plant.density) * 100) : null;
    const facts = [
        [ru ? 'Высота' : 'Height', `${plant.height} м${plant.size ? ` · ${plant.size}` : ''}`],
        [ru ? 'Ширина' : 'Spread', `${plant.spread} м`],
        [ru ? 'Посадка' : 'Planting', plant.density ? `${plant.density} шт/м² · шаг ${step} см` : '—'],
        [ru ? 'Листва' : 'Foliage', FOLIAGE[plant.foliage]?.[ru ? 0 : 1] ?? '—'],
        [ru ? 'Зимой' : 'In winter', WINTER[plant.winter]?.[ru ? 0 : 1] ?? '—'],
        [ru ? 'Срезка' : 'Cut back', plant.cutBack ? MONTH_NAMES[plant.cutBack - 1] : '—'],
        [ru ? 'Свет' : 'Light', plant.light ?? '—'],
        [ru ? 'Влага' : 'Water', plant.water ?? '—'],
        [ru ? 'Зимостойкость' : 'Hardiness', plant.zone ? `USDA ${plant.zone}` : '—'],
    ];
    return <article className="plant-card" data-testid="plant-card">
        <button type="button" className="plant-card__back" onClick={onBack}>← {ru ? 'Библиотека' : 'Library'}</button>
        <PlantPicture plant={plant} ru={ru} />
        <PlantSeasons plant={plant} ru={ru} />
        <h3>{plantName(plant, ru)}</h3>
        <p className="plant-card__latin">{plant.latin}</p>
        <div className="plant-chips plant-chips--static"><span style={{ background: plant.cap }}>{CATEGORY_LABELS[plant.category]?.[ru ? 0 : 1]}</span>{plant.zone ? <span>USDA {plant.zone}</span> : null}</div>
        {months.length ? <div className="plant-card__bloom" title={ru ? 'Цветение' : 'Bloom'}>
            {MONTHS_RU.map((letter, i) => <span key={i} style={months.includes(i + 1) ? { background: plant.bloomColor ?? '#c9b77a', color: '#1b1d1d' } : undefined}>{letter}</span>)}
        </div> : null}
        <dl className="plant-card__facts">{facts.map(([label, value]) => <React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}</dl>
        {plant.rostov ? <p className="plant-card__note"><b>{ru ? 'В Ростове. ' : 'In Rostov. '}</b>{plant.rostov}</p> : null}
        {plant.risk ? <p className="plant-card__note plant-card__note--risk"><b>{ru ? 'Риск. ' : 'Risk. '}</b>{plant.risk}</p> : null}
        <p className="plant-card__source">{ru
            ? `Данные — справочные, уверенность ${plant.source?.confidence ?? 'средняя'}${plant.source?.checked ? ', проверено' : ', не проверено дендрологом'}.`
            : `Reference data, confidence ${plant.source?.confidence ?? 'medium'}${plant.source?.checked ? ', checked' : ', not yet checked by a dendrologist'}.`}</p>
        <div className="plant-card__actions">
            <button type="button" className="is-primary" onClick={() => onPlantWith(plant.id)} data-testid="plant-card-plant">{ru ? 'Сажать поштучно · T' : 'Plant one by one · T'}</button>
            {bedName ? <button type="button" onClick={() => onAddToBed(plant.id)} data-testid="plant-card-to-bed">{ru ? `В «${bedName}»` : `Into “${bedName}”`}</button> : null}
        </div>
    </article>;
}

export function PlantLibraryView({ library, ru, openId, setOpenId, onPlantWith, onAddToBed, bedName }) {
    const [filter, setFilter] = useState('all');
    const plants = useMemo(() => [...library.values()].sort(byCategory), [library]);
    const present = new Set(plants.map((plant) => plant.category));
    const open = openId ? library.get(openId) : null;
    if (open) return <PlantCard plant={open} ru={ru} onBack={() => setOpenId(null)} onPlantWith={onPlantWith} onAddToBed={onAddToBed} bedName={bedName} />;
    return <div className="plant-library" data-testid="plant-library">
        <div className="plant-chips">
            {['all', ...CATEGORY_ORDER.filter((id) => present.has(id))].map((id) => <button key={id} type="button" className={filter === id ? 'is-active' : ''} onClick={() => setFilter(id)}>
                {id === 'all' ? (ru ? 'Все' : 'All') : CATEGORY_LABELS[id][ru ? 0 : 1]}<small>{id === 'all' ? plants.length : plants.filter((plant) => plant.category === id).length}</small>
            </button>)}
        </div>
        <div className="plant-library__grid">
            {plants.filter((plant) => filter === 'all' || plant.category === filter).map((plant) => <button key={plant.id} type="button" onClick={() => setOpenId(plant.id)} title={plant.latin} data-testid={`plant-tile-${plant.id}`}>
                <PlantThumb plant={plant} size={86} />
                <span>{plantName(plant, ru)}</span>
                <small>{plant.latin}</small>
            </button>)}
        </div>
    </div>;
}
