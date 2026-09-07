// A shell-sand ridge with two shores, unioned with the existing height field.
// The centreline is in metre-space (u, s); it never moves the mainland bluff.
// The same tapered segments are uploaded to GLSL for water and ground queries.
export const SPIT_SEGMENTS = 20;
const clamp = n => Math.max(0, Math.min(1, n));
const smooth = (a, b, n) => { const t = clamp((n - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;

export function createSpitDefinition(p, shoreAt) {
  const nodes = [], length = p.terrainSpitLength, bend = p.terrainSpitBend;
  const root = p.terrainSpitPosition, start = Math.min(6, p.terrainBeachWidth * .4);
  let arc = 0;
  for (let i = 0; i <= SPIT_SEGMENTS; i++) {
    const t = i / SPIT_SEGMENTS, a = 1 - t;
    // The last control point turns back slightly: a recurved distal hook.
    const q = start * a * a * a - length * (3 * a * a * t * .24 + 3 * a * t * t * 1.18 + t * t * t * .92);
    const s = root + length * bend * (3 * a * t * t * .08 + t * t * t * .68);
    const u = shoreAt(root, p) + q;
    const width = p.terrainSpitWidth * .5 * (1 + .7 * Math.exp(-t * 10)) * (1 - .96 * smooth(.48, 1, t));
    const height = p.terrainSpitHeight * (1 - .86 * smooth(.62, 1, t));
    if (nodes.length) arc += Math.hypot(u - nodes[i - 1].u, s - nodes[i - 1].s);
    nodes.push({ u, s, width, height, arc });
  }
  const pad = p.terrainSpitWidth + p.terrainSpitShoal;
  const bounds = { minU: Math.min(...nodes.map(n => n.u)) - pad, maxU: Math.max(...nodes.map(n => n.u)) + pad,
    minS: Math.min(...nodes.map(n => n.s)) - pad, maxS: Math.max(...nodes.map(n => n.s)) + pad };
  // Account for the original curved shore when choosing a straight strip edge.
  const offshore = Math.ceil((p.terrainSpitLength * 1.06 + pad + p.terrainCurve * 3 + p.terrainCapeDepth) / 32) * 32;
  return { nodes, bounds, length: arc, offshore };
}

export function sampleSpit(u, s, p) {
  if (!p.terrainSpitEnabled || !p.terrainEnabled) return null;
  const { nodes, bounds } = p.spit;
  if (u < bounds.minU || u > bounds.maxU || s < bounds.minS || s > bounds.maxS) return null;
  let result = null, best = -Infinity;
  for (let i = 0; i < SPIT_SEGMENTS; i++) {
    const a = nodes[i], b = nodes[i + 1], du = b.u - a.u, ds = b.s - a.s;
    const t = clamp(((u - a.u) * du + (s - a.s) * ds) / Math.max(du * du + ds * ds, .0001));
    const dx = u - mix(a.u, b.u, t), dz = s - mix(a.s, b.s, t);
    const edge = mix(a.width, b.width, t) - Math.hypot(dx, dz);
    if (edge > best) {
      best = edge;
      result = { edge, width: mix(a.width, b.width, t), height: mix(a.height, b.height, t),
        shoreU: mix(a.u,b.u,t)+dx/Math.max(.001,Math.hypot(dx,dz))*mix(a.width,b.width,t),
        shoreS: mix(a.s,b.s,t)+dz/Math.max(.001,Math.hypot(dx,dz))*mix(a.width,b.width,t),
        along: mix(a.arc, b.arc, t), side: du * dz - ds * dx >= 0 ? 1 : -1 };
    }
  }
  return result;
}

export function spitHeight(base, spit, coverage, p) {
  if (!spit || spit.edge <= -p.terrainSpitShoal) return base;
  const shoal = p.terrainSpitShoal, edge = spit.edge;
  const ridge = spit.height * smooth(0, Math.max(1, spit.width * .72), edge);
  const relief = Math.sin(spit.along * .12) * .035 * p.terrainRelief * smooth(.5, 3, edge);
  const shelf = -p.waterDepth * (1 - Math.exp(Math.min(edge, 0) / Math.max(4, shoal * .3)));
  const weight = smooth(-shoal, -shoal * .6, edge) * coverage;
  return mix(base, Math.max(base, ridge + relief + shelf), weight);
}

export const spitShader = /* glsl */`
uniform vec4 uCoastSpit;
uniform vec4 uCoastSpitBounds;
uniform vec4 uCoastSpitNodes[${SPIT_SEGMENTS + 1}];
// edge: signed distance inside the sand; y/z/w: half width, crest, arc length.
vec4 coastSpit(vec2 qs) {
 if(uCoastSpit.x<.5 || uCoastShape.x<.5)return vec4(-1e6,1.0,0.0,0.0);
 vec2 at=vec2(qs.x+coastShore(qs.y),qs.y);
 if(at.x<uCoastSpitBounds.x || at.x>uCoastSpitBounds.y || at.y<uCoastSpitBounds.z || at.y>uCoastSpitBounds.w)return vec4(-1e6,1.0,0.0,0.0);
 vec4 result=vec4(-1e6,1.0,0.0,0.0);float arc=0.0;
 for(int i=0;i<${SPIT_SEGMENTS};i++){
  vec4 a=uCoastSpitNodes[i],b=uCoastSpitNodes[i+1];vec2 delta=b.xy-a.xy;
  float t=clamp(dot(at-a.xy,delta)/max(dot(delta,delta),.0001),0.0,1.0);
  float edge=mix(a.z,b.z,t)-length(at-mix(a.xy,b.xy,t));
  float segment=length(delta);
  if(edge>result.x)result=vec4(edge,mix(a.z,b.z,t),mix(a.w,b.w,t),arc+segment*t);
  arc+=segment;
 }
 return result;
}
float coastSpitHeight(float base,vec2 qs,float coverage) {
 vec4 spit=coastSpit(qs);float edge=spit.x,shoal=uCoastSpit.y;
 if(edge<=-shoal)return base;
 float ridge=spit.z*smoothstep(0.0,max(1.0,spit.y*.72),edge);
 float relief=sin(spit.w*.12)*.035*uCoastSurface.z*smoothstep(.5,3.0,edge);
 float shelf=-uCoastSurface.y*(1.0-exp(min(edge,0.0)/max(4.0,shoal*.3)));
 float weight=smoothstep(-shoal,-shoal*.6,edge)*coverage;
 return mix(base,max(base,ridge+relief+shelf),weight);
}
// Only the wave frame changes to the nearest shore. Coverage, geology and
// the mainland frame keep their original coordinates.
vec2 coastSurfLocal(vec2 qs) {
 vec4 spit=coastSpit(qs);
 return spit.x>qs.x?vec2(spit.x,spit.w+uCoastSpit.z):qs;
}
`;
