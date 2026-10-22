import type { EditorialPack } from './editorial-engine';
import type { CarouselTheme } from './carousel-theme';
/** Stable day-to-day rhythm; selected only for new, untouched drafts. */
export function editorialDesignDirection(pack: Pick<EditorialPack, 'date'|'lane'>): CarouselTheme {
  const day = Math.floor(Date.parse(`${pack.date}T00:00:00Z`) / 86400000);
  const directions: CarouselTheme[] = pack.lane === 'poster'
    ? ['verse-connection', 'editorial-white', 'cinematic']
    : pack.lane === 'teaching'
      ? ['editorial-white', 'street-theology', 'verse-connection']
      : ['manifesto', 'cinematic', 'street-theology'];
  return directions[((day % directions.length) + directions.length) % directions.length] || 'editorial-white';
}
