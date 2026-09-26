import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLanguage } from '../i18n/useLanguage';
import './references.css';

const PREF = 'ouroboros-reference-profile';
const initialProfile = () => { try { return localStorage.getItem(PREF) || 'daragangarden'; } catch { return 'daragangarden'; } };
const route = (profile, tail = '', values = {}) => `/__references${tail}?${new URLSearchParams({ profile, ...values })}`;
async function call(url, write = false) {
    const response = await fetch(url, write ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' } : { cache: 'no-store' });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.message || 'Pinterest недоступен');
    return data;
}

export default function ReferencePicker({ onSelect, onClose, multiple = true }) {
    const { language } = useLanguage(); const tr = (ru, en) => language === 'ru' ? ru : en;
    const [profile, setProfile] = useState(initialProfile), [input, setInput] = useState(initialProfile);
    const [data, setData] = useState(null), [board, setBoard] = useState(null), [query, setQuery] = useState('');
    const [selected, setSelected] = useState([]), [error, setError] = useState(''), [adding, setAdding] = useState(false);
    const dialog = useRef(null), live = useRef(true), requested = useRef(''), loadedFor = useRef(null);
    const activeProfile = useRef(profile); activeProfile.current = profile;
    const current = data?.boards.find((item) => item.id === board);
    const running = data?.job?.running;
    const refresh = useCallback(async () => {
        const result = await call(route(profile));
        if (live.current && activeProfile.current === profile) { setData(result); setError(result.job?.error || ''); }
        return result;
    }, [profile]);
    const sync = useCallback(async (id) => {
        try { const { job } = await call(route(profile, '/sync', id ? { board: id } : {}), true); if (live.current && activeProfile.current === profile) { setData((state) => ({ ...state, boards: state?.boards || [], pins: state?.pins || [], job })); setError(''); } }
        catch (issue) { if (live.current && activeProfile.current === profile) setError(issue.message); }
    }, [profile]);
    useEffect(() => { live.current = true; dialog.current.showModal(); return () => { live.current = false; }; }, []);
    useEffect(() => {
        let active = true;
        setData(null); setSelected([]); requested.current = ''; loadedFor.current = null;
        void call(route(profile)).then((result) => { if (active) { loadedFor.current = profile; setData(result); } }, (issue) => { if (active) setError(issue.message); });
        try { localStorage.setItem(PREF, profile); } catch { /* optional */ }
        return () => { active = false; };
    }, [profile]);
    useEffect(() => {
        if (!data || running || loadedFor.current !== profile) return;
        const key = `${profile}:${board || ''}`;
        if (requested.current === key) return;
        requested.current = key;
        const stamp = board ? current?.updated : data.updated;
        if (!stamp || Date.now() - Date.parse(stamp) > 5 * 60 * 1000) void sync(board);
    }, [profile, board, current?.updated, data, running, sync]);
    useEffect(() => {
        if (!running) return undefined;
        const timer = setInterval(() => { if (!document.hidden) void refresh().catch((issue) => setError(issue.message)); }, 1500);
        return () => clearInterval(timer);
    }, [running, refresh]);
    useEffect(() => {
        const timer = setInterval(() => { if (!document.hidden && !running) void sync(board); }, 5 * 60 * 1000);
        return () => clearInterval(timer);
    }, [board, running, sync]);
    const pins = (data?.pins || []).filter((pin) => pin.board === board && `${pin.title} ${pin.id}`.toLowerCase().includes(query.toLowerCase()));
    const boards = (data?.boards || []).filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
    const image = (id, kind) => route(data?.profile || profile, '/image', { id, kind });
    const choose = (pin) => setSelected((list) => list.includes(pin.id) ? list.filter((id) => id !== pin.id) : multiple ? [...list, pin.id].slice(0, 12) : [pin.id]);
    const add = async () => {
        setAdding(true); setError('');
        try {
            const files = [];
            for (const id of selected) {
                const response = await fetch(image(id, 'full'));
                if (!response.ok) throw new Error(tr('Не удалось загрузить выбранный аналог.', 'Could not load the selected reference.'));
                const pin = data.pins.find((item) => item.id === id);
                files.push(new File([await response.blob()], `${(pin?.title || `Pinterest ${id}`).slice(0, 80)}.webp`, { type: 'image/webp' }));
            }
            await onSelect(files); onClose();
        } catch (issue) { if (live.current && activeProfile.current === profile) { setError(issue.message); setAdding(false); } }
    };
    return createPortal(<dialog aria-label="Pinterest" className="reference-picker" ref={dialog} onCancel={(event) => { event.preventDefault(); if (!adding) onClose(); }} onKeyDown={(event) => event.stopPropagation()}>
        <header><strong>Pinterest</strong><button type="button" aria-label={tr('Закрыть', 'Close')} onClick={onClose} disabled={adding}>×</button></header>
        <form onSubmit={(event) => { event.preventDefault(); setBoard(null); setQuery(''); setError(''); setProfile(input.trim()); }}>
            <input aria-label={tr('Аккаунт Pinterest', 'Pinterest account')} value={input} onChange={(event) => setInput(event.target.value)} placeholder="@daragangarden" />
            <button type="submit" disabled={adding}>{tr('Открыть', 'Open')}</button>
            <button type="button" onClick={() => void sync(board)} disabled={running || adding}>{running ? tr('Обновление…', 'Refreshing…') : tr('Обновить', 'Refresh')}</button>
        </form>
        <div className="reference-picker__path">{board ? <button type="button" onClick={() => { setBoard(null); setQuery(''); }}>{tr('← Доски', '← Boards')}</button> : <span>{tr('Доски', 'Boards')} · {boards.length}</span>}<strong>{current?.name}</strong><input type="search" aria-label={tr('Поиск аналогов', 'Search references')} placeholder={tr('Поиск…', 'Search…')} value={query} onChange={(event) => setQuery(event.target.value)} /></div>
        {error ? <p role="alert">{error}</p> : null}
        <div className={`reference-picker__grid${board ? ' is-pins' : ''}`}>
            {board ? pins.map((pin) => <button type="button" key={pin.id} aria-pressed={selected.includes(pin.id)} aria-label={pin.title || `Pinterest ${pin.id}`} title={pin.title || tr('Аналог Pinterest', 'Pinterest reference')} onClick={() => choose(pin)}>
                <img loading="lazy" src={image(pin.id, 'thumb')} alt="" /><span>{pin.title}</span>{selected.includes(pin.id) ? <b>✓</b> : null}
            </button>) : boards.map((item) => <button type="button" key={item.id} onClick={() => { setBoard(item.id); setQuery(''); setSelected([]); }}>
                {item.cover ? <img loading="lazy" src={image(item.id, 'cover')} alt="" /> : <div className="reference-picker__blank" />}<span>{item.name}<small>{item.count}</small></span>
            </button>)}
            {!data || (running && !(board ? pins.length : boards.length)) ? <span>{tr('Загрузка Pinterest…', 'Loading Pinterest…')}</span> : !(board ? pins.length : boards.length) ? <span>{tr('Нет изображений. Откройте публичный профиль или обновите доску.', 'No images. Open a public profile or refresh this board.')}</span> : null}
        </div>
        <footer><small>{tr('Просмотренные миниатюры и выбранные аналоги сохраняются локально.', 'Viewed thumbnails and selected references are cached locally.')}</small><button type="button" className="reference-picker__apply" disabled={!selected.length || adding} onClick={() => void add()}>{adding ? tr('Загрузка…', 'Loading…') : tr(`Добавить ${selected.length || ''}`, `Add ${selected.length || ''}`)}</button></footer>
    </dialog>, document.body);
}
