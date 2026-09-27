import React, { useMemo, useRef, useState } from 'react';
import { LUMINAIRE_KINDS } from '../fixtures.js';
import { byKind, guessedFields, kindLabel, libraryFamilies, luminairePhotoUrl, makerLabel, makerOf, matchesLuminaire, priceText, removeLuminairePhoto, shortName, specLine, uploadLuminairePhoto } from '../luminaireLibrary.js';
import { LuminaireKindIcon } from './LuminaireKindIcon.jsx';
import { LuminaireGlyph, LuminaireThumb } from './LuminairePicker.jsx';

// Библиотека светильников (рабочее место «Освещение», вкладка «Библиотека»):
// поиск, производитель и вид — сверху; изделия — сериями, как в каталоге
// производителя (серия открывается списком вариантов), виды — разделами,
// по PAGE плиток с «Показать ещё» — каталог на тысячи вариантов не тормозит.
// Карточка изделия — фото или схема, паспортные числа, цена, ссылка, что в
// записи догадка.
const CONTROLS = { switch: ['выключатель', 'switch'], dali: ['DALI', 'DALI'], '0-10v': ['0–10 В', '0–10 V'], dmx: ['DMX', 'DMX'], casambi: ['Casambi', 'Casambi'] };
const mm = (m) => Math.round(m * 1000);
const PAGE = 48;

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
        {type.family ? <p className="plant-card__source">{ru ? 'Серия' : 'Series'} {type.family}{type.variant ? ` · ${type.variant}` : ''}</p> : null}
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

// Серия с несколькими вариантами: список вариантов с числами, щелчок — карточка.
function FamilyView({ family, usage, ru, onBack, onOpen }) {
    return <div className="plant-library lum-library" data-testid="lum-family">
        <button type="button" className="plant-card__back" onClick={onBack}>← {ru ? 'Библиотека' : 'Library'}</button>
        <h3 className="lum-family__title">{family.name}<small>{makerLabel(family.maker, ru)} · {family.variants.length} {ru ? 'вар.' : 'var.'}</small></h3>
        <div className="lum-family__list">
            {family.variants.map((type) => {
                const used = usage.get(type.id)?.length ?? 0;
                return <button key={type.id} type="button" className="lum-spec__row" onClick={() => onOpen(type.id)} data-testid={`lum-variant-${type.id}`}>
                    <LuminaireThumb type={type} size={40} />
                    <span className="lum-spec__name"><b>{type.variant || shortName(type, ru)}</b><small>{[specLine(type, ru), type.optics?.cct ? `${type.optics.cct} K` : null, type.article].filter(Boolean).join(' · ')}</small></span>
                    {used ? <span className="lum-spec__qty">×{used}</span> : null}
                </button>;
            })}
        </div>
    </div>;
}

export function LuminaireLibraryView({ types, ru, openId, setOpenId, usage, onPlace, onReplace, selectedLabel, selectedType }) {
    const [kind, setKind] = useState('all');
    const [maker, setMaker] = useState('all');
    const [query, setQuery] = useState('');
    const [familyId, setFamilyId] = useState(null);
    const [limit, setLimit] = useState(PAGE);
    const all = useMemo(() => [...types.values()].sort(byKind), [types]);
    const makers = useMemo(() => [...new Set(all.map(makerOf))].sort((a, b) => Number(a === 'generic') - Number(b === 'generic') || a.localeCompare(b, 'ru')), [all]);
    const found = useMemo(() => all.filter((type) => (maker === 'all' || makerOf(type) === maker) && matchesLuminaire(type, query)), [all, maker, query]);
    const families = useMemo(() => libraryFamilies(found), [found]);
    const open = openId ? types.get(openId) : null;
    const family = familyId ? libraryFamilies(all).find((item) => item.id === familyId) : null;
    if (open) return <LuminaireCard type={open} used={usage.get(open.id) ?? []} ru={ru} onBack={() => setOpenId(null)} onPlace={onPlace} onReplace={onReplace} selectedLabel={selectedLabel} selectedType={selectedType} />;
    if (family && family.variants.length > 1) return <FamilyView family={family} usage={usage} ru={ru} onBack={() => setFamilyId(null)} onOpen={setOpenId} />;
    const filter = (next) => { next(); setLimit(PAGE); };
    const sections = LUMINAIRE_KINDS.filter((item) => kind === 'all' || item.id === kind)
        .map((item) => ({ kind: item, list: families.filter((entry) => entry.kind === item.id) })).filter((section) => section.list.length);
    let shown = 0;
    return <div className="plant-library lum-library" data-testid="lum-library">
        <input type="search" className="planting-name lum-search" value={query} onChange={(event) => filter(() => setQuery(event.target.value))}
            placeholder={ru ? 'Найти: название, серия, артикул…' : 'Find: name, series, article…'} aria-label={ru ? 'Поиск по библиотеке' : 'Search the library'} data-testid="lum-search" />
        <div className="planting-toggle lum-makers" role="radiogroup" aria-label={ru ? 'Производитель' : 'Maker'}>
            {['all', ...makers].map((id) => <button key={id} type="button" role="radio" aria-checked={maker === id} className={maker === id ? 'is-active' : ''} onClick={() => filter(() => setMaker(id))} data-testid={`lum-maker-${id}`}>
                {id === 'all' ? (ru ? 'Все' : 'All') : makerLabel(id, ru)}
            </button>)}
        </div>
        <div className="lum-kinds" role="group" aria-label={ru ? 'Вид светильника' : 'Luminaire kind'}>
            {['all', ...LUMINAIRE_KINDS.map((item) => item.id)].map((id) => {
                const count = families.filter((entry) => id === 'all' || entry.kind === id).length;
                return count || id === kind ? <button key={id} type="button" aria-pressed={kind === id} className={kind === id ? 'is-active' : ''} onClick={() => filter(() => setKind(id))} data-testid={`lum-kind-${id}`}>
                    <LuminaireKindIcon kind={id} /><span>{id === 'all' ? (ru ? 'Все' : 'All') : kindLabel(id, ru)}</span><small>{count}</small>
                </button> : null;
            })}
        </div>
        <div className="lum-results"><span>{ru ? 'Серии и изделия' : 'Series and products'}</span><span>{sections.reduce((sum, section) => sum + section.list.length, 0)}</span></div>
        {sections.map((section) => {
            const room = Math.max(0, limit - shown), list = section.list.slice(0, room);
            shown += list.length;
            return list.length ? <section key={section.kind.id} className="lum-section">
                {kind === 'all' ? <h4>{ru ? section.kind.ru : section.kind.en}<small>{section.list.length}</small></h4> : null}
                <div className="plant-library__grid">
                    {list.map((entry) => {
                        const type = entry.variants[0], many = entry.variants.length > 1;
                        const used = entry.variants.reduce((sum, item) => sum + (usage.get(item.id)?.length ?? 0), 0);
                        return <button key={entry.id} type="button" onClick={() => (many ? setFamilyId(entry.id) : setOpenId(type.id))} title={many ? entry.name : type.ru} data-testid={many ? `lum-series-${entry.id}` : `lum-tile-${type.id}`}>
                            <span className="lum-tile__thumb"><LuminaireThumb type={entry.variants.find(luminairePhotoUrl) ?? type} size={86} />{used ? <b className="lum-used">×{used}</b> : null}</span>
                            <span>{many ? entry.name : shortName(type, ru)}</span>
                            <small>{makerLabel(entry.maker, ru)} · {many ? `${entry.variants.length} ${ru ? 'вариантов' : 'variants'}` : specLine(type, ru)}</small>
                        </button>;
                    })}
                </div>
            </section> : null;
        })}
        {sections.reduce((sum, section) => sum + section.list.length, 0) > limit ? <button type="button" className="lum-more" onClick={() => setLimit((value) => value + PAGE)} data-testid="lum-more">
            {ru ? `Показать ещё · осталось ${sections.reduce((sum, section) => sum + section.list.length, 0) - limit}` : `Show more · ${sections.reduce((sum, section) => sum + section.list.length, 0) - limit} left`}</button> : null}
        {!sections.length ? <p className="planting-empty">{query ? (ru ? 'Ничего не нашлось — другие слова, производитель или вид.' : 'Nothing found — try other words, maker or kind.') : (ru ? 'Здесь ничего нет — выберите другой вид или производителя.' : 'Nothing here — pick another kind or maker.')}</p> : null}
    </div>;
}
