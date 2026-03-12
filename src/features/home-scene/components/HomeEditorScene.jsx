import React, { useRef } from 'react';
import { OrbitControls } from '@react-three/drei/core/OrbitControls.js';
import { GizmoHelper } from '@react-three/drei/core/GizmoHelper.js';
import { GizmoViewport } from '@react-three/drei/core/GizmoViewport.js';
import { Stats } from '@react-three/drei/core/Stats.js';
import CameraController from '../../../components/effects/CameraController';
import DraggableTransformControls from '../../../components/effects/DraggableTransformControls';
import NormalsHelper from '../../../components/effects/NormalsHelper';
import HomeScenePlane from './HomeScenePlane';
import HomeSceneLighting from './HomeSceneLighting';
import { useHomeScenePointerTrail } from '../hooks/useHomeScenePointerTrail';
import { getHomeSceneFieldConfig } from '../shaders/homeSceneFieldShader';

const HomeEditorScene = ({
  settings,
  selectedId,
  setSelectedId,
  isDragging = false,
  setIsDragging,
  handleTransformUpdate,
}) => {
  const orbitRef = useRef();
  const planeWrapperRef = useRef();
  const trailConfig = getHomeSceneFieldConfig(settings);
  const { handlePointerMove, trailBufferRef } = useHomeScenePointerTrail({
    radiusWorld: trailConfig.radiusWorld,
    trailSpanWorld: trailConfig.spanWorld,
    trailPersistence: trailConfig.persistenceSeconds,
    isDragging,
  });

  return (
    <>
      <CameraController settings={settings} orbitRef={orbitRef} />
      <OrbitControls
        ref={orbitRef}
        makeDefault
        target={[0, -1, 0]}
        minPolarAngle={settings.freeCamera ? 0 : 0}
        maxPolarAngle={settings.freeCamera ? Math.PI : 0.01}
        enableRotate={settings.freeCamera}
        enablePan
        enableZoom
      />

      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -1.01, 0]}
        onPointerDown={(event) => {
          event.stopPropagation();
          setSelectedId?.(null);
        }}
        visible={false}
      >
        <planeGeometry args={[2000, 2000]} />
      </mesh>

      <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
        <GizmoViewport labelColor="white" axisColors={['#9d4b4b', '#2f7f4f', '#3b5b9d']} />
      </GizmoHelper>

      {settings.devAxes ? <axesHelper args={[10]} /> : null}
      {settings.devNormals ? <NormalsHelper /> : null}
      {settings.devStats ? <Stats /> : null}

      <HomeSceneLighting settings={settings} mode="editor" />

      <group
        ref={planeWrapperRef}
        name="plane-wrapper"
        position={[
          settings?.planePos?.x ?? 0,
          settings?.planePos?.y ?? -1,
          settings?.planePos?.z ?? 0,
        ]}
      >
        <HomeScenePlane
          settings={settings}
          editable
          onSelect={() => setSelectedId?.('plane')}
          isDragging={isDragging}
          onPointerWorldMove={handlePointerMove}
          trailBufferRef={trailBufferRef}
        />
      </group>

      {selectedId === 'plane' && planeWrapperRef.current ? (
        <DraggableTransformControls
          orbitRef={orbitRef}
          object={planeWrapperRef.current}
          onPositionChange={(pos) => handleTransformUpdate?.('plane', pos)}
          setIsDragging={setIsDragging}
        />
      ) : null}
    </>
  );
};

export default HomeEditorScene;
