import { importLibrary } from '@googlemaps/js-api-loader';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useGooglePlacesLoader } from '../hooks/useGooglePlacesLoader';
import {
  fetchTaiwanAddressSuggestions,
  getPlacePredictionLabel,
  resolvePlacePredictionAddress,
} from '../utils/googlePlaces';

const SUGGESTION_DEBOUNCE_MS = 280;

export function AddressAutocompleteInput({
  value,
  onChange,
  className = 'field-control',
  placeholder = '請輸入完整地址',
  required = false,
  disabled = false,
  showFallbackHint = true,
}) {
  const listboxId = useId();
  const containerRef = useRef(null);
  const debounceRef = useRef(null);
  const requestIdRef = useRef(0);
  const sessionTokenRef = useRef(null);
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const { isLoaded, loadError, apiKeyConfigured } = useGooglePlacesLoader(true);

  const autocompleteEnabled = apiKeyConfigured && isLoaded && !loadError && !disabled;

  useEffect(() => () => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }
  }, []);

  const ensureSessionToken = useCallback(async () => {
    if (sessionTokenRef.current) {
      return sessionTokenRef.current;
    }

    const { AutocompleteSessionToken } = await importLibrary('places');
    sessionTokenRef.current = new AutocompleteSessionToken();
    return sessionTokenRef.current;
  }, []);

  const loadSuggestions = useCallback(async (input) => {
    const query = String(input || '').trim();

    if (!autocompleteEnabled || query.length < 2) {
      setSuggestions([]);
      setOpen(false);
      setLoadingSuggestions(false);
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoadingSuggestions(true);

    try {
      const sessionToken = await ensureSessionToken();
      const nextSuggestions = await fetchTaiwanAddressSuggestions(query, sessionToken);

      if (requestId !== requestIdRef.current) {
        return;
      }

      setSuggestions(nextSuggestions);
      setOpen(nextSuggestions.length > 0);
    } catch {
      if (requestId === requestIdRef.current) {
        setSuggestions([]);
        setOpen(false);
      }
    } finally {
      if (requestId === requestIdRef.current) {
        setLoadingSuggestions(false);
      }
    }
  }, [autocompleteEnabled, ensureSessionToken]);

  const queueSuggestions = useCallback((input) => {
    if (debounceRef.current) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      loadSuggestions(input);
    }, SUGGESTION_DEBOUNCE_MS);
  }, [loadSuggestions]);

  const handleInputChange = (event) => {
    const nextValue = event.target.value;
    onChange(nextValue);
    queueSuggestions(nextValue);
  };

  const handleSelectSuggestion = async (prediction) => {
    const address = await resolvePlacePredictionAddress(prediction);
    onChange(address || getPlacePredictionLabel(prediction));
    setSuggestions([]);
    setOpen(false);
    sessionTokenRef.current = null;
  };

  const handleBlur = () => {
    window.setTimeout(() => {
      if (!containerRef.current?.contains(document.activeElement)) {
        setOpen(false);
      }
    }, 120);
  };

  let hint = '';

  if (!apiKeyConfigured && showFallbackHint) {
    hint = '未設定 VITE_GOOGLE_MAPS_API_KEY，地址自動完成已停用，可直接手動輸入。';
  } else if (loadError) {
    hint = 'Google 地址建議載入失敗，可直接手動輸入完整地址。';
  } else if (autocompleteEnabled) {
    hint = '可直接輸入完整地址；有建議時可點選，非必選。';
  }

  return (
    <div
      className={`address-autocomplete-field${open ? ' address-autocomplete-field--open' : ''}`}
      ref={containerRef}
    >
      <textarea
        className={className}
        value={value || ''}
        onChange={handleInputChange}
        onFocus={() => {
          if (suggestions.length > 0) {
            setOpen(true);
          }
        }}
        onBlur={handleBlur}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        autoComplete="street-address"
        rows={2}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        aria-autocomplete="list"
      />

      {open && suggestions.length > 0 && (
        <ul
          id={listboxId}
          className="address-autocomplete-suggestions"
          role="listbox"
        >
          {suggestions.map((prediction, index) => {
            const label = getPlacePredictionLabel(prediction);
            const key = `${prediction.placeId || label}-${index}`;

            return (
              <li key={key} role="presentation">
                <button
                  type="button"
                  className="address-autocomplete-suggestions__item"
                  role="option"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => handleSelectSuggestion(prediction)}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {loadingSuggestions && autocompleteEnabled && (
        <p className="hint address-autocomplete-field__status">搜尋地址建議中...</p>
      )}

      {hint && !loadingSuggestions && (
        <p className="hint address-autocomplete-field__hint">{hint}</p>
      )}
    </div>
  );
}
