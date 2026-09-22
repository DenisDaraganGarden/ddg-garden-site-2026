// The moon and the stars, once, for every sky that draws them: the analytic
// dome (SkyDome), the painterly cloud pass and its water atlas.
//
// The moon is a lit sphere, not a disc with a brightness: the pixel ray is
// projected onto the sphere seen at the moon's direction, and the surface
// normal there is shaded by the sun's direction. The phase therefore falls out
// of the same sun and moon positions the light solver already uses, and the
// terminator faces the sun by construction.
export const celestialShaderChunk = /* glsl */`
  uniform vec3 uMoonDirection;
  uniform vec3 uMoonSunDirection;
  uniform vec3 uMoonRadiance;
  uniform float uMoonCosRadius;
  uniform vec3 uStarAxis;
  uniform float uStarRotation;
  uniform float uStars;
  uniform float uNight;

  vec3 moonBody(vec3 ray) {
    float c = dot(ray, uMoonDirection);
    float aa = max(fwidth(c), 1e-5);
    float disc = smoothstep(uMoonCosRadius - aa, uMoonCosRadius + aa, c);
    float sinR = sqrt(max(1.0 - uMoonCosRadius * uMoonCosRadius, 1e-12));
    vec3 tangent = (ray - uMoonDirection * c) / sinR;
    float u2 = min(dot(tangent, tangent), 1.0);
    // Sphere normal at the seen point; at the centre it faces the viewer.
    vec3 n = normalize(tangent - uMoonDirection * sqrt(1.0 - u2));
    float lit = max(dot(n, uMoonSunDirection), 0.0);
    // A little earthshine keeps the dark limb legible against a black sky.
    return uMoonRadiance * disc * (lit + 0.025);
  }

  float starHash(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yzx + 33.33);
    return fract((p.x + p.y) * p.z);
  }

  vec3 rotateAboutAxis(vec3 v, vec3 axis, float angle) {
    float s = sin(angle);
    float c = cos(angle);
    return v * c + cross(axis, v) * s + axis * dot(axis, v) * (1.0 - c);
  }

  // One star per cell of a cube-face grid over the rotated ray, so the density
  // is even near the poles. Brightness follows a steep power law: a few bright
  // stars over a dust of faint ones. The point stays about a pixel wide at any
  // zoom because its radius is measured from the ray's screen derivative.
  vec3 starField(vec3 ray) {
    if (uStars <= 0.0005 || uNight <= 0.0005) return vec3(0.0);
    vec3 r = rotateAboutAxis(ray, uStarAxis, -uStarRotation);
    vec3 a = abs(r);
    vec2 uv;
    float face;
    if (a.x >= a.y && a.x >= a.z) { uv = r.yz / a.x; face = r.x > 0.0 ? 0.0 : 1.0; }
    else if (a.y >= a.z) { uv = r.xz / a.y; face = r.y > 0.0 ? 2.0 : 3.0; }
    else { uv = r.xy / a.z; face = r.z > 0.0 ? 4.0 : 5.0; }
    const float N = 96.0;
    vec2 g = uv * N;
    vec2 cell = floor(g);
    vec3 seed = vec3(cell, face * 7.0);
    float h = starHash(seed);
    vec2 centre = vec2(starHash(seed + 11.0), starHash(seed + 29.0)) * 0.7 + 0.15;
    float px = length(fwidth(r)) * N * 0.75;
    float radius = max(px, 0.012);
    float d = length(g - cell - centre);
    float star = 1.0 - smoothstep(radius * 0.35, radius, d);
    float magnitude = pow(h, 9.0) * 0.55;
    vec3 tint = mix(vec3(1.0, 0.86, 0.72), vec3(0.78, 0.86, 1.0), starHash(seed + 41.0));
    float gate = uNight * uNight;
    return tint * star * magnitude * uStars * gate;
  }
`;
