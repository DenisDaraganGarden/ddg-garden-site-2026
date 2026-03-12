const HOME_SCENE_PUBLISH_ENDPOINT = '/__home-scene/publish';

export async function publishHomeSceneSettings(settings) {
  const response = await fetch(HOME_SCENE_PUBLISH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ settings }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message || 'Home scene publish failed');
  }

  return payload;
}
