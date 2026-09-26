import React, { useEffect, useState } from 'react';
import { useLanguage } from '../../../../../i18n/useLanguage';
import { SectionHeading } from '../../HomeEditorControls';
import { useFocusControlScope } from '../focus/FocusControlsContext';
import { listImageModels, readKeyStatus, removeKey, saveKey } from '../../../../../materials/api.js';

// «Настройки движка → API»: ключ OpenAI вставляется один раз (⌘V) и живёт на
// этом Mac, в связке ключей (scripts/openaiKey.mjs). Редактор ключ не видит и
// не хранит — только «sk-…abcd». Нужен для текстур по ИИ (правый щелчок по
// модели SketchUp → «Сгенерировать / доработать текстуру…»).
const WHERE = { keychain: ['в связке ключей macOS', 'in the macOS keychain'], file: ['в файле ~/Ouroboros/secrets (только для вас)', 'in ~/Ouroboros/secrets (owner only)'], env: ['из переменной OPENAI_API_KEY', 'from OPENAI_API_KEY'] };

export function ApiSection() {
    const { language } = useLanguage();
    const tr = (ru, en) => (language === 'ru' ? ru : en);
    const scope = useFocusControlScope();
    const [status, setStatus] = useState(null);
    const [value, setValue] = useState('');
    const [message, setMessage] = useState('');
    const [models, setModels] = useState(null);
    const [busy, setBusy] = useState(false);
    // Цвет статуса: зелёный — ключ есть, красный — сохранить или проверить не
    // вышло, жёлтый мигает — ключа нет, можно вставлять.
    const [failed, setFailed] = useState(false);

    useEffect(() => {
        if (scope?.catalogOnly) return;
        readKeyStatus().then(setStatus, (error) => { setMessage(error.message); setFailed(true); });
    }, [scope?.catalogOnly]);
    if (scope?.catalogOnly) return null;

    const check = async () => {
        setBusy(true);
        try {
            const list = await listImageModels();
            setModels(list);
            setFailed(false);
            setMessage(list.length ? tr('Ключ работает.', 'The key works.') : tr('Ключ работает, но моделей для картинок у него нет.', 'The key works, but it has no image models.'));
        } catch (error) {
            setMessage(error.message);
            setFailed(true);
        } finally {
            setBusy(false);
        }
    };
    const save = async () => {
        if (!value.trim()) return;
        setBusy(true);
        try {
            const saved = await saveKey(value.trim());
            setValue('');
            setStatus({ hasKey: true, hint: saved.hint, where: saved.where });
            setBusy(false);
            await check();
        } catch (error) {
            setMessage(error.message);
            setFailed(true);
            setBusy(false);
        }
    };
    const remove = async () => {
        if (!window.confirm(tr('Удалить ключ OpenAI с этого компьютера?', 'Remove the OpenAI key from this computer?'))) return;
        await removeKey().catch((error) => setMessage(error.message));
        setStatus({ hasKey: false });
        setModels(null);
        setFailed(false);
        setMessage(tr('Ключ удалён.', 'Key removed.'));
    };

    const state = failed ? 'error' : !status ? 'unknown' : status.hasKey ? 'connected' : 'ready';
    const stateLabel = { error: tr('Ошибка', 'Error'), unknown: tr('Проверяю…', 'Checking…'), connected: tr('Подключён', 'Connected'), ready: tr('Готов к вставке', 'Ready to paste') }[state];

    return <>
        <SectionHeading label="OpenAI" subtle />
        <div className="home-editor-status api-key-state" data-state={state} data-testid="api-key-state"><span className="api-key-state__dot" aria-hidden="true" />{stateLabel}</div>
        <div className="home-editor-status" data-testid="api-key-status">{status?.hasKey
            ? `${tr('Ключ сохранён', 'Key saved')}: ${status.hint} · ${tr(...(WHERE[status.where] ?? WHERE.file))}`
            : tr('Ключа нет. Вставьте ключ OpenAI (⌘V) — он останется на этом Mac.', 'No key. Paste your OpenAI key (⌘V) — it stays on this Mac.')}</div>
        <div className="home-editor-control-group">
            <input className="home-editor-select" type="password" autoComplete="off" spellCheck={false} value={value} data-testid="api-key-input"
                placeholder={status?.hasKey ? tr('Новый ключ sk-…, чтобы заменить', 'A new sk-… key to replace it') : 'sk-…'} aria-label={tr('Ключ OpenAI', 'OpenAI key')}
                onChange={(event) => setValue(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void save(); }} />
        </div>
        <div className="home-editor-tabs">
            <button type="button" className="home-editor-tab" disabled={busy || !value.trim()} onClick={() => void save()} data-testid="api-key-save">{tr('Сохранить', 'Save')}</button>
            <button type="button" className="home-editor-tab" disabled={busy || !status?.hasKey} onClick={() => void check()}>{tr('Проверить', 'Check')}</button>
            <button type="button" className="home-editor-tab" disabled={busy || !status?.hasKey || status?.where === 'env'} onClick={() => void remove()}>{tr('Удалить ключ', 'Remove key')}</button>
        </div>
        {message ? <div className="home-editor-status" role="status">{message}</div> : null}
        {models?.length ? <div className="home-editor-status">{tr('Модели для картинок', 'Image models')}: {models.join(', ')}</div> : null}
        <div className="home-editor-status">{tr(
            'Ключ нужен для текстур по ИИ: правый щелчок по модели SketchUp → «Сгенерировать / доработать текстуру…». Он хранится только здесь: в проект, git и на сайт не попадает. Картинки рисуются на серверах OpenAI и оплачиваются с этого ключа.',
            'The key is for AI textures: right-click a SketchUp model → “Generate / refine texture…”. It stays here only — never in the project, git or the site. Images are drawn on OpenAI’s servers and billed to this key.',
        )}</div>
    </>;
}
