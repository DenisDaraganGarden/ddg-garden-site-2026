# River fish collection

This is the first collection in the shared asset laboratory described in
`ASSET_LAB.md`. It does not mount in the home water scene and does not read or
write the home editor draft.

## Delivered assets

| Species | Length | Triangles | Bones | Runtime role |
| --- | ---: | ---: | ---: | --- |
| Northern pike (`Esox lucius`) | 0.92 m | 908 | 10 | solitary ambush / short burst |
| European perch (`Perca fluviatilis`) | 0.38 m | 664 | 9 | loose mid-water group |
| Common roach (`Rutilus rutilus`) | 0.18 m | 460 | 8 | cohesive polarized shoal |

Each GLB is one skinned primitive. The axial chain runs head to tail and two
extra bones drive the paired pectoral fins. Skinning uses at most two influences
per vertex. The watertight body is generated separately from the thin fin and
eye detail before the export copy is joined.

The left and right sides intentionally overlap on one lateral UV atlas. This is
the useful form of mirroring here: it halves texture memory without mirroring
geometry or the skeleton. Fin and eye color survives the one-primitive export
through `COLOR_0`.

Each species has:

- `albedo.webp` in sRGB;
- tangent-space `normal.webp` in linear space;
- `orm.webp`, with AO / roughness / metalness in R / G / B;
- `specular.webp`, whose alpha stores per-scale reflection intensity.

The scale highlight is intentionally dielectric, not metallic. Roughness,
normal relief, clearcoat and the per-scale specular mask make highlights travel
across the rows as the fish turns.

## Rebuild

```sh
node scripts/generate-fish-pbr.mjs
/Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python-exit-code 1 --python assets-source/fish/generate_fish_assets.py
/Applications/Blender.app/Contents/MacOS/Blender --background assets-source/fish/river_fish_authoring.blend --python-exit-code 1 --python assets-source/fish/export_fish_glb.py
node ./node_modules/vite/bin/vite.js --config vite.asset-lab.config.js --port 7313 --strictPort
```

Open `http://127.0.0.1:7313/asset-lab.html?collection=river-fish`.

The browser lab uses a spatial hash for neighbors, species-specific drag,
buoyancy, steering and turn-rate limits, plus explicit cruise, surface, bottom,
ambush and burst states. At the 50-fish preset it draws 51 calls and about 26k
triangles per frame at the authored LOD.

Before these assets enter the actual pond, they still need to be wired into the
scene's refraction pass and wave-relative surface clipping. That integration is
deliberately outside this isolated model task.
