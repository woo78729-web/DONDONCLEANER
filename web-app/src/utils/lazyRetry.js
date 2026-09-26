const CHUNK_RELOAD_AT = 'spa-chunk-reload-at';
const LEGACY_CHUNK_RELOAD = 'spa-chunk-reload';
const CHUNK_RELOAD_COOLDOWN_MS = 12000;

const CHUNK_ERROR_PATTERN = /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Loading chunk [\d]+ failed/i;

export function isChunkLoadError(error) {
  return CHUNK_ERROR_PATTERN.test(String(error?.message || error || ''));
}

export function clearChunkReload() {
  sessionStorage.removeItem(CHUNK_RELOAD_AT);
  sessionStorage.removeItem(LEGACY_CHUNK_RELOAD);
}

export function canAutoReloadForChunk() {
  const at = Number(sessionStorage.getItem(CHUNK_RELOAD_AT) || 0);

  return !at || Date.now() - at > CHUNK_RELOAD_COOLDOWN_MS;
}

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

/**
 * Hashed chunks 404 when the open tab still has an old bundle.
 * Retry the import, then reload once. A later failure can reload again
 * after a short cooldown, so the tab does not stay broken until it is closed.
 */
export function lazyRetry(factory) {
  return async () => {
    let lastError;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const module = await factory();
        clearChunkReload();
        return module;
      } catch (error) {
        lastError = error;

        if (!isChunkLoadError(error) || attempt === 2) {
          break;
        }

        await wait(400 * (attempt + 1));
      }
    }

    if (isChunkLoadError(lastError) && canAutoReloadForChunk()) {
      sessionStorage.setItem(CHUNK_RELOAD_AT, String(Date.now()));
      sessionStorage.removeItem(LEGACY_CHUNK_RELOAD);
      window.location.reload();
      return new Promise(() => {});
    }

    clearChunkReload();
    throw lastError;
  };
}
