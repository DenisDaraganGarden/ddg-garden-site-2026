# Generated rock texture sources

Created with the built-in imagegen tool on 2026-09-07. Generated albedo references, not measured scans. The runtime PBR set is reproduced with `node scripts/terrain/build-rock-textures.mjs`. Original files are kept here, outside the public runtime assets.

## coquina

Use case: photorealistic-natural. Asset type: seamless PBR base-color source texture for procedural limestone boulders on the Sea of Azov coast, NOT a scene or isolated object. Generate ONE square 2048 x 2048 texture, edge-to-edge orthographic macro view of pale weathered bioclastic limestone / shellstone (coquina). Realistic fused broken cream shell fragments, small irregular dissolution pits, chalky off-white and restrained warm grey/beige limestone matrix, occasional subtle ochre mineral staining. Texture covers approximately 60 x 60 centimetres of rock. Fine multiscale granular structure, pores mostly 1-8 mm, occasional 15 mm cavities, eroded fossil shell impressions embedded in compact rock, NO loose pebbles. Matte dry surface, photogrammetric material capture, cross-polarized fully diffuse uniform illumination: neutral flat ALBEDO without directional highlights, shadows, ambient occlusion or perspective. Seamless tile on all four edges, irregular non-repeating distribution, constant detail density and luminosity, no vignette. No labels, letters, borders, background, large slabs, brickwork or object silhouette. The final output is ONLY this albedo texture.

## limestone

Use case: photorealistic-natural. Asset type: seamless PBR base-color source texture for fractured and sea-worn limestone rocks, NOT a scene or isolated object. Generate ONE square 2048 x 2048 texture, edge-to-edge orthographic macro view of solid pale grey limestone with fine sedimentary grain and very subtle broken bedding seams. Surface covers 60 x 60 centimetres. Cool warm-grey balanced mineral matrix, restrained creamy chalk flecks and faint buff oxidized inclusions, tiny hairline fissures, slightly etched salt-worn texture with sparse small pores, occasional worn calcite seam. Mostly compact stone surface with small scale details; no broad cloud patterns, no glossy marble, no dramatic black cracks, no granite crystals, no stone wall joints, no obvious stripes. Photogrammetric realism with cross-polarized fully diffuse uniform illumination: neutral flat ALBEDO without directional highlights, shadows, ambient occlusion or perspective. Seamless tile on all four edges, consistent brightness, no vignette. No labels, letters, borders, background, loose rocks or object silhouette. The final output is ONLY this albedo texture.

## Fresh fracture — 2026-09-07

`fracture-generated.png`: built-in imagegen, 1254 × 1254, additional albedo
for the procedural blend with the weathered coquina/limestone. Generated
reference, not a measured scan. The runtime surface packs independent fields:
R blend mask, G estimated height, B estimated AO, A roughness.

Prompt: Create a single seamless square PBR base-color/albedo texture for
photoreal coastal limestone boulders, representing a 60 by 60 cm patch of
freshly fractured pale warm grey calcium limestone and coquina. Orthographic
straight-on surface scan, no object boundary or perspective. Irregular broad
angular cleavage scars with small splintered rims, fractured granular stone,
shallow angular gouges, sporadic deeper weathered pits, broken shell inclusions,
thin interrupted sedimentary ridges. Large fracture planes 10–20 cm wide and
smaller chips 1–4 cm, fine mineral grain, locally retained ochre-grey aged crust.
Avoid regular tessellations, continuous polygon crackle, tiled paving, brick,
pebbles, mud cracks, polished marble, fluffy uniform sand and melting forms.
Restrained limestone palette, diffuse perfectly even illumination, minimal
relief shading, no cast shadows, highlights, vignetting or baked directional
lighting. Real material-library albedo, edge to edge, seamless on all edges.
