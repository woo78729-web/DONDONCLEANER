import { buildGoogleMapsUrl, hasMapAddress } from '../utils/googleMaps';

export function GoogleMapsLink({ address, className = 'btn btn-secondary btn-sm map-link-btn', label = 'Google 地圖' }) {
  if (!hasMapAddress(address)) {
    return null;
  }

  const href = buildGoogleMapsUrl(address);

  return (
    <a
      href={href}
      className={className}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`在 Google 地圖開啟：${address.trim()}`}
    >
      {label}
    </a>
  );
}
