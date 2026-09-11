import React, { useCallback, useEffect, useState } from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { FocusIcon } from './FocusIcons';
import { useFocusControls } from './FocusControlsContext';
import { presetStore } from '../../../../engine/projectApi';
import './FocusPresets.css';

// Склад деталей. Деталь — это настроенный вариант одного объекта: три вида
// травы, пять кустов. Движок процедурный, поэтому вариант — это просто значения
// его параметров, и новый проект собирается из деталей как из каталога.
//
// Что входит в деталь, решает сам редактор: ключи берутся из его каталога
// контролов для этого узла. Второго списка «что относится к траве» не заводится,
// и новый ползунок попадает в деталь сам.
// Не всякий контрол — ключ сцены: у некоторых опознавательный знак выведен из
// подписи, а вложенные вроде «audio.enabled» в деталь не годятся. В склад идёт
// только то, что действительно лежит в настройках.
const flatKeys = (controls, path, settings) => controls.store.all()
    .filter((item) => item.path === path)
    .map((item) => String(item.id).split(':')[1])
    .filter((key) => key && !key.includes('.') && settings[key] !== undefined);

export default function FocusPresets({ path, label, settings, applySettings, onClose }) {
    const { language } = useLanguage();
    const tr = (ru, en) => (language === 'ru' ? ru : en);
    const controls = useFocusControls();
    const keys = flatKeys(controls, path, settings);
    const [entries, setEntries] = useState(null);
    const [message, setMessage] = useState('');
    const [name, setName] = useState('');

    const reload = useCallback(async () => {
        try {
            setEntries((await presetStore.list()).filter((entry) => entry.node === path));
        } catch (error) {
            setEntries([]);
            setMessage(error.message);
        }
    }, [path]);

    useEffect(() => { void reload(); }, [reload]);

    const save = async () => {
        if (!name.trim()) return;
        try {
            await presetStore.create({
                name,
                node: path,
                object: label,
                values: Object.fromEntries(keys.map((key) => [key, settings[key]])),
            });
            setName('');
            setMessage(tr('Деталь сохранена.', 'Part saved.'));
            await reload();
        } catch (error) { setMessage(error.message); }
    };

    const apply = async (entry) => {
        try {
            const full = await presetStore.read(entry.id);
            // В сцену уходят только те ключи, которые в ней есть: деталь могла
            // быть снята со старой версии движка, где параметр назывался иначе.
            const known = Object.fromEntries(Object.entries(full.values ?? {})
                .filter(([key]) => keys.includes(key) && settings[key] !== undefined));
            applySettings(known);
            setMessage(tr(
                `Применено: ${Object.keys(known).length} из ${Object.keys(full.values ?? {}).length}.`,
                `Applied ${Object.keys(known).length} of ${Object.keys(full.values ?? {}).length}.`,
            ));
        } catch (error) { setMessage(error.message); }
    };

    const remove = async (entry) => {
        try {
            await presetStore.remove(entry.id);
            await reload();
        } catch (error) { setMessage(error.message); }
    };

    return <div className="focus-presets">
        <p className="focus-presets__lead">{tr(
            `Деталь — это ${keys.length} параметров объекта «${label}» под именем. Сцена целиком в деталь не входит.`,
            `A part is the ${keys.length} parameters of “${label}” under a name. It never holds the whole scene.`,
        )}</p>

        <div className="focus-presets__save">
            <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => { event.stopPropagation(); if (event.key === 'Enter') save(); }}
                placeholder={tr('Название детали', 'Part name')}
                aria-label={tr('Название детали', 'Part name')}
            />
            <button type="button" className="focus-primary" onClick={save} disabled={!name.trim() || !keys.length}>
                {tr('Сохранить текущие', 'Save current')}
            </button>
        </div>

        {entries === null ? <p className="focus-presets__empty">{tr('Читаю склад…', 'Reading the shelf…')}</p> : null}
        {entries?.length === 0 ? <p className="focus-presets__empty">{tr(
            'Деталей этого объекта пока нет. Настрой его и сохрани — вариант ляжет в папку presets/ и станет доступен любому проекту.',
            'No parts for this object yet. Tune it and save — the variant lands in presets/ and becomes available to every project.',
        )}</p> : null}

        <div className="focus-presets__list">
            {(entries ?? []).map((entry) => <div key={entry.id} className="focus-presets__row">
                <button type="button" className="focus-presets__apply" onClick={() => apply(entry)}>
                    <FocusIcon name="check" />
                    <span>{entry.name}<small>{entry.id}</small></span>
                </button>
                <button type="button" className="focus-presets__remove" aria-label={tr('Удалить деталь', 'Delete part')} onClick={() => remove(entry)}>
                    <FocusIcon name="close" />
                </button>
            </div>)}
        </div>

        {message ? <p className="focus-presets__message" role="status">{message}</p> : null}
        <footer><button type="button" onClick={onClose}>{tr('Закрыть', 'Close')}</button></footer>
    </div>;
}
