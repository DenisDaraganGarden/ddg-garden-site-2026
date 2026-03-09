import React, { Component, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useLanguage } from '../../i18n/LanguageProvider';

let webglSupportCache;

function detectWebGLSupport() {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return true;
  }

  if (typeof webglSupportCache === 'boolean') {
    return webglSupportCache;
  }

  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('webgl2')
      || canvas.getContext('webgl')
      || canvas.getContext('experimental-webgl');
    webglSupportCache = Boolean(context);
  } catch {
    webglSupportCache = false;
  }

  return webglSupportCache;
}

function getCanvasProfile(mode) {
  if (typeof window === 'undefined') {
    return {
      maxDpr: 1.5,
      antialias: true,
      powerPreference: 'high-performance',
    };
  }

  const isEditor = mode === 'editor';
  const isMobileViewport = window.innerWidth < 768;

  return {
    maxDpr: isEditor
      ? (isMobileViewport ? 1.5 : 2)
      : (isMobileViewport ? 1.25 : 1.75),
    antialias: !isMobileViewport,
    powerPreference: isEditor ? 'high-performance' : 'default',
  };
}

class SceneCanvasErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    this.props.onError?.(error);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }

    return this.props.children;
  }
}

const SceneFallback = ({ title, body, testId }) => (
  <div className="scene-fallback" data-testid={testId}>
    <h2>{title}</h2>
    <p>{body}</p>
  </div>
);

const RuntimeDiagnostics = ({ sceneId, mode, settings }) => {
  const { gl, scene } = useThree();
  const lastWriteRef = useRef(0);

  useFrame(() => {
    if (!import.meta.env.DEV || typeof window === 'undefined') {
      return;
    }

    const now = performance.now();
    if (now - lastWriteRef.current < 300) {
      return;
    }

    lastWriteRef.current = now;
    const runtimeRoot = window.__DDG_RUNTIME_METRICS__ ?? {};
    const nextSettings = settings
      ? {
          planeMeshDensity: settings.planeMeshDensity,
          cameraFov: settings.cameraFov,
          planeTrailSpan: settings.planeTrailSpan,
          planeTrailPersistence: settings.planeTrailPersistence,
          planeAlbedo: settings.planeAlbedo,
        }
      : null;

    window.__DDG_RUNTIME_METRICS__ = {
      ...runtimeRoot,
      [sceneId]: {
        mode,
        timestamp: now,
        renderer: {
          geometries: gl.info.memory.geometries,
          textures: gl.info.memory.textures,
          programs: gl.info.programs?.length ?? 0,
          calls: gl.info.render.calls,
          triangles: gl.info.render.triangles,
          points: gl.info.render.points,
          lines: gl.info.render.lines,
        },
        sceneChildren: scene.children.length,
        settings: nextSettings,
      },
    };
  });

  useEffect(() => () => {
    if (!import.meta.env.DEV || typeof window === 'undefined' || !window.__DDG_RUNTIME_METRICS__) {
      return;
    }

    delete window.__DDG_RUNTIME_METRICS__[sceneId];
  }, [sceneId]);

  return null;
};

const SceneCanvas = ({
  sceneId,
  mode = 'public',
  className = '',
  camera,
  children,
  testId,
  fallbackTestId,
  settings,
  style,
}) => {
  const { t } = useLanguage();
  const [runtimeError, setRuntimeError] = useState(false);
  const supportsWebgl = useMemo(() => detectWebGLSupport(), []);
  const [profile, setProfile] = useState(() => getCanvasProfile(mode));
  const fallback = (
    <SceneFallback
      title={t('app.webglTitle')}
      body={t(mode === 'editor' ? 'app.webglEditorBody' : 'app.webglBody')}
      testId={fallbackTestId ?? `${sceneId}-fallback`}
    />
  );

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const syncProfile = () => {
      setProfile(getCanvasProfile(mode));
    };

    syncProfile();
    window.addEventListener('resize', syncProfile);
    return () => window.removeEventListener('resize', syncProfile);
  }, [mode]);

  if (!supportsWebgl || runtimeError) {
    return fallback;
  }

  return (
    <SceneCanvasErrorBoundary
      fallback={fallback}
      onError={() => setRuntimeError(true)}
    >
      <div
        className={className}
        data-testid={testId}
        style={{ width: '100%', height: '100%', ...style }}
      >
        <Canvas
          shadows
          dpr={[1, profile.maxDpr]}
          camera={camera}
          gl={{
            alpha: true,
            antialias: profile.antialias,
            powerPreference: profile.powerPreference,
          }}
        >
          {children}
          {import.meta.env.DEV ? (
            <RuntimeDiagnostics
              sceneId={sceneId}
              mode={mode}
              settings={settings}
            />
          ) : null}
        </Canvas>
      </div>
    </SceneCanvasErrorBoundary>
  );
};

export default SceneCanvas;
