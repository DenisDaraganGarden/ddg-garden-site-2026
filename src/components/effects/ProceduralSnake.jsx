import React, { useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import CustomShaderMaterial from 'three-custom-shader-material/vanilla';
import SnakeTongue from './SnakeTongue';
import {
    TRAIL_FIELD_MAX_POINTS,
    TRAIL_FIELD_STRIDE,
    buildTrailFieldGLSL,
    buildTrailFieldUniforms,
    getTrailFieldConfig,
    syncTrailFieldUniforms,
} from './shaders/trailFieldShader';

const TRAIL_FIELD_SHADER = buildTrailFieldGLSL(TRAIL_FIELD_MAX_POINTS);

const writeSnakeDebugState = (material) => {
    if (!import.meta.env.DEV || typeof window === 'undefined') {
        return;
    }

    window.__DDG_SNAKE_DEBUG__ = {
        ...(window.__DDG_SNAKE_DEBUG__ ?? {}),
        snakeTrailArrayLength: material?.uniforms?.uTrailData?.value?.length ?? 0,
        snakeTrailStride: TRAIL_FIELD_STRIDE,
    };
};

// OuroborosCurve: bends from straight line into a circle
class OuroborosCurve extends THREE.Curve {
    constructor(length = 40, curl = 0) {
        super();
        this.length = length;
        this.curl = curl;
    }

    getPoint(t, optionalTarget = new THREE.Vector3()) {
        const straightX = (t - 0.5) * this.length;

        if (this.curl < 0.0001) {
            return optionalTarget.set(straightX, 0, 0);
        }

        const totalAngle = this.curl * Math.PI * 2;
        const radius = this.length / totalAngle;
        const angle = (t - 0.5) * totalAngle;
        const x = radius * Math.sin(angle);
        const z = radius * (1.0 - Math.cos(angle)) - (radius * this.curl);

        return optionalTarget.set(x, 0, z);
    }
}

const ProceduralSnake = ({ settings, onSelect, trailBufferRef }) => {
    const config = {
        length: settings?.length ?? 40,
        curl: settings?.curl ?? 0,
        scaleDensity: settings?.scaleDensity ?? 50,
        roughness: settings?.roughness ?? 85,
        metalness: settings?.metalness ?? 10,
        tailFactor: settings?.tailFactor ?? 10,
        bodyFactor: settings?.bodyFactor ?? 80,
        neckFactor: settings?.neckFactor ?? 40,
        headFactor: settings?.headFactor ?? 100,
        noseFactor: settings?.noseFactor ?? 20,
        eyeDimple: settings?.eyeDimple ?? 20,
        cheekbone: settings?.cheekbone ?? 30,
        jaw: settings?.jaw ?? 10,
        crown: settings?.crown ?? 15,
        baseColor: settings?.baseColor ?? '#0a0a0a',
        bellyColor: settings?.bellyColor ?? '#14120f',
    };
    const tubularSegments = Math.min(420, Math.max(220, Math.round(config.length * 9)));
    const radialSegments = 28;

    const curve = useMemo(() => new OuroborosCurve(config.length, config.curl / 100.0), [config.length, config.curl]);
    const trailUniforms = useMemo(() => buildTrailFieldUniforms(TRAIL_FIELD_MAX_POINTS), []);

    const uniforms = useMemo(
        () => ({
            uLength: { value: config.length },
            uScaleDensity: { value: config.scaleDensity },
            uTail: { value: config.tailFactor / 100.0 },
            uBody: { value: config.bodyFactor / 100.0 },
            uNeck: { value: config.neckFactor / 100.0 },
            uHead: { value: config.headFactor / 100.0 },
            uNose: { value: config.noseFactor / 100.0 },
            uEyeDimple: { value: config.eyeDimple / 100.0 },
            uCheekbone: { value: config.cheekbone / 100.0 },
            uJaw: { value: config.jaw / 100.0 },
            uCrown: { value: config.crown / 100.0 },
            uBaseColor: { value: new THREE.Color(config.baseColor) },
            uBellyColor: { value: new THREE.Color(config.bellyColor) },
            ...trailUniforms,
        }),
        [trailUniforms]
    );

    const vertexShader = useMemo(() => `
        uniform float uLength;
        uniform float uTail;
        uniform float uBody;
        uniform float uNeck;
        uniform float uHead;
        uniform float uNose;
        uniform float uEyeDimple;
        uniform float uCheekbone;
        uniform float uJaw;
        uniform float uCrown;

        varying vec2 vUv;
        varying float vAngle;

        ${TRAIL_FIELD_SHADER}

        float gaussian(float value, float center, float width) {
            return exp(-pow((value - center) / max(width, 0.0001), 2.0));
        }

        float angleGaussian(float angle, float center, float width) {
            float delta = abs(angle - center);
            delta = min(delta, 6.28318530718 - delta);
            return exp(-pow(delta / max(width, 0.0001), 2.0));
        }

        float getBodyRadius(float t) {
            // Constant base thickness based on uBody parameter
            float baseThickness = 0.04 + (uBody * 0.15);

            // Taper the tail incredibly fast ONLY at the very tip (where it enters the mouth)
            // It stays thick right up to the mouth
            float tipTaper = smoothstep(0.0, 0.04, t);
            
            // The tail tip should not drop to exactly 0 to prevent geometry inversion
            float tailRadius = mix(baseThickness * 0.2, baseThickness, tipTaper);
            
            // Neck pinch - very subtle, mainly to define where the head starts
            float neckStart = smoothstep(0.86, 0.90, t);
            float neckPinch = mix(1.0, 0.85 - (uNeck * 0.15), neckStart);
            
            // Head expansion
            float headMass = gaussian(t, 0.94, 0.06) * (uHead * 0.05);

            float radius = (tailRadius * neckPinch) + headMass;

            return max(radius, 0.005);
        }

        float getCrossSectionScale(float t, float angle) {
            float side = pow(abs(cos(angle)), 1.1);
            float dorsal = max(sin(angle), 0.0);
            float ventral = max(-sin(angle), 0.0);
            
            // Make the body overall slightly flattened
            float bodyRegion = smoothstep(0.05, 0.4, t) * (1.0 - smoothstep(0.8, 0.9, t));
            
            // Head Region
            float headRegion = smoothstep(0.88, 1.0, t);
            float headCore = gaussian(t, 0.93, 0.06);
            float snoutRegion = smoothstep(0.96, 1.0, t);
            
            float scale = 1.0;
            
            // Hexagonal jaw widening
            float jawWidth = mix(0.0, 0.6 + (uCheekbone * 0.8), headCore);
            float snoutWidth = mix(0.0, 0.2 + (uNose * 0.4), snoutRegion);
            
            scale += side * (jawWidth + snoutWidth);
            
            // Flatter top and bottom overall for a more geometric look
            scale -= dorsal * mix(0.05, 0.35, headRegion);
            scale -= ventral * mix(0.1, 0.25, headRegion);
            scale -= ventral * mix(0.1, 0.2, bodyRegion);

            // Open mouth at the very end to swallow the tail
            float mouthOpen = smoothstep(0.975, 1.0, t);
            scale += dorsal * mix(0.0, 0.4, mouthOpen);
            scale += ventral * mix(0.0, 0.4 + (uJaw * 0.3), mouthOpen);

            return max(scale, 0.2);
        }

        float getHeadSurfaceDeform(float t, float angle) {
            float headRegion = smoothstep(0.88, 1.0, t);
            
            // Sharp geometric brow ridges (supraorbital)
            float browRidge = (
                angleGaussian(angle, 1.15, 0.3) +
                angleGaussian(angle, 3.14159265359 - 1.15, 0.3)
            ) * gaussian(t, 0.94, 0.03) * (0.01 + (uCrown * 0.03));
            
            // Sharp cheekbones / rear jaw corners
            float cheeks = (
                angleGaussian(angle, 0.2, 0.3) +
                angleGaussian(angle, 3.14159265359 - 0.2, 0.3)
            ) * gaussian(t, 0.91, 0.04) * (0.015 + (uCheekbone * 0.06));

            // Structured jawline
            float jawline = angleGaussian(angle, 4.71238898038, 0.7)
                * gaussian(t, 0.93, 0.05)
                * (0.01 + (uJaw * 0.04));

            // Flattened geometric crown
            float crown = angleGaussian(angle, 1.57079632679, 0.6)
                * gaussian(t, 0.94, 0.06)
                * (0.005 + (uCrown * 0.03));

            // Broad, blunt snout bridge
            float snoutBridge = angleGaussian(angle, 1.57079632679, 0.7)
                * gaussian(t, 0.98, 0.02)
                * (0.005 + (uNose * 0.02));
            
            // Slight indent for the eyes (kept minimal for geometric look)
            float eyeSockets = (
                angleGaussian(angle, 0.85, 0.2) +
                angleGaussian(angle, 3.14159265359 - 0.85, 0.2)
            ) * gaussian(t, 0.95, 0.02) * (0.01 + (uEyeDimple * 0.05));

            float deform = (cheeks + jawline + crown + browRidge + snoutBridge - eyeSockets);

            return deform * headRegion;
        }

        vec3 getDeformedPos(vec3 center, vec3 norm, float t, float angle) {
            float baseRadius = getBodyRadius(t);
            float crossScale = getCrossSectionScale(t, angle);
            float headSurface = getHeadSurfaceDeform(t, angle);
            float totalR = max(0.002, (baseRadius * crossScale) + headSurface);

            return center + (norm * totalR);
        }

        void main() {
            vUv = uv;
            float angle = uv.y * 6.2831853;
            vAngle = angle;

            vec3 center = position - normal * 1.0;
            vec3 worldCenter = (modelMatrix * vec4(center, 1.0)).xyz;

            float terrainY = getTrailDisplacement(
                worldCenter.xz,
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
            float bellyLift = getBodyRadius(uv.x) * mix(
                0.88,
                0.76,
                smoothstep(0.08, 0.38, uv.x) * (1.0 - smoothstep(0.72, 0.88, uv.x))
            );
            float crownLift = gaussian(uv.x, 0.9, 0.06) * (0.004 + (uHead * 0.018));
            center.y += terrainY + bellyLift + crownLift;

            vec3 P = getDeformedPos(center, normal, uv.x, angle);

            csm_Position = P;
            csm_Normal = normal;
        }
    `, []);

    const fragmentShader = useMemo(() => `
        uniform float uScaleDensity;
        uniform float uLength;
        uniform vec3 uBaseColor;
        uniform vec3 uBellyColor;

        varying vec2 vUv;
        varying float vAngle;

        float random(vec2 p) {
            return fract(sin(dot(p, vec2(12.71, 31.17))) * 43758.5453123);
        }

        float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            float a = random(i);
            float b = random(i + vec2(1.0, 0.0));
            float c = random(i + vec2(0.0, 1.0));
            float d = random(i + vec2(1.0, 1.0));
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
        }

        void main() {
            float bodySin = sin(vAngle);
            float dorsalMask = smoothstep(-0.2, 0.5, bodySin);
            float bellyMask = smoothstep(-0.15, -0.82, bodySin);

            float headFade = 1.0 - smoothstep(0.82, 0.96, vUv.x);
            float tailFade = smoothstep(0.02, 0.12, vUv.x);
            float patternFade = headFade * tailFade;

            vec3 color = mix(uBaseColor, uBellyColor, bellyMask);

            float variation = noise(vec2(vUv.x * uLength * 0.5, vUv.y * 5.0));
            color = mix(color, color * (0.9 + variation * 0.2), dorsalMask);

            color = mix(color, color * 0.8, (1.0 - patternFade) * 0.5);

            csm_DiffuseColor = vec4(color, 1.0);
            csm_Roughness = 0.5;
        }
    `, []);

    const material = useMemo(() => {
        return new CustomShaderMaterial({
            baseMaterial: THREE.MeshStandardMaterial,
            color: new THREE.Color('#0a0a0a'),
            roughness: 0.85,
            metalness: 0.1,
            uniforms,
            vertexShader,
            fragmentShader,
        });
    }, [uniforms, vertexShader, fragmentShader]);

    const depthMaterial = useMemo(() => {
        return new CustomShaderMaterial({
            baseMaterial: THREE.MeshDepthMaterial,
            depthPacking: THREE.RGBADepthPacking,
            uniforms,
            vertexShader,
        });
    }, [uniforms, vertexShader]);

    useEffect(() => {
        const trailConfig = getTrailFieldConfig(settings);

        const syncGeometryUniforms = (targetMaterial) => {
            if (!targetMaterial?.uniforms) {
                return;
            }

            targetMaterial.uniforms.uLength.value = config.length;
            targetMaterial.uniforms.uScaleDensity.value = config.scaleDensity;
            targetMaterial.uniforms.uTail.value = config.tailFactor / 100.0;
            targetMaterial.uniforms.uBody.value = config.bodyFactor / 100.0;
            targetMaterial.uniforms.uNeck.value = config.neckFactor / 100.0;
            targetMaterial.uniforms.uHead.value = config.headFactor / 100.0;
            targetMaterial.uniforms.uNose.value = config.noseFactor / 100.0;
            targetMaterial.uniforms.uEyeDimple.value = config.eyeDimple / 100.0;
            targetMaterial.uniforms.uCheekbone.value = config.cheekbone / 100.0;
            targetMaterial.uniforms.uJaw.value = config.jaw / 100.0;
            targetMaterial.uniforms.uCrown.value = config.crown / 100.0;

            if (targetMaterial.uniforms.uBaseColor) {
                targetMaterial.uniforms.uBaseColor.value.set(config.baseColor);
            }
            if (targetMaterial.uniforms.uBellyColor) {
                targetMaterial.uniforms.uBellyColor.value.set(config.bellyColor);
            }

            syncTrailFieldUniforms(targetMaterial.uniforms, trailConfig, trailBufferRef?.current);
        };

        syncGeometryUniforms(material);
        syncGeometryUniforms(depthMaterial);

        if (material) {
            material.roughness = config.roughness / 100.0;
            material.metalness = config.metalness / 100.0;
        }
    }, [
        material,
        depthMaterial,
        trailBufferRef,
        settings,
        config.length,
        config.scaleDensity,
        config.roughness,
        config.metalness,
        config.tailFactor,
        config.bodyFactor,
        config.neckFactor,
        config.headFactor,
        config.noseFactor,
        config.eyeDimple,
        config.cheekbone,
        config.jaw,
        config.crown,
        config.baseColor,
        config.bellyColor,
    ]);

    useFrame(() => {
        const time = performance.now() / 1000;
        const trailConfig = getTrailFieldConfig(settings);
        const trailBuffer = trailBufferRef?.current;

        if (material) {
            syncTrailFieldUniforms(material.uniforms, trailConfig, trailBuffer, time);
        }

        if (depthMaterial) {
            syncTrailFieldUniforms(depthMaterial.uniforms, trailConfig, trailBuffer, time);
        }

        writeSnakeDebugState(material);
    });

    return (
        <group>
            <mesh
                name="snake"
                position={[0, 0, 0]}
                castShadow
                receiveShadow
                customDepthMaterial={depthMaterial}
                onClick={(event) => {
                    event.stopPropagation();
                    if (onSelect) onSelect();
                }}
            >
                <tubeGeometry args={[curve, tubularSegments, 1.0, radialSegments, false]} />
                <primitive object={material} attach="material" />
            </mesh>
            <SnakeTongue curve={curve} settings={settings} />
        </group>
    );
};

export default ProceduralSnake;
