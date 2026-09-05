import React from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import SceneCanvas from '../src/components/effects/SceneCanvas.jsx';
import { LanguageProvider } from '../src/i18n/LanguageProvider.jsx';

const wait = (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds));

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

async function waitFor(read, label, timeoutMilliseconds = 1800) {
  const deadline = performance.now() + timeoutMilliseconds;
  while (performance.now() < deadline) {
    const value = read();
    if (value) return value;
    await wait(16);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function readTimeline(canvas) {
  const raw = canvas?.dataset.ddgSceneTimeline;
  if (!raw) return null;
  try {
    const timeline = JSON.parse(raw);
    return Number.isFinite(timeline.elapsed) && Number.isFinite(timeline.frames)
      ? timeline
      : null;
  } catch {
    return null;
  }
}

const TinyThreePlane = () => (
  <mesh rotation={[-Math.PI * 0.18, 0, 0]}>
    <planeGeometry args={[0.35, 0.35]} />
    <meshBasicMaterial color={new THREE.Color('#d8e6e0')} />
  </mesh>
);

// This is an integration check for SceneCanvas' actual visibility listener and
// R3F frameloop. It changes only this document instance's visibility getter;
// requestAnimationFrame and R3F's clock remain real browser implementations.
export async function runSceneVisibilityCheck(container) {
  assert(container instanceof HTMLElement, 'A check container is required');

  const originalVisibilityDescriptor = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  let syntheticVisibility = 'visible';
  let root = null;
  const setSyntheticVisibility = (nextVisibility) => {
    syntheticVisibility = nextVisibility;
    document.dispatchEvent(new Event('visibilitychange'));
  };

  try {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => syntheticVisibility,
    });

    root = createRoot(container);
    root.render(
      <LanguageProvider>
        <SceneCanvas
          sceneId="visibility-integration"
          mode="public"
          testId="visibility-integration-canvas"
          style={{ width: 320, height: 180, background: '#101315' }}
        >
          <TinyThreePlane />
        </SceneCanvas>
      </LanguageProvider>,
    );

    const canvas = await waitFor(
      () => container.querySelector('canvas'),
      'the SceneCanvas WebGL canvas',
    );
    const firstActive = await waitFor(
      () => {
        const timeline = readTimeline(canvas);
        return timeline?.active && timeline.frames >= 2 ? timeline : null;
      },
      'active R3F frames',
    );
    await wait(200);
    const active = readTimeline(canvas);
    assert(active?.active, 'Timeline did not remain active for the initial 200ms sample');
    assert(active.frames > firstActive.frames, 'R3F did not advance during the active sample');

    setSyntheticVisibility('hidden');
    await waitFor(
      () => {
        const timeline = readTimeline(canvas);
        return timeline && !timeline.active ? timeline : null;
      },
      'SceneCanvas to stop after synthetic visibilitychange',
    );
    // Let the visibility React commit consume any frame already scheduled when
    // the event was dispatched; only the following 1200ms is the hidden sample.
    await wait(80);
    const hiddenStart = readTimeline(canvas);
    await wait(1200);
    const hiddenEnd = readTimeline(canvas);
    assert(hiddenStart && hiddenEnd, 'Timeline telemetry disappeared while hidden');
    assert(hiddenStart.frames === hiddenEnd.frames, 'R3F frames advanced while frameloop was hidden');
    assert(hiddenStart.elapsed === hiddenEnd.elapsed, 'Active scene time advanced while hidden');

    setSyntheticVisibility('visible');
    await waitFor(
      () => {
        const timeline = readTimeline(canvas);
        return timeline?.active ? timeline : null;
      },
      'SceneCanvas to resume after synthetic visibilitychange',
    );
    await wait(200);
    const resumed = readTimeline(canvas);
    assert(resumed?.active, 'Timeline did not resume');
    const resumedElapsedDelta = resumed.elapsed - hiddenEnd.elapsed;
    assert(resumed.frames > hiddenEnd.frames, 'R3F did not render after resume');
    assert(resumedElapsedDelta > 0, 'Active scene time did not resume');
    assert(resumedElapsedDelta < 0.5, `Hidden interval leaked into scene time (${resumedElapsedDelta}s)`);

    return {
      status: 'PASS',
      check: 'synthetic visibility event + real R3F frame loop',
      syntheticVisibilityOverride: true,
      active,
      hidden: { start: hiddenStart, end: hiddenEnd },
      resumed: { timeline: resumed, elapsedDelta: resumedElapsedDelta },
    };
  } finally {
    if (root) root.unmount();
    if (originalVisibilityDescriptor) {
      Object.defineProperty(document, 'visibilityState', originalVisibilityDescriptor);
    } else {
      delete document.visibilityState;
    }
  }
}
