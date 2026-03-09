import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import CustomShaderMaterial from 'three-custom-shader-material';
import {
    TRAIL_FIELD_MAX_POINTS,
    TRAIL_FIELD_STRIDE,
    buildTrailFieldGLSL,
    buildTrailFieldUniforms,
    getTrailFieldConfig,
    syncTrailFieldUniforms,
} from './shaders/trailFieldShader';

const TRAIL_FIELD_SHADER = buildTrailFieldGLSL(TRAIL_FIELD_MAX_POINTS);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const snapToStep = (value, step = 8) => Math.max(step, Math.round(value / step) * step);

const writePlaneDebugState = (materialRef, debugState) => {
    if (!import.meta.env.DEV || typeof window === 'undefined') {
        return;
    }

    window.__DDG_SNAKE_DEBUG__ = {
        ...(window.__DDG_SNAKE_DEBUG__ ?? {}),
        planeTrailArrayLength: materialRef.current?.uniforms?.uTrailData?.value?.length ?? 0,
        planeTrailStride: TRAIL_FIELD_STRIDE,
        planeMeshDensity: materialRef.current?.userData?.meshDensity ?? 0,
        planeMeshDensityX: debugState?.planeMeshDensityX ?? 0,
        planeMeshDensityY: debugState?.planeMeshDensityY ?? 0,
        planeDensityBase: debugState?.planeDensityBase ?? 0,
        planeWorldWidth: debugState?.planeWorldWidth ?? 0,
        planeWorldDepth: debugState?.planeWorldDepth ?? 0,
        planeViewportWidth: debugState?.planeViewportWidth ?? 0,
        planeViewportHeight: debugState?.planeViewportHeight ?? 0,
    };
};

export default function InteractivePlane({
    settings,
    onSelect,
    isDragging,
    onPointerWorldMove,
    trailBufferRef,
    editable = false,
}) {
    const materialRef = useRef();
    const { camera, size, viewport } = useThree();
    const materialUniforms = useMemo(() => ({
        ...buildTrailFieldUniforms(TRAIL_FIELD_MAX_POINTS),
        uPlaneAlbedo: { value: new THREE.Color('#dddddd') },
    }), []);

    const trailConfig = getTrailFieldConfig(settings);
    const planeTarget = useMemo(
        () => new THREE.Vector3(
            settings?.planePos?.x ?? 0,
            settings?.planePos?.y ?? -1,
            settings?.planePos?.z ?? 0,
        ),
        [settings?.planePos?.x, settings?.planePos?.y, settings?.planePos?.z],
    );
    const viewportAtPlane = viewport.getCurrentViewport(camera, planeTarget);
    const isMobileViewport = size.width < 768;
    const coverageScale = editable
        ? (settings?.freeCamera ? 2.2 : 1.7)
        : (isMobileViewport ? 1.18 : 1.08);
    const planeWorldWidth = Math.max(viewportAtPlane.width * coverageScale, 8);
    const planeWorldDepth = Math.max(viewportAtPlane.height * coverageScale, 8);
    const planeLongSide = Math.max(planeWorldWidth, planeWorldDepth);
    const planeShortSide = Math.max(Math.min(planeWorldWidth, planeWorldDepth), 0.001);
    const planeAspectRatio = planeShortSide / planeLongSide;
    const densityControl = clamp(settings?.planeMeshDensity ?? 128, 16, 2048);
    const densityBase = isMobileViewport ? 256 : 512;
    const densityMultiplier = densityControl / 128;
    const maxLongSideSegments = isMobileViewport ? 640 : 1024;
    const longSideSegments = clamp(
        snapToStep(densityBase * densityMultiplier, 8),
        64,
        maxLongSideSegments,
    );
    const shortSideSegments = clamp(
        snapToStep(longSideSegments * planeAspectRatio, 8),
        48,
        longSideSegments,
    );
    const meshDensityX = planeWorldWidth >= planeWorldDepth ? longSideSegments : shortSideSegments;
    const meshDensityY = planeWorldDepth > planeWorldWidth ? longSideSegments : shortSideSegments;

    const vertexShader = useMemo(() => `
        ${TRAIL_FIELD_SHADER}

        void main() {
            vec3 worldPos = (modelMatrix * vec4(position, 1.0)).xyz;
            float disp = getTrailDisplacement(
                worldPos.xz,
                uTrailData,
                uTime,
                uTrailCurrentPathLength,
                uTrailRadius,
                uTrailHeight,
                uTrailSpan,
                uTrailPersistence,
                uTrailSharpness,
                uTrailHeadTaper,
                uTrailTailTaper
            );
            float e = 0.1;
            float dx = getTrailDisplacement(
                worldPos.xz + vec2(e, 0.0),
                uTrailData,
                uTime,
                uTrailCurrentPathLength,
                uTrailRadius,
                uTrailHeight,
                uTrailSpan,
                uTrailPersistence,
                uTrailSharpness,
                uTrailHeadTaper,
                uTrailTailTaper
            ) - disp;
            float dz = getTrailDisplacement(
                worldPos.xz + vec2(0.0, e),
                uTrailData,
                uTime,
                uTrailCurrentPathLength,
                uTrailRadius,
                uTrailHeight,
                uTrailSpan,
                uTrailPersistence,
                uTrailSharpness,
                uTrailHeadTaper,
                uTrailTailTaper
            ) - disp;

            csm_Position.z += disp;
            csm_Normal = normalize(vec3(-dx, -dz, e));
        }
    `, []);
    const fragmentShader = useMemo(() => `
        uniform vec3 uPlaneAlbedo;

        void main() {
            csm_DiffuseColor = vec4(uPlaneAlbedo, 1.0);
        }
    `, []);

    useEffect(() => {
        if (!materialRef.current?.uniforms?.uPlaneAlbedo) {
            return;
        }

        materialRef.current.uniforms.uPlaneAlbedo.value.set(
            settings?.planeAlbedo ?? settings?.planeColor ?? '#dddddd'
        );
        materialRef.current.roughness = clamp((settings?.planeRoughness ?? 96) / 100, 0, 1);
        materialRef.current.metalness = clamp((settings?.planeMetalness ?? 4) / 100, 0, 1);
    }, [
        settings?.planeAlbedo,
        settings?.planeColor,
        settings?.planeMetalness,
        settings?.planeRoughness,
    ]);

    useEffect(() => {
        if (!materialRef.current) {
            return;
        }

        materialRef.current.userData.meshDensity = {
            control: densityControl,
            x: meshDensityX,
            y: meshDensityY,
        };

        writePlaneDebugState(materialRef, {
            planeMeshDensityX: meshDensityX,
            planeMeshDensityY: meshDensityY,
            planeDensityBase: densityBase,
            planeWorldWidth,
            planeWorldDepth,
            planeViewportWidth: viewportAtPlane.width,
            planeViewportHeight: viewportAtPlane.height,
        });
    }, [
        densityBase,
        densityControl,
        meshDensityX,
        meshDensityY,
        planeWorldDepth,
        planeWorldWidth,
        viewportAtPlane.height,
        viewportAtPlane.width,
    ]);

    useFrame(() => {
        if (!materialRef.current?.uniforms) {
            return;
        }

        syncTrailFieldUniforms(
            materialRef.current.uniforms,
            trailConfig,
            trailBufferRef?.current,
            performance.now() / 1000
        );
    });

    return (
        <group>
            <mesh
                rotation={[-Math.PI / 2, 0, 0]}
                visible={false}
                onPointerMove={(event) => {
                    if (isDragging) {
                        return;
                    }

                    onPointerWorldMove?.({ x: event.point.x, z: event.point.z });
                }}
            >
                <planeGeometry args={[planeWorldWidth, planeWorldDepth, 1, 1]} />
            </mesh>
            <mesh
                name="plane"
                rotation={[-Math.PI / 2, 0, 0]}
                receiveShadow
                onClick={() => onSelect && onSelect()}
            >
                <planeGeometry args={[planeWorldWidth, planeWorldDepth, meshDensityX, meshDensityY]} />
                <CustomShaderMaterial
                    ref={materialRef}
                    baseMaterial={THREE.MeshStandardMaterial}
                    color={new THREE.Color('#ffffff')}
                    roughness={0.96}
                    metalness={0.04}
                    vertexShader={vertexShader}
                    fragmentShader={fragmentShader}
                    uniforms={materialUniforms}
                />
            </mesh>
        </group>
    );
}
