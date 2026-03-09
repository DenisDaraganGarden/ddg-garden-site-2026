import React from 'react';
import { useThree } from '@react-three/fiber';
import { Environment } from '@react-three/drei/core/Environment.js';
import { SoftShadows } from '@react-three/drei/core/softShadows.js';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const SceneLighting = ({ settings, mode = 'public' }) => {
  const { size } = useThree();
  const isMobileViewport = size.width < 768;
  const isEditor = mode === 'editor';

  const shadowSamples = isEditor ? (isMobileViewport ? 12 : 24) : (isMobileViewport ? 8 : 16);
  const shadowMapSize = isEditor ? (isMobileViewport ? 2048 : 4096) : (isMobileViewport ? 1024 : 2048);
  const shadowFrustum = isEditor ? 40 : 32;
  const lAngleRad = (settings.lightAngle * Math.PI) / 180;
  const lRadius = settings.lightDistance / 10;
  const lX = Math.cos(lAngleRad) * lRadius;
  const lZ = Math.sin(lAngleRad) * lRadius;
  const lY = settings.lightHeight / 10;
  const environmentIntensity = clamp(settings.hdrExposure / 100, 0.15, 4);

  return (
    <>
      <SoftShadows size={isEditor ? 20 : 14} samples={shadowSamples} focus={1} />
      <Environment preset="city" environmentIntensity={environmentIntensity} />

      <directionalLight
        position={[lX, lY, lZ]}
        intensity={settings.lightIntensity / 100}
        color={settings.lightColor}
        castShadow
        shadow-mapSize-width={shadowMapSize}
        shadow-mapSize-height={shadowMapSize}
        shadow-camera-near={0.5}
        shadow-camera-far={200}
        shadow-camera-left={-shadowFrustum}
        shadow-camera-right={shadowFrustum}
        shadow-camera-top={shadowFrustum}
        shadow-camera-bottom={-shadowFrustum}
        shadow-bias={-0.0005}
        shadow-normalBias={0.02}
      />

      <directionalLight
        position={[-15, 10, -10]}
        intensity={isEditor ? 0.8 : 0.62}
        color="#ffffff"
      />
    </>
  );
};

export default SceneLighting;
