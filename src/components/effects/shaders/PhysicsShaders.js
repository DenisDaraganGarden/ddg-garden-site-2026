export const PhysicsShaders = {
  heightmapFragment: `
    #include <common>

    uniform sampler2D uHeightmap;
    uniform vec2 uResolution;
    uniform vec2 uMousePos;
    uniform float uMouseSize;
    uniform float uViscosity;
    uniform float uTime;

    void main() {
      vec2 cellSize = 1.0 / uResolution.xy;
      vec2 uv = gl_FragCoord.xy * cellSize;

      // Get neighbors
      vec4 heightmapValue = texture2D(uHeightmap, uv);
      vec4 heightmapValueWest = texture2D(uHeightmap, uv + vec2(-cellSize.x, 0.0));
      vec4 heightmapValueEast = texture2D(uHeightmap, uv + vec2(cellSize.x, 0.0));
      vec4 heightmapValueNorth = texture2D(uHeightmap, uv + vec2(0.0, cellSize.y));
      vec4 heightmapValueSouth = texture2D(uHeightmap, uv + vec2(0.0, -cellSize.y));

      // Wave propagation
      float h = heightmapValue.x;
      float v = heightmapValue.y;
      
      float average = (heightmapValueWest.x + heightmapValueEast.x + heightmapValueNorth.x + heightmapValueSouth.x) * 0.25;
      
      // Update velocity
      v += (average - h) * 2.0;
      v *= uViscosity;
      
      // Update height
      h += v;

      // Mouse interaction
      float d = distance(uv, uMousePos);
      if (d < uMouseSize) {
        h += (uMouseSize - d) * 2.0;
      }

      gl_FragColor = vec4(h, v, 0.0, 1.0);
    }
  `
};
