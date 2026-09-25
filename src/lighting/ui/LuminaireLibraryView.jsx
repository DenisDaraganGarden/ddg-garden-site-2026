import React, { useMemo, useRef, useState } from 'react';
import { LUMINAIRE_KINDS } from '../fixtures.js';
import { byKind, guessedFields, kindLabel, luminairePhotoUrl, makerLabel, makerOf, priceText, removeLuminairePhoto, shortName, specLine, uploadLuminairePhoto } from '../luminaireLibrary.js';
import { LuminaireGlyph, LuminaireThumb } from './LuminairePicker.jsx';

// Библиотека светильников (рабочее место «Освещение», вкладка «Библиотека»):
// виды — разделами, производитель — переключателем; карточка изделия — фото
// или схема, паспортные числа, цена, ссылка, что в записи догадка.
const CONTROLS = { switch: ['выключатель', 'switch'], dali: ['DALI', 'DALI'], '0-10v': ['0–10 В', '0–10 V'], dmx: ['DMX', 'DMX'], casambi: ['Casambi', 'Casambi'] };
const mm = (m) => Math.round(m * 1000);

function LuminairePicture({ type, ru }) {
    const [busy, setBusy] = useState(''), [over, setOver] = useState(false);
    const input = useRef(null);
    const photo = luminairePhotoUrl(type), own = !type.generic;
    const send = async (file) => {
        if (!file) return;
        setBusy(ru ? 'Загружаю…' : 'Uploading…');
        try { await uploadLuminairePhoto(type.id, file); setBusy(''); } catch (error) { setBusy(error.message); }
    };
    return <div className={`plant-picture ${over ? 'is-over' : ''}`}
        onDragOver={(event) => { if (!own) return; event.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(event) => { if (!own) return; event.preventDefault(); setOver(false); void send(event.dataTransfer.files?.[0]); }}>
        <div className={`plant-picture__image lum-picture ${photo ? 'has-photo' : ''}`}>{photo ? <img src={photo} alt={shortName(type, ru)} /> : <LuminaireGlyph type={type} />}</div>
        {own ? <div className="plant-picture__actions">
            <span>{busy || (photo ? (ru ? 'Фото изделия' : 'Product photo') : (ru ? 'Схема по паспорту · бросьте фото сюда' : 'Drawn from the datasheet · drop a photo here'))}</span>
            <button type="button" onClick={() => input.current?.click()}>{photo ? (ru ? 'Заменить' : 'Replace') : (ru ? 'Приложить фото' : 'Attach a photo')}</button>
            {photo ? <button type="button" onClick={() => removeLuminairePhoto(type.id)}>{ru ? 'Убрать' : 'Remove'}</button> : null}
            <input ref={input} type="file" accept="image/*" hidden onChange={(event) => { void send(event.target.files?.[0]); event.target.value = ''; }} />
        </div> : null}
    </div>;
}

function LuminaireCard({ type, used, ru, onBack, onPlace, onReplace, selectedLabel, selectedType }) {
    const optics = type.optics ?? {}, power = type.power ?? {}, housing = type.housing ?? {};
    const size = housing.w ? `${mm(housing.w)} × ${mm(housing.h ?? 0)} × ${mm(housing.d ?? 0)} мм` : housing.h ? `${ru ? 'выс.' : 'h'} ${mm(housing.h)} · ⌀ ${mm(housing.d ?? 0)} мм` : '—';
    const guessed = guessedFields(type, ru);
    const facts = [
        [ru ? 'Свет' : 'Light', [optics.lumens ? `${optics.lumens} ${ru ? 'лм' : 'lm'}` : null, optics.beam ? `${optics.beam}°` : null, optics.cct ? `${optics.cct} K` : null, optics.cri ? `Ra ${optics.cri}` : null].filter(Boolean).join(' · ') || '—'],
        [ru ? 'Питание' : 'Power', [power.watts ? `${power.watts} ${ru ? 'Вт' : 'W'}` : null, power.volts ? `${power.volts} ${ru ? 'В' : 'V'} ${power.current === 'dc' ? (ru ? 'пост.' : 'DC') : (ru ? 'перем.' : 'AC')}` : null, power.driver === 'remote' ? (ru ? 'выносной драйвер' : 'remote driver') : null].filter(Boolean).join(' · ') || '—'],
        [ru ? 'Управление' : 'Control', (type.control ?? []).map((c) => CONTROLS[c]?.[ru ? 0 : 1] ?? c).join(', ') || '—'],
        [ru ? 'Монтаж' : 'Mounting', type.mount === 'wall' ? (ru ? 'на стену' : 'on a wall') : (ru ? 'в землю' : 'in the ground')],
        [ru ? 'Размеры' : 'Size', size],
        [ru ? 'Защита' : 'Protection', [type.ip ? (String(type.ip).startsWith('IP') ? type.ip : `IP${type.ip}`) : null, type.ik].filter(Boolean).join(' · ') || '—'],
        [ru ? 'Цена' : 'Price', priceText(type, ru)],
    ];
    return <article className="plant-card lum-card" data-testid="lum-card">
        <button type="button" className="plant-card__back" onClick={onBack}>← {ru ? 'Библиотека' : 'Library'}</button>
        <LuminairePicture type={type} ru={ru} />
        <h3>{shortName(type, ru)}</h3>
        <p className="plant-card__latin lum-card__maker">{type.generic ? (ru ? 'Заготовка без изделия — числа ориентировочные' : 'A generic stand-in — indicative numbers') : [makerOf(type), type.article].filter(Boolean).join(' · ')}</p>
        <div className="plant-chips plant-chips--static"><span className="lum-kind">{kindLabel(type.housing?.shape, ru)}</span>{optics.cct ? <span>{optics.cct} K</span> : null}{power.volts ? <span>{power.volts} {ru ? 'В' : 'V'}</span> : null}</div>
        {type.model && !type.generic ? <p className="plant-card__source">{type.model}</p> : null}
        <dl className="plant-card__facts">{facts.map(([label, value]) => <React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}</dl>
        {used.length ? <p className="plant-card__note"><b>{ru ? 'В проекте: ' : 'In the project: '}</b>{used.length} {ru ? 'шт.' : 'pcs'} — {used.join(', ')}</p> : null}
        {guessed.length ? <p className="plant-card__note plant-card__note--risk"><b>{ru ? 'Догадка. ' : 'Guessed. '}</b>{ru ? `Не из паспорта: ${guessed.join(', ')}.` : `Not from the datasheet: ${guessed.join(', ')}.`}</p> : null}
        {type.url ? <p className="plant-card__source"><a href={type.url} target="_blank" rel="noreferrer">{ru ? 'Страница изделия' : 'Product page'} ↗</a>{type.photometryUrl ? <> · <a href={type.photometryUrl} target="_blank" rel="noreferrer">{ru ? 'фотометрия' : 'photometry'} ↗</a></> : null}</p> : null}
        <div className="plant-card__actions">
            <button type="button" className="is-primary" onClick={() => onPlace(type.id)} data-testid="lum-card-place">{ru ? 'Ставить · O' : 'Place · O'}</button>
            {selectedLabel && selectedType !== type.id ? <button type="button" onClick={() => onReplace(type.id)} data-testid="lum-card-replace">{ru ? `Заменить ${selectedLabel}` : `Replace ${selectedLabel}`}</button> : null}
        </div>
    </article>;
}

export function LuminaireLibraryView({ types, ru, openId, setOpenId, usage, onPlace, onReplace, selectedLabel, selectedType }) {
    const [kind, setKind] = useState('all');
    const [maker, setMaker] = useState('all');
    const all = useMemo(() => [...types.values()].sort(byKind), [types]);
    const makers = useMemo(() => [...new Set(all.map(makerOf))].sort((a, b) => Number(a === 'generic') - Number(b === 'generic') || a.localeCompare(b, 'ru')), [all]);
    const open = openId ? types.get(openId) : null;
    if (open) return <LuminaireCard type={open} used={usage.get(open.id) ?? []} ru={ru} onBack={() => setOpenId(null)} onPlace={onPlace} onReplace={onReplace} selectedLabel={selectedLabel} selectedType={selectedType} />;
    const byMaker = all.filter((type) => maker === 'all' || makerOf(type) === maker);
    const sections = LUMINAIRE_KINDS.filter((item) => kind === 'all' || item.id === kind)
        .map((item) => ({ kind: item, list: byMaker.filter((type) => type.housing?.shape === item.id) })).filter((section) => section.list.length);
    return <div className="plant-library lum-library" data-testid="lum-library">
        <div className="plant-chips">
            {['all', ...LUMINAIRE_KINDS.map((item) => item.id)].map((id) => {
                const count = byMaker.filter((type) => id === 'all' || type.housing?.shape === id).length;
                return count || id === kind ? <button key={id} type="button" className={kind === id ? 'is-active' : ''} onClick={() => setKind(id)} data-testid={`lum-kind-${id}`}>
                    {id === 'all' ? (ru ? 'Все' : 'All') : kindLabel(id, ru)}<small>{count}</small>
                </button> : null;
            })}
        </div>
        <div className="planting-toggle lum-makers" role="radiogroup" aria-label={ru ? 'Производитель' : 'Maker'}>
            {['all', ...makers].map((id) => <button key={id} type="button" role="radio" aria-checked={maker === id} className={maker === id ? 'is-active' : ''} onClick={() => setMaker(id)} data-testid={`lum-maker-${id}`}>
                {id === 'all' ? (ru ? 'Все' : 'All') : makerLabel(id, ru)}
            </button>)}
        </div>
        {sections.map((section) => <section key={section.kind.id} className="lum-section">
            {kind === 'all' ? <h4>{ru ? section.kind.ru : section.kind.en}<small>{section.list.length}</small></h4> : null}
            <div className="plant-library__grid">
                {section.list.map((type) => {
                    const used = usage.get(type.id)?.length ?? 0;
                    return <button key={type.id} type="button" onClick={() => setOpenId(type.id)} title={type.ru} data-testid={`lum-tile-${type.id}`}>
                        <span className="lum-tile__thumb"><LuminaireThumb type={type} size={86} />{used ? <b className="lum-used">×{used}</b> : null}</span>
                        <span>{shortName(type, ru)}</span>
                        <small>{makerLabel(makerOf(type), ru)} · {specLine(type, ru)}</small>
                    </button>;
                })}
            </div>
        </section>)}
        {!sections.length ? <p className="planting-empty">{ru ? 'Здесь ничего нет — выберите другой вид или производителя.' : 'Nothing here — pick another kind or maker.'}</p> : null}
    </div>;
}
