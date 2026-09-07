# Shore limestone, 7 September 2026

Generated with the built-in imagegen tool for Denis's driftwood lab stone circle.
The source is an AI material reference, not a measured scan. Native source size
1254 × 1254; runtime maps are 1024 × 1024, one repeat covers 0.60 × 0.60 metres.
`scripts/terrain/build-shore-stone-textures.mjs` prepares periodic borders and
derives a restrained relief estimate from local luminance differences, then
bakes the normal and packed surface maps. Large colour clouds are excluded from
height. Fine dark inclusions can still be interpreted as shallow pits.

Runtime files in `public/textures/shore-stone/`: albedo (sRGB), normal (linear,
OpenGL +Y), surface (linear R ambient occlusion, G roughness, B height). No metal.
Height is a shading estimate, not measured displacement; the silhouette is mesh
geometry. Original and runtime maps are saved in the project.

## Generation prompt

Use case: photorealistic-natural. Asset type: seamless physically based 3D stone material base-color texture, not a picture of an object. Generate one high-resolution square 2048 x 2048 texture image. Orthographic flat surface color scan covering exactly 60 x 60 cm of dry water-worn coastal sedimentary limestone / fine sandstone, suitable for individual 15–40 cm beach stones in a hand-laid stone circle on an Azov shore. Warm pale grey beige stone, muted mineral ochre clouds and subtle cool grey mottling, sparse tiny dark grains, small naturally eroded pores, fine irregular mineral speckling predominantly 0.3–2 mm, a few 3–6 mm pits, faint discontinuous sediment traces. Natural multi-scale irregular detail with subdued contrast. The entire square is continuous SOLID ROCK surface. Perfect seamless tiling horizontally and vertically: patterns continue across opposite edges. PBR base color only: uniform diffuse neutral illumination, remove directional light, no shadows, no highlights, no ambient occlusion, no dark vignette, no large cracks or deep crevices. No objects, no separate pebbles, no stones in sand, no layout, no borders, no grid, no text, no labels, no watermark. Nothing sculpted or faceted, no polygon outlines, no repeated dots or regular pattern. Highly realistic natural stone texture, restrained fine detail.
