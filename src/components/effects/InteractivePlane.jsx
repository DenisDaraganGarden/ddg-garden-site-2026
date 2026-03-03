import React, { useMemo, useRef } from 'react';
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

const writePlaneDebugState = (materialRef) => {
    if (!import.meta.env.DEV || typeof window === 'undefined') {
        return;
    }

    window.__DDG_SNAKE_DEBUG__ = {
        ...(window.__DDG_SNAKE_DEBUG__ ?? {}),
        planeTrailArrayLength: materialRef.current?.uniforms?.uTrailData?.value?.length ?? 0,
        planeTrailStride: TRAIL_FIELD_STRIDE,
        planeMeshDensity: materialRef.current?.userData?.meshDensity ?? 0,
    };
};

export default function InteractivePlane({
    settings,
    onSelect,
    isDragging,
    onPointerWorldMove,
    trailBufferRef,
}) {
    const materialRef = useRef();
    const { viewport } = useThree();
    const trailUniforms = useMemo(() => buildTrailFieldUniforms(TRAIL_FIELD_MAX_POINTS), []);

    const trailConfig = getTrailFieldConfig(settings);

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

    const densityControl = Math.min(2048, Math.max(16, settings?.planeMeshDensity || 64));
    const meshDensity = Math.min(220, Math.max(48, Math.round(22 + (Math.sqrt(densityControl) * 6.2))));

    useFrame(() => {
        if (!materialRef.current?.uniforms) {
            return;
        }

        materialRef.current.userData.meshDensity = meshDensity;

        syncTrailFieldUniforms(
            materialRef.current.uniforms,
            trailConfig,
            trailBufferRef?.current,
            performance.now() / 1000
        );

        if (materialRef.current.color) {
            materialRef.current.color.set(settings?.planeColor || '#dddddd');
        }

        writePlaneDebugState(materialRef);
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
                <planeGeometry args={[viewport.width * 4, viewport.height * 4, 1, 1]} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow onClick={() => onSelect && onSelect()}>
                <planeGeometry args={[viewport.width * 4, viewport.height * 4, meshDensity, meshDensity]} />
                <CustomShaderMaterial
                    ref={materialRef}
                    baseMaterial={THREE.MeshStandardMaterial}
                    color={new THREE.Color('#dddddd')}
                    roughness={1.0}
                    metalness={0.0}
                    vertexShader={vertexShader}
                    uniforms={trailUniforms}
                />
            </mesh>
        </group>
    );
}
