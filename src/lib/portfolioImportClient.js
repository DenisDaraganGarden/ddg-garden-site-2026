function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

export async function getPortfolioImportStatus() {
  try {
    const response = await fetch('/__portfolio/status');
    if (!response.ok) {
      throw new Error(`Status ${response.status}`);
    }

    return await response.json();
  } catch {
    return {
      available: false,
      targetDir: 'public/portfolio/imported',
      message: 'Local import is available only while Vite dev server is running.',
    };
  }
}

export async function importPortfolioFiles(projectId, fileList) {
  const files = Array.from(fileList ?? []);
  if (files.length === 0) {
    return [];
  }

  const payload = await Promise.all(
    files.map(async (file) => ({
      name: file.name,
      type: file.type,
      dataUrl: await fileToDataUrl(file),
    })),
  );

  const response = await fetch('/__portfolio/import', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      projectId,
      files: payload,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Import failed with status ${response.status}`);
  }

  const data = await response.json();
  return Array.isArray(data.files) ? data.files : [];
}
