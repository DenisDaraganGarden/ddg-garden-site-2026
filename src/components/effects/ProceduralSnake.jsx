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
            float tailSeed = mix(0.005, 0.018, clamp(uTail * 0.45, 0.0, 1.0));
            float tailBuild = mix(tailSeed, 0.032 + (uTail * 0.08), smoothstep(0.0, 0.12, t));
            float trunk = mix(tailBuild, 0.055 + (uBody * 0.18), smoothstep(0.12, 0.34, t));
            float trunkTaper = mix(1.0, 0.86, smoothstep(0.56, 0.76, t));
            float neckPinch = 1.0 - (smoothstep(0.72, 0.88, t) * mix(0.14, 0.5, clamp(uNeck, 0.0, 1.0)));
            float headMass = gaussian(t, 0.905, 0.075) * (0.028 + (uHead * 0.12));
            float snoutMass = smoothstep(0.88, 0.965, t) * (0.01 + (uNose * 0.05));
            float bluntFront = 1.0 - (smoothstep(0.985, 1.0, t) * 0.1);
            float tipFloor = mix(0.0, 0.014 + (uNose * 0.028), smoothstep(0.93, 0.998, t));
            float radius = (trunk * trunkTaper * neckPinch) + headMass + snoutMass;

            radius *= bluntFront;
            return max(radius, tipFloor);
        }

        float getCrossSectionScale(float t, float angle) {
            float side = pow(abs(cos(angle)), 1.1);
            float dorsal = max(sin(angle), 0.0);
            float ventral = max(-sin(angle), 0.0);
            float bodyRegion = smoothstep(0.08, 0.35, t) * (1.0 - smoothstep(0.7, 0.9, t));
            float headRegion = smoothstep(0.82, 0.9, t);

            float scale = 1.0;
            scale += side * mix(0.08, 0.26, headRegion);
            scale -= ventral * mix(0.16, 0.28, bodyRegion);
            scale += dorsal * mix(0.015, 0.06, headRegion);
            scale += ventral * headRegion * (0.015 + (uJaw * 0.05));

            return max(scale, 0.5);
        }

        float getHeadSurfaceDeform(float t, float angle) {
            float headRegion = smoothstep(0.82, 0.88, t);
            float skullRegion = gaussian(t, 0.9, 0.06);
            float snoutRegion = smoothstep(0.89, 0.975, t) * (1.0 - smoothstep(0.992, 1.0, t));

            float eyeSockets = (
                angleGaussian(angle, 0.95, 0.22) +
                angleGaussian(angle, 3.14159265359 - 0.95, 0.22)
            ) * gaussian(t, 0.905, 0.03) * (0.008 + (uEyeDimple * 0.04));

            float cheeks = (
                angleGaussian(angle, 0.34, 0.44) +
                angleGaussian(angle, 3.14159265359 - 0.34, 0.44)
            ) * gaussian(t, 0.89, 0.055) * (0.008 + (uCheekbone * 0.05));

            float jawline = angleGaussian(angle, 4.71238898038, 0.55)
                * gaussian(t, 0.91, 0.055)
                * (0.006 + (uJaw * 0.05));

            float crown = angleGaussian(angle, 1.57079632679, 0.4)
                * gaussian(t, 0.9, 0.06)
                * (0.004 + (uCrown * 0.05));

            float snoutBridge = angleGaussian(angle, 1.57079632679, 0.68)
                * snoutRegion
                * (0.004 + (uNose * 0.028));

            float snoutSides = (
                angleGaussian(angle, 0.26, 0.36) +
                angleGaussian(angle, 3.14159265359 - 0.26, 0.36)
            ) * snoutRegion * (0.002 + (uNose * 0.014));

            return ((cheeks + jawline + crown + snoutBridge + snoutSides) - eyeSockets) * headRegion * skullRegion;
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
