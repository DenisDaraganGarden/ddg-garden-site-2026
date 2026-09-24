// A project of the kind «Участок» has no sea, boat or house: those editor
// nodes are left out of every list and path. Set once per page, before the
// editor draws (HomeEditRoute): a page shows one project. Its own module so
// the tree and the sections it registers can both read it.
let hiddenNodes = new Set();
export const setHiddenEditorNodes = (paths) => { hiddenNodes = new Set(paths); };
export const isEditorNodeHidden = (path) => hiddenNodes.has(path);
