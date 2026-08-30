import { buildSkyLut } from './skyModel.js';

// The sky table, built off the main thread.
//
// skyModel.js was written without three and without the DOM so it could be
// checked in node; the same property is what lets it run here. Nothing in this
// file knows about rendering - it takes the same state buildSkyLut always took
// and hands back the same object, minus the seconds the main thread used to
// spend not painting.
//
// The table's own floats are transferred rather than copied. Packing them into
// half-floats stays on the main thread, where three's converter already lives.

self.onmessage = (event) => {
  const { id, state } = event.data ?? {};

  try {
    const lut = buildSkyLut(state);
    self.postMessage({ id, lut }, [lut.data.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
