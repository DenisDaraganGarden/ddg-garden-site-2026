// Готовые рецепты цветников: растение и доля площади. С них начинает новый
// цветник; дальше доли и виды правятся в рецепте. Растения, которых нет в
// библиотеке, пропускаются. Первая палитра — для нового цветника: Ростов —
// солнце, жара и сухой август (план §7–8).
export const PLANTING_PALETTES = Object.freeze([
    { id: 'steppe', ru: 'Степной · солнце, сухо', en: 'Steppe · sun, dry', drift: 1.6, recipe: [['pennisetum-hameln', 20], ['nassella-tenuissima', 15], ['perovskia-atriplicifolia', 15], ['sedum-herbstfreude', 15], ['rudbeckia-goldsturm', 10], ['gaillardia-grandiflora', 10], ['lavandula-angustifolia', 10], ['festuca-glauca', 5]] },
    { id: 'prairie', ru: 'Злаки и многолетники', en: 'Grasses and perennials', drift: 2.2, recipe: [['miscanthus-sinensis', 15], ['pennisetum-hameln', 20], ['deschampsia-cespitosa', 15], ['liatris-spicata', 10], ['perovskia-atriplicifolia', 15], ['rudbeckia-goldsturm', 10], ['sedum-herbstfreude', 15]] },
    { id: 'flowering', ru: 'Цветущий', en: 'Flowering', drift: 1.2, recipe: [['iris-germanica', 15], ['leucanthemum-superbum', 20], ['gaillardia-grandiflora', 15], ['lavandula-angustifolia', 15], ['rudbeckia-goldsturm', 15], ['liatris-spicata', 10], ['sedum-herbstfreude', 10]] },
    { id: 'shade', ru: 'Полутень', en: 'Part shade', drift: 1.4, recipe: [['alchemilla-mollis', 30], ['deschampsia-cespitosa', 20], ['vinca-minor', 30], ['spiraea-tor-gold', 10], ['cornus-alba-elegantissima', 10]] },
    { id: 'evergreen', ru: 'Вечнозелёный каркас', en: 'Evergreen frame', drift: 1.8, recipe: [['juniperus-sabina-mas', 30], ['picea-alberta-globe', 15], ['buxus-sempervirens-ball', 15], ['festuca-glauca', 25], ['lavandula-angustifolia', 15]] },
]);
