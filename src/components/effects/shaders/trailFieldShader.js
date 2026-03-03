export const TRAIL_FIELD_MAX_POINTS = 64;
export const TRAIL_FIELD_STRIDE = 4;

const DEFAULT_TRAIL_HEIGHT = 2;
const DEFAULT_TRAIL_RADIUS = 3.5;
const DEFAULT_TRAIL_SPAN = 30;
const DEFAULT_TRAIL_PERSISTENCE = 15;
const DEFAULT_TRAIL_SHARPNESS = 0.2;
const DEFAULT_TRAIL_HEAD_TAPER = 0.15;
const DEFAULT_TRAIL_TAIL_TAPER = 0.5;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const lerp = (start, end, amount) => start + (end - start) * amount;

export const createInactiveTrailFieldData = (maxPoints = TRAIL_FIELD_MAX_POINTS) => {
    const data = new Float32Array(maxPoints * TRAIL_FIELD_STRIDE).fill(0);

    for (let i = 0; i < maxPoints; i += 1) {
        data[(i * TRAIL_FIELD_STRIDE) + 2] = -1;
    }

    return data;
};

export const buildTrailFieldUniforms = (maxPoints = TRAIL_FIELD_MAX_POINTS) => ({
    uTrailData: { value: createInactiveTrailFieldData(maxPoints) },
    uTrailPointCount: { value: 0 },
    uTrailCurrentPathLength: { value: 0 },
    uTime: { value: 0 },
    uTrailRadius: { value: DEFAULT_TRAIL_RADIUS },
    uTrailHeight: { value: DEFAULT_TRAIL_HEIGHT },
    uTrailSpan: { value: DEFAULT_TRAIL_RADIUS * 2.8 },
    uTrailPersistence: { value: DEFAULT_TRAIL_PERSISTENCE / 10 },
    uTrailSharpness: { value: DEFAULT_TRAIL_SHARPNESS },
    uTrailHeadTaper: { value: DEFAULT_TRAIL_HEAD_TAPER },
    uTrailTailTaper: { value: DEFAULT_TRAIL_TAIL_TAPER },
});

export const getTrailFieldConfig = (settings = {}) => {
    const radiusWorld = (settings.planeRadius ?? 350) / 100;
    const trailSpanControl = clamp(settings.planeTrailSpan ?? DEFAULT_TRAIL_SPAN, 1, 100);
    const persistenceControl = clamp(settings.planeTrailPersistence ?? DEFAULT_TRAIL_PERSISTENCE, 1, 50);

    return {
        radiusWorld,
        heightWorld: (settings.planeHeight ?? 200) / 100,
        spanControl: trailSpanControl,
        spanWorld: radiusWorld * lerp(0.75, 8.0, trailSpanControl / 100),
        persistenceControl,
        persistenceSeconds: clamp(persistenceControl / 10, 0.1, 5.0),
        sharpness: clamp((settings.planeSharpness ?? 20) / 100, 0.01, 1),
        headTaper: clamp((settings.planeHeadTaper ?? 15) / 100, 0, 1),
        tailTaper: clamp((settings.planeTailTaper ?? 50) / 100, 0, 1.5),
    };
};

export const syncTrailFieldUniforms = (uniforms, config, trailBuffer, time) => {
    if (!uniforms || !config) {
        return;
    }

    uniforms.uTrailRadius.value = config.radiusWorld;
    uniforms.uTrailHeight.value = config.heightWorld;
    uniforms.uTrailSpan.value = config.spanWorld;
    uniforms.uTrailPersistence.value = config.persistenceSeconds;
    uniforms.uTrailSharpness.value = config.sharpness;
    uniforms.uTrailHeadTaper.value = config.headTaper;
    uniforms.uTrailTailTaper.value = config.tailTaper;

    if (typeof time === 'number') {
        uniforms.uTime.value = time;
    }

    if (trailBuffer) {
        uniforms.uTrailData.value = trailBuffer.data;
        uniforms.uTrailPointCount.value = trailBuffer.pointCount;
        uniforms.uTrailCurrentPathLength.value = trailBuffer.currentPathLength;
    }
};

export const buildTrailFieldGLSL = (maxPoints = TRAIL_FIELD_MAX_POINTS) => `
uniform float uTrailData[${maxPoints * TRAIL_FIELD_STRIDE}];
uniform float uTrailPointCount;
uniform float uTrailCurrentPathLength;
uniform float uTime;
uniform float uTrailRadius;
uniform float uTrailHeight;
uniform float uTrailSpan;
uniform float uTrailPersistence;
uniform float uTrailSharpness;
uniform float uTrailHeadTaper;
uniform float uTrailTailTaper;

float trailSegmentDistance(vec2 p, vec2 a, vec2 b, out float h) {
    vec2 ab = b - a;
    float denom = max(dot(ab, ab), 0.00001);
    h = clamp(dot(p - a, ab) / denom, 0.0, 1.0);
    return length(p - (a + (ab * h)));
}

float trailSpatialKernel(float dist, float radius, float sharpness) {
    float sharpnessMix = mix(0.035, 0.25, clamp(sharpness, 0.0, 1.0));
    return exp(-(dist * dist) / max(radius * radius * sharpnessMix, 0.0001));
}

float trailArcEnvelope(float spanNorm, float headTaper, float tailTaper) {
    float headMix = clamp(headTaper, 0.0, 1.0);
    float tailMix = clamp(tailTaper / 1.5, 0.0, 1.0);

    float frontWidth = mix(0.03, 0.22, headMix);
    float backStart = mix(0.22, 0.96, tailMix);
    float frontEnvelope = smoothstep(0.0, frontWidth, spanNorm);
    float backEnvelope = 1.0 - smoothstep(backStart, 1.0, spanNorm);
    float crestBias = pow(max(0.0, 1.0 - spanNorm), mix(1.2, 0.45, tailMix));

    return frontEnvelope * backEnvelope * crestBias;
}

float trailTimeEnvelope(float ageNorm) {
    return 1.0 - smoothstep(0.0, 1.0, ageNorm);
}

float smoothFieldMax(float a, float b, float softness) {
    float k = max(softness, 0.0001);
    float h = max(k - abs(a - b), 0.0) / k;
    return max(a, b) + (h * h * k * 0.25);
}

float getTrailDisplacement(
    vec2 worldXZ,
    float trailData[${maxPoints * TRAIL_FIELD_STRIDE}],
    float currentTime,
    float currentPathLength,
    float trailRadius,
    float trailHeight,
    float trailSpan,
    float trailPersistence,
    float sharpness,
    float headTaper,
    float tailTaper
) {
    float field = 0.0;
    float radius = max(0.1, trailRadius);
    float span = max(0.001, trailSpan);
    float persistence = max(0.001, trailPersistence);
    float blendSoftness = max(trailHeight * 0.18, radius * 0.08);

    if (uTrailPointCount < 2.0) {
        return 0.0;
    }

    for (int i = 0; i < ${maxPoints - 1}; i += 1) {
        if (float(i) >= uTrailPointCount - 1.0) {
            break;
        }

        int offsetA = i * ${TRAIL_FIELD_STRIDE};
        int offsetB = (i + 1) * ${TRAIL_FIELD_STRIDE};

        float timeA = trailData[offsetA + 2];
        float timeB = trailData[offsetB + 2];

        if (timeA < 0.0 || timeB < 0.0) {
            continue;
        }

        vec2 pointA = vec2(trailData[offsetA], trailData[offsetA + 1]);
        vec2 pointB = vec2(trailData[offsetB], trailData[offsetB + 1]);

        float h;
        float dist = trailSegmentDistance(worldXZ, pointA, pointB, h);
        float sampleTime = mix(timeA, timeB, h);
        float samplePathLength = mix(trailData[offsetA + 3], trailData[offsetB + 3], h);

        float segmentPathDelta = max(0.0, currentPathLength - samplePathLength);
        float segmentAge = max(0.0, currentTime - sampleTime);

        float spanNorm = clamp(segmentPathDelta / span, 0.0, 1.0);
        float ageNorm = clamp(segmentAge / persistence, 0.0, 1.0);

        float spatialKernel = trailSpatialKernel(dist, radius, sharpness);
        float arcEnvelope = trailArcEnvelope(spanNorm, headTaper, tailTaper);
        float timeEnvelope = trailTimeEnvelope(ageNorm);
        float segmentContribution = spatialKernel * arcEnvelope * timeEnvelope * trailHeight;

        field = smoothFieldMax(field, segmentContribution, blendSoftness);
    }

    return field;
}
`;
