import { EDITOR_TREE } from '../editorTree';

// Focus groups the existing stable editor tree into six working domains.
// The original group/node path stays the selection and persistence contract.
export const FOCUS_DOMAINS = [
    { id: 'scene', ru: 'Сцена', en: 'Scene', icon: 'grid', groupIds: ['landscape', 'greenery', 'objects', 'creatures'] },
    { id: 'environment', ru: 'Среда', en: 'Environment', icon: 'sun', groupIds: ['atmosphere', 'lights'] },
    { id: 'cameras', ru: 'Камеры', en: 'Cameras', icon: 'camera', groupIds: ['cameras'] },
    { id: 'render', ru: 'Рендер', en: 'Render', icon: 'sliders', groupIds: ['render'] },
    { id: 'audio', ru: 'Звук', en: 'Audio', icon: 'sound', groupIds: ['audio'] },
    // Настройки движка — то, что про кадр и рабочее место, а не про сцену:
    // разрешение, качество кадра, интерфейс, редактор, клавиши. Открываются
    // отдельным окном, а не в правой панели. Видимость объектов и плёнка — это
    // сцена, они остаются в «Рендере» справа.
    { id: 'workspace', ru: 'Настройки движка', en: 'Engine settings', icon: 'settings', groupIds: ['engine', 'interface', 'cursor', 'editor'], dialog: 'settings' },
];

// Разделы окна настроек: слева список, справа те же секции, что и в инспекторе.
export const SETTINGS_PAGES = [
    { id: 'graphics', ru: 'Графика', en: 'Graphics', icon: 'sliders', paths: ['engine/resolution', 'engine/quality'] },
    { id: 'interface', ru: 'Интерфейс', en: 'Interface', icon: 'panel', paths: ['interface/ui', 'cursor/cursor'] },
    { id: 'editor', ru: 'Редактор', en: 'Editor', icon: 'settings', paths: ['editor/settings'] },
    { id: 'keys', ru: 'Клавиши', en: 'Shortcuts', icon: 'help', paths: [] },
    { id: 'debug', ru: 'Отладка', en: 'Debug', icon: 'bug', paths: ['engine/debug'], devOnly: true },
];

const groupToDomain = new Map(
    FOCUS_DOMAINS.flatMap((domain) => domain.groupIds.map((groupId) => [groupId, domain])),
);

export function getFocusDomain(path) {
    const groupId = String(path ?? '').split('/')[0];
    return groupToDomain.get(groupId) ?? FOCUS_DOMAINS[0];
}

export function getFocusGroups(domainId, { includeDevOnly = false } = {}) {
    const domain = FOCUS_DOMAINS.find((item) => item.id === domainId) ?? FOCUS_DOMAINS[0];
    return domain.groupIds
        .map((groupId) => EDITOR_TREE.find((group) => group.id === groupId))
        .filter(Boolean)
        .map((group) => ({
            ...group,
            nodes: group.nodes.filter((node) => includeDevOnly || !node.devOnly),
        }))
        .filter((group) => group.nodes.length > 0);
}

const NODE_ICONS = {
    terrain: 'terrain', rocks: 'terrain', pebbles: 'terrain', shore: 'terrain', water: 'water', seabed: 'water',
    lilies: 'leaf', algae: 'leaf', trees: 'leaf', shrubs: 'leaf', grass: 'leaf',
    tanker: 'box', boat: 'box', sculpture: 'box',
    seagulls: 'bird', fish: 'fish',
    light1: 'light', light1target: 'target', light2: 'light', light2target: 'target',
    light: 'sun', hdri: 'cloud', fog: 'cloud', rays: 'sun', clouds: 'cloud',
    audioMixer: 'sound', audioTracks: 'sound', audioSpatial: 'sound',
    camera: 'camera', visibility: 'eye', resolution: 'sliders', quality: 'sliders', post: 'sliders', debug: 'bug',
    ui: 'panel', cursor: 'cursor', settings: 'settings',
};

export function getNodeIcon(nodeId) {
    return NODE_ICONS[nodeId] ?? 'box';
}

export function getFocusLabel(item, language = 'ru') {
    return language === 'ru' ? item.ru : item.en;
}
