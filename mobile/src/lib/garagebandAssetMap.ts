import { Asset } from 'expo-asset';
import { Image } from 'react-native';
import type { GarageBandVinylDefinition } from '@/constants/garagebandLibrary';
import type { Track } from '@/types/music';

/**
 * Resolves bundled GarageBand audio + artwork to a Vybe `Track` for native
 * playback (`source: 'vybe'`, `audioUrl` from expo-asset).
 */
export async function vinylDefinitionToVybeTrack(def: GarageBandVinylDefinition): Promise<Track> {
  const art = Image.resolveAssetSource(def.artModule);
  const asset = Asset.fromModule(def.audioModule);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  return {
    id: `gb-${def.id}`,
    title: def.title,
    artist: def.artist,
    artistId: '',
    album: def.title,
    albumId: def.id,
    artwork: art.uri ?? '',
    duration: 0,
    isLiked: false,
    source: 'vybe',
    audioUrl: uri,
    genreTags: ['garageband'],
    tags: ['garageband', 'local'],
    importedAt: def.mixedAt,
  };
}

/** Resolve all registered vinyl definitions in parallel. */
export async function resolveAllGarageBandVinyls(
  defs: GarageBandVinylDefinition[],
): Promise<Track[]> {
  if (defs.length === 0) return [];
  return Promise.all(defs.map((d) => vinylDefinitionToVybeTrack(d)));
}
