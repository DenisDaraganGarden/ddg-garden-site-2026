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

// A project's imported models live in its own folder, which the site does not
// have: on the home page they would be empty places. Asked before a project
// goes there; true means go on.
export function confirmPublishWithModels(settings, ru = true) {
  if (!settings?.placedObjects?.some((object) => object.kind === 'model')) return true;
  return window.confirm(ru
    ? 'В проекте есть импортированные модели (SketchUp, сканы). На сайте их не будет — они лежат в папке проекта, — на заглавной останутся пустые места. Всё равно поставить на заглавную?'
    : 'The project has imported models (SketchUp, scans). The site does not have them — they live in the project folder — so the home page would show empty places. Put it on the home page anyway?');
}
