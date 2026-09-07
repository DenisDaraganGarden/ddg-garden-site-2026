import { useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { createCalibrationQueue } from './calibrationQueue';

const queues = new WeakMap();
export function useCalibrationQueue() {
  const { gl, invalidate } = useThree();
  const owner = useRef({});
  const queue = useMemo(() => {
    if (!queues.has(gl)) queues.set(gl, createCalibrationQueue());
    return queues.get(gl);
  }, [gl]);
  useLayoutEffect(() => queue.attach(owner.current), [queue]);
  useFrame(() => {
    if (!queue.isDriver(owner.current)) return;
    if (queue.advance()) {
      gl.domElement.dataset.ddgPlantWarmup = JSON.stringify(queue.stats);
      if (queue.stats.pending) invalidate();
    }
  }, -0.01);
  return queue;
}
