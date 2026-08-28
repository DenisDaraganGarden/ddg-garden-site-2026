import React, { Component, useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { useLanguage } from '../../i18n/useLanguage';

let webglSupportCache;
const SHADOWS_CONFIG = { type: THREE.PCFShadowMap };

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
      maxDpr: 1.3,
      antialias: true,
      powerPreference: 'default',
    };
  }

  const isEditor = mode === 'editor';
  const isMobileViewport = window.innerWidth < 768;
  const isTouchPrimary = typeof window.matchMedia === 'function'
    && window.matchMedia('(hover: none) and (pointer: coarse)').matches;
  const hasNavigator = typeof navigator !== 'undefined';
  const deviceMemory = hasNavigator && typeof navigator.deviceMemory === 'number'
    ? navigator.deviceMemory
    : null;
  const hardwareConcurrency = hasNavigator && typeof navigator.hardwareConcurrency === 'number'
    ? navigator.hardwareConcurrency
    : null;
  const isLowPowerDevice = isMobileViewport
    || isTouchPrimary
    || (deviceMemory !== null && deviceMemory <= 4)
    || (hardwareConcurrency !== null && hardwareConcurrency <= 4);

  return {
    // The editor covers almost the whole viewport. Supersampling it at 1.5x meant
    // shading roughly 5.6 million pixels every frame on a 1440p-class window.
    // Keep modest supersampling on the public scene, while favoring responsive
    // controls in the editor.
    minDpr: 1,
    maxDpr: isEditor
      ? (isLowPowerDevice ? 1 : 1.25)
      : (isLowPowerDevice ? 1 : 1.5),
    antialias: !isLowPowerDevice,
    powerPreference: isLowPowerDevice ? 'low-power' : 'high-performance',
  };
}

function isDocumentVisible() {
  if (typeof document === 'undefined') {
    return true;
  }

  return document.visibilityState === 'visible';
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
  const { camera, gl, scene } = useThree();
  const lastWriteRef = useRef(0);
  const frameTimesRef = useRef([]);
  const gpuInfoRef = useRef(null);

  useFrame((_, delta) => {
    if (!import.meta.env.DEV || typeof window === 'undefined') {
      return;
    }

    const frameTimes = frameTimesRef.current;
    frameTimes.push(Math.min(delta * 1000, 1000));
    if (frameTimes.length > 240) {
      frameTimes.shift();
    }

    const now = performance.now();
    if (now - lastWriteRef.current < 1000) {
      return;
    }

    lastWriteRef.current = now;
    const sortedFrameTimes = [...frameTimes].sort((left, right) => left - right);
    const averageFrameMs = frameTimes.length > 0
      ? frameTimes.reduce((total, value) => total + value, 0) / frameTimes.length
      : 0;
    const percentile = (ratio) => (
      sortedFrameTimes.length > 0
        ? sortedFrameTimes[Math.min(sortedFrameTimes.length - 1, Math.floor(sortedFrameTimes.length * ratio))]
        : 0
    );

    if (!gpuInfoRef.current) {
      const context = gl.getContext();
      const debugRendererInfo = context.getExtension('WEBGL_debug_renderer_info');
      gpuInfoRef.current = {
        vendor: debugRendererInfo
          ? context.getParameter(debugRendererInfo.UNMASKED_VENDOR_WEBGL)
          : context.getParameter(context.VENDOR),
        renderer: debugRendererInfo
          ? context.getParameter(debugRendererInfo.UNMASKED_RENDERER_WEBGL)
          : context.getParameter(context.RENDERER),
        maxTextureSize: context.getParameter(context.MAX_TEXTURE_SIZE),
      };
    }

    const runtimeRoot = window.__DDG_RUNTIME_METRICS__ ?? {};
    const browserMemory = performance.memory;
    const canvasDataset = gl.domElement.dataset;
    const nextSettings = settings
      ? {
          simulationResolution: settings.simulationResolution,
          waterMeshDensity: settings.waterMeshDensity,
          cameraFov: settings.cameraFov,
          waveAmplitude: settings.waveAmplitude,
          waveLength: settings.waveLength,
          waterDepthMeters: settings.waterDepthMeters,
          debugView: settings.debugView,
        }
      : null;

    const runtimeMetrics = {
      mode,
      timestamp: now,
      performance: {
        fps: averageFrameMs > 0 ? 1000 / averageFrameMs : 0,
        averageFrameMs,
        p95FrameMs: percentile(0.95),
        p99FrameMs: percentile(0.99),
        longFramesOver50Ms: frameTimes.filter((value) => value > 50).length,
        sampleSize: frameTimes.length,
      },
      memory: typeof browserMemory?.usedJSHeapSize === 'number'
        ? { jsHeapUsedBytes: browserMemory.usedJSHeapSize }
        : null,
      drawingBuffer: {
        width: gl.domElement.width,
        height: gl.domElement.height,
        pixelRatio: gl.getPixelRatio(),
      },
      gpu: gpuInfoRef.current,
      renderer: {
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        programs: gl.info.programs?.length ?? 0,
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        points: gl.info.render.points,
        lines: gl.info.render.lines,
      },
      runtime: {
        waterEngine: canvasDataset.ddgWaterEngine ?? null,
        simulationRequested: canvasDataset.ddgSimulationRequested ?? null,
        simulationEffective: canvasDataset.ddgSimulationEffective ?? null,
        refraction: canvasDataset.ddgRefractionMode
          ?? canvasDataset.ddgRefraction
          ?? canvasDataset.ddgRefractionActive
          ?? null,
      },
      sceneChildren: scene.children.length,
      camera: {
        position: {
          x: camera.position.x,
          y: camera.position.y,
          z: camera.position.z,
        },
        rotation: {
          x: camera.rotation.x,
          y: camera.rotation.y,
          z: camera.rotation.z,
        },
      },
      childTypes: scene.children.map((child) => ({
        name: child.name || child.type,
        type: child.type,
        visible: child.visible,
      })),
      settings: nextSettings,
    };

    window.__DDG_RUNTIME_METRICS__ = {
      ...runtimeRoot,
      [sceneId]: runtimeMetrics,
    };

    gl.domElement.dataset.ddgRuntimeMetrics = JSON.stringify(runtimeMetrics);
  });

  useEffect(() => () => {
    if (!import.meta.env.DEV || typeof window === 'undefined' || !window.__DDG_RUNTIME_METRICS__) {
      return;
    }

    delete window.__DDG_RUNTIME_METRICS__[sceneId];
  }, [sceneId]);

  return null;
};

const formatMetric = (value, digits = 0) => (
  typeof value === 'number' && Number.isFinite(value)
    ? value.toFixed(digits)
    : '—'
);

const PerformanceHud = ({ sceneId, enabled }) => {
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') {
      setMetrics(null);
      return undefined;
    }

    const syncMetrics = () => {
      setMetrics(window.__DDG_RUNTIME_METRICS__?.[sceneId] ?? null);
    };

    syncMetrics();
    const intervalId = window.setInterval(syncMetrics, 500);
    return () => window.clearInterval(intervalId);
  }, [enabled, sceneId]);

  if (!enabled || !metrics) {
    return null;
  }

  const jsHeapMegabytes = metrics.memory?.jsHeapUsedBytes
    ? metrics.memory.jsHeapUsedBytes / (1024 * 1024)
    : null;
  const runtimeEntries = [
    ['sim', [metrics.runtime?.simulationRequested, metrics.runtime?.simulationEffective]
      .filter(Boolean)
      .join('→')],
    ['refract', metrics.runtime?.refraction],
  ].filter(([, value]) => value);

  return (
    <aside
      aria-label="Performance diagnostics"
      data-testid={`${sceneId}-performance-hud`}
      style={{
        position: 'absolute',
        top: 12,
        right: 12,
        zIndex: 20,
        minWidth: 174,
        padding: '9px 10px',
        color: '#edf3f5',
        background: 'rgba(4, 6, 8, 0.78)',
        border: '1px solid rgba(230, 244, 247, 0.24)',
        borderRadius: 5,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: 10,
        lineHeight: 1.5,
        letterSpacing: '0.02em',
        pointerEvents: 'none',
        userSelect: 'none',
      }}
    >
      <div style={{ color: '#aebcc0', marginBottom: 3 }}>PERFORMANCE · DEV</div>
      <div>FPS {formatMetric(metrics.performance?.fps)}</div>
      <div>P95 {formatMetric(metrics.performance?.p95FrameMs, 1)} ms</div>
      <div>HEAP {jsHeapMegabytes === null ? '—' : `${formatMetric(jsHeapMegabytes, 1)} MB`}</div>
      <div>TEX {formatMetric(metrics.renderer?.textures)} · GEO {formatMetric(metrics.renderer?.geometries)}</div>
      <div>PROG {formatMetric(metrics.renderer?.programs)} · TRI {formatMetric(metrics.renderer?.triangles)}</div>
      {runtimeEntries.map(([label, value]) => (
        <div key={label}>{label.toUpperCase()} {value}</div>
      ))}
    </aside>
  );
};

const VisibilityResume = ({ isActive }) => {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    if (!isActive) {
      return;
    }

    invalidate();
  }, [invalidate, isActive]);

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
  const [isTabVisible, setIsTabVisible] = useState(() => isDocumentVisible());
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

  useEffect(() => {
    if (typeof document === 'undefined') {
      return undefined;
    }

    const syncVisibility = () => {
      setIsTabVisible(isDocumentVisible());
    };

    syncVisibility();
    document.addEventListener('visibilitychange', syncVisibility);
    window.addEventListener('pageshow', syncVisibility);
    window.addEventListener('pagehide', syncVisibility);

    return () => {
      document.removeEventListener('visibilitychange', syncVisibility);
      window.removeEventListener('pageshow', syncVisibility);
      window.removeEventListener('pagehide', syncVisibility);
    };
  }, []);

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
        style={{ position: 'relative', width: '100%', height: '100%', ...style }}
      >
        <Canvas
          shadows={SHADOWS_CONFIG}
          frameloop={isTabVisible ? 'always' : 'never'}
          dpr={[profile.minDpr, profile.maxDpr]}
          camera={camera}
          gl={{
            alpha: true,
            antialias: profile.antialias,
            powerPreference: profile.powerPreference,
            // Stencil buffer powers the boat water-cutout (hull cap masks the water surface).
            stencil: true,
          }}
        >
          <VisibilityResume isActive={isTabVisible} />
          {children}
          {import.meta.env.DEV ? (
            <RuntimeDiagnostics
              sceneId={sceneId}
              mode={mode}
              settings={settings}
            />
          ) : null}
        </Canvas>
        <PerformanceHud
          sceneId={sceneId}
          enabled={Boolean(import.meta.env.DEV && settings?.showPerformanceHud)}
        />
      </div>
    </SceneCanvasErrorBoundary>
  );
};

export default SceneCanvas;
