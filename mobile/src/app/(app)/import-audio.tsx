import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';
import {
  ChevronLeft,
  FileAudio,
  Upload,
  CheckCircle,
  Info,
  HardDrive,
  Music,
  CloudDownload,
  X,
} from 'lucide-react-native';
import {
  useDownloadsStore,
  formatFileSize,
  getAudioFormat,
  isLosslessFormat,
  DownloadedTrack,
} from '@/stores/downloadsStore';
import { usePlaybackController } from '@/stores/playbackController';
import { useRecentsStore } from '@/stores/recentsStore';
import { useVybePopup } from '@/components/VybePopup';

const SUPPORTED_FORMATS = ['mp3', 'm4a', 'aac', 'wav', 'flac', 'ogg', 'opus'];
const IMPORTS_DIR = `${FileSystem.documentDirectory}Library/VYBE/Imported/`;

interface PickedFile {
  uri: string;
  name: string;
  size: number;
  mimeType?: string;
  ext: string;
  formatLabel: string;
  isLossless: boolean;
}

type ImportStatus = 'idle' | 'importing' | 'done' | 'error';

interface FileResult {
  file: PickedFile;
  status: 'pending' | 'importing' | 'done' | 'error';
  error?: string;
  track?: DownloadedTrack;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function generateFileHash(uri: string, size: number): Promise<string> {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${uri}:${size}:${Date.now()}`
  );
  return hash.substring(0, 16);
}

function cleanFilename(filename: string): string {
  let name = filename.replace(/\.[^/.]+$/, '');
  name = name.replace(/\s*[\[\(][^\]\)]*[\]\)]\s*$/g, '');
  return name.replace(/\s*-\s*$/, '').trim();
}

function parseFilename(filename: string): { title: string; artist: string } {
  const cleaned = cleanFilename(filename);
  if (cleaned.includes(' - ')) {
    const parts = cleaned.split(' - ');
    if (parts.length >= 2) {
      return { artist: parts[0].trim(), title: parts.slice(1).join(' - ').trim() };
    }
  }
  return { title: cleaned, artist: '' };
}

function generatePlaceholderArtwork(title: string): string {
  const hash = title.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const hue = hash % 360;
  const c1 = `hsl(${hue}, 60%, 20%)`;
  const c2 = `hsl(${(hue + 40) % 360}, 70%, 30%)`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" style="stop-color:${c1}"/><stop offset="100%" style="stop-color:${c2}"/></linearGradient></defs><rect width="400" height="400" fill="url(#bg)"/><rect x="150" y="320" width="100" height="24" rx="4" fill="rgba(139,92,246,0.3)"/><text x="200" y="338" text-anchor="middle" fill="rgba(255,255,255,0.7)" font-size="12" font-family="system-ui">Imported</text></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function ImportAudioScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { showVybePopup } = useVybePopup();
  const addDownload = useDownloadsStore(s => s.addDownload);
  const downloads = useDownloadsStore(s => s.downloads);
  const playTrack = usePlaybackController(s => s.playTrack);
  const addToRecents = useRecentsStore(s => s.addToRecents);

  const bottomPadding = insets.bottom + 32;

  const [results, setResults] = useState<FileResult[]>([]);
  const [importStatus, setImportStatus] = useState<ImportStatus>('idle');
  const [doneCount, setDoneCount] = useState(0);
  const importingRef = useRef(false);

  const handleSelectFiles = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['audio/*', 'public.audio', 'public.mp3', 'public.mpeg-4-audio'],
        copyToCacheDirectory: true,
        multiple: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const valid: PickedFile[] = [];
      const skipped: string[] = [];

      for (const asset of result.assets) {
        const ext = asset.name.split('.').pop()?.toLowerCase() ?? '';
        if (!SUPPORTED_FORMATS.includes(ext)) {
          skipped.push(asset.name);
          continue;
        }
        valid.push({
          uri: asset.uri,
          name: asset.name,
          size: asset.size ?? 0,
          mimeType: asset.mimeType,
          ext,
          formatLabel: getAudioFormat(asset.name),
          isLossless: isLosslessFormat(ext),
        });
      }

      if (skipped.length > 0) {
        showVybePopup({
          title: 'Unsupported Files Skipped',
          message: `${skipped.length} file(s) were skipped (unsupported format). Supported: ${SUPPORTED_FORMATS.join(', ')}`,
          type: 'warning',
        });
      }

      if (valid.length === 0) return;

      setResults(valid.map(f => ({ file: f, status: 'pending' })));
      setImportStatus('idle');
      setDoneCount(0);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e) {
      console.error('[ImportAudio] picker error', e);
    }
  };

  const handleImportAll = async () => {
    if (importingRef.current || results.length === 0) return;
    importingRef.current = true;
    setImportStatus('importing');
    setDoneCount(0);

    await FileSystem.makeDirectoryAsync(IMPORTS_DIR, { intermediates: true }).catch(() => null);

    let done = 0;
    const updated = [...results];

    for (let i = 0; i < updated.length; i++) {
      const entry = updated[i];
      if (entry.status === 'done') { done++; continue; }

      // Mark as importing
      updated[i] = { ...entry, status: 'importing' };
      setResults([...updated]);

      try {
        const hash = await generateFileHash(entry.file.uri, entry.file.size);
        const trackId = `imported-${hash}`;

        // Duplicate check
        if (downloads.some(d => d.id === trackId || d.localFilePath?.includes(hash))) {
          updated[i] = { ...updated[i], status: 'done', error: 'Already in library' };
          done++;
          setDoneCount(done);
          setResults([...updated]);
          continue;
        }

        const safeFilename = entry.file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const destPath = `${IMPORTS_DIR}${hash}_${safeFilename}`;

        await FileSystem.copyAsync({ from: entry.file.uri, to: destPath });

        const info = await FileSystem.getInfoAsync(destPath);
        if (!info.exists) throw new Error('Copy failed');

        const { title, artist } = parseFilename(entry.file.name);
        const finalTitle = title || 'Untitled';
        const finalArtist = artist || 'Unknown Artist';

        const track: DownloadedTrack = {
          id: trackId,
          title: finalTitle,
          artist: finalArtist,
          artistId: 'user-imported',
          album: 'Imported',
          albumId: 'user-imports',
          artwork: generatePlaceholderArtwork(finalTitle),
          duration: 0,
          isLiked: false,
          source: 'vybe',
          isDownloaded: true,
          localFilePath: destPath,
          importedAt: Date.now(),
          isUserImported: true,
          fileSize: entry.file.size,
          fileFormat: entry.file.formatLabel,
          audioUrl: destPath,
        };

        addDownload(track);
        addToRecents(track);
        updated[i] = { ...updated[i], status: 'done', track };
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Import failed';
        updated[i] = { ...updated[i], status: 'error', error: msg };
      }

      done++;
      setDoneCount(done);
      setResults([...updated]);
    }

    importingRef.current = false;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setImportStatus('done');
  };

  const handleReset = () => {
    setResults([]);
    setImportStatus('idle');
    setDoneCount(0);
    importingRef.current = false;
  };

  const handlePlayFirst = () => {
    const firstDone = results.find(r => r.status === 'done' && r.track);
    if (firstDone?.track) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      playTrack(firstDone.track);
    }
  };

  const isImporting = importStatus === 'importing';
  const isDone = importStatus === 'done';
  const successCount = results.filter(r => r.status === 'done' && !r.error).length;

  return (
    <View style={{ flex: 1, backgroundColor: '#0A0A0A' }}>
      <LinearGradient colors={['#1a1a2e', '#0F0F0F', '#0A0A0A']} style={{ flex: 1 }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: insets.top + 8, paddingBottom: 12 }}>
          <Pressable onPress={() => router.back()} style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}>
            <ChevronLeft size={28} color="#fff" />
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
            <FileAudio size={20} color="#8B5CF6" />
            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700', marginLeft: 8 }}>Import Audio</Text>
          </View>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 20, paddingBottom: bottomPadding }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Done state ── */}
          {isDone ? (
            <View style={{ alignItems: 'center', paddingVertical: 32 }}>
              <View style={{ width: 88, height: 88, backgroundColor: 'rgba(29,185,84,0.15)', borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginBottom: 20 }}>
                <CheckCircle size={52} color="#1DB954" />
              </View>
              <Text style={{ color: '#fff', fontSize: 22, fontWeight: '800', marginBottom: 6 }}>
                {successCount} {successCount === 1 ? 'Track' : 'Tracks'} Imported
              </Text>
              <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 28 }}>
                Ready to play in your Downloads library
              </Text>

              {/* Per-file summary */}
              <View style={{ width: '100%', backgroundColor: '#1A1A1A', borderRadius: 12, overflow: 'hidden', marginBottom: 24 }}>
                {results.map((r, i) => (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: i < results.length - 1 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                    <View style={{ width: 30, height: 30, backgroundColor: r.status === 'done' && !r.error ? 'rgba(29,185,84,0.15)' : 'rgba(239,68,68,0.15)', borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                      {r.status === 'done' && !r.error
                        ? <CheckCircle size={16} color="#1DB954" />
                        : <X size={16} color="#EF4444" />}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>{r.track?.title ?? r.file.name}</Text>
                      {r.error
                        ? <Text style={{ color: 'rgba(239,68,68,0.8)', fontSize: 11, marginTop: 1 }}>{r.error}</Text>
                        : <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 1 }}>{r.file.formatLabel} • {formatFileSize(r.file.size)}</Text>}
                    </View>
                  </View>
                ))}
              </View>

              <Pressable onPress={handlePlayFirst} style={{ width: '100%', borderRadius: 12, overflow: 'hidden', marginBottom: 12 }}>
                <LinearGradient colors={['#8B5CF6', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
                  <Music size={20} color="#fff" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, marginLeft: 8 }}>Play Now</Text>
                </LinearGradient>
              </Pressable>
              <Pressable onPress={() => router.replace('/(app)/downloads' as never)} style={{ width: '100%', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ color: '#fff', fontWeight: '600' }}>View in Library</Text>
              </Pressable>
              <Pressable onPress={handleReset} style={{ paddingVertical: 12 }}>
                <Text style={{ color: '#8B5CF6', fontWeight: '600' }}>Import More Files</Text>
              </Pressable>
            </View>

          ) : results.length === 0 ? (
            /* ── Empty / select state ── */
            <>
              {/* iCloud Drive callout */}
              <View style={{ backgroundColor: 'rgba(0,122,255,0.1)', borderRadius: 12, padding: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center' }}>
                <CloudDownload size={22} color="#0A84FF" />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: '#0A84FF', fontWeight: '700', fontSize: 14 }}>iCloud Drive Supported</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 12, marginTop: 2 }}>
                    Pick files from iCloud Drive, Files app, or On My iPhone — all work.
                  </Text>
                </View>
              </View>

              <View style={{ backgroundColor: '#1A1A1A', borderRadius: 12, padding: 20, marginBottom: 16 }}>
                <Pressable
                  onPress={handleSelectFiles}
                  style={{ borderWidth: 2, borderStyle: 'dashed', borderColor: 'rgba(139,92,246,0.5)', borderRadius: 12, paddingVertical: 36, alignItems: 'center' }}
                >
                  <Upload size={40} color="#8B5CF6" />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16, marginTop: 14 }}>Select Audio Files</Text>
                  <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, marginTop: 4 }}>Tap to browse — multiple files supported</Text>
                </Pressable>
              </View>

              {/* Supported formats */}
              <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14, marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                  <Info size={15} color="rgba(255,255,255,0.4)" />
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, fontWeight: '700', marginLeft: 6 }}>Supported Formats</Text>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {SUPPORTED_FORMATS.map(f => (
                    <View key={f} style={{ backgroundColor: 'rgba(139,92,246,0.15)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 }}>
                      <Text style={{ color: '#8B5CF6', fontSize: 12, fontWeight: '600' }}>{f.toUpperCase()}</Text>
                    </View>
                  ))}
                </View>
              </View>

              <View style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: 14 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <HardDrive size={16} color="rgba(255,255,255,0.4)" />
                  <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, marginLeft: 8 }}>
                    Original quality preserved — no transcoding. Lossless formats (FLAC, WAV) stored as-is.
                  </Text>
                </View>
              </View>
            </>

          ) : (
            /* ── Files selected / importing ── */
            <>
              {/* Progress bar while importing */}
              {isImporting && (
                <View style={{ backgroundColor: '#1A1A1A', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>Importing…</Text>
                    <Text style={{ color: '#8B5CF6', fontWeight: '700' }}>{doneCount} / {results.length}</Text>
                  </View>
                  <View style={{ height: 4, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                    <View style={{ height: 4, backgroundColor: '#8B5CF6', borderRadius: 2, width: `${(doneCount / results.length) * 100}%` }} />
                  </View>
                </View>
              )}

              {/* File list */}
              <View style={{ backgroundColor: '#1A1A1A', borderRadius: 12, overflow: 'hidden', marginBottom: 20 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.07)' }}>
                  <Text style={{ color: 'rgba(255,255,255,0.5)', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 }}>
                    {results.length} {results.length === 1 ? 'file' : 'files'} selected
                  </Text>
                  {!isImporting && (
                    <Pressable onPress={handleReset} hitSlop={8}>
                      <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>Clear</Text>
                    </Pressable>
                  )}
                </View>
                {results.map((r, i) => {
                  const { title, artist } = parseFilename(r.file.name);
                  return (
                    <View key={i} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: i < results.length - 1 ? 1 : 0, borderBottomColor: 'rgba(255,255,255,0.06)' }}>
                      <View style={{ width: 34, height: 34, backgroundColor: 'rgba(139,92,246,0.15)', borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                        {r.status === 'importing'
                          ? <ActivityIndicator size="small" color="#8B5CF6" />
                          : r.status === 'done'
                            ? <CheckCircle size={18} color="#1DB954" />
                            : r.status === 'error'
                              ? <X size={18} color="#EF4444" />
                              : <Music size={18} color="#8B5CF6" />}
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '600' }} numberOfLines={1}>
                          {title || r.file.name}
                        </Text>
                        <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, marginTop: 1 }}>
                          {artist ? `${artist}  •  ` : ''}{r.file.formatLabel} • {formatFileSize(r.file.size)}
                          {r.file.isLossless ? '  🎵 Lossless' : null}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* Add more */}
              {!isImporting && (
                <Pressable onPress={handleSelectFiles} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12, marginBottom: 16 }}>
                  <Text style={{ color: '#8B5CF6', fontWeight: '600', fontSize: 14 }}>+ Add More Files</Text>
                </Pressable>
              )}

              {/* Import button */}
              <Pressable
                onPress={handleImportAll}
                disabled={isImporting}
                style={{ borderRadius: 12, overflow: 'hidden', opacity: isImporting ? 0.6 : 1 }}
              >
                <LinearGradient colors={['#8B5CF6', '#7C3AED']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={{ paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center' }}>
                  {isImporting
                    ? <><ActivityIndicator color="#fff" size="small" /><Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, marginLeft: 10 }}>Importing {doneCount}/{results.length}…</Text></>
                    : <><Upload size={20} color="#fff" /><Text style={{ color: '#fff', fontWeight: '700', fontSize: 15, marginLeft: 10 }}>Import {results.length} {results.length === 1 ? 'Track' : 'Tracks'}</Text></>}
                </LinearGradient>
              </Pressable>
            </>
          )}
        </ScrollView>
      </LinearGradient>
    </View>
  );
}
