export async function publishPortfolioPreviewSettings(settings) {
  const response = await fetch('/__portfolio-preview/publish', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ settings }),
  });

  if (!response.ok) {
    const errorPayload = await response.json().catch(() => ({}));
    throw new Error(errorPayload.message || `Publish failed with status ${response.status}`);
  }

  return response.json();
}
