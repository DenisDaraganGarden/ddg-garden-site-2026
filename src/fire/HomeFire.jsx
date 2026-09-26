import React, { useCallback, useMemo } from 'react';
import { coastWeather, terrainGeometryKey } from '../terrain/settings.js';
import { createTerrainDefinition, sampleTerrainHeight } from '../terrain/terrainModel.js';
import FireTrail from './FireTrail.jsx';

// Огонь в сцене: земля — рельеф берега вместе с валунами (запрос сцены, когда
// он есть), ветер — ветер берега, тот же, что гнёт кусты и траву; свет и тир
// общие. Всё остальное делает FireTrail.
export default function HomeFire({ settings, lighting, qualityProfile, terrainQuery = null, mode = 'public' }) {
  const terrainKey = terrainGeometryKey(settings);
  const definition = useMemo(() => createTerrainDefinition(JSON.parse(terrainKey)), [terrainKey]);
  const queryHeight = terrainQuery?.heightAt ?? null;
  const heightAt = useCallback((x, z) => (queryHeight ? queryHeight(x, z) : sampleTerrainHeight(x, z, definition)), [queryHeight, definition]);
  // Ветер — из полных настроек: в ключ геометрии он не входит, и определение
  // выше знает только заводские 4 м/с.
  const windSpeed = coastWeather(settings).wind;
  const bearing = (Number(settings.terrainWindBearing) || 0) * Math.PI / 180;
  const wind = useMemo(() => ({ x: Math.sin(bearing) * windSpeed, z: -Math.cos(bearing) * windSpeed }), [bearing, windSpeed]);
  return (
    <FireTrail
      settings={settings}
      heightAt={heightAt}
      wind={wind}
      lighting={lighting}
      tier={qualityProfile?.isLowPower ? 'low' : (qualityProfile?.isMobileDevice ? 'medium' : (qualityProfile?.qualityTier ?? 'high'))}
      paused={Boolean(settings.animationPaused)}
      editor={mode === 'editor'}
    />
  );
}
