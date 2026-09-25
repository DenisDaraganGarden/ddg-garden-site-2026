import { useEffect, useRef } from 'react';
import { useThree } from '@react-three/fiber';
import { registerTraceSource } from './bridge.js';

export default function TraceBridge({ settings }) {
    const get = useThree((state) => state.get);
    const latest = useRef(settings); latest.current = settings;
    useEffect(() => registerTraceSource(() => ({ ...get(), settings: latest.current })), [get]);
    return null;
}
