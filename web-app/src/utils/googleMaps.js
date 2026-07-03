export function buildGoogleMapsUrl(address) {
  const query = String(address || '').trim();

  if (!query) {
    return '';
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export function hasMapAddress(address) {
  return String(address || '').trim().length > 0;
}
