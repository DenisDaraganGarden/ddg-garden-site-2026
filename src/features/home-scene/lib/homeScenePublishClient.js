const HOME_SCENE_PUBLISH_ENDPOINT = '/__home-scene/publish';

// deploy: true also commits the published file and pushes it to the site.
export async function publishHomeSceneSettings(settings, { deploy = false } = {}) {
  const response = await fetch(HOME_SCENE_PUBLISH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ settings, deploy }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message || 'Home scene publish failed');
  }

  return payload;
}
