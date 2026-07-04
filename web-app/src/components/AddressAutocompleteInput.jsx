import { useEffect, useRef, useState } from 'react';
import { useGooglePlacesLoader } from '../hooks/useGooglePlacesLoader';
import { extractFormattedAddress } from '../utils/googlePlaces';

function findAutocompleteInput(element) {
  if (!element) {
    return null;
  }

  if (element.matches?.('input')) {
    return element;
  }

  return element.querySelector?.('input') || element.shadowRoot?.querySelector('input') || null;
}

function PlainAddressInput({
  value,
  onChange,
  className,
  placeholder,
  required,
  disabled,
  hint = '',
}) {
  return (
    <>
      <input
        className={className}
        value={value || ''}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
      />
      {hint && <p className="hint" style={{ marginTop: 8 }}>{hint}</p>}
    </>
  );
}

export function AddressAutocompleteInput({
  value,
  onChange,
  className = 'field-control',
  placeholder = '請輸入完整地址',
  required = false,
  disabled = false,
  showFallbackHint = true,
}) {
  const widgetRef = useRef(null);
  const onChangeRef = useRef(onChange);
  const valueRef = useRef(value || '');
  const [usePlainInput, setUsePlainInput] = useState(false);
  const [widgetError, setWidgetError] = useState('');
  const { isLoaded, loadError, apiKeyConfigured } = useGooglePlacesLoader(!usePlainInput);

  onChangeRef.current = onChange;
  valueRef.current = value || '';

  useEffect(() => {
    if (!isLoaded || usePlainInput || disabled || !widgetRef.current) {
      return undefined;
    }

    const widget = widgetRef.current;
    let inputListener = null;

    const handleSelect = async (event) => {
      try {
        const place = event.placePrediction.toPlace();
        await place.fetchFields({ fields: ['formattedAddress', 'addressComponents'] });
        const address = place.formattedAddress || extractFormattedAddress({
          formatted_address: place.formattedAddress,
          address_components: place.addressComponents,
        });

        if (address) {
          onChangeRef.current(address);
          const input = findAutocompleteInput(widget);
          if (input) {
            input.value = address;
          }
        }

        setWidgetError('');
      } catch {
        setWidgetError('地址詳細資料取得失敗，請再試一次或改用手動輸入。');
      }
    };

    const handleError = () => {
      setWidgetError('Google 地址建議無法使用，請確認已啟用 Places API (New)。');
    };

    widget.includedRegionCodes = ['tw'];
    widget.placeholder = placeholder;

    widget.addEventListener('gmp-select', handleSelect);
    widget.addEventListener('gmp-error', handleError);

    const attachInputListener = () => {
      const input = findAutocompleteInput(widget);
      if (!input) {
        return false;
      }

      input.classList.add(...className.split(' ').filter(Boolean));
      input.value = valueRef.current;
      input.disabled = disabled;
      input.placeholder = placeholder;

      inputListener = (event) => {
        onChangeRef.current(event.target.value);
        setWidgetError('');
      };
      input.addEventListener('input', inputListener);
      return true;
    };

    if (!attachInputListener()) {
      window.setTimeout(attachInputListener, 0);
    }

    return () => {
      widget.removeEventListener('gmp-select', handleSelect);
      widget.removeEventListener('gmp-error', handleError);

      const input = findAutocompleteInput(widget);
      if (input && inputListener) {
        input.removeEventListener('input', inputListener);
      }
    };
  }, [isLoaded, usePlainInput, className, placeholder, disabled]);

  useEffect(() => {
    if (usePlainInput || !isLoaded) {
      return;
    }

    const input = findAutocompleteInput(widgetRef.current);
    if (input && input.value !== (value || '')) {
      input.value = value || '';
    }
  }, [value, usePlainInput, isLoaded]);

  if (!apiKeyConfigured || usePlainInput) {
    return (
      <PlainAddressInput
        value={value}
        onChange={onChange}
        className={className}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        hint={!apiKeyConfigured && showFallbackHint ? '未設定 VITE_GOOGLE_MAPS_API_KEY，地址自動完成已停用。' : ''}
      />
    );
  }

  if (loadError) {
    return (
      <PlainAddressInput
        value={value}
        onChange={onChange}
        className={className}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        hint="Google 地址建議載入失敗，仍可手動輸入地址。"
      />
    );
  }

  if (!isLoaded) {
    return (
      <PlainAddressInput
        value={value}
        onChange={onChange}
        className={className}
        placeholder="載入地址建議中..."
        required={required}
        disabled
      />
    );
  }

  return (
    <>
      <gmp-place-autocomplete
        ref={widgetRef}
        className={`address-autocomplete-widget ${className}`}
        placeholder={placeholder}
      />
      <input
        tabIndex={-1}
        aria-hidden="true"
        className="address-autocomplete-hidden-input"
        value={value || ''}
        readOnly
        required={required}
        onChange={() => {}}
      />
      {widgetError && (
        <p className="hint" style={{ marginTop: 8 }}>
          {widgetError}
          {' '}
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setUsePlainInput(true)}
          >
            改用手動輸入
          </button>
        </p>
      )}
    </>
  );
}
