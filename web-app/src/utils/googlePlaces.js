export function extractFormattedAddress(place) {
  if (!place) {
    return '';
  }

  const formatted = String(place.formatted_address || '').trim();
  if (formatted) {
    return formatted;
  }

  const components = place.address_components;
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
