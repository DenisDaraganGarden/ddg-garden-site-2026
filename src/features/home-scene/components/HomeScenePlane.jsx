import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import CustomShaderMaterial from 'three-custom-shader-material';
import {
    HOME_SCENE_FIELD_MAX_POINTS,
    HOME_SCENE_FIELD_STRIDE,
    buildHomeSceneFieldGLSL,
    buildHomeSceneFieldUniforms,
    getHomeSceneFieldConfig,
    syncHomeSceneFieldUniforms,
} from '../shaders/homeSceneFieldShader';

const TRAIL_FIELD_SHADER = buildHomeSceneFieldGLSL(HOME_SCENE_FIELD_MAX_POINTS);
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const snapToStep = (value, step = 8) => Math.max(step, Math.round(value / step) * step);

const writePlaneDebugState = (materialRef, debugState) => {
    if (!import.meta.env.DEV || typeof window === 'undefined') {
        return;
    }

    window.__DDG_HOME_SCENE_DEBUG__ = {
        ...(window.__DDG_HOME_SCENE_DEBUG__ ?? {}),
        planeTrailArrayLength: materialRef.current?.uniforms?.uTrailData?.value?.length ?? 0,
        planeTrailStride: HOME_SCENE_FIELD_STRIDE,
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

export default function HomeScenePlane({
    settings,
    onSelect,
    isDragging,
    onPointerWorldMove,
    trailBufferRef,
    texture1 = null,
    texture2 = null,
    morphProgress = 0,
    parallaxStrength = 0.08,
    editable = false,
}) {
    const materialRef = useRef();
    const { camera, size, viewport } = useThree();
    const materialUniforms = useMemo(() => ({
        ...buildHomeSceneFieldUniforms(HOME_SCENE_FIELD_MAX_POINTS),
        uPlaneAlbedo: { value: new THREE.Color('#dddddd') },
        uTexture1: { value: null },
        uTexture2: { value: null },
        uMorphProgress: { value: 0 },
        uParallaxStrength: { value: 0 },
    }), []);

    const trailConfig = getHomeSceneFieldConfig(settings);
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
        varying vec2 vUv;
        varying float vDisp;
        ${TRAIL_FIELD_SHADER}

        void main() {
            vUv = uv;
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
            vDisp = disp;
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
        varying vec2 vUv;
        varying float vDisp;
        uniform vec3 uPlaneAlbedo;
        uniform sampler2D uTexture1;
        uniform sampler2D uTexture2;
        uniform float uMorphProgress;
        uniform float uParallaxStrength;
        ${TRAIL_FIELD_SHADER}

        void main() {
            vec4 texColor = getMorphingTexture(
                vUv,
                uTexture1,
                uTexture2,
                uMorphProgress,
                vDisp,
                uParallaxStrength
            );
            
            // If texture is empty (black/zero), fallback to albedo
            float useTexture = step(0.0001, texColor.a);
            csm_DiffuseColor = mix(vec4(uPlaneAlbedo, 1.0), texColor, useTexture);
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

        syncHomeSceneFieldUniforms(
            materialRef.current.uniforms,
            trailConfig,
            trailBufferRef?.current,
            performance.now() / 1000
        );

        if (materialRef.current.uniforms.uTexture1) {
            materialRef.current.uniforms.uTexture1.value = texture1;
        }
        if (materialRef.current.uniforms.uTexture2) {
            materialRef.current.uniforms.uTexture2.value = texture2;
        }
        if (materialRef.current.uniforms.uMorphProgress) {
            materialRef.current.uniforms.uMorphProgress.value = morphProgress;
        }
        if (materialRef.current.uniforms.uParallaxStrength) {
            materialRef.current.uniforms.uParallaxStrength.value = parallaxStrength;
        }
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
