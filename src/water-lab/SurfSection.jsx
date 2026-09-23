import React, { useEffect, useMemo, useState } from 'react';
import { coastHeight, coastPoint } from '../terrain/terrainModel.js';
import { gerstnerWeatherAt } from '../components/effects/water/gerstnerWaves';
import { breakLineMean, coastBreakLine, coastCrestWiggleAt } from '../components/effects/water/coastFrame';
import { surfFrozenTravel, surfProfileParams, surfProfilePoint } from '../components/effects/water/surfProfile';
import { createGerstnerSurfaceSampler } from '../components/effects/water/gerstnerSurfaceSampler';

// Разрез прибоя — чертёж, а не рендер. Верх: сечение вала поперёк гребня в
// метрах, один масштаб по обеим осям, с дном и уровнем воды; тонкие линии —
// та же волна на всех фазах, жирная — выбранная «Фазой обрушения». Низ: кромка
// губы сверху вдоль гребня — где она ломается, там в 3D пила. Всё считает
// CPU-двойник surfProfile, тот же, что лофт на GPU; зыбь не входит.
const PHASES = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
const T_STEPS = 240;
const MARGIN = { top: 168, right: 392, bottom: 84, left: 44 };
// The swell under the breaker: the coast fades it to about a third shoreward
// of the break line (coastSwellFade), and that remainder rides the lip.
const SWELL_UNDER_LIP = 0.35;
const COPY = {
  ru: { section: 'Сечение поперёк гребня', plan: 'Кромка губы сверху, вдоль гребня', sea: 'море', shore: 'берег', still: 'уровень воды', bed: 'дно',
    height: 'высота', lip: 'вылет губы', tube: 'труба', fall: 'падение', sheet: 'толщина губы', face: 'крутизна фронта', knots: 'узлы линии обрушения', tip: 'кромка губы', tipZ: 'высота кромки', noSwell: 'без зыби', withSwell: 'с зыбью', worst: 'худшая фаза', fold: 'перехлёст губы (сейчас / худший)', foldHint: '— от 1 и выше губа складывается: пила', phases: 'тонкие — все фазы на месте выбранной', metres: 'м' },
  en: { section: 'Section across the crest', plan: 'Lip edge from above, along the crest', sea: 'sea', shore: 'shore', still: 'still water', bed: 'bed',
    height: 'height', lip: 'lip reach', tube: 'tube', fall: 'fall', sheet: 'lip thickness', face: 'face steepness', knots: 'break line knots', tip: 'lip edge', tipZ: 'lip height', noSwell: 'no swell', withSwell: 'with swell', worst: 'worst phase', fold: 'lip overlap (now / worst)', foldHint: '— at 1 and above the lip folds: the saw', phases: 'thin: every phase where the chosen one stands', metres: 'm' },
};
const smooth = (x) => x * x * (3 - 2 * x);

function useViewport() {
  const read = () => ({ w: globalThis.innerWidth ?? 1400, h: globalThis.innerHeight ?? 900 });
  const [size, setSize] = useState(read);
  useEffect(() => {
    const update = () => setSize(read());
    globalThis.addEventListener?.('resize', update);
    return () => globalThis.removeEventListener?.('resize', update);
  }, []);
  return size;
}

// The same break line BreakingWaves builds: per-section heights from the swell's
// weather, the author's offset, smoothstep between the 48 samples.
function useBreakLine(definition, settings, along0, length) {
  return useMemo(() => {
    const guess = breakLineMean(coastBreakLine(definition, settings.surfHeight, along0, length, 8));
    const heightAt = (s) => { const p = coastPoint(guess, s, definition); return settings.surfHeight * gerstnerWeatherAt(p.x, p.z, settings.gusts); };
    const line = coastBreakLine(definition, settings.surfHeight, along0, length, 48, 0.78, heightAt);
    for (let i = 0; i < line.length; i += 1) line[i] += settings.surfBreakDistance;
    const mean = breakLineMean(line);
    const breakAt = (s) => {
      const x = Math.min(Math.max((s - along0) / length, 0), 1) * 48;
      const i = Math.floor(x), f = x - i;
      return line[i] + (line[Math.min(i + 1, 48)] - line[i]) * smooth(f);
    };
    const heightOf = (s) => { const p = coastPoint(mean, s, definition); return settings.surfHeight * gerstnerWeatherAt(p.x, p.z, settings.gusts); };
    return { line, mean, breakAt, heightOf, step: length / 48 };
  }, [along0, definition, length, settings.gusts, settings.surfBreakDistance, settings.surfHeight]);
}

export default function SurfSection({ settings, definition, along0, length, s, language = 'ru' }) {
  const t = COPY[language] ?? COPY.ru;
  const { w, h } = useViewport();
  const P = useMemo(() => surfProfileParams(settings), [settings]);
  const br = useBreakLine(definition, settings, along0, length);
  const refraction = settings.surfRefraction;

  // A wave's section at a phase, placed where the frozen ribbon stands it.
  const centreOf = (phase) => br.breakAt(s) + (1 - refraction) * (br.mean - br.breakAt(s)) + Math.max(1.4, surfFrozenTravel(settings, phase)) + coastCrestWiggleAt(s, settings.surfWidth, settings.surfMeander ?? 1);
  // Every phase is drawn standing where the chosen one stands, so the drawing
  // shows how the shape changes, not how far the wave travels.
  const sectionAt = (phase, centre = centreOf(phase)) => {
    const travel = surfFrozenTravel(settings, phase);
    const dn = travel + (1 - refraction) * (br.mean - br.breakAt(s));
    const H = br.heightOf(s);
    const points = [];
    for (let i = 0; i <= T_STEPS; i += 1) {
      const p = surfProfilePoint(i / T_STEPS, dn, H, P);
      const q = centre + p.x;
      points.push({ ...p, q, y: p.z - p.base + Math.max(coastHeight(q, s, definition), 0) });
    }
    return { points, H, dn, centre };
  };
  const current = useMemo(() => sectionAt(settings.surfPhase), [settings, br, s, definition]); // eslint-disable-line react-hooks/exhaustive-deps
  const ghosts = useMemo(() => PHASES.map((phase) => sectionAt(phase, current.centre)), [settings, br, s, definition, current.centre]); // eslint-disable-line react-hooks/exhaustive-deps

  // Top box: the section, one metre the same on both axes.
  const box = { x: MARGIN.left, y: MARGIN.top, w: Math.max(w - MARGIN.left - MARGIN.right, 200), h: Math.max((h - MARGIN.top - MARGIN.bottom) * 0.62, 160) };
  const all = [...ghosts, current].flatMap((g) => g.points);
  // Framed on the lip: the long, quiet back of the swell is cut off.
  const qMin = current.centre - Math.max(3, settings.surfWidth * 0.3), qMax = Math.max(...all.map((p) => p.q)) + 1.5;
  const yMin = Math.min(-0.5, ...Array.from({ length: 40 }, (_, i) => coastHeight(qMin + (qMax - qMin) * i / 39, s, definition))) - 0.3;
  const yMax = Math.max(...all.map((p) => p.y)) + 0.5;
  const scale = Math.min(box.w / (qMax - qMin), box.h / (yMax - yMin));
  const X = (q) => box.x + (q - qMin) * scale;
  const Y = (y) => box.y + box.h - (y - yMin) * scale;
  const path = (points) => points.map((p, i) => `${i ? 'L' : 'M'}${X(p.q).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  const bed = Array.from({ length: 160 }, (_, i) => { const q = qMin + (qMax - qMin) * i / 159; return { q, y: coastHeight(q, s, definition) }; });
  const shoreQ = bed.find((p) => p.y >= 0)?.q ?? qMax;

  // The chosen phase's numbers: what the sliders do, in metres and degrees.
  const pts = current.points;
  const lipPts = pts.filter((p) => p.part === 'lip');
  const tip = lipPts[lipPts.length - 1] ?? pts[0];
  const root = lipPts[0] ?? pts[0];
  const facePts = pts.filter((p) => p.part === 'face');
  let steep = 0;
  for (let i = 1; i < facePts.length; i += 1) {
    const dq = facePts[i].q - facePts[i - 1].q, dy = facePts[i - 1].y - facePts[i].y;
    if (Math.hypot(dq, dy) > 1e-4) steep = Math.max(steep, Math.atan2(dy, Math.max(dq, 1e-6)) * 180 / Math.PI);
  }
  const readout = [
    [t.height, `${current.H.toFixed(2)} м`], [t.lip, `${(tip.q - root.q).toFixed(2)} м`], [t.tube, `${Math.max(0, root.y - Math.min(...facePts.slice(0, 20).map((p) => p.y))).toFixed(2)} м`],
    [t.fall, `${(root.tauImp ?? 0).toFixed(2)} с`], [t.sheet, `${(settings.surfSheet * current.H).toFixed(2)} м`], [t.face, `${steep.toFixed(0)}°`],
  ];

  // Bottom box: the lip edge along ±40 m of crest, as the loft places it.
  const plan = { x: MARGIN.left, y: box.y + box.h + 36, w: box.w, h: Math.max(h - MARGIN.bottom - (box.y + box.h + 36), 90) };
  // The loft sweeps each section along the crest's normal (surfWorld): a
  // point x metres out moves k·x along the crest, k = du/ds. Where the crest
  // bends tighter than x (k'·x > 1) neighbouring sections cross — the lip
  // folds over itself, and in 3D that fold is the saw.
  const centreAt = (a, travel) => br.breakAt(a) + (1 - refraction) * (br.mean - br.breakAt(a)) + Math.max(1.4, travel) + coastCrestWiggleAt(a, settings.surfWidth, settings.surfMeander ?? 1);
  const lipAlong = (phase) => {
    const travel = surfFrozenTravel(settings, phase);
    const rows = [];
    let fold = 0;
    for (let a = s - 40; a <= s + 40; a += 0.25) {
      const c0 = centreAt(a - 0.5, travel), c = centreAt(a, travel), c1 = centreAt(a + 0.5, travel);
      const k = c1 - c0, bend = (c1 - 2 * c + c0) / 0.25;
      const dn = travel + (1 - refraction) * (br.mean - br.breakAt(a));
      const lip = surfProfilePoint(0.5, dn, br.heightOf(a), P);
      const x = lip.x * (1 / Math.sqrt(1 + k * k));
      fold = Math.max(fold, Math.abs(bend * x));
      rows.push({ a, sa: a - k * x, q: c + x, z: lip.z - lip.base });
    }
    return { rows, fold };
  };
  const along = useMemo(() => {
    const current = lipAlong(settings.surfPhase);
    const sampler = createGerstnerSurfaceSampler(settings);
    const swell = {};
    for (const r of current.rows) {
      const p = coastPoint(r.q, r.a, definition);
      // The sampler answers at a visible point; the particle there came from
      // (parameterX, parameterZ), and that offset is what the lip rides.
      sampler(p.x, p.z, 0, swell, { fadeAt: () => SWELL_UNDER_LIP });
      r.qs = r.q + (p.x - swell.parameterX) * definition.landX + (p.z - swell.parameterZ) * definition.landZ;
      r.zs = r.z + swell.y;
    }
    // The worst phase of the whole break, and its lip edge.
    let worst = { fold: -1 };
    for (const phase of PHASES) { const w = lipAlong(phase); if (w.fold > worst.fold) worst = { ...w, phase }; }
    return { rows: current.rows, fold: current.fold, worst };
  }, [settings, br, s, P, refraction, definition]); // eslint-disable-line react-hooks/exhaustive-deps
  const rowsAll = [...along.rows, ...along.worst.rows];
  const pqMin = Math.min(...rowsAll.map((r) => Math.min(r.q, r.qs ?? r.q))) - 0.3, pqMax = Math.max(...rowsAll.map((r) => Math.max(r.q, r.qs ?? r.q))) + 0.3;
  const pzMin = Math.min(...along.rows.map((r) => Math.min(r.z, r.zs))) - 0.2, pzMax = Math.max(...along.rows.map((r) => Math.max(r.z, r.zs))) + 0.2;
  const trace = (rows, key, Yof, xKey = 'a') => rows.map((r, i) => `${i ? 'L' : 'M'}${PX(r[xKey]).toFixed(1)},${Yof(r[key]).toFixed(1)}`).join('');
  const folds = (rows) => rows.filter((r, i) => i > 0 && r.sa < rows[i - 1].sa);
  const PX = (a) => plan.x + (a - (s - 40)) / 80 * plan.w;
  const PQ = (q) => plan.y + plan.h - (q - pqMin) / Math.max(pqMax - pqMin, 0.5) * plan.h;
  const PZ = (z) => plan.y + plan.h - (z - pzMin) / Math.max(pzMax - pzMin, 0.3) * plan.h;
  const knots = br.line.map((_, i) => along0 + i * br.step).filter((a) => a >= s - 40 && a <= s + 40);

  const ink = 'var(--lab-ink)', faint = 'var(--lab-faint)', line = 'var(--lab-line)';
  return <div className="lab__section" data-testid="water-lab-section">
    <svg width={w} height={h} role="img" aria-label={t.section}>
      <defs><clipPath id="lab-section-box"><rect x={box.x} y={box.y} width={box.w} height={box.h} /></clipPath></defs>
      <text x={box.x} y={box.y - 12} className="lab__section-title">{t.section} · {t.noSwell} · {t.phases}</text>
      {Array.from({ length: Math.floor(qMax) - Math.ceil(qMin) + 1 }, (_, i) => Math.ceil(qMin) + i).filter((q) => q % 5 === 0).map((q) => <line key={`gx${q}`} x1={X(q)} x2={X(q)} y1={box.y} y2={box.y + box.h} stroke={line} />)}
      {Array.from({ length: Math.floor(yMax) - Math.ceil(yMin) + 1 }, (_, i) => Math.ceil(yMin) + i).map((y) => <g key={`gy${y}`}><line x1={box.x} x2={box.x + box.w} y1={Y(y)} y2={Y(y)} stroke={line} /><text x={box.x - 4} y={Y(y) + 3} textAnchor="end" className="lab__section-axis">{y}</text></g>)}
      <path d={`M${X(qMin)},${Y(0)}L${X(shoreQ)},${Y(0)}`} stroke="#6f9bb0" strokeWidth={1} strokeDasharray="4 3" fill="none" />
      <path d={`${path(bed)}L${X(qMax)},${box.y + box.h}L${X(qMin)},${box.y + box.h}Z`} fill="#d9cfb8" stroke="#a89877" strokeWidth={1} />
      <g clipPath="url(#lab-section-box)">
      {ghosts.map((g, i) => <path key={i} d={path(g.points)} stroke={faint} strokeWidth={0.8} fill="none" />)}
      <path d={path(current.points)} stroke={ink} strokeWidth={2.2} fill="none" strokeLinejoin="round" />
      {current.points.filter((p, i) => p.puff > 0.02 && i % 3 === 0).map((p, i) => <circle key={i} cx={X(p.q)} cy={Y(p.y)} r={Math.max(1.5, p.puff * settings.surfRoller * current.H * 0.7 * scale)} fill="rgba(255,255,255,.55)" stroke="rgba(23,25,22,.25)" strokeWidth={0.6} />)}
      <circle cx={X(tip.q)} cy={Y(tip.y)} r={3.5} fill="#b5543c" />
      </g>
      <text x={X(qMin) + 4} y={box.y + box.h - 6} className="lab__section-axis">← {t.sea}</text>
      <text x={X(qMax) - 4} y={box.y + box.h - 6} textAnchor="end" className="lab__section-axis">{t.shore} →</text>
      <g transform={`translate(${box.x + 8},${box.y + 8})`}>
        {readout.map(([label, value], i) => <text key={label} y={i * 15 + 10} className="lab__section-axis"><tspan fill={faint}>{label}</tspan> <tspan fill={ink} fontWeight={650}>{value}</tspan></text>)}
      </g>

      <text x={plan.x} y={plan.y - 10} className="lab__section-title">{t.plan}</text>
      <rect x={plan.x} y={plan.y} width={plan.w} height={plan.h} fill="none" stroke={line} />
      {knots.map((a) => <line key={a} x1={PX(a)} x2={PX(a)} y1={plan.y} y2={plan.y + plan.h} stroke="rgba(181,84,60,.35)" strokeDasharray="2 3" />)}
      <path d={trace(along.worst.rows, 'q', PQ, 'sa')} stroke="#b5543c" strokeWidth={0.9} fill="none" opacity={0.7} />
      {folds(along.worst.rows).map((r) => <circle key={`w${r.a}`} cx={PX(r.sa)} cy={PQ(r.q)} r={2.2} fill="#b5543c" />)}
      <path d={trace(along.rows, 'q', PQ, 'sa')} stroke={ink} strokeWidth={1.6} fill="none" />
      <path d={trace(along.rows, 'qs', PQ, 'sa')} stroke={ink} strokeWidth={0.9} strokeDasharray="3 2" fill="none" />
      <path d={trace(along.rows, 'z', PZ)} stroke="#6f9bb0" strokeWidth={1.2} fill="none" />
      <text x={plan.x + 6} y={plan.y + 14} className="lab__section-axis"><tspan fill={ink}>— {t.tip}</tspan>  <tspan fill={faint}>┄ {t.withSwell}</tspan>  <tspan fill="#6f9bb0">— {t.tipZ}</tspan>  <tspan fill="#b5543c">— {t.worst} {along.worst.phase}</tspan>  <tspan fill="#b5543c">┆ {t.knots}</tspan></text>
      <text x={plan.x + 6} y={plan.y + 28} className="lab__section-axis"><tspan fill={faint}>{t.fold}</tspan> <tspan fill={along.worst.fold >= 1 ? '#b5543c' : ink} fontWeight={650}>{along.fold.toFixed(2)} / {along.worst.fold.toFixed(2)}</tspan> <tspan fill={faint}>{t.foldHint}</tspan></text>
      <text x={plan.x + plan.w - 6} y={plan.y + plan.h - 6} textAnchor="end" className="lab__section-axis">{t.tip} {(pqMax - pqMin).toFixed(1)} {t.metres} · 80 {t.metres}</text>
    </svg>
  </div>;
}
