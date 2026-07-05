import { importLibrary } from '@googlemaps/js-api-loader';

export function extractFormattedAddress(place) {
  if (!place) {
    return '';
  }

  const formatted = String(place.formattedAddress || place.formatted_address || '').trim();
  if (formatted) {
    return formatted;
  }

  const components = place.addressComponents || place.address_components;
  if (!Array.isArray(components) || components.length === 0) {
    return '';
  }

  const get = (type) => components.find((component) => component.types.includes(type))?.long_name || '';

  const postalCode = get('postal_code');
  const adminArea = get('administrative_area_level_1');
  const locality = get('locality') || get('administrative_area_level_2');
  const sublocality = get('sublocality') || get('administrative_area_level_3');
  const route = get('route');
  const streetNumber = get('street_number');

  const street = [route, streetNumber].filter(Boolean).join('');
  const parts = [postalCode, adminArea, locality, sublocality, street].filter(Boolean);

  return parts.join('');
}

export function getPlacePredictionLabel(prediction) {
  return String(prediction?.text?.text || prediction?.mainText?.text || '').trim();
}

export async function resolvePlacePredictionAddress(prediction) {
  if (!prediction?.toPlace) {
    return getPlacePredictionLabel(prediction);
  }

  try {
    const place = prediction.toPlace();
    await place.fetchFields({ fields: ['formattedAddress', 'addressComponents'] });

    return extractFormattedAddress({
      formattedAddress: place.formattedAddress,
      addressComponents: place.addressComponents,
    }) || getPlacePredictionLabel(prediction);
  } catch {
    return getPlacePredictionLabel(prediction);
  }
}

export async function fetchTaiwanAddressSuggestions(input, sessionToken) {
  const query = String(input || '').trim();
  if (!query || query.length < 2) {
    return [];
  }

  const { AutocompleteSuggestion } = await importLibrary('places');
  const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
    input: query,
    sessionToken,
    includedRegionCodes: ['tw'],
    language: 'zh-TW',
  });

  return (suggestions || [])
    .map((item) => item.placePrediction)
    .filter(Boolean)
    .slice(0, 6);
}
