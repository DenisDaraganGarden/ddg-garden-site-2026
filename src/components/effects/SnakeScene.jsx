import React from 'react';
import InteractivePlane from './InteractivePlane';
import SceneLighting from './SceneLighting';
import { usePointerTrail } from '../../hooks/usePointerTrail';
import { getTrailFieldConfig } from './shaders/trailFieldShader';

const SnakeScene = ({ settings }) => {
  const trailConfig = getTrailFieldConfig(settings);
  const { handlePointerMove, trailBufferRef } = usePointerTrail({
    radiusWorld: trailConfig.radiusWorld,
    trailSpanWorld: trailConfig.spanWorld,
    trailPersistence: trailConfig.persistenceSeconds,
    isDragging: false,
  });

  return (
    <>
      <SceneLighting settings={settings} mode="public" />

      <group
        name="plane-wrapper"
        position={[
          settings?.planePos?.x ?? 0,
          settings?.planePos?.y ?? -1,
          settings?.planePos?.z ?? 0,
        ]}
      >
        <InteractivePlane
          settings={settings}
          editable={false}
          isDragging={false}
          onPointerWorldMove={handlePointerMove}
          trailBufferRef={trailBufferRef}
        />
      </group>
    </>
  );
};

export default SnakeScene;
