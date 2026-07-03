import { useEffect, useState } from 'react';

export function useIsMobile(breakpoint = 768) {
  const query = `(max-width: ${breakpoint}px)`;

  const [isMobile, setIsMobile] = useState(() => (
    typeof window !== 'undefined' && window.matchMedia(query).matches
  ));

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = (event) => setIsMobile(event.matches);

    update(media);
    media.addEventListener('change', update);

    return () => media.removeEventListener('change', update);
  }, [query]);

  return isMobile;
}
