import {
    SeabedSection,
    WaterGeometrySection,
    WaterShaderSection,
    WaterWavesSection,
} from './sections/landscape';
import { AlgaeSection, EmptySection, LiliesSection } from './sections/greenery';
import { BoatSection, SculptureSection } from './sections/objects';
import {
    FogSection,
    HdriSection,
    LightSection,
    RaysSection,
} from './sections/atmosphere';
import {
    CameraSection,
    DebugSection,
    PostSection,
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
import {
    AudioMixerSection,
    AudioSpatialSection,
    AudioTracksSection,
} from './sections/audio';

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
            { id: 'lilies', aspects: [{ id: 'scatter', Section: LiliesSection }] },
            { id: 'algae', aspects: [{ id: 'scatter', Section: AlgaeSection }] },
            { id: 'trees', aspects: [{ id: 'empty', Section: EmptySection }] },
            { id: 'shrubs', aspects: [{ id: 'empty', Section: EmptySection }] },
            { id: 'grass', aspects: [{ id: 'empty', Section: EmptySection }] },
        ],
    },
    {
        id: 'objects',
        nodes: [
            { id: 'boat', aspects: [{ id: 'transform', Section: BoatSection }] },
            { id: 'sculpture', aspects: [{ id: 'transform', Section: SculptureSection }] },
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
        id: 'render',
        nodes: [
            { id: 'visibility', aspects: [{ id: 'visibility', Section: VisibilitySection }] },
            { id: 'camera', aspects: [{ id: 'camera', Section: CameraSection }] },
            { id: 'resolution', aspects: [{ id: 'resolution', Section: ResolutionSection }] },
            { id: 'post', aspects: [{ id: 'post', Section: PostSection }] },
            { id: 'debug', devOnly: true, aspects: [{ id: 'debug', Section: DebugSection }] },
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
];

export const DEFAULT_EDITOR_PATH = 'landscape/water';

// The selection is one string ("group/node") so it rides the existing persisted
// activeTab without touching the settings hook. Anything unrecognised - including
// a value saved by the old flat tabs - falls back to the first available node.
export function resolveEditorPath(path, { includeDevOnly = false } = {}) {
    const groups = EDITOR_TREE.map((group) => ({
        ...group,
        nodes: group.nodes.filter((node) => includeDevOnly || !node.devOnly),
    })).filter((group) => group.nodes.length > 0);

    const [groupId, nodeId] = String(path ?? '').split('/');
    const group = groups.find((item) => item.id === groupId) ?? groups[0];
    const node = group.nodes.find((item) => item.id === nodeId) ?? group.nodes[0];

    return { groups, group, node, path: `${group.id}/${node.id}` };
}
