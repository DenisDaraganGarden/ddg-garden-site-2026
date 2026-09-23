import { coastPoint } from '../../../terrain/terrainModel.js';
import { BREAK_SAMPLES, breakLineMean, coastBreakLine, coastBreakVisibility } from './coastBreakLine.js';
import { gerstnerWeatherAt } from './gerstnerWaves.js';

// What the breakers are doing this frame, for anything on the CPU that has to
// ride them. The ribbon timeline lives in BreakingWaves' frame loop and cannot
// be recomputed from the time alone (a respawn waits for a swell crest and
// draws its height from a counter), so BreakingWaves copies what its loft
// shader reads into this plain holder every frame: surfSurfaceSampler is the
// CPU twin that reads it. Created by the scene outside the canvas and handed
// down, like the swash holder, so a board beside the sea can see it.

// As many as BreakingWaves can draw (its RIBBON_COUNT, FOAM_BORE_SLOTS).
export const SURF_RIBBON_SLOTS = 7;

export function createSurfRibbons(slots = SURF_RIBBON_SLOTS) {
  return {
    revision: 0,        // +1 on every write
    time: 0,            // scene time of the last write, s
    count: 0,           // ribbons BreakingWaves drives; 0 while no surf is drawn
    frozen: false,      // seaSurfFreeze: one breaker standing still on the break line
    speed: 0,           // uSpeed: the breakers' speed toward the shore, m/s
    coast: { definition: null, along0: 0, length: 1 },
    settings: null,     // the resolved sea settings BreakingWaves drew with
    // The loft's global uniforms (BreakingWaves.jsx loftShader).
    loft: { refraction: 0.7, peelSpan: 1, runup: 10, spent: 60, meander: 1, smooth: 0, gusts: 0 },
    // surfProfilePoint's P, from the same uniforms the GLSL profile reads.
    profile: { width: 9, steepen: 16, lean: 0.45, jet: 1.6, lift: 0.6, sheet: 0.16, bore: 14, speed: 4.5 },
    ribbons: Array.from({ length: slots }, () => ({
      visible: 0,       // uRibbonVisible
      travel: -1000,    // uTravel: metres past the mean break line, the break phase
      pose: -1000,      // uPose: where the wave stands, metres past the mean break line
      height: 0,        // uHeight, m
      peel: 0,          // uPeel
      breakMean: -10,   // uBreakMean, coast q
      breakLine: new Float32Array(BREAK_SAMPLES + 1).fill(-10),
      breakVisible: new Float32Array(BREAK_SAMPLES + 1),
    })),
  };
}

// Where one wave of this height breaks, section by section: where the coast is
// shallower than H / 0.78, with the crest's height read from the swell's
// weather at its own break point — first with the plain height to find the
// line, then with the heights along it. The author's offset can move a break,
// never onto the sand. Returns the line, its split mask and its mean.
export function surfRibbonBreakLine(coast, height, settings) {
  const guess = breakLineMean(coastBreakLine(coast.definition, height, coast.along0, coast.length, 8));
  const heightAt = (s) => { const at = coastPoint(guess, s, coast.definition); return height * gerstnerWeatherAt(at.x, at.z, settings.gusts); };
  const line = coastBreakLine(coast.definition, height, coast.along0, coast.length, BREAK_SAMPLES, 0.78, heightAt);
  for (let i = 0; i < line.length; i += 1) line[i] = Math.min(line[i] + settings.surfBreakDistance, -1.5);
  return { line, visible: coastBreakVisibility(line, coast.length), mean: breakLineMean(line) };
}

// Copies what the loft shader reads out of BreakingWaves' ribbons, after their
// uniforms were written for this frame. Reading the uniforms themselves, not
// the settings they came from, keeps the CPU twin on exactly what was drawn.
// No allocation: a frame loop calls this.
export function recordSurfRibbons(holder, { time, frozen, definition, settings }, ribbons) {
  const first = ribbons[0]?.uniforms;
  const count = Math.min(ribbons.length, holder.ribbons.length);
  holder.count = first ? count : 0;
  if (!first) return;
  holder.time = time;
  holder.frozen = Boolean(frozen);
  holder.speed = first.uSpeed.value;
  holder.settings = settings;
  holder.coast.definition = definition;
  holder.coast.along0 = first.uAlong0.value;
  holder.coast.length = first.uCrestLength.value;
  const { loft, profile } = holder;
  loft.refraction = first.uRefraction.value;
  loft.peelSpan = first.uPeelSpan.value;
  loft.runup = first.uRunup.value;
  loft.spent = first.uSpent.value;
  loft.meander = first.uMeander.value;
  loft.smooth = first.uSurfSmooth.value;
  loft.gusts = first.uGerstnerGusts.value;
  profile.width = first.uWidth.value;
  profile.steepen = first.uSteepen.value;
  profile.lean = first.uLean.value;
  profile.jet = first.uJet.value;
  profile.lift = first.uLift.value;
  profile.sheet = first.uSheet.value;
  profile.bore = first.uBore.value;
  profile.speed = first.uSpeed.value;
  for (let index = 0; index < count; index += 1) {
    const uniforms = ribbons[index].uniforms;
    const record = holder.ribbons[index];
    record.visible = uniforms.uRibbonVisible.value;
    record.travel = uniforms.uTravel.value;
    record.pose = uniforms.uPose.value;
    record.height = uniforms.uHeight.value;
    record.peel = uniforms.uPeel.value;
    record.breakMean = uniforms.uBreakMean.value;
    record.breakLine.set(uniforms.uBreakLine.value);
    record.breakVisible.set(uniforms.uBreakVisible.value);
  }
  for (let index = count; index < holder.ribbons.length; index += 1) holder.ribbons[index].visible = 0;
  holder.revision += 1;
}
