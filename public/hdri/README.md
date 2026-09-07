# HDRI environments

Downloaded from Poly Haven on 2026-09-07. Radiance HDR, 2K equirectangular
(2048 × 1024), original downloads without tonemapping or conversion to LDR.
The renderer loads the selected local file through Drei's HDR loader/PMREM.
There is no runtime dependency on Poly Haven or Drei's preset CDN.

All six assets are [CC0](https://polyhaven.com/license).

| Editor preset | Persisted ID | Asset and source | Authors |
| --- | --- | --- | --- |
| Ночь / Night | `night` | [Kloppenheim 02 (Pure Sky)](https://polyhaven.com/a/kloppenheim_02_puresky) — `kloppenheim_02_puresky_2k.hdr` | Greg Zaal, Jarod Guest |
| Пасмурно / Overcast | `studio` | [Kloofendal Overcast (Pure Sky)](https://polyhaven.com/a/kloofendal_overcast_puresky) — `kloofendal_overcast_puresky_2k.hdr` | Greg Zaal |
| Солнце без облаков / Clear sun | `warehouse` | [Kloofendal 43d Clear (Pure Sky)](https://polyhaven.com/a/kloofendal_43d_clear_puresky) — `kloofendal_43d_clear_puresky_2k.hdr` | Greg Zaal |
| Солнце с облаками / Sun with clouds | `city` | [Kloofendal 48d Partly Cloudy (Pure Sky)](https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky) — `kloofendal_48d_partly_cloudy_puresky_2k.hdr` | Greg Zaal, Jarod Guest |
| Закатное солнце / Sunset | `sunset` | [Qwantani Sunset (Pure Sky)](https://polyhaven.com/a/qwantani_sunset_puresky) — `qwantani_sunset_puresky_2k.hdr` | Greg Zaal, Jarod Guest |
| Розоватое солнце / Pink sun | `dawn` | [Pink Sunrise](https://polyhaven.com/a/pink_sunrise) — `pink_sunrise_2k.hdr` | Greg Zaal |

Five maps are sky-only editions. Pink Sunrise includes the photographed coastal
horizon and road; its pink light is photographic, not a tint applied by the engine.

Preset IDs stay compatible with existing published settings and camera snapshots.
Their display names and mapped files have changed. Matching broad water palette
anchors live in `src/components/effects/homeSceneLighting.js`; they are artistic
approximations, not measured irradiance from these files. Direct sun settings
remain separately authored in the scene.

The previous `dikhololo_night_1k.hdr` remains available for old asset URLs but is
no longer selected by the renderer. Its source is
[Dikhololo Night](https://polyhaven.com/a/dikhololo_night), Greg Zaal, CC0.
