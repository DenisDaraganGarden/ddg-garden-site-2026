import React from 'react';
import HomeScenePlane from './HomeScenePlane';
import HomeSceneLighting from './HomeSceneLighting';
import { useHomeScenePointerTrail } from '../hooks/useHomeScenePointerTrail';
import { getHomeSceneFieldConfig } from '../shaders/homeSceneFieldShader';

const HomeScene = ({ settings }) => {
  const trailConfig = getHomeSceneFieldConfig(settings);
  const { handlePointerMove, trailBufferRef } = useHomeScenePointerTrail({
    radiusWorld: trailConfig.radiusWorld,
    trailSpanWorld: trailConfig.spanWorld,
    trailPersistence: trailConfig.persistenceSeconds,
    isDragging: false,
  });

  return (
    <>
      <HomeSceneLighting settings={settings} mode="public" />

      <group
        name="plane-wrapper"
        position={[
          settings?.planePos?.x ?? 0,
          settings?.planePos?.y ?? -1,
          settings?.planePos?.z ?? 0,
        ]}
      >
        <HomeScenePlane
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

export default HomeScene;
