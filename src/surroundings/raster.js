import { roadClass } from './osm.js';

// Земля окружения — картинка: площади, реки, дороги и рельсы рисуются на
// холсте и ложатся на рельеф текстурой. Так дорога лежит ровно на склоне, не
// мерцает с землёй и обрезается краем круга сама.

const hex = (value) => [1, 3, 5].map((at) => parseInt(value.slice(at, at + 2), 16));
const mix = (a, b, t) => `#${hex(a).map((channel, i) => Math.round(channel + (hex(b)[i] - channel) * t).toString(16).padStart(2, '0')).join('')}`;

// Цвета редактора → вся палитра макета (дома красятся своим, пятым).
export function surroundingsPalette(ground, road, green, water) {
    return {
        ground,
        water,
        major: road,
        minor: mix(road, ground, 0.2),
        path: mix(road, ground, 0.55),
        rail: mix(road, '#2f2f2f', 0.35),
        areas: {
            farm: mix(green, ground, 0.55),
            green,
            forest: mix(green, '#4f5f45', 0.22),
            sport: mix(green, ground, 0.35),
            sand: mix(ground, '#e9dcbc', 0.6),
            paved: mix(road, ground, 0.4),
            water,
        },
    };
}

const AREA_ORDER = ['farm', 'green', 'forest', 'sport', 'sand', 'paved', 'water'];
const ROAD_ORDER = ['path', 'minor', 'major'];

export function drawSurroundingsMap(canvas, data, palette) {
    const size = canvas.width, half = data.half, k = size / (2 * half);
    const context = canvas.getContext('2d');
    const trace = (points, close) => {
        points.forEach(([x, z], index) => (index ? context.lineTo((x + half) * k, (z + half) * k) : context.moveTo((x + half) * k, (z + half) * k)));
        if (close) context.closePath();
    };
    const stroke = (line, width, color) => {
        context.strokeStyle = color;
        context.lineWidth = Math.max(1, width * k);
        context.beginPath();
        trace(line, false);
        context.stroke();
    };
    context.lineCap = 'round';
    context.lineJoin = 'round';
    context.fillStyle = palette.ground;
    context.fillRect(0, 0, size, size);
    for (const kind of AREA_ORDER) {
        context.fillStyle = palette.areas[kind];
        for (const area of data.areas ?? []) {
            if (area.kind !== kind || area.hidden) continue;
            context.beginPath();
            trace(area.ring, true);
            for (const hole of area.holes ?? []) trace(hole, true);
            context.fill('evenodd');
        }
    }
    for (const line of data.lines ?? []) if (line.kind === 'water' && !line.hidden) stroke(line.line, line.width, palette.water);
    for (const kind of ROAD_ORDER) {
        for (const road of data.roads ?? []) if (!road.hidden && roadClass(road.kind) === kind) stroke(road.line, road.width, palette[kind]);
    }
    for (const line of data.lines ?? []) if (line.kind === 'rail' && !line.hidden) stroke(line.line, line.width, palette.rail);
}
