/**
 * Internet Archive — live music "etree" vault.
 *
 * We source 8K-grade, legally-tradeable concert recordings from the
 * Live Music Archive (`mediatype:etree`). Every track we surface is FLAC
 * (lossless) — anything lower is rejected in the service layer.
 *
 * Docs:
 *   Advanced Search: https://archive.org/advancedsearch.php
 *   Item Metadata:   https://archive.org/services/docs/api/metadata.html
 *   Downloads:       https://archive.org/download/<identifier>/<file>
 */

export const ARCHIVE_SEARCH_URL = 'https://archive.org/advancedsearch.php';
export const ARCHIVE_METADATA_URL = 'https://archive.org/metadata';
export const ARCHIVE_DOWNLOAD_URL = 'https://archive.org/download';

/** Dynamic Pill / Now Playing art — the pillars mark archive.org has used for years. */
export const ARCHIVE_BRAND_LOGO_URL = 'https://archive.org/images/glogo.jpg';

/** Slim Dynamic Island chip: `ARCHIVE · LIVE`. */
export const ARCHIVE_DI_TAG = 'ARCHIVE · LIVE';

/** Only FLAC files qualify — we refuse to downgrade the vault's fidelity. */
export const ARCHIVE_FLAC_FORMATS = new Set(['Flac', 'FLAC', 'flac']);
