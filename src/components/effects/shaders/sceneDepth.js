// All world ShaderMaterials must use the renderer's depth encoding. Fullscreen
// simulation/post passes and the sky keep their explicit screen-space depth.
export function sceneDepthVertex(shader) {
  const end=shader.lastIndexOf('}');
  return '#include <logdepthbuf_pars_vertex>\n'+shader.slice(0,end)+`
#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
  vFragDepth = 1.0 + gl_Position.w;
  vIsPerspective = float(projectionMatrix[2][3] == -1.0);
#endif
`+shader.slice(end);
}
export function sceneDepthFragment(shader) {
  return '#include <logdepthbuf_pars_fragment>\n'+shader.replace(/void main\(\)\s*\{/, 'void main() {\n#include <logdepthbuf_fragment>\n');
}
