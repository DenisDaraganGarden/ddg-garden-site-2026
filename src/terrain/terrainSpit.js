// A shell-sand ridge with two shores, unioned with the existing height field.
// The centreline is in metre-space (u, s); it never moves the mainland bluff.
// The same tapered segments are uploaded to GLSL for water and ground queries.
export const SPIT_SEGMENTS = 20;
const clamp = n => Math.max(0, Math.min(1, n));
const smooth = (a, b, n) => { const t = clamp((n - a) / (b - a)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a + (b - a) * t;
export const spitRootRadius = width => Math.max(12, Math.min(48, width * 1.2));
export const spitPadding = (width, shoal) => Math.max(width + shoal, width * .85 + spitRootRadius(width) * 1.5);

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
  const pad = spitPadding(p.terrainSpitWidth, p.terrainSpitShoal);
  const bounds = { minU: Math.min(...nodes.map(n => n.u)) - pad, maxU: Math.max(...nodes.map(n => n.u)) + pad,
    minS: Math.min(...nodes.map(n => n.s)) - pad, maxS: Math.max(...nodes.map(n => n.s)) + pad };
  // Account for the original curved shore when choosing a straight strip edge.
  const offshore = Math.ceil((p.terrainSpitLength * 1.06 + pad + p.terrainCurve * 3 + p.terrainCapeDepth) / 32) * 32;
  return { nodes, bounds, length: arc, offshore, rootRadius: spitRootRadius(p.terrainSpitWidth) };
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
        along: mix(a.arc, b.arc, t), side: Math.max(-1, Math.min(1, (du * dz - ds * dx)
          / Math.hypot(du, ds) / Math.max(1, mix(a.width, b.width, t) * .3))) };
    }
  }
  return result;
}

export function spitJoin(q, spit, p) {
  const radius = p.spit.rootRadius;
  const weight = (1 - smooth(radius, radius * 1.5, Math.abs(q)))
    * (1 - smooth(radius, radius * 1.5, Math.abs(spit.edge)))
    * (1 - smooth(radius * 2, radius * 4, spit.along));
  const blend = clamp(.5 + .5 * (spit.edge - q) / radius);
  const edge = mix(q, spit.edge, blend) + radius * blend * (1 - blend);
  return { edge: mix(Math.max(q, spit.edge), edge, weight), blend, weight };
}

export function spitHeight(base, spit, coverage, p, q) {
  if (!spit || spit.edge <= -Math.max(p.terrainSpitShoal, p.spit.rootRadius * 1.5)) return base;
  const shoal = p.terrainSpitShoal, edge = spit.edge;
  const ridge = spit.height * smooth(0, Math.max(1, spit.width * .72), edge);
  const relief = Math.sin(spit.along * .12) * .035 * p.terrainRelief * smooth(.5, 3, edge);
  const tip = smooth(.7, .98, spit.along / p.spit.length);
  const outer = .5 + .5 * spit.side * (p.terrainSpitBend < 0 ? -1 : 1);
  const steep = .5 + .5 * Math.sin(spit.along * .039 + p.terrainSeed * .11);
  // A short submerged shoulder drops to the real surrounding bed. Alternating
  // banks and the terminal scour remove the old broad 1.25 m-deep pedestal.
  const shoulder = Math.max(.8, shoal * mix(.22, .14, outer) * mix(1, .55, steep) * mix(1, .38, tip));
  const shelf = -Math.max(p.waterDepth, -base) * (1 - Math.exp(Math.min(edge, 0) / shoulder));
  const weight = smooth(-shoal, -shoal * .6, edge) * coverage;
  const height = mix(base, Math.max(base, ridge + relief + shelf), weight);
  const join = spitJoin(q, spit, p);
  const root = join.edge > 0 ? spit.height * smooth(0, p.spit.rootRadius * .65, join.edge)
    : -p.waterDepth * (1 - Math.exp(join.edge / 12));
  return mix(height, Math.max(height, root), join.weight * coverage);
}

export const spitShader = /* glsl */`
uniform vec4 uCoastSpit;
uniform vec4 uCoastSpitProfile;
uniform vec4 uCoastSpitBounds;
uniform vec4 uCoastSpitNodes[${SPIT_SEGMENTS + 1}];
// edge: signed distance inside the sand; y/z/w: half width, crest, arc length.
vec4 coastSpit(vec2 qs, out float side) {
 side=1.0;
 if(uCoastSpit.x<.5 || uCoastShape.x<.5)return vec4(-1e6,1.0,0.0,0.0);
 vec2 at=vec2(qs.x+coastShore(qs.y),qs.y);
 if(at.x<uCoastSpitBounds.x || at.x>uCoastSpitBounds.y || at.y<uCoastSpitBounds.z || at.y>uCoastSpitBounds.w)return vec4(-1e6,1.0,0.0,0.0);
 vec4 result=vec4(-1e6,1.0,0.0,0.0);float arc=0.0;
 for(int i=0;i<${SPIT_SEGMENTS};i++){
  vec4 a=uCoastSpitNodes[i],b=uCoastSpitNodes[i+1];vec2 delta=b.xy-a.xy;
  float t=clamp(dot(at-a.xy,delta)/max(dot(delta,delta),.0001),0.0,1.0);
  float edge=mix(a.z,b.z,t)-length(at-mix(a.xy,b.xy,t));
  float segment=length(delta);
  if(edge>result.x){
   result=vec4(edge,mix(a.z,b.z,t),mix(a.w,b.w,t),arc+segment*t);
   vec2 offset=at-mix(a.xy,b.xy,t);side=clamp((delta.x*offset.y-delta.y*offset.x)/segment/max(1.0,result.y*.3),-1.0,1.0);
  }
  arc+=segment;
 }
 return result;
}
vec4 coastSpit(vec2 qs){float side;return coastSpit(qs,side);}
vec3 coastSpitJoin(float q,vec4 spit){
 float radius=uCoastSpitProfile.y;
 float weight=(1.0-smoothstep(radius,radius*1.5,abs(q)))*(1.0-smoothstep(radius,radius*1.5,abs(spit.x)))*(1.0-smoothstep(radius*2.0,radius*4.0,spit.w));
 float blend=clamp(.5+.5*(spit.x-q)/radius,0.0,1.0);
 float edge=mix(q,spit.x,blend)+radius*blend*(1.0-blend);
 return vec3(mix(max(q,spit.x),edge,weight),blend,weight);
}
float coastSpitHeight(float base,vec2 qs,float coverage) {
 float side;vec4 spit=coastSpit(qs,side);float edge=spit.x,shoal=uCoastSpit.y;
 if(edge<=-max(shoal,uCoastSpitProfile.y*1.5))return base;
 float ridge=spit.z*smoothstep(0.0,max(1.0,spit.y*.72),edge);
 float relief=sin(spit.w*.12)*.035*uCoastSurface.z*smoothstep(.5,3.0,edge);
 float tip=smoothstep(.7,.98,spit.w/uCoastSpitProfile.x);
 float outer=.5+.5*side*uCoastSpitProfile.z;
 float steep=.5+.5*sin(spit.w*.039+uCoastShape.w*.11);
 float shoulder=max(.8,shoal*mix(.22,.14,outer)*mix(1.0,.55,steep)*mix(1.0,.38,tip));
 float shelf=-max(uCoastSurface.y,-base)*(1.0-exp(min(edge,0.0)/shoulder));
 float weight=smoothstep(-shoal,-shoal*.6,edge)*coverage;
 float height=mix(base,max(base,ridge+relief+shelf),weight);
 vec3 join=coastSpitJoin(qs.x,spit);
 float root=join.x>0.0?spit.z*smoothstep(0.0,uCoastSpitProfile.y*.65,join.x):-uCoastSurface.y*(1.0-exp(join.x/12.0));
 return mix(height,max(height,root),join.z*coverage);
}
// Only the wave frame changes to the nearest shore. Coverage, geology and
// the mainland frame keep their original coordinates.
vec2 coastSurfLocal(vec2 qs) {
 vec4 spit=coastSpit(qs);
 if(spit.x<-1e5)return qs;
 vec3 join=coastSpitJoin(qs.x,spit);
 float along=mix(qs.y,spit.w+uCoastSpit.z,join.y);
 return vec2(join.x,mix(spit.x>qs.x?spit.w+uCoastSpit.z:qs.y,along,join.z));
}
`;
