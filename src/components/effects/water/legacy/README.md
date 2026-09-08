# Archived visual water

The old finite ripple surface, far-water shell, and terrain-strip water overlays
were removed from the active scene when the Gerstner sea became the sole visual
water path. They are kept here intact for a reversible historical comparison.

They are deliberately outside the active import graph. `useWaterRuntime` stays
active: it supplies cursor ripples, probe sampling and caustic normals to the
new sea and scene actors.

`check-water-seam.historical.mjs` records the former finite-pond/far-water
overlap assertions for comparison only. The active `scripts/check-water-seam.mjs`
checks the retained simulation boundary and SeaWater ripple hand-over instead.
