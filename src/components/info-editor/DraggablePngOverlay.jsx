import React, { useEffect, useMemo, useRef, useState } from 'react';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getClientPoint(event) {
  if ('touches' in event && event.touches.length) {
    return {
      clientX: event.touches[0].clientX,
      clientY: event.touches[0].clientY,
    };
  }

  if ('changedTouches' in event && event.changedTouches.length) {
    return {
      clientX: event.changedTouches[0].clientX,
      clientY: event.changedTouches[0].clientY,
    };
  }

  return {
    clientX: event.clientX,
    clientY: event.clientY,
  };
}

const DraggablePngOverlay = ({ overlay, editable, selected = false, onSelect, onUpdate }) => {
  const overlayRef = useRef(null);
  const dragHandleRef = useRef(null);
  const resizeHandleRef = useRef(null);
  const [aspectRatio, setAspectRatio] = useState(2.6);

  const overlayStyle = useMemo(() => ({
    left: `${overlay.xPct}%`,
    top: `${overlay.yPct}%`,
    width: `${overlay.widthPct}%`,
    opacity: overlay.opacity,
    aspectRatio,
  }), [aspectRatio, overlay.opacity, overlay.widthPct, overlay.xPct, overlay.yPct]);

  const startPointerSession = (event, mode) => {
    if (!editable || !overlayRef.current?.parentElement) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const { clientX, clientY } = getClientPoint(event);

    const parentRect = overlayRef.current.parentElement.getBoundingClientRect();
    const widthPx = (overlay.widthPct / 100) * parentRect.width;
    const startState = {
      x: clientX,
      y: clientY,
      xPct: overlay.xPct,
      yPct: overlay.yPct,
      widthPct: overlay.widthPct,
      widthPx,
      parentRect,
    };

    const handlePointerMove = (moveEvent) => {
      const point = getClientPoint(moveEvent);
      const deltaX = point.clientX - startState.x;
      const deltaY = point.clientY - startState.y;

      if (mode === 'drag') {
        const nextWidthPx = (overlay.widthPct / 100) * startState.parentRect.width;
        const nextHeightPx = nextWidthPx / aspectRatio;
        const maxXPct = Math.max(0, 100 - ((nextWidthPx / startState.parentRect.width) * 100));
        const maxYPct = Math.max(0, 100 - ((nextHeightPx / startState.parentRect.height) * 100));

        onUpdate({
          xPct: clamp(startState.xPct + ((deltaX / startState.parentRect.width) * 100), 0, maxXPct),
          yPct: clamp(startState.yPct + ((deltaY / startState.parentRect.height) * 100), 0, maxYPct),
        });
        return;
      }

      const proposedWidthPx = clamp(startState.widthPx + deltaX, startState.parentRect.width * 0.12, startState.parentRect.width * 0.9);
      const proposedWidthPct = (proposedWidthPx / startState.parentRect.width) * 100;
      const maxWidthPct = Math.max(12, 100 - startState.xPct);

      onUpdate({
        widthPct: clamp(proposedWidthPct, 12, maxWidthPct),
      });
    };

    const handlePointerUp = () => {
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('touchmove', handlePointerMove);
      window.removeEventListener('touchend', handlePointerUp);
    };

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('touchmove', handlePointerMove, { passive: false });
    window.addEventListener('touchend', handlePointerUp);
  };

  useEffect(() => {
    if (!editable || !dragHandleRef.current || !resizeHandleRef.current) {
      return undefined;
    }

    const dragHandle = dragHandleRef.current;
    const resizeHandle = resizeHandleRef.current;
    const startDrag = (event) => startPointerSession(event, 'drag');
    const startResize = (event) => startPointerSession(event, 'resize');

    dragHandle.addEventListener('mousedown', startDrag);
    dragHandle.addEventListener('touchstart', startDrag, { passive: false });
    resizeHandle.addEventListener('mousedown', startResize);
    resizeHandle.addEventListener('touchstart', startResize, { passive: false });

    return () => {
      dragHandle.removeEventListener('mousedown', startDrag);
      dragHandle.removeEventListener('touchstart', startDrag);
      resizeHandle.removeEventListener('mousedown', startResize);
      resizeHandle.removeEventListener('touchstart', startResize);
    };
  }, [aspectRatio, editable, onUpdate, overlay.widthPct, overlay.xPct, overlay.yPct]);

  return (
    <div
      ref={overlayRef}
      className={`png-overlay ${editable ? 'is-editable' : ''} ${selected ? 'is-selected' : ''}`}
      style={overlayStyle}
      onPointerDown={() => onSelect?.()}
    >
      <img
        src={overlay.src}
        alt={overlay.name}
        draggable={false}
        onLoad={(event) => {
          const image = event.currentTarget;
          if (image.naturalWidth && image.naturalHeight) {
            setAspectRatio(image.naturalWidth / image.naturalHeight);
          }
        }}
      />
      {editable ? (
        <>
          <button
            ref={dragHandleRef}
            type="button"
            className="png-overlay__drag-handle"
          >
            Move
          </button>
          <button
            ref={resizeHandleRef}
            type="button"
            className="png-overlay__resize-handle"
            aria-label="Resize PNG overlay"
          />
        </>
      ) : null}
    </div>
  );
};

export default DraggablePngOverlay;
