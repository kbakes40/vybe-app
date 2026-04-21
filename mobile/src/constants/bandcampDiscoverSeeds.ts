/**
 * Curated Bandcamp album URLs for Discover when `/tag/*` hub HTML no longer
 * embeds album links (Vue SPA). Each URL must be a public album with
 * `data-tralbum` + `mp3-128` on the page (see {@link bandcampService}).
 */
export const BANDCAMP_DISCOVER_ALBUM_SEEDS: readonly string[] = [
  'https://nilsfrahm.bandcamp.com/album/all-melody',
  'https://tycho.bandcamp.com/album/awake',
  'https://floatingpoints.bandcamp.com/album/crush',
  'https://caribouband.bandcamp.com/album/our-love',
  'https://khruangbin.bandcamp.com/album/the-universe-smiles-upon-you',
  'https://jonhopkins.bandcamp.com/album/immunity',
  'https://bicep.bandcamp.com/album/bicep',
  'https://overmono.bandcamp.com/album/good-lies',
  'https://flyinglotus.bandcamp.com/album/yasuke',
  'https://teebs.bandcamp.com/album/ardour',
  'https://teebs.bandcamp.com/album/collections-01',
  'https://emancipator.bandcamp.com/album/dusk-to-dawn',
  'https://cattledecapitation.bandcamp.com/album/death-atlas',
  'https://mfdoom.bandcamp.com/album/mm-food',
  'https://jpegmafia.bandcamp.com/album/all-my-heroes-are-cornballs',
  'https://sunn.bandcamp.com/album/black-one',
  'https://chelseawolfe.bandcamp.com/album/pain-is-beauty',
  'https://maxcooper.bandcamp.com/album/one-hundred-billion-sparks',
] as const;
