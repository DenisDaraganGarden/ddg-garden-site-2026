const HOME_SCENE_PUBLISH_ENDPOINT = '/__home-scene/publish';

// deploy: true also commits the published file and pushes it to the site.
// source: { projectId, projectName } when a project's scene becomes the home
// page; null when the site's own editor publishes.
export async function publishHomeSceneSettings(settings, { deploy = false, source = null } = {}) {
  const response = await fetch(HOME_SCENE_PUBLISH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ settings, deploy, source }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message || 'Home scene publish failed');
  }

  return payload;
}

// A project's imported models live in its own folder, and its plantings draw
// from the plant library in the data home (~/Ouroboros): the site has
// neither, so on the home page they would be empty places. Asked before a
// project goes there; true means go on.
export function confirmPublishWithModels(settings, ru = true) {
  const models = settings?.placedObjects?.some((object) => object.kind === 'model');
  const plantings = Boolean(settings?.plantingBeds?.length || settings?.plantingPoints?.length);
  if (!models && !plantings) return true;
  const what = ru
    ? [models ? 'импортированные модели (SketchUp, сканы)' : '', plantings ? 'посадки из библиотеки растений' : ''].filter(Boolean).join(' и ')
    : [models ? 'imported models (SketchUp, scans)' : '', plantings ? 'plantings from the plant library' : ''].filter(Boolean).join(' and ');
  return window.confirm(ru
    ? `В проекте есть ${what}. На сайте их не будет — они лежат в папке данных на этом компьютере, — на заглавной останутся пустые места. Всё равно поставить на заглавную?`
    : `The project has ${what}. The site does not have them — they live in the data folder on this computer — so the home page would show empty places. Put it on the home page anyway?`);
}
