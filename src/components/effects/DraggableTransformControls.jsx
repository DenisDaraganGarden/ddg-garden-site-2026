import React, { useRef, useEffect } from 'react';
import { TransformControls } from '@react-three/drei/core/TransformControls.js';

const DraggableTransformControls = ({ orbitRef, object, onPositionChange, setIsDragging, ...props }) => {
    const tcRef = useRef();

    useEffect(() => {
        const tc = tcRef.current;
        if (!tc) return;

        const handleDraggingChanged = (event) => {
            if (orbitRef.current) {
                orbitRef.current.enabled = !event.value;
            }
            if (setIsDragging) setIsDragging(event.value);
        };

        const handleChange = () => {
            if (object) {
                const pos = object.position;
                onPositionChange({ x: pos.x, y: pos.y, z: pos.z });
            }
        };

        tc.addEventListener('dragging-changed', handleDraggingChanged);
        tc.addEventListener('change', handleChange);
        return () => {
            tc.removeEventListener('dragging-changed', handleDraggingChanged);
            tc.removeEventListener('change', handleChange);
        };
    }, [orbitRef, object, onPositionChange, setIsDragging]);

    return (
        <TransformControls
            ref={tcRef}
            object={object}
            mode="translate"
            space="world"
            size={0.7}
            {...props}
        />
    );
};

export default DraggableTransformControls;
