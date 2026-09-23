// The ripple's two slices as planes through the periodic noise volume: the
// in-plane axes the world x and z map to, and the normal the drift pushes
// along (every component of it well away from zero, so no world direction
// returns to a whole tile). One table for the GLSL in waterShading.js and for
// waterRipple.check.js.
export const RIPPLE_PLANES = Object.freeze([
  Object.freeze([[[0.6267, 0.7405, -0.2425], 'a.x'], [[-0.5812, 0.2370, -0.7785], 'a.y'], [[-0.5190, 0.6288, 0.5789], 'drift']]),
  Object.freeze([[[0.2552, -0.8177, 0.5159], 'b.x'], [[0.7500, -0.1693, -0.6394], 'b.y'], [[0.6102, 0.5501, 0.5701], 'drift']]),
]);
