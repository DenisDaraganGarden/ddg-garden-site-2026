import * as THREE from 'three';

// Знак отметки уровня «от руки» на холсте и поиск поверхности под отметкой —
// для AnnotationLayer.jsx.
const FONT = '"Noteworthy", "Marker Felt", "Chalkboard SE", "Bradley Hand", "Comic Sans MS", cursive';
const RATIO = 2;
export const SHELF = 26;
const TIP = 11;
const DOWN = new THREE.Vector3(0, -1, 0);

export const hash = (text) => { let h = 2166136261; for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
function wobble(seed) {
    let a = seed;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 - 0.5; };
}

// Линия от руки: белая подложка (читается на тёмном и светлом), потом два
// прохода цветом с дрожью — как карандаш по линейке.
function sketch(ctx, points, color, width, rand) {
    const pass = (stroke, lineWidth, shake) => {
        ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth;
        ctx.beginPath();
        points.forEach(([x, y], i) => { const dx = rand() * shake, dy = rand() * shake; if (i) ctx.lineTo(x + dx, y + dy); else ctx.moveTo(x + dx, y + dy); });
        ctx.stroke();
    };
    pass('rgba(255,255,255,0.85)', width + 3, 0);
    pass(color, width, 0.9);
    pass(color, width * 0.6, 1.4);
}

// Знак отметки на холсте. Остриё — внизу слева (tip), полочка — на высоте
// level · SHELF над ним. Размеры — css-пиксели; холст в RATIO раз плотнее.
// fill, outline — белая заливка под числом и рамка вокруг него; без заливки
// у числа белый ореол, как у линий, — читается и так.
export function drawMark(canvas, { text, color, level = 0, selected = false, zero = false, seed = 1, fill = true, outline = true }) {
    const ctx = canvas.getContext('2d');
    const font = `bold 19px ${FONT}`;
    ctx.font = font;
    const width = Math.ceil(ctx.measureText(text).width);
    // Снизу вверх: остриё, выноска до полочки, над ней рамка с числом.
    const tipX = TIP, shelfY = 34 + level * SHELF, W = tipX + width + 30, H = shelfY + 34;
    // Новый размер холста сбрасывает его состояние — шрифт ставится снова.
    canvas.width = W * RATIO; canvas.height = H * RATIO;
    ctx.setTransform(RATIO, 0, 0, RATIO, 0, 0);
    ctx.font = font;
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const rand = wobble(seed), baseY = H - 2, top = baseY - shelfY;
    if (selected) sketch(ctx, [[tipX - 8, baseY], [tipX + 8, baseY]], '#f2c14e', 3, rand);
    // Стрелка остриём в точку, выноска вверх, полочка вправо.
    sketch(ctx, [[tipX - 7, baseY - 11], [tipX, baseY], [tipX + 7, baseY - 11]], color, 2, rand);
    sketch(ctx, [[tipX, baseY], [tipX, top]], color, 1.6, rand);
    sketch(ctx, [[tipX, top], [tipX + width + 22, top]], color, zero ? 2.4 : 1.6, rand);
    if (zero) sketch(ctx, [[tipX + 4, top + 4], [tipX + width + 18, top + 4]], color, 1.1, rand);
    // Число в рамке над полочкой.
    const box = { x: tipX + 5, y: top - 28, w: width + 14, h: 24 };
    if (fill) {
        ctx.fillStyle = selected ? 'rgba(255, 246, 214, 0.96)' : 'rgba(255, 255, 255, 0.93)';
        ctx.beginPath(); ctx.roundRect(box.x, box.y, box.w, box.h, 7); ctx.fill();
    }
    if (outline) sketch(ctx, [[box.x + 5, box.y], [box.x + box.w - 5, box.y + 0.5], [box.x + box.w, box.y + 6], [box.x + box.w - 0.5, box.y + box.h - 5], [box.x + box.w - 6, box.y + box.h], [box.x + 5, box.y + box.h - 0.5], [box.x, box.y + box.h - 6], [box.x + 0.5, box.y + 5], [box.x + 5, box.y]], selected ? '#d19a2a' : color, 1.2, rand);
    ctx.textBaseline = 'middle';
    if (!fill) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3.5;
        ctx.strokeText(text, box.x + 7, box.y + box.h / 2 + 1);
    }
    ctx.fillStyle = color;
    ctx.fillText(text, box.x + 7, box.y + box.h / 2 + 1);
    return { width: W, height: H, tipX };
}

// Поверхность под отметкой: луч сверху через её x, z — по модели или, у
// отметки на плоскости, по плоскости; из попаданий — самое близкое к прежней
// высоте (отметка на террасе не прыгает на крышу). Нет попаданий (модель ещё
// грузится) — null, отметка остаётся где была.
const solid = (object) => {
    for (let node = object; node; node = node.parent) if (!node.visible) return false;
    const material = Array.isArray(object.material) ? object.material[0] : object.material;
    return !object.userData.faceNormal && !object.userData.crownPlan && !material?.transparent;
};
export function snapHeight(scene, mark, ray = new THREE.Raycaster()) {
    const targets = [scene.getObjectByName(mark.ground ? 'ground-plane' : 'placed')].filter(Boolean);
    ray.set(new THREE.Vector3(mark.x, mark.y + 3, mark.z), DOWN);
    ray.far = 6;
    let best = null;
    for (const hit of ray.intersectObjects(targets, true)) if (solid(hit.object) && (best === null || Math.abs(hit.point.y - mark.y) < Math.abs(best - mark.y))) best = hit.point.y;
    return best;
}

