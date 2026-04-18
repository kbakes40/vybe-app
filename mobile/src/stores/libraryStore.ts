/**
 * Full music library manifest from Railway: FreePD tracks are loaded via this store’s
 * `loadCatalog` (paginated `GET /api/freepd/tracks` until complete). Prefer importing
 * `useFreePDStore` directly unless an older `libraryStore` name is required.
 */
export { useFreePDStore as useLibraryStore } from './freePDStore';
