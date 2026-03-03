import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
    TRAIL_FIELD_MAX_POINTS,
    TRAIL_FIELD_STRIDE,
    createInactiveTrailFieldData,
} from '../components/effects/shaders/trailFieldShader';

const createTrailBuffer = () => ({
    data: createInactiveTrailFieldData(TRAIL_FIELD_MAX_POINTS),
    currentPathLength: 0,
    pointCount: 0,
});

const writeDebugState = (patch) => {
    if (!import.meta.env.DEV || typeof window === 'undefined') {
        return;
    }

    window.__DDG_SNAKE_DEBUG__ = {
        ...(window.__DDG_SNAKE_DEBUG__ ?? {}),
        ...patch,
    };
};

export const usePointerTrail = ({
    radiusWorld,
    trailSpanWorld,
    trailPersistence,
    isDragging,
}) => {
    const trailBufferRef = useRef(createTrailBuffer());
    const targetPointerRef = useRef(null);
    const smoothedPointerRef = useRef(null);
    const lastSamplePointRef = useRef(null);
    const samplesRef = useRef([]);
    const currentPathLengthRef = useRef(0);

    const handlePointerMove = (point) => {
        if (isDragging) {
            return;
        }

        targetPointerRef.current = { x: point.x, z: point.z };
    };

    useFrame((_, delta) => {
        const time = performance.now() / 1000;
        const spacing = Math.min(0.18, Math.max(0.045, radiusWorld * 0.05));
        const targetPoint = targetPointerRef.current;

        if (targetPoint) {
            if (!smoothedPointerRef.current) {
                smoothedPointerRef.current = { ...targetPoint };
            } else {
                const easing = 1 - Math.exp(-delta * 18);
                smoothedPointerRef.current.x += (targetPoint.x - smoothedPointerRef.current.x) * easing;
                smoothedPointerRef.current.z += (targetPoint.z - smoothedPointerRef.current.z) * easing;
            }

            const currentPoint = smoothedPointerRef.current;
            const previousPoint = lastSamplePointRef.current;

            if (!previousPoint) {
                samplesRef.current.unshift({
                    x: currentPoint.x,
                    z: currentPoint.z,
                    t: time,
                    pathLength: currentPathLengthRef.current,
                });
                lastSamplePointRef.current = { ...currentPoint };
            } else {
                const distance = Math.hypot(currentPoint.x - previousPoint.x, currentPoint.z - previousPoint.z);

                if (distance >= spacing * 0.2) {
                    const steps = Math.min(10, Math.max(1, Math.ceil(distance / spacing)));
                    let lastX = previousPoint.x;
                    let lastZ = previousPoint.z;

                    for (let i = 1; i <= steps; i += 1) {
                        const alpha = i / steps;
                        const nextX = previousPoint.x + ((currentPoint.x - previousPoint.x) * alpha);
                        const nextZ = previousPoint.z + ((currentPoint.z - previousPoint.z) * alpha);
                        const segmentDistance = Math.hypot(nextX - lastX, nextZ - lastZ);

                        currentPathLengthRef.current += segmentDistance;
                        samplesRef.current.unshift({
                            x: nextX,
                            z: nextZ,
                            t: time - ((1 - alpha) * Math.min(delta, 1 / 30)),
                            pathLength: currentPathLengthRef.current,
                        });

                        lastX = nextX;
                        lastZ = nextZ;
                    }

                    lastSamplePointRef.current = { ...currentPoint };
                }
            }
        }

        const spanBudget = Math.max(spacing * 2, trailSpanWorld);
        const persistenceBudget = Math.max(0.05, trailPersistence);

        samplesRef.current = samplesRef.current
            .filter((sample) => {
                const trailDistance = currentPathLengthRef.current - sample.pathLength;
                const age = time - sample.t;
                return !(trailDistance > spanBudget * 1.35 && age > persistenceBudget * 1.2);
            })
            .slice(0, TRAIL_FIELD_MAX_POINTS);

        const buffer = trailBufferRef.current;
        buffer.currentPathLength = currentPathLengthRef.current;
        buffer.pointCount = samplesRef.current.length;

        const { data } = buffer;
        data.fill(0);
        for (let i = 0; i < TRAIL_FIELD_MAX_POINTS; i += 1) {
            data[(i * TRAIL_FIELD_STRIDE) + 2] = -1;
        }

        samplesRef.current.forEach((sample, index) => {
            const offset = index * TRAIL_FIELD_STRIDE;
            data[offset] = sample.x;
            data[offset + 1] = sample.z;
            data[offset + 2] = sample.t;
            data[offset + 3] = sample.pathLength;
        });

        writeDebugState({
            trailPointCount: buffer.pointCount,
            trailStride: TRAIL_FIELD_STRIDE,
            currentPathLength: buffer.currentPathLength,
        });
    });

    return {
        handlePointerMove,
        trailBufferRef,
    };
};
