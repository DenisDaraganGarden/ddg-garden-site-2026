import React, { useEffect, useState } from 'react';
import { generatePlantSeasons, plantCardUrl, plantSeasonUrl, removePlantSeason } from '../plantLibrary.js';
import { seasonPhases } from '../season.js';
import { listImageModels, readKeyStatus } from '../../materials/api.js';

// Сезоны растения по ИИ: модель OpenAI перерисовывает карточку таким, какое
// растение весной, летом без цветков, осенью и зимой (scripts/plantSeasons.mjs);
// сцена берёт картинки по месяцу. Рисует только эта кнопка — картинки с ключа
// Дениса стоят денег.
const LABELS = {
    card: ['Лето', 'Summer'], leaf: ['Без цветов', 'Out of bloom'], spring: ['Весна', 'Spring'], autumn: ['Осень', 'Autumn'], winter: ['Зима', 'Winter'],
};
const ORDER = ['spring', 'card', 'leaf', 'autumn', 'winter'];
const QUALITIES = [['medium', 'Среднее', 'Medium'], ['high', 'Высокое', 'High']];
// Модель по умолчанию — та же, что у текстур, если список моделей ключа не пришёл.
const FALLBACK_MODEL = 'gpt-image-2.5-sunburst';
const pictures = (n, ru) => (ru ? `${n} ${n % 10 === 1 && n % 100 !== 11 ? 'картинка' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'картинки' : 'картинок'}` : `${n} image${n === 1 ? '' : 's'}`);

export default function PlantSeasons({ plant, ru }) {
    const phases = seasonPhases(plant);
    const [busy, setBusy] = useState(null);
    const [note, setNote] = useState('');
    const [quality, setQuality] = useState('high');
    const [model, setModel] = useState(null);
    const [key, setKey] = useState(null);
    useEffect(() => {
        readKeyStatus().then((status) => setKey(Boolean(status.hasKey)), () => setKey(false));
        listImageModels().then((models) => setModel(models[0] ?? FALLBACK_MODEL), () => setModel(FALLBACK_MODEL));
    }, []);
    // Секунды, пока рисует: картинка — полминуты-минута, фазы — разом.
    const [now, setNow] = useState(0);
    useEffect(() => {
        if (!busy) return undefined;
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [busy]);
    if (!phases.length) return null;

    const missing = phases.filter((phase) => !plant.seasons?.[phase]);
    const draw = async (list) => {
        setBusy({ list, started: Date.now() });
        setNow(Date.now());
        setNote('');
        try {
            const results = await generatePlantSeasons(plant.id, { phases: list, model, quality });
            const failed = Object.entries(results).filter(([, result]) => !result.ok);
            setNote(failed.length ? failed.map(([phase, result]) => `${LABELS[phase][ru ? 0 : 1]}: ${result.message}`).join(' · ') : '');
        } catch (error) {
            setNote(error.message);
        }
        setBusy(null);
    };
    const shown = ORDER.filter((phase) => phase === 'card' || phases.includes(phase));
    const seconds = busy ? Math.max(0, Math.round((now - busy.started) / 1000)) : 0;
    const count = missing.length || phases.length;

    return <section className="plant-seasons" data-testid="plant-seasons">
        <header>
            <span>{ru ? 'Сезоны' : 'Seasons'}</span>
            <small>{ru ? 'ИИ перерисовывает эту карточку' : 'AI redraws this card'}</small>
        </header>
        <div className="plant-seasons__strip">
            {shown.map((phase) => {
                const drawn = phase === 'card' || plant.seasons?.[phase];
                const pending = busy?.list.includes(phase);
                return <figure key={phase} className={`${drawn ? '' : 'is-missing'} ${pending ? 'is-busy' : ''}`}>
                    {drawn ? <img src={phase === 'card' ? plantCardUrl(plant) : plantSeasonUrl(plant, phase)} alt="" /> : <span>{pending ? '…' : (ru ? 'правкой карточки' : 'card tweak')}</span>}
                    <figcaption>{phase === 'card' && plant.bloomColor ? (ru ? 'В цвету' : 'In bloom') : LABELS[phase][ru ? 0 : 1]}</figcaption>
                    {phase !== 'card' && !busy && key ? <div className="plant-seasons__tools">
                        <button type="button" onClick={() => void draw([phase])} title={ru ? 'Перерисовать' : 'Redraw'}>↻</button>
                        {plant.seasons?.[phase] ? <button type="button" onClick={() => void removePlantSeason(plant.id, phase)} title={ru ? 'Убрать — снова правкой карточки' : 'Remove — back to the card tweak'}>×</button> : null}
                    </div> : null}
                </figure>;
            })}
        </div>
        {key === false ? <p className="plant-seasons__note">{ru ? 'Нужен ключ OpenAI: «Настройки движка → API».' : 'An OpenAI key is needed: “Engine settings → API”.'}</p> : null}
        {key ? <div className="plant-seasons__actions">
            <div role="group" aria-label={ru ? 'Качество' : 'Quality'}>
                <span>{ru ? 'Качество' : 'Quality'}</span>
                {QUALITIES.map(([id, labelRu, labelEn]) => <button key={id} type="button" aria-pressed={quality === id} disabled={Boolean(busy)} onClick={() => setQuality(id)}>{ru ? labelRu : labelEn}</button>)}
            </div>
            <button type="button" className="is-primary" disabled={Boolean(busy) || !model} onClick={() => void draw(missing.length ? missing : phases)} data-testid="plant-seasons-draw">
                {busy ? (ru ? `Рисую ${busy.list.length} · ${seconds} с` : `Drawing ${busy.list.length} · ${seconds} s`)
                    : missing.length ? (ru ? `Нарисовать ${count} · ИИ` : `Draw ${count} · AI`) : (ru ? 'Перерисовать все · ИИ' : 'Redraw all · AI')}
            </button>
        </div> : null}
        {note ? <p className="plant-seasons__note is-error">{note}</p> : null}
        {key && missing.length ? <p className="plant-seasons__note">{ru
            ? `${pictures(count, true)} с ключа OpenAI (${model ?? '…'}). Где картинки нет, сезон — правкой летней карточки.`
            : `${pictures(count, false)} on the OpenAI key (${model ?? '…'}). Without a picture the season is a tweak of the summer card.`}</p> : null}
    </section>;
}
