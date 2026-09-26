import { useEffect, useRef } from 'react';

function wait(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export async function loadWithRetry(task, { attempts = 3, delayMs = 700 } = {}) {
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;

      if (attempt === attempts - 1) {
        break;
      }

      await wait(delayMs * (attempt + 1));
    }
  }

  throw lastError;
}

export function useRefreshOnVisible(refresh) {
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    function refreshIfVisible() {
      if (document.visibilityState === 'visible') {
        refreshRef.current();
      }
    }

    function handlePageShow(event) {
      if (event.persisted) {
        refreshRef.current();
      }
    }

    document.addEventListener('visibilitychange', refreshIfVisible);
    window.addEventListener('pageshow', handlePageShow);

    return () => {
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.removeEventListener('pageshow', handlePageShow);
    };
  }, []);
}
