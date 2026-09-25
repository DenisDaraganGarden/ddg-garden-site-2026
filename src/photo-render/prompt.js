// Shared by the local API and the prompt preview. These are image instructions,
// never scene settings: a photograph cannot change a saved camera or material.
export const PHOTO_MODEL = 'gpt-image-2.5-sunburst';
export const PHOTO_PRESETS = [
    { id: 'scene', ru: 'Как в кадре', en: 'As framed', prompt: 'Match the source lighting, sky, weather, season and time of day.' },
    { id: 'overcast', ru: 'Мягкий пасмурный свет', en: 'Soft overcast', prompt: 'Soft overcast daylight, a natural layered cloudy sky, gentle diffuse shadows and restrained colours.' },
    { id: 'sun', ru: 'Ясный день', en: 'Clear daylight', prompt: 'Clear natural daylight, a believable blue sky with a few clouds, physically consistent sunlight and shadows.' },
    { id: 'golden', ru: 'Тёплый вечер', en: 'Warm evening', prompt: 'Low warm late-afternoon sunlight, delicate atmospheric depth, natural long shadows and a softly lit sky.' },
    { id: 'blue', ru: 'Сумерки', en: 'Blue hour', prompt: 'Blue hour just after sunset. Preserve the positions and types of existing garden lights, with realistic warm illumination and a quiet twilight sky. Do not add lights.' },
];

export function photoDimensions(width, height, edge = 2048) {
    const ratio = width / height;
    if (!Number.isFinite(ratio) || ratio < 1 / 3 || ratio > 3) throw new Error('Пропорции кадра должны быть от 1:3 до 3:1.');
    const target = [1024, 2048, 3840].includes(Number(edge)) ? Number(edge) : 2048;
    const scale = Math.min(Math.sqrt(8294400 / (width * height)), 3840 / Math.max(width, height), Math.max(target / Math.max(width, height), Math.sqrt(655360 / (width * height))));
    const idealW = width * scale, idealH = height * scale;
    let best = null, score = Infinity;
    for (let dw = -4; dw <= 4; dw++) for (let dh = -4; dh <= 4; dh++) {
        const w = (Math.round(idealW / 16) + dw) * 16, h = (Math.round(idealH / 16) + dh) * 16;
        if (w <= 0 || h <= 0 || w * h < 655360 || w * h > 8294400 || Math.max(w, h) > 3840 || w > h * 3 || h > w * 3) continue;
        const candidate = Math.abs(Math.log(w / h / ratio)) * 10 + Math.abs(w / idealW - 1) + Math.abs(h / idealH - 1);
        if (candidate < score) { best = [w, h]; score = candidate; }
    }
    if (!best) throw new Error('Не удалось подобрать размер кадра.');
    return best;
}

const clean = (value, limit = 240) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').slice(0, limit);

// A raster lawn/leaf map is a preview shortcut, not a photographic reference.
// Keep this selection shared by capture and the API, including older clients.
export function isVegetationPhotoMaterial(material) {
    return /vegetation|foliage|leaves|\bleaf\b|\bgrass\b|\blawn\b|\bturf\b|\bbark\b|\bhedge\b|\bshrub\b|\bplant\b|газон|листв|листь|трав|изгород|кустар|растени|кора/i.test(String(material?.name ?? '').replace(/_/g, ' '));
}

export function photoPrompt({ mode = 'photo', description = '', preset = 'scene', context = {}, references = [], foliageReference = false } = {}) {
    const local = mode === 'edit';
    const surfaces = references.filter((ref) => !isVegetationPhotoMaterial(ref)).slice(0, 6);
    const lines = [
        'Image 1 is the exact source view of a designed garden and its architecture.',
        local
            ? 'Edit ONLY the transparent area of the mask according to the requested change. Match the surrounding photograph, perspective, scale, light, texture and shadows. Everything outside the mask must remain identical.'
            : 'Create a convincing professional architectural landscape photograph of this exact place. Preserve the camera position, lens perspective, framing, horizon, building geometry, openings, paths, edges, grades and object placements.',
        'Preserve the existing NON-LIVING materials: colours, wood grain direction, stone and brick patterns, joint spacing, texture scale, glazing and metal finishes. Do not redesign or substitute architectural materials.',
        'Use the source vegetation only for botanical identity, placement, dimensions and overall pruning shape. Reconstruct living plants; do not preserve raster leaf textures, billboard edges, aliasing, tiled patches, or the preview lawn texture.',
        'Build vegetation at three scales: the softly modelled volume of the whole crown; irregular overlapping sprays and shoots with small natural gaps; individual leaves only where their species, distance and the image resolution make them resolvable. Leaves grow along stems with varied orientations and partly overlap; they are not evenly scattered flecks on a solid surface. Keep clipped hedges clipped, but with a subtle fringe of real shoots, never a ragged or chewed outline. Keep the specified species and their real leaf sizes, not oversized generic leaves.',
        'Let broad areas of foliage share coherent middle tones and soft gradients. Leaf highlights are broad and restrained, shaded foliage retains colour and bounce light, and only occasional deep gaps are dark. Avoid a bright outline and black shadow around every leaf, glitter, white speckling, uniform microcontrast, crunchy sharpening, clarity/HDR halos and repeated texture stamps. With distance, merge fine leaves naturally into sprays and crown masses; do not resolve every leaf equally throughout the frame.',
        'Grasses have sparse, individually curved blades grouped into tufts, with air between them; avoid a dense mesh of equally bright wires. A lawn reads first as a continuous living surface with gentle variation, not a noisy carpet of isolated high-contrast blades.',
        'A quietly processed, natural colour photograph with balanced exposure, neutral local contrast, credible reflections and shadows. Preserve real detail without global blur or artificial bokeh; use normal optical falloff of fine detail with distance. No illustration, synthetic gloss, text, labels, interface or watermarks.',
    ];
    if (!local) lines.push((PHOTO_PRESETS.find((item) => item.id === preset) ?? PHOTO_PRESETS[0]).prompt);
    if (context.month) lines.push(`Planting month: ${Number(context.month)}. Preserve the corresponding foliage, flowering and dormancy; do not turn the garden into a different season.`);
    if (context.camera) lines.push(`Source camera: ${clean(context.camera.name)}; vertical field of view ${Number(context.camera.fov).toFixed(1)} degrees.`);
    if (context.plants?.length) {
        lines.push('Plant observations from the scene (image coordinates in percent, origin at the top left). Counts refer to candidates in view; the source image decides occlusion. Do not introduce anything behind opaque architecture:');
        for (const plant of context.plants.slice(0, 50)) {
            lines.push(`- ${clean(plant.name)}${plant.latin ? ` (${clean(plant.latin)})` : ''}: ${plant.count} in view; height about ${plant.height} m; positions ${clean(plant.positions, 800)}; ${clean(plant.season)}.`);
        }
    }
    if (context.objects?.length) lines.push(`Other objects in view: ${context.objects.slice(0, 32).map((o) => `${clean(o.name)} (${clean(o.position)})`).join('; ')}.`);
    const materials = context.materials?.filter((material) => !isVegetationPhotoMaterial(material)) ?? [];
    if (materials.length) lines.push(`Observed architectural surface materials: ${materials.slice(0, 24).map((m) => `${clean(m.name)}${m.color ? `, base colour ${clean(m.color)}` : ''}`).join('; ')}.`);
    surfaces.forEach((ref, i) => lines.push(`Image ${i + 2} is the actual architectural surface texture "${clean(ref.name)}" from the source scene. Preserve its identity and pattern only where that non-living material already appears. Never apply its texture to foliage. It is a material reference, not a composition to reproduce.`));
    if (foliageReference) lines.push(`Image ${surfaces.length + 2} is a real garden photograph used ONLY as a reference for the natural rendering of vegetation: coherent leaf surfaces, irregular shoots, soft tonal groupings and believable optical detail. Do not copy its plants, species, leaf size, layout, architecture, camera, weather or lighting into Image 1. Image 1 and the botanical observations remain authoritative for those. Transfer photographic naturalness, not the reference garden.`);
    const request = String(description ?? '').trim().slice(0, 4000);
    if (request) lines.push(`Requested ${local ? 'local change' : 'refinement'}: ${request}`);
    return lines.join('\n');
}
