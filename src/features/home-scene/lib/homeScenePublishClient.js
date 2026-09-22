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
