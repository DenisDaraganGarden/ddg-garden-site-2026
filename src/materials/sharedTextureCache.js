// Consumers own their UV transform and dispose their view. Three shares the
// GPU allocation between views with the same Source and sampler settings.
// Keep sources only while somebody uses (or is waiting for) them.
export function createSharedTextureCache(load) {
    const entries = new Map();
    return async (url, color) => {
        const key = `${url}|${Boolean(color)}`;
        let entry = entries.get(key);
        if (!entry) {
            entry = { users: 0, texture: null, ready: null };
            entry.ready = Promise.resolve().then(() => load(url, color)).then((texture) => {
                entry.texture = texture;
                return texture;
            });
            entries.set(key, entry);
        }
        entry.users += 1;
        let released = false;
        const release = () => {
            if (released) return;
            released = true;
            if (--entry.users === 0) {
                entries.delete(key);
                entry.texture?.dispose();
            }
        };
        try {
            const source = await entry.ready;
            const view = source.clone();
            view.addEventListener('dispose', release);
            return view;
        } catch (error) {
            release();
            throw error;
        }
    };
}
