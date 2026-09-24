import { DESIGN_ONLY_NODES } from '../../lib/sceneObjects.js';

// A project of the kind «Участок» has no sea, boat or house: those editor
// nodes are left out of every list and path. Set once per page, before the
// editor draws (HomeEditRoute): a page shows one project. Its own module so
// the tree and the sections it registers can both read it. Until a project
// says it is a «Участок», its own nodes (the surroundings) stay hidden: the
// site's editor opens without a project.
let hiddenNodes = new Set(DESIGN_ONLY_NODES);
export const setHiddenEditorNodes = (paths) => { hiddenNodes = new Set(paths); };
export const isEditorNodeHidden = (path) => hiddenNodes.has(path);
