import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { X } from 'lucide-react-native';
import { saveNavidromeToDisk, clearNavidromeFromDisk } from '@/lib/navidromeLocalConfig';
import { getActiveNavidrome, hasCredentials } from '@/lib/subsonic/subsonicClient';
import { useSubsonicStore } from '@/stores/subsonicStore';
import { DOCK_CYAN } from '@/constants/machinedTheme';
import { SHADOW_TEXT_INPUT_DEFAULTS } from '@/lib/shadowInput';

type Props = {
  visible: boolean;
  onDismiss: () => void;
};

export function NavidromeConnectModal({ visible, onDismiss }: Props) {
  const credentialsRevision = useSubsonicStore((s) => s.credentialsRevision);
  const testConnection = useSubsonicStore((s) => s.testConnection);
  const notifyNavidromeConfigChanged = useSubsonicStore((s) => s.notifyNavidromeConfigChanged);
  void credentialsRevision;

  const [baseUrl, setBaseUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    const c = getActiveNavidrome();
    setBaseUrl(c.baseUrl);
    setUsername(c.username);
    setPassword(c.password);
    setError(null);
  }, [visible]);

  const handleDismiss = useCallback(() => {
    setError(null);
    onDismiss();
  }, [onDismiss]);

  const handleSave = useCallback(async () => {
    setError(null);
    const u = baseUrl.trim();
    const user = username.trim();
    const pass = password;
    if (!u || !user || !pass) {
      setError('Enter server URL, username, and password.');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    if (!/^https?:\/\//i.test(u)) {
      setError('Server URL should start with https:// or http://');
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      return;
    }
    setBusy(true);
    try {
      saveNavidromeToDisk({ baseUrl: u, username: user, password: pass });
      notifyNavidromeConfigChanged();
      await testConnection();
      const st = useSubsonicStore.getState().status;
      if (st.kind === 'connected') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        handleDismiss();
      } else if (st.kind === 'offline') {
        setError(
          st.message?.slice(0, 120) ??
            'Could not reach the server. Credentials are saved — check URL, tunnel, or Navidrome Subsonic API.',
        );
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      } else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        handleDismiss();
      }
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setBusy(false);
    }
  }, [baseUrl, username, password, handleDismiss, notifyNavidromeConfigChanged, testConnection]);

  const handleRemove = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    clearNavidromeFromDisk();
    notifyNavidromeConfigChanged();
    void testConnection();
    handleDismiss();
  }, [handleDismiss, notifyNavidromeConfigChanged, testConnection]);

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={handleDismiss}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.backdrop}
      >
        <Pressable style={StyleSheet.absoluteFillObject} onPress={handleDismiss} />
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.title}>Connect Navidrome</Text>
            <Pressable
              onPress={handleDismiss}
              hitSlop={12}
              accessibilityLabel="Close"
              style={({ pressed }) => [styles.closeBtn, pressed && { opacity: 0.7 }]}
            >
              <X size={22} color="rgba(255,255,255,0.85)" strokeWidth={2.2} />
            </Pressable>
          </View>
          <Text style={styles.blurb}>
            Your server URL (no /rest path needed), Subsonic username, and password. Stored only on this device.
          </Text>

          <Text style={styles.label}>Server URL</Text>
          <TextInput
            value={baseUrl}
            onChangeText={setBaseUrl}
            placeholder="https://music.example.com"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            style={styles.input}
            {...SHADOW_TEXT_INPUT_DEFAULTS}
          />

          <Text style={styles.label}>Username</Text>
          <TextInput
            value={username}
            onChangeText={setUsername}
            placeholder="Subsonic user"
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            style={styles.input}
            {...SHADOW_TEXT_INPUT_DEFAULTS}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            editable={!busy}
            style={styles.input}
            {...SHADOW_TEXT_INPUT_DEFAULTS}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable
            onPress={() => {
              void handleSave();
            }}
            disabled={busy}
            style={({ pressed }) => [styles.primaryBtn, (pressed || busy) && { opacity: 0.85 }]}
          >
            {busy ? (
              <ActivityIndicator color="#0A0A0A" />
            ) : (
              <Text style={styles.primaryBtnText}>Save & test</Text>
            )}
          </Pressable>

          {hasCredentials() ? (
            <Pressable
              onPress={handleRemove}
              disabled={busy}
              style={({ pressed }) => [styles.removeBtn, pressed && { opacity: 0.75 }]}
            >
              <Text style={styles.removeBtnText}>Remove saved server</Text>
            </Pressable>
          ) : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.72)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: '#0c0c0e',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.35)',
    padding: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  title: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  closeBtn: {
    padding: 4,
  },
  blurb: {
    color: 'rgba(255,255,255,0.52)',
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 14,
  },
  label: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 12,
  },
  error: {
    color: '#FF8A8A',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 12,
  },
  primaryBtn: {
    backgroundColor: DOCK_CYAN,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#0A0A0A',
    fontSize: 16,
    fontWeight: '800',
  },
  removeBtn: {
    marginTop: 14,
    alignItems: 'center',
    paddingVertical: 8,
  },
  removeBtnText: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 14,
    fontWeight: '700',
  },
});
