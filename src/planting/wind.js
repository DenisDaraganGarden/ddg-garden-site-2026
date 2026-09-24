import * as THREE from 'three';
import { coastWeather } from '../terrain/settings.js';

// Ветер сада — для всего, что растёт не на берегу: карточек посадок, листьев
// лиан, 2D-растений модели SketchUp. Ветер тот же, что гнёт кусты, деревья и
// траву берега (terrainWindBearing — куда дует, terrainWindSpeed,
// terrainStorm; «Атмосфера → Ветер»), и порывы те же (plantEcology.js
// plantBend): фронты бегут по ветру через весь участок, поэтому цветник
// колышется волнами, а не каждый куст сам по себе.
//
// Растение наклоняется по ветру на долю своей высоты (гибкость при 8 м/с) и
// качается около наклона со своей частотой, чуть-чуть и поперёк; низ стоит,
// верх ходит — изгиб по квадрату высоты, как у стебля. Все шейдеры читают
// одни и те же униформы; их раз в кадр пишет GardenWind (WaterScene).
export const gardenWind = Object.freeze({ uWindTime: { value: 0 }, uWind: { value: new THREE.Vector2() }, uWindSway: { value: 1 } });

export function updateGardenWind(terrain, sway, time) {
    const { wind } = coastWeather(terrain), angle = (terrain.terrainWindBearing * Math.PI) / 180;
    gardenWind.uWind.value.set(Math.sin(angle) * wind, -Math.cos(angle) * wind);
    gardenWind.uWindTime.value = time;
    gardenWind.uWindSway.value = sway;
}

// Гибкость (доля высоты при 8 м/с) и своя частота (Гц) — по виду растения:
// злаки ходят широко и медленно, кусты и почвопокровные дрожат, деревья
// едва клонятся, стриженое стоит.
const FLEX = {
    grass: [0.2, 0.9], perennial: [0.12, 1.3], groundcover: [0.05, 2], shrub: [0.05, 1.6],
    tree: [0.028, 0.45], conifer: [0.016, 0.6], topiary: [0.004, 1.8], climber: [0.03, 1.4],
};
export const plantFlex = (category) => FLEX[category] ?? [0.08, 1.2];

export const GARDEN_WIND_GLSL = /* glsl */`
uniform float uWindTime, uWindSway;
uniform vec2 uWind;
// Смещение верхушки по ветру (м) растения высотой height, стоящего в root:
// flex — доля высоты при 8 м/с, hz — своя частота.
vec2 gardenSway(vec2 root, float height, float flex, float hz) {
    float speed = length(uWind);
    if (speed < 0.01) return vec2(0.0);
    vec2 dir = uWind / speed;
    float travel = dot(root, dir) * 0.23 - uWindTime * (0.6 + speed * 0.09);
    float front = pow(0.5 + 0.5 * sin(travel + sin(travel * 0.37) * 0.8), 3.0);
    float gust = 0.35 + front * 0.9 + (0.5 + 0.5 * sin(travel * 1.91 + root.x * 0.13 - root.y * 0.07)) * 0.24;
    float seed = fract(sin(dot(root, vec2(12.9898, 78.233))) * 43758.5453) * 6.2832;
    float t = uWindTime * 6.2832 * hz + seed;
    float swing = sin(t) * 0.38 + sin(t * 2.13 + seed) * 0.12;
    float reach = height * flex * uWindSway * min(speed / 8.0, 2.2) * gust;
    return (dir * (0.55 + swing) + vec2(-dir.y, dir.x) * sin(t * 0.71 + seed * 1.9) * 0.16) * reach;
}
// Растение без вида (2D-растение модели) — по высоте: низкое гибче.
vec2 gardenSwayByHeight(vec2 root, float height) {
    float tall = smoothstep(0.6, 7.0, height);
    return gardenSway(root, height, mix(0.14, 0.026, tall), mix(1.3, 0.4, tall));
}
`;
