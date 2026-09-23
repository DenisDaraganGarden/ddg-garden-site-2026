import { sampleTerrainHeight } from '../../terrain/terrainModel.js';
import { createGerstnerSurfaceSampler } from '../effects/water/gerstnerSurfaceSampler.js';
import { radialCellFactor } from '../effects/water/radialWaterGeometry.js';
import { createSeaSurfaceFade } from '../effects/water/seaCoastFade.js';
import { createSurfSurfaceSampler } from '../effects/water/surfSurfaceSampler.js';

// The water a board rides, as the GPU draws it: the Gerstner sea plus the
// breaking surf standing on it. Height, the water's own velocity and a normal
// at any world point, analytic, with no readback.
//
// The sea is sampled with the same camera fade and mesh cell cut as
// useWaterRuntime, so the trains the drawn sea drops the board does not feel
// either. The breaker lifts the sea by surfSurfaceSampler's offset at the
// sea's own parameter point, exactly as the loft is built on the GPU.
//
// Velocity. The sea's is the Gerstner particle velocity (a Lagrangian surface:
// the time derivative of where its particle is). The breaker adds its own:
//  - Along the crest normal fwd, the depth-averaged speed of water under a
//    long wave moving at c, from the mass balance across it: water in front
//    at rest in depth h, the wave's column h + η moving at u, so
//    u (h + η) = c η, u = c η / (h + η). η is the breaker's own lift over the
//    sea it stands on (that sea's orbital motion is already in the Gerstner
//    term), h the still-water depth from the terrain. Kept under 0.9 c; in
//    whitewater — the roller, the bore — pushed toward 0.8 c, because a
//    broken wave's front is water moving with the wave, and that push is what
//    carries a board in the soup.
//  - Vertically, whatever keeps that water on the moving surface (the
//    kinematic condition ∂η/∂t + u·∇η = w): w = rate + u·∇η, where rate is how
//    fast the breaker's lift rises at a fixed point as its shape passes and
//    changes. A frozen breaker has neither.
// The normal is the sea's tilted by the breaker's slope across the crest (its
// slope along the crest is small and left out).
//
// A plunging wave's wall is a step, not a slope: where the crest's edge drops
// onto the floor under a leaning lip the breaker's slope is unbounded, and its
// rise rate, differenced across the step, runs to hundreds of m/s. A board
// handed that water is blown away. So the breaker is felt no steeper than
// MAX_SLOPE (72°), and rising no faster than that face moving at its speed;
// wherever the face is gentler than that, nothing changes.

const ORIGIN = Object.freeze({ x: 0, y: 0, z: 0 });
// The lift over the sea at which the board counts as fully on the breaker.
const BREAKER_LIFT = 0.15;
const MAX_SLOPE = 3;
// The breaker's vertical water velocity is bounded by its speed: a steep face
// rising at a fixed point is the shape moving, not the water, and handed to
// the board unbounded it launched it metres into the air. Half the speed held
// the water too still under a paddling rider on the face; the speed itself
// kept every ridden run on the water.
export const RISE_SHARE = 1;
const clampAbs = (x, limit) => (x > limit ? limit : x < -limit ? -limit : x);

// seaSettings: the resolved EFFECTIVE sea settings (resolveEffectiveSeaSettings),
// the object the sea and useWaterRuntime draw with. coastDefinition: the
// terrain definition. getCamera: () => the camera position (for the fade and
// the cell cut). surfRibbons: the createSurfRibbons() holder BreakingWaves
// fills. terrainHeight: (x, z) => ground y, or null; defaults to the coast.
export function createSurfWater({ seaSettings = null, coastDefinition = null, getCamera = () => ORIGIN, surfRibbons = null, terrainHeight = null } = {}) {
  const cameraAt = () => getCamera() ?? ORIGIN;
  const sea = seaSettings && seaSettings.enabled !== false ? createGerstnerSurfaceSampler(seaSettings) : null;
  const cellFactor = sea ? radialCellFactor({ rings: seaSettings.meshRings, segments: seaSettings.meshSegments }) : 0;
  const seaOptions = sea ? {
    fadeAt: createSeaSurfaceFade(coastDefinition, seaSettings, cameraAt),
    cellAt: (x, z) => { const camera = cameraAt(); return Math.hypot(x - camera.x, z - camera.z) * cellFactor; },
  } : null;
  const groundAt = terrainHeight ?? (coastDefinition?.terrainEnabled ? (x, z) => sampleTerrainHeight(x, z, coastDefinition) : null);
  const seaSample = {};
  const surf = createSurfSurfaceSampler();
  const surfSample = {};

  // x, z: world metres; time: the scene clock (state.clock.elapsedTime).
  const sample = (x, z, time, out = {}) => {
    let height = 0;
    let vx = 0;
    let vy = 0;
    let vz = 0;
    let gx = 0;
    let gz = 0;
    let px = x;
    let pz = z;
    if (sea) {
      sea(x, z, time, seaSample, seaOptions);
      height = seaSample.worldY;
      vx = seaSample.velocity.x;
      vy = seaSample.velocity.y;
      vz = seaSample.velocity.z;
      gx = -seaSample.normal.x / seaSample.normal.y;
      gz = -seaSample.normal.z / seaSample.normal.y;
      px = seaSample.parameterX;
      pz = seaSample.parameterZ;
    }
    const ground = groundAt?.(x, z);
    out.ground = Number.isFinite(ground) ? ground : -Infinity;
    const lift = surf.surfOffsetAt(px, pz, time, surfRibbons, surfSample, height);
    // With surfSmooth the crest ignores that share of the swell under it.
    const keep = 1 - lift.damp;
    vx *= keep;
    vy *= keep;
    vz *= keep;
    const slopeAlong = clampAbs(lift.slopeAlong, MAX_SLOPE);
    gx = gx * keep + slopeAlong * lift.fwdX;
    gz = gz * keep + slopeAlong * lift.fwdZ;
    if (lift.ribbon >= 0) {
      const c = lift.speed;
      const depth = Math.max(-out.ground, 0);
      let along = Math.min(Math.max(c * lift.offset / (depth + lift.offset), 0), 0.9 * c);
      along += (Math.max(along, 0.8 * c) - along) * lift.whitewater;
      vx += along * lift.fwdX;
      vz += along * lift.fwdZ;
      vy += clampAbs(lift.rate + along * (gx * lift.fwdX + gz * lift.fwdZ), RISE_SHARE * c);
    }
    const normalScale = 1 / Math.sqrt(1 + gx * gx + gz * gz);
    out.height = height + lift.offset;
    out.vx = vx;
    out.vy = vy;
    out.vz = vz;
    out.nx = -gx * normalScale;
    out.ny = normalScale;
    out.nz = -gz * normalScale;
    out.whitewater = lift.whitewater;
    out.onBreaker = Math.min(lift.offset / BREAKER_LIFT, 1);
    return out;
  };

  return { sample };
}
