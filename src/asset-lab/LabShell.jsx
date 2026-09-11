import React from 'react';
import LabNav from './LabNav';
import { assetIndex } from './assetCatalog';
import './lab.css';

// Оболочка коллекции. Одна на всю лабораторию: раньше каждая коллекция строила
// свою шапку, свою таблетку ракурсов и свою панель — отсюда и разный вид у
// одинаковых по смыслу вещей.
//
// Место у каждой части закреплено: слева вверху — что это, справа вверху —
// куда перейти и какой свет, по центру — ракурсы, справа — параметры, внизу —
// телеметрия и подсказки. Коллекция отдаёт только содержимое.
export default function LabShell({
    collection,
    eyebrow,
    title,
    subtitle,
    language = 'ru',
    onLanguage,
    views,
    view,
    onView,
    specimens,
    panel,
    transport,
    stats,
    hints,
    scale,
    testId,
    children,
}) {
    return (
        <main className="lab" data-testid={testId ?? `${collection}-lab`} data-asset-collection={collection} lang={language}>
            {children}

            <div className="lab__corner lab__title">
                <p>{eyebrow ?? `ASSET LAB / ${assetIndex(collection)} / ${String(collection).toUpperCase()}`}</p>
                <h1>{title}</h1>
                {subtitle ? <span>{subtitle}</span> : null}
            </div>

            <div className="lab__corner lab__rail">
                <div className="lab__index">
                    {onLanguage ? (
                        <div className="lab__languages" role="group" aria-label={language === 'en' ? 'Language' : 'Язык'}>
                            {['ru', 'en'].map((code) => (
                                <button key={code} type="button" aria-pressed={language === code} onClick={() => onLanguage(code)}>{code.toUpperCase()}</button>
                            ))}
                        </div>
                    ) : null}
                    <LabNav current={collection} lang={language} />
                </div>

                {panel || transport ? (
                    <aside className="lab__panel" aria-label={language === 'en' ? 'Parameters' : 'Параметры'}>
                        {panel ? <div className="lab__panel-scroll">{panel}</div> : null}
                        {transport ? <div className="lab__transport">{transport}</div> : null}
                    </aside>
                ) : null}
            </div>

            {views?.length ? (
                <div className="lab__corner lab__views">
                    <div className="lab__pill" role="group" aria-label={language === 'en' ? 'View' : 'Ракурс'}>
                        {views.map((item, index) => (item === '-'
                            ? <i key={`gap-${index}`} className="lab__pill-gap" aria-hidden="true" />
                            : <button
                                key={item.id}
                                type="button"
                                aria-pressed={item.pressed ?? view === item.id}
                                disabled={item.disabled}
                                onClick={() => (item.onSelect ? item.onSelect() : onView?.(item.id))}
                            >
                                {item.label}
                            </button>))}
                    </div>
                </div>
            ) : null}

            {specimens?.length ? (
                <aside className="lab__specimens" aria-label={language === 'en' ? 'Specimens' : 'Образцы'}>
                    {specimens.map((item) => (
                        <div key={item.id ?? item.name} className="lab__specimen">
                            <div><strong>{item.name}</strong>{item.latin ? <em>{item.latin}</em> : null}</div>
                            {item.size ? <span>{item.size}</span> : null}
                            {item.note ? <small>{item.note}</small> : null}
                        </div>
                    ))}
                </aside>
            ) : null}

            {stats ? <footer className="lab__corner lab__stats" aria-live="off">{stats}</footer> : null}

            {hints?.length || scale ? (
                <div className="lab__corner lab__hints">
                    {scale ? <div className="lab__scale"><span>{scale}</span><i /></div> : null}
                    {(hints ?? []).map((hint) => <span key={hint}>{hint}</span>)}
                </div>
            ) : null}
        </main>
    );
}

// Общие контролы. Ползунок, выключатель, цвет, список и таблица фактов —
// по одному на всю лабораторию, чтобы у травы и у танкера они были одинаковыми.
export function LabRange({ label, value, min = 0, max = 1, step = 0.01, unit = '', format, onChange }) {
    const shown = format ? format(value) : Number(value).toFixed(step >= 1 ? 0 : 2);
    return (
        <label className="lab__range">
            <span>{label}</span>
            <output>{shown}{unit ? ` ${unit}` : ''}</output>
            <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        </label>
    );
}

export function LabToggle({ label, value, onChange }) {
    return (
        <label className="lab__row">
            <span>{label}</span>
            <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        </label>
    );
}

export function LabColor({ label, value, onChange }) {
    return (
        <label className="lab__row">
            <span>{label}</span>
            <input type="color" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} />
        </label>
    );
}

export function LabSelect({ label, value, options, onChange }) {
    return (
        <label className="lab__row">
            <span>{label}</span>
            <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
                {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
        </label>
    );
}

export function LabFacts({ rows }) {
    return (
        <dl className="lab__facts">
            {rows.map(([term, value]) => <div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}
        </dl>
    );
}

export function LabGroup({ title, children }) {
    return <section className="lab__group">{title ? <h2>{title}</h2> : null}{children}</section>;
}

export function LabModes({ label, items, value, onChange }) {
    return (
        <div className="lab__modes" role="group" aria-label={label}>
            {items.map((item) => (
                <button key={item.id} type="button" aria-pressed={value === item.id} onClick={() => onChange(item.id)}>{item.label}</button>
            ))}
        </div>
    );
}

export function LabTabs({ label, items, value, onChange }) {
    return (
        <div className="lab__tabs" role="tablist" aria-label={label}>
            {items.map((item) => (
                <button key={item.id} type="button" role="tab" aria-selected={value === item.id} onClick={() => onChange(item.id)}>{item.label}</button>
            ))}
        </div>
    );
}
