# Black stone sculpture

Процедурный look-dev использует точный web-экспорт
`public/models/sculpture/sculpture.glb`; исходная геометрия хранится в
`assets-source/models/sculpture/sculpture.obj`. Геометрия и её иерархия не
меняются.

Материал находится в `src/black-stone-lab/blackStoneMaterial.js`. Это
диэлектрический `MeshPhysicalMaterial` (`metalness = 0`, без transmission),
расширенный через `onBeforeCompile`. UV и текстуры не требуются: слои, излом,
жилы, зерно, потёртая полировка и влажные пятна считаются в object space тремя
октавами value noise. Shader не меняет силуэт; настоящие сколы остаются
ответственностью исходной геометрии.

Слоистость, излом, жилы и потёртость имеют независимые масштабы. Слои отдельно
управляют глубиной procedural normal, остротой уступов и локальными сколами на
кромке. Микрорельеф и слоистая normal постепенно подавляются только внутри
влажной маски, поэтому сухие участки сохраняют рельеф рядом с гладкой плёнкой.

Основной пресет смешивает сухую слоистую массу, редкие стеклянные плоскости и
локальную влажность. Отдельные `slate`, `obsidian` и `wet` задают проверочные
пределы, а режимы roughness, normal и RGB masks показывают внутренние сигналы
без догадок по beauty-рендеру.

Запуск:

```sh
node ./node_modules/vite/bin/vite.js --config vite.asset-lab.config.js --port 7313 --strictPort
```

Адрес:
`http://127.0.0.1:7313/asset-lab.html?collection=black-stone-sculpture`.

Интеграция материала в `StaticSculpture.jsx` выполняется только после отдельного
утверждения вида в лаборатории.
