// Scene writes are serialized per editor; the server arbitrates other editors
// and CLI writers. Unacknowledged data stays on this origin across page closure.
export const projectRevision = (entry) => entry.revision ?? entry.updated;
const prefix = (id) => `ddg_project_recovery_v1:${id}:`;

export function readProjectRecoveries(storage, project) {
    const found = [];
    for (let i = 0; i < storage.length; i += 1) {
        const key = storage.key(i);
        if (!key?.startsWith(prefix(project.id))) continue;
        try {
            const raw = storage.getItem(key), entry = JSON.parse(raw);
            if (entry?.settings && typeof entry.settings === 'object' && !Array.isArray(entry.settings)) {
                // A response can be lost after the server committed the write.
                if (JSON.stringify(entry.settings) !== JSON.stringify(project.settings)) found.push({ ...entry, key, raw });
            }
        } catch { /* An unreadable recovery never replaces a valid project. */ }
    }
    return found.sort((a, b) => b.at - a.at);
}

export function createProjectAutosave({ project, storage, send, onStatus = () => {}, onConflict, onAdopt, delay = 700 }) {
    // LAN previews over HTTP do not expose crypto.randomUUID.
    const session = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const key = `${prefix(project.id)}${session}`;
    let base = projectRevision(project), pending = null, flight = null, timer = null;
    let durable = true, recovered = null, paused = false, overwrite = false;
    const status = (phase, error = null) => onStatus({ phase, error: error?.message ?? null });
    const clearTimer = () => { clearTimeout(timer); timer = null; };
    const clearOwn = () => {
        try {
            storage.removeItem(key);
            // Never delete another window's more recent recovery.
            if (recovered && storage.getItem(recovered.key) === recovered.raw) storage.removeItem(recovered.key);
        } catch { /* A stale recovery is preferable to losing the saved scene. */ }
        recovered = null;
    };
    const persist = () => {
        try {
            storage.setItem(key, JSON.stringify({ base, settings: pending, at: Date.now() }));
            durable = true;
        } catch (error) {
            durable = false;
            status('recovery-error', error);
        }
    };
    const adopt = (entry) => {
        base = projectRevision(entry);
        pending = null;
        durable = true;
        clearOwn();
        status('saved');
        onAdopt?.(entry);
    };
    const flush = () => {
        clearTimer();
        if (flight) return flight;
        if (!pending) return Promise.resolve();
        flight = (async () => {
            while (pending) {
                const snapshot = pending;
                status('saving');
                let entry;
                try {
                    entry = await send(project.id, snapshot, overwrite ? { base, snapshot: 'overwrite' } : { base });
                } catch (error) {
                    const current = error.status === 409 ? error.payload?.entry : null;
                    if (!current || paused) throw error;
                    if (await onConflict(current)) { adopt(current); return; }
                    base = projectRevision(current);
                    // The other version is not lost: the server files it in
                    // the project's history before ours replaces it.
                    overwrite = true;
                    persist();
                    continue;
                }
                overwrite = false;
                base = projectRevision(entry);
                if (pending === snapshot) {
                    pending = null;
                    durable = true;
                    clearOwn();
                    status('saved');
                } else {
                    // The newer local edit now follows the acknowledged write.
                    persist();
                }
            }
        })().catch((error) => { status(durable ? 'error' : 'recovery-error', error); throw error; }).finally(() => { flight = null; });
        return flight;
    };
    return {
        stage(settings) {
            pending = settings;
            persist();
            if (durable) status('pending');
            clearTimer();
            if (!paused) timer = setTimeout(() => { void flush().catch(() => {}); }, delay);
        },
        restore(entry) { base = entry.base; recovered = entry; },
        adopt,
        flush,
        pause() { paused = true; clearTimer(); },
        resume() { paused = false; if (pending) timer = setTimeout(() => { void flush().catch(() => {}); }, delay); },
        get revision() { return base; },
        get dirty() { return pending !== null; },
        get durable() { return durable; },
    };
}
