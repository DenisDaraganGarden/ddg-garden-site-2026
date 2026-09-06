# Grass source prompts — Azov steppe coast

Генератор тот же, что у лоха (`public/textures/plants/oleaster-source-prompt.md`):
сначала альбедо, потом из него карты. Все альбедо — «neutral diffuse cross-polarized,
no shadows, no highlights», взгляд строго спереди, без перспективы и сцены, прозрачный
фон; если прозрачность не выходит — ровный фон #FF00FF (magenta), я его выключу.
Размер: максимальный, что даёт генератор; для лезвий портрет 1024×1536, для плиток и
метёлок квадрат. Сохранять PNG в `public/textures/grass/source/` под именем из плана.

Общая шапка для каждого запроса:

> Use case: photorealistic-natural.
> Asset type: physically based 3D vegetation albedo/opacity atlas, transparent RGBA PNG,
> orthographic straight-on view, neutral diffuse cross-polarized albedo, no shadows, no
> directional illumination, no highlights, no rim light. Actually transparent background
> and negative spaces with alpha channel, not white, not checkerboard; sharp clean alpha
> silhouettes, no halo. Nothing else in the image: no soil, no roots, no scene, no labels,
> no text, no watermark. This is a functional texture atlas, not a decorative composition.

## 1. `stipa-blades-albedo.png` — ковыль, лезвия

Create a portrait atlas of six separate Stipa lessingiana (feather grass) leaf blades in
a strict 6 columns x 1 row grid, one isolated blade per identical cell, no grid lines.
Every blade vertical, its base at the bottom centre of the cell and its tip at the top
centre, complete from base to tip, filling 92% of the cell height and at most 40% of the
cell width. Blades narrow, tightly inrolled, thread-like, grey-green with fine
longitudinal ribs; the lower third fresh green, the upper third fading to pale straw
yellow. Three blades early-summer fresh, three blades late-summer half-dry with straw
tips. Natural photographic botanical detail for close 3D inspection.

## 2. `stipa-awns-albedo.png` — ковыль, ости с перьями

Create a portrait atlas of four separate feathery awns of Stipa pennata (European
feather grass) in a strict 4 columns x 1 row grid, one isolated awn per identical cell,
no grid lines. Every awn vertical: the short twisted dark base at the bottom centre, the
long silky plumose plume rising to the top centre, 92% of the cell height, plume width
up to 60% of the cell. Fine translucent silky hairs on both sides of a thin straw-coloured
axis, pale silver-white with a warm straw core, hairs slightly curved by their own weight.
Four different plumes: two dense and fresh, two thinner and windblown.

## 3. `festuca-blades-albedo.png` — типчак, лезвия

Create a portrait atlas of six separate Festuca valesiaca (Volga fescue) leaf blades in a
strict 6 columns x 1 row grid, one isolated blade per identical cell, no grid lines.
Every blade vertical, base at the bottom centre, tip at the top centre, complete, filling
92% of the cell height and at most 30% of the cell width. Blades hair-thin, wiry,
inrolled, glaucous blue-green with a fine waxy bloom, a few faint ribs; four blades fresh
glaucous green, two blades with dry straw tips and a brownish base sheath.

## 4. `leymus-blades-albedo.png` — колосняк песчаный, лезвия

Create a portrait atlas of six separate Leymus racemosus (mammoth wild rye, dune grass)
leaf blades in a strict 6 columns x 1 row grid, one isolated blade per identical cell, no
grid lines. Every blade vertical, base at the bottom centre, tip at the top centre,
complete, filling 92% of the cell height and at most 55% of the cell width. Blades stiff,
broad, flat to slightly folded, blue-grey glaucous with a pale waxy bloom, strong parallel
ribs, rough edges; four blades fresh, two with dry brown tips and a torn edge.

## 5. `phragmites-leaves-albedo.png` — тростник, листья

Create a portrait atlas of six separate Phragmites australis (common reed) leaf blades in
a strict 6 columns x 1 row grid, one isolated leaf per identical cell, no grid lines.
Every leaf vertical, its sheath base at the bottom centre, tip at the top centre,
complete, filling 92% of the cell height and at most 60% of the cell width. Leaves broad
lanceolate, flat, grey-green, a pale midrib and fine parallel veins, rough finely
serrated edges, slightly twisted along their length; four leaves fresh, two late-season
with yellowing and brown dry margins.

## 6. `phragmites-panicles-albedo.png` — тростник, метёлки

Create a square atlas of four separate Phragmites australis (common reed) flower
panicles in a strict 2 columns x 2 rows grid, one isolated panicle per identical cell, no
grid lines. Every panicle vertical, its stalk at the bottom centre, the plume at the top,
filling 90% of the cell height and at most 70% of the cell width, drooping slightly to one
side. Two panicles young: dense, purplish-brown, spikelets tight; two panicles mature:
loose, fluffy, silky silver-grey with long soft hairs. Fine photographic detail.

## 7. `phragmites-stems-albedo.png` — тростник, стебли (необязательно)

Create a portrait atlas of four separate Phragmites australis reed stem segments in a
strict 4 columns x 1 row grid, one isolated straight vertical stem per identical cell, no
grid lines, each stem filling 96% of the cell height and about 12% of the cell width,
cut flat at top and bottom. Smooth hollow cane, straw-yellow with green shading near two
visible nodes per segment, thin dry leaf sheath remnants wrapping one node; two stems
green early-season, two stems dry golden late-season.

## 8. `leymus-spikes-albedo.png` — колосняк, колосья (необязательно)

Create a portrait atlas of four separate Leymus racemosus flower spikes in a strict 4
columns x 1 row grid, one isolated vertical spike per identical cell, no grid lines,
stalk at the bottom centre, tip at the top, 92% of the cell height, at most 35% of the
cell width. Dense cylindrical spike of overlapping glaucous blue-green spikelets, two
fresh, two dry straw-coloured.

## 9. `turf-fresh-albedo.png` — дёрн свежий (плитка)

Use case: photorealistic-natural. Asset type: seamless tileable top-down orthographic
albedo texture, square, edges wrap perfectly in both directions. A 2 x 2 metre patch of
Azov steppe turf in early summer seen straight down: dense fine fescue and feather grass
blades, glaucous green with scattered silvery feather-grass plumes, a little last-year
straw litter, small gaps of pale grey-brown loam, no flowers, no stones. Uniform
coverage without a focal point, no repeated obvious features, no shadows, no lighting
direction, no highlights, no vignette. Nothing else: no text, no watermark.

## 10. `turf-dry-albedo.png` — дёрн сухой (плитка)

Same as the fresh turf, but late August after weeks of drought: straw-yellow and
silver-grey dry blades over grey-green bases, dry litter, more bare pale loam and dust,
a few dark grey dry stems; still a seamless tileable top-down orthographic albedo,
uniform, no shadows, no lighting direction.

## 11. `turf-trampled-albedo.png` — дёрн притоптанный (плитка)

Same family as the turf tiles, seamless tileable top-down orthographic albedo: the same
steppe turf trampled by feet and wind, blades pressed flat in mostly one direction with
a slight swirl, crushed pale straw, bruised dull green, dusty compacted loam showing
through in irregular worn patches, no footprints, no shadows, no lighting direction.

## Карты из альбедо — запросы ко второму шагу

К каждому альбедо, «from this image, same resolution, exactly aligned pixel to pixel»:

- **Opacity** (`-opacity.png`, только если прозрачность не вышла): «Produce a black and
  white opacity mask of this atlas: pure white where there is plant material, pure black
  everywhere else, hard anti-aliased edges, no grey halo, exactly aligned.»
- **Normal** (`-normal.png`): «Produce a tangent-space normal map of this atlas, OpenGL
  convention: flat areas RGB(128,128,255), green channel points up the image. Encode the
  blade midrib ridge, parallel veins and rolled edges as gentle relief; no colour or
  lighting from the albedo, background flat RGB(128,128,255), same alignment.»
- **Roughness** (`-roughness.png`): «Produce a greyscale roughness map: black is glossy,
  white is matte. Fresh waxy blade bases about 55% grey, dry straw tips and awns about
  80% grey, panicle hairs 85%; background white, same alignment.»
- **Translucency** (`-translucency.png`, только вырезки): «Produce a greyscale thickness
  map for light passing through: white where the plant is thin and backlight passes
  (blade tips, awn plumes, panicle hairs), black where it is opaque (stem bases, sheaths);
  background black, same alignment.»
- **AO** (`-ao.png`): «Produce a greyscale ambient occlusion map: white open surfaces,
  darker where blades or spikelets overlap and converge at the base; background white.»
- **Height** (`-height.png`, только плитки): «Produce a greyscale height map of this turf
  tile: white the top of the blades, black the soil between them, no lighting, seamless
  like the source.»

Нормали и шероховатость от генератора я проверю; если они «нарисованы», выведу их из
альбедо скриптом, как `leaf-normal.png` у лоха. Главное от Дениса — альбедо и
просвечивание.
