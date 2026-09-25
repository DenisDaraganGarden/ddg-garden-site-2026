import { isEditorNodeHidden } from './hiddenNodes.js';
import {TopiarySection} from './sections/topiary';
import { PlantingSection } from './sections/planting';
import {PlacedSection} from './sections/placed';
import {ShrubsSection} from './sections/shrubs';
import {TreesSection} from './sections/trees';
import { TerrainSection } from './sections/terrain';
import { TankerSection } from './sections/tanker';
import { SurfboardBoardSection, SurfboardCheckpointSection, SurfboardRideSection } from './sections/surfboard';
import { HouseLightSection, HousePaintSection, HouseThingsSection, HouseTransformSection, HouseWearSection } from './sections/house';
import {
    SeabedSection,
    WaterGeometrySection,
    WaterShaderSection,
    WaterWavesSection,
} from './sections/landscape';
import { AlgaeSection, LiliesSection } from './sections/greenery';
import { GrassSection } from './sections/grass';
import { BoatSection, PlaneSection, SculptureSection } from './sections/objects';
import {
    CloudsSection,
    FogSection,
    HdriSection,
    LightSection,
    RaysSection,
} from './sections/atmosphere';
import {
    CameraSection,
    DebugSection,
    PostLookSection,
    PostQualitySection,
    ResolutionSection,
    VisibilitySection,
} from './sections/render';
import {
    Light1Section,
    Light1TargetSection,
    Light2Section,
    Light2TargetSection,
} from './sections/lights';
import { InterfaceSection } from './sections/interfaceSection';
import { CursorSection } from './sections/cursorSection';
import { EditorSettingsSection } from './sections/editorSettings';
import { PebblesSection, RocksSection } from './sections/rocks';
import { ShoreSection } from './sections/shore';
import { FishSection, SeagullsSection } from './sections/creatures';
import { AnnotationsSection } from './sections/annotations';
import { WalkStartSection } from './sections/walkStart';
import { LightingSection } from './sections/lighting';
import { LightingPowerSection } from './sections/lightingPower';
import { WindSection } from './sections/wind';
import {
    AudioMixerSection,
    AudioSpatialSection,
    AudioTracksSection,
} from './sections/audio';
import { SurroundingsSection } from './sections/surroundings';
import { ApiSection } from './sections/apiKey';

// The editor is organised the way a game engine organises a scene: groups hold
// objects, and an object exposes its aspects. Aspects render as headings inside
// the object's body rather than as a third row of tabs - the panel is short, and
// stacking them reads like an inspector instead of eating the frame.
//
// `devOnly` nodes only appear in a dev build.
export const EDITOR_TREE = [
    {
        id: 'landscape',
        nodes: [
            // Только в «Участке» (sceneObjects.js, design): окружение по адресу.
            { id: 'surroundings', aspects: [{ id: 'surroundings', Section: SurroundingsSection }] },
            { id: 'terrain', aspects: [{ id: 'geometry', Section: TerrainSection }] },
            { id: 'rocks', aspects: [{ id: 'rocks', Section: RocksSection }] },
            { id: 'pebbles', aspects: [{ id: 'pebbles', Section: PebblesSection }] },
            { id: 'shore', aspects: [{ id: 'scatter', Section: ShoreSection }] },
            {
                id: 'water',
                aspects: [
                    { id: 'geometry', Section: WaterGeometrySection },
                    { id: 'waves', Section: WaterWavesSection },
                    { id: 'shader', Section: WaterShaderSection },
                ],
            },
            {
                id: 'seabed',
                aspects: [{ id: 'shader', Section: SeabedSection }],
            },
        ],
    },
    {
        id: 'greenery',
        nodes: [
            // workspace: своё рабочее место вместо «Параметры / Избранное» (FocusEditor).
            { id: 'planting', workspace: true, aspects: [{ id: 'scatter', Section: PlantingSection }] },
            { id: 'lilies', aspects: [{ id: 'scatter', Section: LiliesSection }] },
            { id: 'algae', aspects: [{ id: 'scatter', Section: AlgaeSection }] },
            { id: 'trees', aspects: [{ id: 'scatter', Section: TreesSection }] },
            { id: 'topiary', aspects: [{ id: 'scatter', Section: TopiarySection }] },
            { id: 'shrubs', aspects: [{ id: 'scatter', Section: ShrubsSection }] },
            { id: 'grass', aspects: [{ id: 'meadow', Section: GrassSection }] },
        ],
    },
    {
        id: 'objects',
        nodes: [
            { id: 'tanker', aspects: [{ id: 'transform', Section: TankerSection }] },
            { id: 'boat', aspects: [{ id: 'transform', Section: BoatSection }] },
            { id: 'sculpture', aspects: [{ id: 'transform', Section: SculptureSection }] },
            { id: 'plane', aspects: [{ id: 'transform', Section: PlaneSection }] },
            { id: 'placed', aspects: [{ id: 'transform', Section: PlacedSection }] },
            {
                id: 'surfboard',
                aspects: [
                    { id: 'board', Section: SurfboardBoardSection },
                    { id: 'ride', Section: SurfboardRideSection },
                    { id: 'checkpoint', Section: SurfboardCheckpointSection },
                ],
            },
            {
                id: 'house',
                aspects: [
                    { id: 'transform', Section: HouseTransformSection },
                    { id: 'wear', Section: HouseWearSection },
                    { id: 'paint', Section: HousePaintSection },
                    { id: 'light', Section: HouseLightSection },
                    { id: 'things', Section: HouseThingsSection },
                ],
            },
        ],
    },
    {
        id: 'creatures',
        nodes: [
            { id: 'seagulls', aspects: [{ id: 'flock', Section: SeagullsSection }] },
            { id: 'fish', aspects: [{ id: 'school', Section: FishSection }] },
        ],
    },
    // Аннотации — пометки проектировщика поверх сцены (src/annotations):
    // отметки уровня и старт прогулки (src/walk); следующие виды — новыми
    // узлами здесь.
    {
        id: 'annotations',
        nodes: [
            { id: 'levels', aspects: [{ id: 'marks', Section: AnnotationsSection }] },
            { id: 'walkStart', aspects: [{ id: 'start', Section: WalkStartSection }] },
        ],
    },
    // Освещение сада (src/lighting): светильники и их свет; питание — щитки, цепи, трассы.
    {
        id: 'lighting',
        nodes: [
            { id: 'luminaires', aspects: [{ id: 'fixtures', Section: LightingSection }] },
            { id: 'power', aspects: [{ id: 'power', Section: LightingPowerSection }] },
        ],
    },
    {
        id: 'lights',
        nodes: [
            { id: 'light1', aspects: [{ id: 'transform', Section: Light1Section }] },
            { id: 'light1target', aspects: [{ id: 'transform', Section: Light1TargetSection }] },
            { id: 'light2', aspects: [{ id: 'transform', Section: Light2Section }] },
            { id: 'light2target', aspects: [{ id: 'transform', Section: Light2TargetSection }] },
        ],
    },
    {
        id: 'atmosphere',
        nodes: [
            { id: 'light', aspects: [{ id: 'light', Section: LightSection }] },
            { id: 'hdri', aspects: [{ id: 'hdri', Section: HdriSection }] },
            { id: 'fog', aspects: [{ id: 'fog', Section: FogSection }] },
            { id: 'rays', aspects: [{ id: 'rays', Section: RaysSection }] },
            { id: 'clouds', aspects: [{ id: 'clouds', Section: CloudsSection }] },
            // Ветер: берег, сад и прибой (sections/wind.jsx).
            { id: 'wind', aspects: [{ id: 'wind', Section: WindSection }] },
        ],
    },
    {
        id: 'audio',
        nodes: [
            { id: 'audioMixer', aspects: [{ id: 'mixer', Section: AudioMixerSection }] },
            { id: 'audioTracks', aspects: [{ id: 'tracks', Section: AudioTracksSection }] },
            { id: 'audioSpatial', aspects: [{ id: 'spatial', Section: AudioSpatialSection }] },
        ],
    },
    {
        id: 'cameras',
        nodes: [
            { id: 'camera', aspects: [{ id: 'camera', Section: CameraSection }] },
        ],
    },
    {
        id: 'render',
        nodes: [
            { id: 'visibility', aspects: [{ id: 'visibility', Section: VisibilitySection }] },
            { id: 'post', aspects: [{ id: 'post', Section: PostLookSection }] },
        ],
    },
    // Движок — то, что не про сцену, а про кадр как таковой: разрешение,
    // сглаживание, апскейл, AO. Живёт в окне настроек, а не в правой панели.
    {
        id: 'engine',
        nodes: [
            { id: 'resolution', aspects: [{ id: 'resolution', Section: ResolutionSection }] },
            { id: 'quality', aspects: [{ id: 'quality', Section: PostQualitySection }] },
            { id: 'debug', devOnly: true, aspects: [{ id: 'debug', Section: DebugSection }] },
            // Ключ OpenAI для текстур по ИИ — только в окне настроек (focusNavigation SETTINGS_PAGES).
            { id: 'api', aspects: [{ id: 'api', Section: ApiSection }] },
        ],
    },
    {
        id: 'interface',
        nodes: [
            { id: 'ui', aspects: [{ id: 'ui', Section: InterfaceSection }] },
        ],
    },
    {
        id: 'cursor',
        nodes: [
            { id: 'cursor', aspects: [{ id: 'cursor', Section: CursorSection }] },
        ],
    },
    {
        id: 'editor',
        nodes: [
            { id: 'settings', aspects: [{ id: 'settings', Section: EditorSettingsSection }] },
        ],
    },
];

export const DEFAULT_EDITOR_PATH = 'landscape/water';

// The selection is one string ("group/node") so it rides the existing persisted
// activeTab without touching the settings hook. Anything unrecognised - including
// a value saved by the old flat tabs - falls back to the first available node.
export function resolveEditorPath(path, { includeDevOnly = false } = {}) {
    const groups = EDITOR_TREE.map((group) => ({
        ...group,
        nodes: group.nodes.filter((node) => (includeDevOnly || !node.devOnly) && !isEditorNodeHidden(`${group.id}/${node.id}`)),
    })).filter((group) => group.nodes.length > 0);

    const [groupId, nodeId] = String(path ?? '').split('/');
    const group = groups.find((item) => item.id === groupId) ?? groups[0];
    const node = group.nodes.find((item) => item.id === nodeId) ?? group.nodes[0];

    return { groups, group, node, path: `${group.id}/${node.id}` };
}
