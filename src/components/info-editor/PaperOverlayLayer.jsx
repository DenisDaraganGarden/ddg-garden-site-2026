import React from 'react';
import DraggablePngOverlay from './DraggablePngOverlay';

const PaperOverlayLayer = ({ overlays, editable = false, onUpdateOverlay }) => {
  if (!overlays?.length) {
    return null;
  }

  return (
    <div className={`paper-overlay-layer ${editable ? 'is-editable' : ''}`}>
      {overlays.map((overlay) => (
        <DraggablePngOverlay
          key={overlay.id}
          overlay={overlay}
          editable={editable}
          onUpdate={(patch) => onUpdateOverlay?.({ id: overlay.id, ...patch })}
        />
      ))}
    </div>
  );
};

export default PaperOverlayLayer;
