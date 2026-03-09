import React from 'react';
import DraggablePngOverlay from './DraggablePngOverlay';

const PaperOverlayLayer = ({ overlays, editable = false, activeOverlayId, onSelectOverlay, onUpdateOverlay }) => {
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
          selected={overlay.id === activeOverlayId}
          onSelect={() => onSelectOverlay?.(overlay.id)}
          onUpdate={(patch) => onUpdateOverlay?.(overlay.id, patch)}
        />
      ))}
    </div>
  );
};

export default PaperOverlayLayer;
