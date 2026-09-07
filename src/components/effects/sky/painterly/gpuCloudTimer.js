// A deliberately small, non-blocking GPU timer for the cloud laboratory.
// Results belong to an earlier frame; no caller is ever allowed to wait for one.

export function createCloudGpuTimer(renderer) {
  let gl = null;
  let extension = null;
  let query = null;
  let pending = false;
  let begun = false;
  let milliseconds = null;
  let disposed = false;

  try {
    gl = renderer?.getContext?.() ?? null;
    extension = gl?.getExtension?.('EXT_disjoint_timer_query_webgl2') ?? null;
  } catch {
    gl = null;
    extension = null;
  }

  const unusable = () => {
    if (disposed || !gl || !extension) return true;
    try {
      if (gl.isContextLost?.() === true) {
        // WebGL deletes query objects with the context. Forget ours so a later
        // restored context creates a fresh one instead of reusing a dead name.
        query = null;
        return true;
      }
      return false;
    } catch {
      return true;
    }
  };

  const discard = () => {
    pending = false;
    begun = false;
  };

  return {
    begin() {
      if (unusable() || pending || begun) return false;
      try {
        if (gl.getParameter(extension.GPU_DISJOINT_EXT)) return false;
        // The scene budget may already measure the whole frame. WebGL cannot
        // nest elapsed-time queries; skip this sample without ending its query.
        if (gl.getQuery(extension.TIME_ELAPSED_EXT, gl.CURRENT_QUERY)) return false;
        query ??= gl.createQuery();
        if (!query) return false;
        gl.beginQuery(extension.TIME_ELAPSED_EXT, query);
        begun = true;
        return true;
      } catch {
        begun = false;
        return false;
      }
    },

    end() {
      if (!begun) return;
      if (unusable()) {
        discard();
        return;
      }
      try {
        gl.endQuery(extension.TIME_ELAPSED_EXT);
        begun = false;
        pending = true;
      } catch {
        discard();
      }
    },

    poll() {
      if (unusable()) {
        discard();
        return null;
      }
      if (!pending) return null;
      try {
        if (gl.getParameter(extension.GPU_DISJOINT_EXT)) {
          discard();
          return null;
        }
        if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) return null;
        const nanoseconds = gl.getQueryParameter(query, gl.QUERY_RESULT);
        pending = false;
        milliseconds = Number.isFinite(nanoseconds) ? nanoseconds / 1e6 : null;
        return milliseconds;
      } catch {
        discard();
        return null;
      }
    },

    get value() {
      return milliseconds;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      if (gl && query) {
        try {
          if (gl.isContextLost?.() !== true) gl.deleteQuery(query);
        } catch {
          // A lost WebGL context has already released its query objects.
        }
      }
      query = null;
      discard();
      gl = null;
      extension = null;
    },
  };
}
