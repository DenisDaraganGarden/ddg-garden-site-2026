import React, { useMemo } from 'react';
import { coastBreakLine, breakLineMean, createShoreDepth, ShoreDepthMap } from './coastFrame.js';
import { createFoamBores, createFoamFieldHolder } from './foamField.js';
import GerstnerWaterSurface from './GerstnerWaterSurface.jsx';
import ShoreWater from './ShoreWater.jsx';
import BreakingWaves from './BreakingWaves.jsx';
import { resolveEffectiveSeaSettings } from './seaSettings.js';
import {
  createWaterSceneBindingUniforms,
  useWaterSceneBindings,
} from './waterSceneBindings.js';

// Product adapter for the water developed in the lab. It only assembles the
// existing modules around the live terrain definition: geometry, foam and the
// shore-depth map stay product modules, while the editor owns the flat `sea*`
// settings that were resolved before reaching this component.

const CREST_LENGTH = 760;
const BAND_PADDING = 60;

export default function SeaWater({
  settings,
  definition,
  lighting,
  sky,
  runtime = null,
  sceneSettings = settings,
  qualityProfile = null,
  swash = null,
  enabled = true,
}) {
  const shoreDepth = useMemo(() => createShoreDepth(), []);
  const foamField = useMemo(() => swash ?? createFoamFieldHolder(), [swash]);
  const foamBores = useMemo(() => createFoamBores(), []);
  const sceneBindings = useMemo(() => createWaterSceneBindingUniforms(), []);
  // Quality may reduce the effective mesh but never touches the authored
  // sea settings or their camera snapshots. The radial grid has two axes, so
  // scale rings by the same density ratio as the established water mesh.
  const effectiveSettings = useMemo(
    () => resolveEffectiveSeaSettings(settings, qualityProfile),
    [qualityProfile, settings],
  );
  const along0 = (definition.terrainSpitPosition ?? 0) - 430;
  const band = useMemo(() => ({
    sMin: along0 - BAND_PADDING,
    sMax: along0 + CREST_LENGTH + BAND_PADDING,
    seam: -24,
  }), [along0]);
  const coast = useMemo(() => {
    const height = settings.surfHeight ?? 0.45;
    const line = coastBreakLine(definition, height, along0, CREST_LENGTH, 8);
    return {
      definition,
      along0,
      length: CREST_LENGTH,
      shoreDepth,
      foamField,
      band,
      breakQ: breakLineMean(line) + (settings.surfBreakDistance ?? 0) - 6,
      swellFadeWidth: effectiveSettings.surfEnabled ? 30 : 0,
    };
  }, [along0, band, definition, effectiveSettings.surfEnabled, foamField, settings.surfBreakDistance, settings.surfHeight, shoreDepth]);

  useWaterSceneBindings(sceneBindings, {
    lighting,
    sky,
    runtime,
    sceneSettings,
  });

  if (!enabled) return null;
  return (
    <>
      {definition.terrainEnabled ? <ShoreDepthMap coast={coast} /> : null}
      <GerstnerWaterSurface
        settings={effectiveSettings}
        lighting={lighting}
        coast={definition.terrainEnabled ? coast : null}
        foamBores={effectiveSettings.surfEnabled && definition.terrainEnabled ? foamBores : null}
        sceneBindings={sceneBindings}
        farVisible={sceneSettings.farWaterVisible !== false}
        nearExtent={sceneSettings.waterExtent}
      />
      {definition.terrainEnabled ? <ShoreWater
        settings={effectiveSettings}
        lighting={lighting}
        coast={coast}
        sceneBindings={sceneBindings}
      /> : null}
      {effectiveSettings.surfEnabled && definition.terrainEnabled ? (
        <BreakingWaves
          settings={effectiveSettings}
          lighting={lighting}
          coast={coast}
          foamBores={foamBores}
          sceneBindings={sceneBindings}
          qualityProfile={qualityProfile}
        />
      ) : null}
    </>
  );
}
