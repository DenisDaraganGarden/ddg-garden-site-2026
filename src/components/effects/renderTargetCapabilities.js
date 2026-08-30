// Runtime framebuffer capability detection.
//
// Extension strings are only hints: several mobile WebViews advertise a format
// but reject the framebuffer once colour and depth attachments are combined.
// The small probes below ask the GPU exactly the question the scene needs and
// cache the result for the lifetime of that renderer/context.

const capabilityCache = new WeakMap();
const PROBE_SIZE = 4;

function getContext(rendererOrContext) {
  if (rendererOrContext && typeof rendererOrContext.getContext === 'function') {
    return rendererOrContext.getContext();
  }
  return rendererOrContext ?? null;
}

function isWebGl2(gl) {
  return Boolean(
    gl
    && typeof gl.texStorage2D === 'function'
    && typeof gl.drawBuffers === 'function',
  );
}

export function isSoftwareRendererName(rendererName = '') {
  return /swiftshader|llvmpipe|software rasterizer|mesa offscreen/i.test(String(rendererName));
}

function readRendererName(gl) {
  try {
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const unmasked = debugInfo
      ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      : '';
    return `${unmasked ?? ''} ${gl.getParameter(gl.RENDERER) ?? ''}`.trim();
  } catch {
    return '';
  }
}

function getHalfFloatType(gl, webgl2) {
  if (webgl2) return gl.HALF_FLOAT;
  return gl.getExtension('OES_texture_half_float')?.HALF_FLOAT_OES ?? null;
}

function getDepthTextureSupport(gl, webgl2) {
  return webgl2 || Boolean(gl.getExtension('WEBGL_depth_texture'));
}

function createColorAttachment(gl, type) {
  const texture = gl.createTexture();
  if (!texture) return null;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const webgl2 = isWebGl2(gl);
  if (type === 'half-float' && webgl2) {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA16F,
      PROBE_SIZE,
      PROBE_SIZE,
      0,
      gl.RGBA,
      gl.HALF_FLOAT,
      null,
    );
  } else {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      PROBE_SIZE,
      PROBE_SIZE,
      0,
      gl.RGBA,
      type === 'half-float' ? getHalfFloatType(gl, false) : gl.UNSIGNED_BYTE,
      null,
    );
  }

  return texture;
}

function createDepthTexture(gl) {
  const texture = gl.createTexture();
  if (!texture) return null;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  if (isWebGl2(gl)) {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.DEPTH_COMPONENT24,
      PROBE_SIZE,
      PROBE_SIZE,
      0,
      gl.DEPTH_COMPONENT,
      gl.UNSIGNED_INT,
      null,
    );
  } else {
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.DEPTH_COMPONENT,
      PROBE_SIZE,
      PROBE_SIZE,
      0,
      gl.DEPTH_COMPONENT,
      gl.UNSIGNED_INT,
      null,
    );
  }

  return texture;
}

function createDepthStencilTexture(gl) {
  const texture = gl.createTexture();
  if (!texture) return null;

  const webgl2 = isWebGl2(gl);
  const depthTextureExtension = webgl2 ? null : gl.getExtension('WEBGL_depth_texture');
  const packedDepthStencilExtension = webgl2 ? null : gl.getExtension('OES_packed_depth_stencil');
  if (!webgl2 && (!depthTextureExtension || !packedDepthStencilExtension)) {
    gl.deleteTexture(texture);
    return null;
  }

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    webgl2 ? gl.DEPTH24_STENCIL8 : gl.DEPTH_STENCIL,
    PROBE_SIZE,
    PROBE_SIZE,
    0,
    gl.DEPTH_STENCIL,
    webgl2 ? gl.UNSIGNED_INT_24_8 : depthTextureExtension.UNSIGNED_INT_24_8_WEBGL,
    null,
  );
  return texture;
}

function createDepthRenderbuffer(gl, depthStencil) {
  const buffer = gl.createRenderbuffer();
  if (!buffer) return null;

  gl.bindRenderbuffer(gl.RENDERBUFFER, buffer);
  if (depthStencil) {
    if (!isWebGl2(gl) && !gl.getExtension('OES_packed_depth_stencil')) {
      gl.deleteRenderbuffer(buffer);
      return null;
    }
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_STENCIL, PROBE_SIZE, PROBE_SIZE);
  } else {
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, PROBE_SIZE, PROBE_SIZE);
  }
  return buffer;
}

function disposeProbeAttachments(gl, { color, depthTexture, depthBuffer, framebuffer }) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  if (color) gl.deleteTexture(color);
  if (depthTexture) gl.deleteTexture(depthTexture);
  if (depthBuffer) gl.deleteRenderbuffer(depthBuffer);
  if (framebuffer) gl.deleteFramebuffer(framebuffer);
}

function probeFramebuffer(gl, { colorType, depthMode = 'none', depthStencil = false }) {
  const framebuffer = gl.createFramebuffer();
  const halfFloatType = colorType === 'half-float' ? getHalfFloatType(gl, isWebGl2(gl)) : null;
  if (!framebuffer) return false;
  if (colorType === 'half-float' && !halfFloatType) {
    gl.deleteFramebuffer(framebuffer);
    return false;
  }

  let color = null;
  let depthTexture = null;
  let depthBuffer = null;
  try {
    color = createColorAttachment(gl, colorType);
    if (!color) return false;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, color, 0);

    if (depthMode === 'texture') {
      if (!getDepthTextureSupport(gl, isWebGl2(gl))) return false;
      depthTexture = createDepthTexture(gl);
      if (!depthTexture) return false;
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);
    } else if (depthMode === 'depth-stencil-texture') {
      depthTexture = createDepthStencilTexture(gl);
      if (!depthTexture) return false;
      gl.framebufferTexture2D(
        gl.FRAMEBUFFER,
        gl.DEPTH_STENCIL_ATTACHMENT,
        gl.TEXTURE_2D,
        depthTexture,
        0,
      );
    } else if (depthMode === 'renderbuffer') {
      depthBuffer = createDepthRenderbuffer(gl, depthStencil);
      if (!depthBuffer) return false;
      gl.framebufferRenderbuffer(
        gl.FRAMEBUFFER,
        depthStencil ? gl.DEPTH_STENCIL_ATTACHMENT : gl.DEPTH_ATTACHMENT,
        gl.RENDERBUFFER,
        depthBuffer,
      );
    }

    return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
  } catch {
    return false;
  } finally {
    disposeProbeAttachments(gl, { color, depthTexture, depthBuffer, framebuffer });
  }
}

export function selectOpticsTarget(probes) {
  // Sampled scene depth has the largest visible impact at the waterline. Keep
  // half-float when it can also expose depth, but prefer RGBA8 + depth texture
  // over half-float + an unsampleable renderbuffer on stricter WebViews.
  for (const colorType of ['half-float', 'rgba8']) {
    const color = probes[colorType];
    if (!color) continue;
    if (color.depthTexture) return { colorType, depthMode: 'texture' };
  }
  for (const colorType of ['half-float', 'rgba8']) {
    const color = probes[colorType];
    if (!color) continue;
    if (color.depthRenderbuffer) return { colorType, depthMode: 'renderbuffer' };
  }
  return { colorType: 'rgba8', depthMode: 'none' };
}

export function formatRenderTargetCapabilities(capabilities) {
  const post = capabilities.post.halfFloatDepthStencil
    ? 'RGBA16F + D24S8'
    : capabilities.post.rgba8DepthStencil
      ? 'RGBA8 + D24S8'
      : 'disabled';
  const opticsFormat = capabilities.optics.colorType === 'half-float' ? 'RGBA16F' : 'RGBA8';
  const opticsDepth = capabilities.optics.depthMode === 'texture'
    ? 'depth texture'
    : capabilities.optics.depthMode === 'renderbuffer'
      ? 'depth buffer'
      : 'analytic depth';
  return `post: ${post}; optics: ${opticsFormat} + ${opticsDepth}`;
}

export function probeRenderTargetCapabilities(rendererOrContext) {
  const renderer = rendererOrContext && typeof rendererOrContext.getContext === 'function'
    ? rendererOrContext
    : null;
  const gl = getContext(rendererOrContext);
  if (!gl || typeof gl.createFramebuffer !== 'function') {
    const unsupported = {
      post: { halfFloatDepthStencil: false, rgba8DepthStencil: false },
      optics: { colorType: 'rgba8', depthMode: 'none' },
      webgl2: false,
      softwareRenderer: false,
    };
    return { ...unsupported, label: formatRenderTargetCapabilities(unsupported) };
  }

  const halfFloatDepthStencil = probeFramebuffer(gl, {
    colorType: 'half-float',
    depthMode: 'depth-stencil-texture',
  });
  const rgba8DepthStencil = probeFramebuffer(gl, {
    colorType: 'rgba8',
    depthMode: 'depth-stencil-texture',
  });
  const opticsProbes = {
    'half-float': {
      depthTexture: probeFramebuffer(gl, { colorType: 'half-float', depthMode: 'texture' }),
      depthRenderbuffer: probeFramebuffer(gl, { colorType: 'half-float', depthMode: 'renderbuffer' }),
    },
    rgba8: {
      depthTexture: probeFramebuffer(gl, { colorType: 'rgba8', depthMode: 'texture' }),
      depthRenderbuffer: probeFramebuffer(gl, { colorType: 'rgba8', depthMode: 'renderbuffer' }),
    },
  };
  const capabilities = {
    post: { halfFloatDepthStencil, rgba8DepthStencil },
    optics: selectOpticsTarget(opticsProbes),
    webgl2: isWebGl2(gl),
    softwareRenderer: isSoftwareRendererName(readRendererName(gl)),
  };
  // The probes intentionally touch raw bindings. Reset Three's binding cache so
  // its first real frame cannot inherit a stale texture/framebuffer assumption.
  renderer?.resetState?.();
  return { ...capabilities, label: formatRenderTargetCapabilities(capabilities) };
}

// This getter deliberately probes once per renderer. A renderer owns its WebGL
// context, so a WeakMap avoids both repeat FBO allocations and stale global GPU
// assumptions after a canvas is recreated on orientation change.
export function getRenderTargetCapabilities(rendererOrContext) {
  const cacheKey = rendererOrContext && typeof rendererOrContext === 'object'
    ? rendererOrContext
    : getContext(rendererOrContext);
  if (!cacheKey || typeof cacheKey !== 'object') {
    return probeRenderTargetCapabilities(rendererOrContext);
  }

  const cached = capabilityCache.get(cacheKey);
  if (cached) return cached;
  const capabilities = probeRenderTargetCapabilities(rendererOrContext);
  capabilityCache.set(cacheKey, capabilities);
  return capabilities;
}
