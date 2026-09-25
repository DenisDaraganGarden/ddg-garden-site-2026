export async function loadEnginePage(window, url) {
  try {
    await window.loadURL(url);
  } catch (error) {
    // A project can be opened before the menu's initial load finishes.
    // Electron cancels that load while the next page is already opening.
    // Do not turn ordinary navigation into a fatal startup error.
    if (error.code !== 'ERR_ABORTED' && error.errno !== -3) throw error;
  }
}
