const SNAKE_PUBLISH_ENDPOINT = '/__snake/publish';

export async function publishSnakeSettings(settings) {
  const response = await fetch(SNAKE_PUBLISH_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ settings }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.message || 'Snake publish failed');
  }

  return payload;
}
