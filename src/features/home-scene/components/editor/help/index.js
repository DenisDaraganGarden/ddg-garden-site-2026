// The «?» beside a parameter: what it does, for the one who moves it. One table
// per group of parameters (water.js, atmosphere.js, …), each key → [по-русски,
// in English], the key being the parameter's key in docs/engine-parameters.json.
// The bundler gathers every table in this folder, so a new one is picked up by
// itself; helpTables.check.js holds them to the reference.
const tables = import.meta.glob(['./*.js', '!./index.js', '!./*.check.js'], { eager: true, import: 'default' });
const HELP = Object.assign({}, ...Object.values(tables));

export function controlHelp(key, language) {
    const entry = key ? HELP[key] : null;
    return entry ? entry[language === 'en' ? 1 : 0] : null;
}
