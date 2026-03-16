import React, { useRef, useEffect } from 'react';
import { TransformControls } from '@react-three/drei/core/TransformControls.js';

const DraggableTransformControls = ({
    orbitRef: _orbitRef,
    object,
    onPositionChange,
    onDragStateChange,
    setIsDragging,
    ...props
}) => {
    const tcRef = useRef();

    useEffect(() => {
        const tc = tcRef.current;
        if (!tc) return;

        const handleDraggingChanged = (event) => {
            if (setIsDragging) setIsDragging(event.value);
            if (onDragStateChange) {
                const pos = object?.position;
                onDragStateChange(event.value, pos ? { x: pos.x, y: pos.y, z: pos.z } : null);
            }

            if (!event.value && onPositionChange && object) {
                const pos = object.position;
                onPositionChange({ x: pos.x, y: pos.y, z: pos.z });
            }
        };

        tc.addEventListener('dragging-changed', handleDraggingChanged);
        return () => {
            tc.removeEventListener('dragging-changed', handleDraggingChanged);
        };
    }, [object, onDragStateChange, onPositionChange, setIsDragging]);

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
