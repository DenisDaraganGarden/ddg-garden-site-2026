import React, { useCallback, useEffect, useState } from 'react';
import { projectStore } from '../../../../engine/projectApi';

// История проекта (scripts/projectStore.mjs): снимки на диске, новые сверху.
// «Вернуть» ставит выбранную версию; нынешняя перед этим уходит в историю,
// так что и возврат отменяется возвратом. В проекте это место кнопки
// «Откатить»: сцена сайта в проект не подставляется.
const REASONS = {
    open: ['Открытие проекта', 'Project opened'],
    auto: ['Автоснимок', 'Automatic snapshot'],
    overwrite: ['Перед записью поверх чужой версии', 'Before writing over another version'],
    restore: ['Перед возвратом версии', 'Before a restore'],
    manual: ['Снимок вручную', 'Manual snapshot'],
};

export default function FocusProjectHistory({ projectId, onRestore, onDone, language, Button }) {
    const ru = language === 'ru';
    const tr = (a, b) => (ru ? a : b);
    const [state, setState] = useState({ status: 'loading', snapshots: [], message: '' });
    const [busy, setBusy] = useState(null);

    const load = useCallback(async () => {
        try {
            setState({ status: 'ready', snapshots: await projectStore.history(projectId), message: '' });
        } catch (error) {
            setState({ status: 'error', snapshots: [], message: error.message });
        }
    }, [projectId]);
    useEffect(() => { void load(); }, [load]);

    const when = (at) => new Date(at).toLocaleString(ru ? 'ru-RU' : 'en-GB', {
        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    const keepNow = async () => {
        setBusy('manual');
        try {
            await projectStore.snapshot(projectId, 'manual');
            await load();
        } catch (error) {
            setState((previous) => ({ ...previous, message: error.message }));
        } finally { setBusy(null); }
    };

    const restore = async (snapshot) => {
        setBusy(snapshot.id);
        try {
            await onRestore(snapshot.id);
            onDone();
        } catch (error) {
            setState((previous) => ({ ...previous, message: tr(`Не удалось вернуть: ${error.message}`, `Could not restore: ${error.message}`) }));
            setBusy(null);
        }
    };

    return <div className="focus-save-summary" data-testid="project-history">
        <p>{tr(
            'Снимки проекта делаются сами: при открытии, после каждых 10 минут работы и перед рискованными действиями. Хранятся последние 50 и по одному на каждый день до них. «Вернуть» ставит выбранную версию, а нынешняя остаётся в истории — возврат тоже можно отменить.',
            'Snapshots are taken on their own: when the project opens, after every 10 minutes of work and before risky actions. The last 50 are kept, and one for each day before them. Restore puts the chosen version back while the current one stays in the history, so a restore can be undone too.',
        )}</p>
        {!onRestore ? <p>{tr('В режиме просмотра версии не возвращаются.', 'Versions are not restored in preview mode.')}</p> : null}
        {state.message ? <p role="alert">{state.message}</p> : null}
        <div className="focus-history-list">
            {state.status === 'loading' ? <p>{tr('Загружаю историю…', 'Loading the history…')}</p> : null}
            {state.status === 'ready' && !state.snapshots.length ? <p>{tr('Снимков пока нет.', 'No snapshots yet.')}</p> : null}
            {state.snapshots.map((snapshot) => <div key={snapshot.id} className="focus-history-row" data-testid="project-history-row">
                <time dateTime={snapshot.at}>{when(snapshot.at)}</time>
                <small>{tr(...(REASONS[snapshot.reason] ?? REASONS.manual))}</small>
                <Button
                    label={tr('Вернуть эту версию', 'Restore this version')}
                    disabled={!onRestore || busy !== null}
                    onClick={() => restore(snapshot)}
                    data-testid="project-history-restore"
                >{busy === snapshot.id ? tr('Возвращаю…', 'Restoring…') : tr('Вернуть', 'Restore')}</Button>
            </div>)}
        </div>
        <footer>
            <Button label={tr('Сохранить снимок сейчас', 'Take a snapshot now')} disabled={busy !== null || state.status !== 'ready'} onClick={keepNow} data-testid="project-history-snapshot">
                {tr('Снимок сейчас', 'Snapshot now')}
            </Button>
            <Button className="focus-primary" label={tr('Закрыть', 'Close')} onClick={onDone}>{tr('Закрыть', 'Close')}</Button>
        </footer>
    </div>;
}
