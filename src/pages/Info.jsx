import React, { useEffect, useState } from 'react';
import PaperOverlayLayer from '../components/info-editor/PaperOverlayLayer';
import { createDefaultInfoEditorDocument } from '../lib/infoEditorHtml';
import { loadInfoEditorDocument } from '../lib/infoEditorStorage';
import '../styles/Info.css';
import '../styles/CIAEditor.css';

function paperStyleVars(settings) {
  return {
    '--paper-brightness': `${settings.brightness}%`,
    '--paper-noise': `${settings.grain / 100}`,
    '--paper-vignette': `${settings.vignette / 100}`,
    '--paper-creases': `${settings.creases / 100}`,
    '--paper-dirt': `${settings.dirt / 100}`,
    '--paper-tone': `${settings.tone}`,
    '--text-scale': `${settings.textScale}`,
  };
}

const Info = () => {
  const [documentState, setDocumentState] = useState(createDefaultInfoEditorDocument());

  useEffect(() => {
    let cancelled = false;

    loadInfoEditorDocument().then((nextDocument) => {
      if (!cancelled) {
        setDocumentState(nextDocument);
      }
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="info-page">
      <h1 className="info-title">Info</h1>

      <div className="paper-wrapper info-paper-wrapper">
        <div className="paper-container info-paper-container" style={paperStyleVars(documentState.paperSettings)}>
          <div
            className="a4-paper info-view-surface"
            dangerouslySetInnerHTML={{ __html: documentState.contentHtml }}
          />
          <div className="paper-overlay paper-creases" />
          <div className="paper-overlay paper-dirt" />
          <div className="paper-overlay paper-noise" />
          <PaperOverlayLayer overlays={documentState.overlays} />
        </div>
      </div>
    </div>
  );
};

export default Info;
