import React, { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import AssetStudio from '../asset-lab/AssetStudio';
import LabShell, { LabRange, LabSelect } from '../asset-lab/LabShell';
import { assetIndex } from '../asset-lab/assetCatalog';
import { getPublishedHomeSceneSettings } from '../features/home-scene/hooks/useHomeSceneSettings';
import { updateGardenWind } from '../planting/wind.js';
import Groundcover from '../groundcover/Groundcover.jsx';
import { normalizeCover, COVER_PRESETS, COVER_RANGES } from '../groundcover/settings.js';
import { COVER_LABELS, COVER_CLIMATES } from '../groundcover/labels.js';

const PUBLISHED = getPublishedHomeSceneSettings();
const VIEWS = {
    full: { landscape: { position: [7, 5, 9], target: [0, .4, 0] }, portrait: { position: [10, 9, 14], target: [0, .3, 0] } },
    close: { landscape: { position: [1.3, .72, 3], target: [.65, .22, 1.5] }, portrait: { position: [1.4, 1, 3.6], target: [.65, .22, 1.5] } },
    side: { landscape: { position: [6, .8, 5], target: [0, .25, 0] }, portrait: { position: [10, 1.5, 8], target: [0, .25, 0] } },
    top: { landscape: { position: [0, 12, .1], target: [0, 0, 0] }, portrait: { position: [0, 17, .1], target: [0, 0, 0] } },
};
const LIMITS = { minDistance: .15, maxDistance: 40, minPolarAngle: .02, maxPolarAngle: Math.PI / 2 - .015 };
const HEIGHT = (x, z) => .63 * Math.exp(-((x + 1.4) ** 2 / 1.6 + (z + .5) ** 2 / 2)) + .3 * Math.exp(-((x - 1.8) ** 2 + (z - .3) ** 2 / 1.4));
const circle = (x, z, r) => Array.from({ length: 24 }, (_, i) => [x + Math.cos(i / 24 * Math.PI * 2) * r, z + Math.sin(i / 24 * Math.PI * 2) * r]);
const STONES = [-1.65, -.45, .75, 1.95].map((z, i) => ({ x: .3 + Math.sin(i) * .22, z }));
const HOLES = [...STONES.map(({ x, z }) => [[x - .38, z - .43], [x + .38, z - .43], [x + .38, z + .43], [x - .38, z + .43]]), circle(-1.5, -.8, .18), circle(2, -.8, .45)];
function Wind() {
    const time = React.useRef(0);
    useFrame((_, delta) => { time.current += Math.min(delta, .1); updateGardenWind({ ...PUBLISHED, terrainWindSpeed: 3, terrainWindBearing: 50 }, 1, time.current); });
    return null;
}
function Stage({ query }) {
    const geometry = useMemo(() => {
        const g = new THREE.PlaneGeometry(9, 7, 100, 80); g.rotateX(-Math.PI / 2);
        const p = g.attributes.position;
        for (let i = 0; i < p.count; i++) p.setY(i, query.sample(p.getX(i), p.getZ(i)).height - .008);
        g.computeVertexNormals(); return g;
    }, [query]);
    useEffect(() => () => geometry.dispose(), [geometry]);
    return <>
        <mesh geometry={geometry} receiveShadow><meshStandardMaterial color="#aaa18b" roughness={1} /></mesh>
        {STONES.map(({ x, z }, i) => <mesh key={i} position={[x, query.sample(x, z).height + .025, z]} castShadow receiveShadow><boxGeometry args={[.76, .06, .86]} /><meshStandardMaterial color="#c8c4b9" roughness={.93} /></mesh>)}
        <mesh position={[-1.5, query.sample(-1.5, -.8).height + .8, -.8]} castShadow receiveShadow><cylinderGeometry args={[.105, .18, 1.6, 9]} /><meshStandardMaterial color="#69614c" roughness={1} /></mesh>
        <mesh position={[2, query.sample(2, -.8).height + .22, -.8]} scale={[.52, .38, .47]} castShadow receiveShadow><icosahedronGeometry args={[1, 1]} /><meshStandardMaterial color="#9b9a88" roughness={1} /></mesh>
    </>;
}
export default function GroundcoverLab() {
    const [language, setLanguage] = useState('ru'), ru = language === 'ru';
    const [cover, setCover] = useState(() => normalizeCover({ ...COVER_PRESETS.woodland.values }));
    const [month, setMonth] = useState(PUBLISHED.plantingMonth ?? 6), [hill, setHill] = useState(1), [view, setView] = useState('full');
    const [hidden, setHidden] = useState(document.hidden), [stats, setStats] = useState(null), [night, setNight] = useState(false);
    useEffect(() => { const changed = () => setHidden(document.hidden); document.addEventListener('visibilitychange', changed); return () => document.removeEventListener('visibilitychange', changed); }, []);
    const query = useMemo(() => ({ sample(x, z) {
        const e = .002, dx = (HEIGHT(x + e, z) - HEIGHT(x - e, z)) * hill / (2 * e), dz = (HEIGHT(x, z + e) - HEIGHT(x, z - e)) * hill / (2 * e), len = Math.hypot(dx, 1, dz);
        return { height: HEIGHT(x, z) * hill, normal: [-dx / len, 1 / len, -dz / len] };
    } }), [hill]);
    const bed = useMemo(() => ({ id: 'lab-cover', points: [[-3.4, -2.5], [2.9, -2.5], [3.4, -1.8], [3.15, 2.6], [-2.8, 2.6], [-3.4, 1.5]], holes: HOLES, seed: 42, y: 0, cover }), [cover]);
    return <LabShell collection="groundcover" testId="groundcover-lab" eyebrow={`DDG / ASSET LAB / ${assetIndex('groundcover')}`} title={ru ? 'Почвопокровные растения' : 'Groundcover plants'}
        language={language} onLanguage={setLanguage} views={['full', 'close', 'side', 'top'].map((id, i) => ({ id, label: (ru ? ['Обзор', 'Вблизи', 'Сбоку', 'Сверху'] : ['Overview', 'Close', 'Side', 'Top'])[i] }))} view={view} onView={setView}
        stats={stats ? <span>{stats.instances.toLocaleString()} · {Math.round(stats.triangles / 1000)}k △ · {stats.batches} {ru ? 'пакетов' : 'batches'}</span> : null}
        panel={<>
            <LabSelect label={ru ? 'Сообщество' : 'Community'} value="" options={[{ value: '', label: ru ? 'Выбрать…' : 'Choose…' }, ...Object.entries(COVER_PRESETS).map(([value, p]) => ({ value, label: p[language] }))]} onChange={(key) => key && setCover(normalizeCover({ ...cover, ...COVER_PRESETS[key].values }))} />
            {Object.entries(COVER_RANGES).map(([key, [min, max, step]]) => <LabRange key={key} label={COVER_LABELS[key][ru ? 0 : 1]} value={cover[key]} min={min} max={max} step={step} onChange={(value) => setCover(normalizeCover({ ...cover, [key]: value }))} />)}
            <LabSelect label={ru ? 'Климат' : 'Climate'} value={cover.climate} options={Object.entries(COVER_CLIMATES).map(([value, names]) => ({ value, label: names[ru ? 0 : 1] }))} onChange={(climate) => setCover({ ...cover, climate })} />
            <LabRange label={ru ? 'Месяц' : 'Month'} value={month} min={1} max={12} step={1} onChange={setMonth} />
            <LabRange label={ru ? 'Рельеф' : 'Relief'} value={hill} min={0} max={2} step={.1} onChange={setHill} />
            <LabSelect label={ru ? 'Освещение' : 'Lighting'} value={night ? 'night' : 'day'} options={[{ value: 'day', label: ru ? 'День' : 'Day' }, { value: 'night', label: ru ? 'Вечерний свет' : 'Evening light' }]} onChange={(value) => setNight(value === 'night')} />
        </>}
    ><AssetStudio view={view} cameraViews={VIEWS} cameraLimits={LIMITS} floorVisible={false} cameraFar={70} fogRange={[40, 65]} shadowRadius={5} paused={hidden} environmentIntensity={night ? .15 : .65} exposure={night ? .25 : 1}>
        <Wind /><Stage query={query} /><Groundcover bed={bed} month={month} surface={query} onStats={setStats} />
        {night ? <pointLight position={[1, .6, 1]} color="#ffcf8f" intensity={12} distance={6} decay={2} castShadow shadow-mapSize-width={512} shadow-mapSize-height={512} /> : null}
    </AssetStudio></LabShell>;
}
