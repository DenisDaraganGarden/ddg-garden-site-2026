import { useEffect, useMemo, useState } from 'react';
import { projectStore } from '../features/engine/projectApi';
import { fixtureLabels } from './fixtures.js';
import { decodeGrid } from './gridCodec.js';
import { useLuminaireTypes } from './luminaireLibrary.js';
import { lightingNetwork } from './network.js';
import { normalizeLightingSettings } from './settings.js';

// Данные раздела освещения в отчёте (LightingReport.jsx): светильники по
// типам с номерами и электрика по сетке участка из папки проекта.
export function useLightingReport(id, settings) {
    const types = useLuminaireTypes();
    const [grid, setGrid] = useState(null);
    useEffect(() => { projectStore.readSiteGrid(id).then((data) => setGrid(decodeGrid(data)), () => setGrid(null)); }, [id]);
    return useMemo(() => {
        const lighting = normalizeLightingSettings(settings ?? {});
        if (!lighting.lightingFixtures.length) return null;
        const labels = fixtureLabels(lighting.lightingFixtures, types);
        const rows = new Map();
        for (const fixture of lighting.lightingFixtures) {
            if (!rows.has(fixture.type)) rows.set(fixture.type, { type: types.get(fixture.type), id: fixture.type, labels: [] });
            rows.get(fixture.type).labels.push(labels.get(fixture.id));
        }
        return { lighting, labels, types, rows: [...rows.values()], network: lightingNetwork(lighting, types, grid), grid };
    }, [settings, types, grid]);
}

