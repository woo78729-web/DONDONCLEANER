import { useEffect, useState } from 'react';
import { importLibrary, setOptions } from '@googlemaps/js-api-loader';

const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY?.trim() || '';
let optionsConfigured = false;
let placesLibraryPromise = null;

function loadPlacesLibrary() {
  if (!apiKey) {
    return Promise.reject(new Error('Missing Google Maps API key'));
  }

  if (!placesLibraryPromise) {
    if (!optionsConfigured) {
      setOptions({
        key: apiKey,
        v: 'weekly',
        language: 'zh-TW',
        region: 'TW',
      });
      optionsConfigured = true;
    }

    placesLibraryPromise = importLibrary('places');
  }

  return placesLibraryPromise;
}

export function useGooglePlacesLoader(enabled = true) {
  const [state, setState] = useState({
    isLoaded: false,
    loadError: null,
    apiKeyConfigured: Boolean(apiKey),
  });

  useEffect(() => {
    if (!enabled || !apiKey) {
      return undefined;
    }

    let cancelled = false;

    loadPlacesLibrary()
      .then(() => {
        if (!cancelled) {
          setState({ isLoaded: true, loadError: null, apiKeyConfigured: true });
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState({ isLoaded: false, loadError: error, apiKeyConfigured: true });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return state;
}
