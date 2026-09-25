import { useEffect, useMemo, useState } from 'react';
import { projectStore } from '../features/engine/projectApi';
import { fixtureLabels, luminaireSchedule } from './fixtures.js';
import { decodeGrid } from './gridCodec.js';
import { useLuminaireTypes } from './luminaireLibrary.js';
import { lightingNetwork } from './network.js';
import { normalizeLightingSettings } from './settings.js';

// Данные раздела освещения в отчёте (LightingReport.jsx): спецификация
// светильников (по видам, та же, что в редакторе) и электрика по сетке
// участка из папки проекта.
export function useLightingReport(id, settings) {
    const types = useLuminaireTypes();
    const [grid, setGrid] = useState(null);
    useEffect(() => { projectStore.readSiteGrid(id).then((data) => setGrid(decodeGrid(data)), () => setGrid(null)); }, [id]);
    return useMemo(() => {
        const lighting = normalizeLightingSettings(settings ?? {});
        if (!lighting.lightingFixtures.length) return null;
        const labels = fixtureLabels(lighting.lightingFixtures, types);
        const schedule = luminaireSchedule(lighting.lightingFixtures, types, labels);
        return { lighting, labels, types, schedule, rows: schedule.rows, network: lightingNetwork(lighting, types, grid), grid };
    }, [settings, types, grid]);
}

