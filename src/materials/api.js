// Материалы по ИИ и их библиотека — с локального сервера (scripts/materials.mjs).
// Ключ OpenAI сюда не приходит: редактор видит только, есть ли он («sk-…abcd»).
async function call(url, options = {}) {
    const response = await fetch(url, {
        ...options,
        headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok || !payload?.ok) {
        const error = new Error(payload?.message ?? `Сервер ответил ${response.status}`);
        error.status = response.status;
        throw error;
    }
    return payload;
}
const json = (method, body) => ({ method, body: JSON.stringify(body) });

export const readKeyStatus = () => call('/__openai/key');
export const saveKey = (key) => call('/__openai/key', json('PUT', { key }));
export const removeKey = () => call('/__openai/key', { method: 'DELETE' });
export const listImageModels = async () => (await call('/__openai/models')).models ?? [];

export const generateMaterial = (request) => call('/__materials/generate', json('POST', request));
export const finishMaterial = async (request) => (await call('/__materials/finish', json('POST', request))).material;
export const mapsFromTexture = async (request) => (await call('/__materials/maps', json('POST', request))).material;
export const buildProceduralMaterial = async (request) => (await call('/__materials/procedural', json('POST', request))).material;

export const listMaterials = async () => (await call('/__library/materials')).materials ?? [];
export const removeMaterial = (id) => call(`/__library/materials/${encodeURIComponent(id)}`, { method: 'DELETE' });
// Имя и умолчания (плитка, рельеф, матовость) — из лаборатории «Материалы».
export const updateMaterial = async (id, patch) => (await call(`/__library/materials/${encodeURIComponent(id)}`, json('PATCH', patch))).material;
