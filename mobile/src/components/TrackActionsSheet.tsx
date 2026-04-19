import React, { useState } from 'react';
import { View, Text, Pressable, Modal, Alert } from 'react-native';
import { VybeTextInput } from '@/components/VybeTextInput';
import { ShadowArtworkImage } from '@/components/ShadowArtworkImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Heart, Share2, Plus, X, ListPlus, Trash2 } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { Track } from '@/types/music';
import { usePlaybackController } from '@/stores/playbackController';
import { useUserPlaylistStore } from '@/stores/userPlaylistStore';
import { useDownloadsStore } from '@/stores/downloadsStore';
import { useLikedSongsStore } from '@/stores/likedSongsStore';
import { shareSong } from '@/lib/share-helpers';

interface Props {
  track: Track | null;
  visible: boolean;
  onClose: () => void;
}

export function TrackActionsSheet({ track, visible, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const isLikedCheck = useLikedSongsStore(s => s.isLiked);
  const toggleLikedSong = useLikedSongsStore(s => s.toggle);
  const addToQueue = usePlaybackController(s => s.addToQueue);
  const playlists = useUserPlaylistStore(s => s.playlists);
  const createPlaylist = useUserPlaylistStore(s => s.createPlaylist);
  const addTracksToPlaylist = useUserPlaylistStore(s => s.addTracksToPlaylist);
  const isTrackDownloaded = useDownloadsStore(s => s.isTrackDownloaded);
  const removeDownload = useDownloadsStore(s => s.removeDownload);

  const [showPlaylistPicker, setShowPlaylistPicker] = useState(false);
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState('');

  if (!track) return null;
  const isLiked = isLikedCheck(track.id);
  const downloaded = isTrackDownloaded(track.id);

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onClose();
    try {
      const url = (track as any).youtubeId
        ? `https://www.youtube.com/watch?v=${(track as any).youtubeId}`
        : (track as any).youtubeMusicId
          ? `https://music.youtube.com/watch?v=${(track as any).youtubeMusicId}`
          : (track as any).soundcloudUrl ?? null;
      await shareSong({
        title: track.title,
        artist: track.artist,
        playbackUrl: url,
      });
    } catch {}
  };

  const handleToggleLike = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    toggleLikedSong(track);
    onClose();
  };

  const handleAddToPlaylist = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPlaylistPicker(true);
  };

  const handlePickPlaylist = (playlistId: string) => {
    addTracksToPlaylist(playlistId, [track]);
    setShowPlaylistPicker(false);
    onClose();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    createPlaylist(newName.trim(), [track]);
    setNewName('');
    setCreatingNew(false);
    setShowPlaylistPicker(false);
    onClose();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'transparent' }} onPress={onClose}>
        <View style={{ flex: 1 }} />
        <Pressable onPress={() => {}} style={{ backgroundColor: '#1a1a1a', borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: insets.bottom + 16 }}>
          <View style={{ width: 36, height: 4, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 16 }} />

          {/* Header — track info */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingBottom: 18, borderBottomWidth: 0.5, borderBottomColor: 'rgba(255,255,255,0.08)' }}>
            <ShadowArtworkImage source={{ uri: track.artwork }} style={{ width: 52, height: 52, borderRadius: 6 }} contentFit="cover" />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }} numberOfLines={1}>{track.title}</Text>
              <Text style={{ color: 'rgba(255,255,255,0.55)', fontSize: 13, marginTop: 2 }} numberOfLines={1}>{track.artist}</Text>
            </View>
          </View>

          {/* Actions */}
          {!showPlaylistPicker ? (
            <>
              <ActionRow icon={<Share2 size={22} color="#fff" />} label="Share" onPress={handleShare} />
              <ActionRow
                icon={<Heart size={22} color={isLiked ? '#FF3366' : '#fff'} fill={isLiked ? '#FF3366' : 'none'} />}
                label={isLiked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
                onPress={handleToggleLike}
              />
              <ActionRow
                icon={<ListPlus size={22} color="#fff" />}
                label="Add to Queue"
                onPress={() => {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                  addToQueue(track);
                  onClose();
                }}
              />
              <ActionRow icon={<Plus size={22} color="#fff" />} label="Add to playlist" onPress={handleAddToPlaylist} />
              {downloaded ? (
                <ActionRow
                  icon={<Trash2 size={22} color="#EF4444" />}
                  label="Remove from Vault"
                  onPress={() => {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
                    removeDownload(track.id);
                    onClose();
                  }}
                />
              ) : null}
            </>
          ) : (
            <View style={{ paddingHorizontal: 20, paddingTop: 18 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>Choose a playlist</Text>
                <Pressable onPress={() => { setShowPlaylistPicker(false); setCreatingNew(false); setNewName(''); }} hitSlop={10}>
                  <X size={22} color="rgba(255,255,255,0.6)" />
                </Pressable>
              </View>

              {creatingNew ? (
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <VybeTextInput
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="Playlist name"
                    autoFocus
                    variant="default"
                    style={{ flex: 1, backgroundColor: '#222', borderColor: 'rgba(255,255,255,0.12)', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 }}
                  />
                  <Pressable onPress={handleCreate} style={{ marginLeft: 10, backgroundColor: '#7C3AED', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 }}>
                    <Text style={{ color: '#fff', fontWeight: '600' }}>Create</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  onPress={() => setCreatingNew(true)}
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, marginBottom: 6 }}
                >
                  <View style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center' }}>
                    <Plus size={22} color="#fff" />
                  </View>
                  <Text style={{ color: '#fff', fontSize: 15, marginLeft: 12, fontWeight: '500' }}>Create new playlist</Text>
                </Pressable>
              )}

              {playlists.length === 0 && !creatingNew ? (
                <Text style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, marginTop: 12 }}>No playlists yet — tap "Create new playlist" above.</Text>
              ) : (
                playlists.map(p => (
                  <Pressable key={p.id} onPress={() => handlePickPlaylist(p.id)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}>
                    <View style={{ width: 44, height: 44, borderRadius: 6, backgroundColor: '#2a2a2a' }} />
                    <View style={{ marginLeft: 12, flex: 1 }}>
                      <Text style={{ color: '#fff', fontSize: 15, fontWeight: '500' }} numberOfLines={1}>{p.name}</Text>
                      <Text style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12, marginTop: 1 }}>{p.tracks.length} tracks</Text>
                    </View>
                  </Pressable>
                ))
              )}
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ActionRow({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 24, paddingVertical: 18 }}>
      <View style={{ width: 28, alignItems: 'center' }}>{icon}</View>
      <Text style={{ color: '#fff', fontSize: 16, fontWeight: '500', marginLeft: 16 }}>{label}</Text>
    </Pressable>
  );
}
