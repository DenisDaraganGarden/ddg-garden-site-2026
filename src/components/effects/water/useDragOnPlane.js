import { useCallback, useEffect, useRef } from 'react';
import * as THREE from 'three';

// Shift-drag an object across a horizontal plane in the editor.
//
// The boat and the sculpture had this same sixty lines each, identical down to
// the pointer-capture bookkeeping and differing only in which plane height they
// drag on. One copy means the two objects cannot drift apart in how they feel.
//
//  isDraggingRef is returned because the caller needs it: while a drag is in
//  flight the authored anchor must not be re-applied from settings, or the object
//  snaps back under the cursor on every render.
export function useDragOnPlane({
    mode,
    anchorRef,
    fallbackAnchorRef,
    planeHeight = 0,
    applyAnchor,
    commitPosition,
    setOrbitEnabled,
}) {
    const isDraggingRef = useRef(false);
    const pointerIdRef = useRef(null);
    const planeRef = useRef(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
    const hitPointRef = useRef(new THREE.Vector3());
    const offsetRef = useRef(new THREE.Vector3());

    const onPointerDown = useCallback((event) => {
        if (mode !== 'editor' || event.button !== 0 || !event.shiftKey) {
            return;
        }

        planeRef.current.set(new THREE.Vector3(0, 1, 0), -planeHeight);
        const hitPoint = hitPointRef.current;

        if (!event.ray?.intersectPlane(planeRef.current, hitPoint)) {
            return;
        }

        event.stopPropagation();
        event.target.setPointerCapture?.(event.pointerId);

        isDraggingRef.current = true;
        pointerIdRef.current = event.pointerId;
        setOrbitEnabled(false);

        const currentAnchor = anchorRef.current?.position ?? fallbackAnchorRef.current;
        offsetRef.current.set(
            currentAnchor.x - hitPoint.x,
            0,
            currentAnchor.z - hitPoint.z,
        );
    }, [anchorRef, fallbackAnchorRef, mode, planeHeight, setOrbitEnabled]);

    const onPointerMove = useCallback((event) => {
        if (!isDraggingRef.current) {
            return;
        }

        if (pointerIdRef.current !== null && event.pointerId !== pointerIdRef.current) {
            return;
        }

        const hitPoint = hitPointRef.current;

        if (!event.ray?.intersectPlane(planeRef.current, hitPoint)) {
            return;
        }

        event.stopPropagation();
        applyAnchor(hitPoint.x + offsetRef.current.x, hitPoint.z + offsetRef.current.z);
    }, [applyAnchor]);

    const onPointerFinish = useCallback((event) => {
        if (!isDraggingRef.current) {
            return;
        }

        event?.stopPropagation?.();
        setOrbitEnabled(true);

        if (pointerIdRef.current !== null && event?.target?.releasePointerCapture) {
            event.target.releasePointerCapture(pointerIdRef.current);
        }

        isDraggingRef.current = false;
        pointerIdRef.current = null;
        commitPosition(anchorRef.current?.position ?? fallbackAnchorRef.current);
    }, [anchorRef, commitPosition, fallbackAnchorRef, setOrbitEnabled]);

    // Unmounting mid-drag would otherwise leave the camera unable to orbit.
    useEffect(() => () => {
        setOrbitEnabled(true);
    }, [setOrbitEnabled]);

    return {
        isDraggingRef,
        dragHandlers: {
            onPointerDown,
            onPointerMove,
            onPointerUp: onPointerFinish,
            onPointerCancel: onPointerFinish,
            onLostPointerCapture: onPointerFinish,
        },
    };
}

export default useDragOnPlane;
