import React, { useRef, useEffect } from 'react';
import { OrbitControls, Environment, GizmoHelper, GizmoViewport, SoftShadows, Stats } from '@react-three/drei';
import CameraController from './CameraController';
import NormalsHelper from './NormalsHelper';
import InteractivePlane from './InteractivePlane';
import ProceduralSnake from './ProceduralSnake';
import DraggableTransformControls from './DraggableTransformControls';
import { usePointerTrail } from '../../hooks/usePointerTrail';
import { getTrailFieldConfig } from './shaders/trailFieldShader';

const SnakeScene = ({
    settings,
    editable = false,
    selectedId = null,
    setSelectedId,
    isDragging = false,
    setIsDragging,
    handleTransformUpdate,
}) => {
    const orbitRef = useRef();
    const snakeWrapperRef = useRef();
    const planeWrapperRef = useRef();

    const snakeInitialized = useRef(false);
    const planeInitialized = useRef(false);
    const trailConfig = getTrailFieldConfig(settings);
    const { handlePointerMove, trailBufferRef } = usePointerTrail({
        radiusWorld: trailConfig.radiusWorld,
        trailSpanWorld: trailConfig.spanWorld,
        trailPersistence: trailConfig.persistenceSeconds,
        isDragging: editable ? isDragging : false,
    });

    useEffect(() => {
        const tryInit = () => {
            if (!snakeInitialized.current && snakeWrapperRef.current && settings.snakePos) {
                snakeWrapperRef.current.position.set(settings.snakePos.x, settings.snakePos.y, settings.snakePos.z);
                snakeInitialized.current = true;
            }

            if (!planeInitialized.current && planeWrapperRef.current && settings.planePos) {
                planeWrapperRef.current.position.set(settings.planePos.x, settings.planePos.y, settings.planePos.z);
                planeInitialized.current = true;
            }
        };

        tryInit();
        const timer = setTimeout(tryInit, 100);
        return () => clearTimeout(timer);
    }, [settings.planePos, settings.snakePos]);

    const lAngleRad = (settings.lightAngle * Math.PI) / 180;
    const lRadius = settings.lightDistance / 10.0;
    const lX = Math.cos(lAngleRad) * lRadius;
    const lZ = Math.sin(lAngleRad) * lRadius;
    const lY = settings.lightHeight / 10.0;

    return (
        <>
            <CameraController settings={settings} orbitRef={orbitRef} />
            <OrbitControls
                ref={orbitRef}
                makeDefault
                target={[0, -1, 0]}
                minPolarAngle={editable && settings.freeCamera ? 0 : 0}
                maxPolarAngle={editable && settings.freeCamera ? Math.PI : 0.01}
                enableRotate={editable ? settings.freeCamera : false}
                enablePan={editable}
                enableZoom={editable}
            />

            {editable ? (
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
            ) : null}

            {editable ? (
                <GizmoHelper alignment="bottom-right" margin={[80, 80]}>
                    <GizmoViewport labelColor="white" axisColors={['#9d4b4b', '#2f7f4f', '#3b5b9d']} />
                </GizmoHelper>
            ) : null}

            {editable && settings.devAxes ? <axesHelper args={[10]} /> : null}
            {editable && settings.devNormals ? <NormalsHelper /> : null}
            {editable && settings.devStats ? <Stats /> : null}

            <SoftShadows size={20} samples={24} focus={1.0} />
            <Environment preset="city" environmentIntensity={settings.hdrExposure / 100.0} />

            <directionalLight
                position={[lX, lY, lZ]}
                intensity={settings.lightIntensity / 100.0}
                color={settings.lightColor}
                castShadow
                shadow-mapSize-width={4096}
                shadow-mapSize-height={4096}
                shadow-camera-near={0.5}
                shadow-camera-far={200}
                shadow-camera-left={-40}
                shadow-camera-right={40}
                shadow-camera-top={40}
                shadow-camera-bottom={-40}
                shadow-bias={-0.0005}
                shadow-normalBias={0.02}
            />

            <directionalLight
                position={[-15, 10, -10]}
                intensity={0.8}
                color="#ffffff"
            />

            <group ref={planeWrapperRef} name="plane-wrapper">
                <InteractivePlane
                    settings={settings}
                    editable={editable}
                    onSelect={editable ? () => setSelectedId?.('plane') : undefined}
                    isDragging={editable ? isDragging : false}
                    onPointerWorldMove={handlePointerMove}
                    trailBufferRef={trailBufferRef}
                />
            </group>

            <group ref={snakeWrapperRef} name="snake-wrapper">
                <ProceduralSnake
                    settings={settings}
                    onSelect={editable ? () => setSelectedId?.('snake') : undefined}
                    trailBufferRef={trailBufferRef}
                />
            </group>

            {editable && selectedId === 'snake' && snakeWrapperRef.current ? (
                <DraggableTransformControls
                    orbitRef={orbitRef}
                    object={snakeWrapperRef.current}
                    onPositionChange={(pos) => handleTransformUpdate?.('snake', pos)}
                    setIsDragging={setIsDragging}
                />
            ) : null}

            {editable && selectedId === 'plane' && planeWrapperRef.current ? (
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

export default SnakeScene;
