import React, { useRef, useCallback, useState, forwardRef, useImperativeHandle, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Track } from '@/types/music';
import { useSoundCloudPreloadStore } from '@/stores/soundcloudPreloadStore';
import { usePlaybackController, registerSoundCloudAdapter, PlayerAdapter } from '@/stores/playbackController';
import { usePlaybackDebugStore } from '@/stores/playbackDebugStore';

/**
 * SoundCloud WebView Pool - Embed Only Mode
 *
 * Uses the official SoundCloud iframe embed with Widget API.
 * This approach is reliable across iOS/Android because it:
 * 1. Loads the embed directly from soundcloud.com (no about:srcdoc)
 * 2. Uses the official Widget API for playback control
 * 3. Works within iOS WebView restrictions
 *
 * IMPORTANT: SoundCloud tracks play via embed ONLY - no native audio extraction.
 * Native audio is reserved for VYBE and FreePD tracks with direct audio URLs.
 */

// Silent playback detection constants
const SILENT_CHECK_DELAY = 800; // ms after play to check if audio is actually playing
const MAX_SILENT_RETRIES = 1;

// Injected script to set up Widget API bindings after page load
const WIDGET_SETUP_SCRIPT = `
(function() {
  if (window.scWidgetSetupDone) return;
  window.scWidgetSetupDone = true;

  var checkInterval = setInterval(function() {
    if (typeof SC !== 'undefined' && SC.Widget) {
      clearInterval(checkInterval);

      try {
        var iframe = document.querySelector('iframe');
        if (!iframe) {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: 'No iframe found' }));
          return;
        }

        var widget = SC.Widget(iframe);
        window.widget = widget;

        widget.bind(SC.Widget.Events.READY, function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
        });

        widget.bind(SC.Widget.Events.PLAY, function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'play' }));
        });

        widget.bind(SC.Widget.Events.PAUSE, function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'pause' }));
        });

        widget.bind(SC.Widget.Events.FINISH, function() {
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'finish' }));
        });

        widget.bind(SC.Widget.Events.ERROR, function(e) {
          var errorMsg = 'This track cannot be played';
          if (e && typeof e === 'string') {
            errorMsg = e;
          } else if (e && e.message) {
            errorMsg = e.message;
          }
          window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: errorMsg }));
        });

        widget.bind(SC.Widget.Events.PLAY_PROGRESS, function(e) {
          if (e && e.currentPosition !== undefined) {
            widget.getDuration(function(dur) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'timeUpdate',
                currentTime: e.currentPosition,
                duration: dur,
                positionChanged: true
              }));
            });
          }
        });

        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'warm' }));
      } catch(e) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'error', message: e.message || 'Widget init failed' }));
      }
    }
  }, 100);

  // Timeout after 10 seconds
  setTimeout(function() {
    clearInterval(checkInterval);
  }, 10000);
})();
true;
`;

export interface SoundCloudWebViewPoolRef {
  loadTrack: (embedUrl: string) => void;
  loadTrackByUrl: (soundcloudUrl: string) => void;
  play: () => void;
  pause: () => void;
  seek: (ms: number) => void;
  isWarm: () => boolean;
  getStatus: () => void;
  forceReload: () => void;
}

interface SoundCloudWebViewPoolProps {
  onMessage?: (event: { nativeEvent: { data: string } }) => void;
  onLoadStart?: () => void;
  onReady?: (loadTime?: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onFinish?: () => void;
  onError?: (message: string) => void;
  onTimeUpdate?: (currentTime: number, duration: number) => void;
  onSilentPlayback?: () => void;
  visible?: boolean;
  style?: object;
}

// Build embed URL from SoundCloud track URL
function buildEmbedUrl(soundcloudUrl: string, autoPlay = false): string {
  return `https://w.soundcloud.com/player/?url=${encodeURIComponent(soundcloudUrl)}&auto_play=${autoPlay}&hide_related=true&show_comments=false&show_user=true&show_reposts=false&visual=true&color=%23FF5500`;
}

export const SoundCloudWebViewPool = forwardRef<SoundCloudWebViewPoolRef, SoundCloudWebViewPoolProps>(
  ({ onMessage, onLoadStart, onReady, onPlay, onPause, onFinish, onError, onTimeUpdate, onSilentPlayback, visible = false, style }, ref) => {
    const webViewRef = useRef<WebView>(null);
    const [isWarm, setIsWarm] = useState(false);
    const [currentEmbedUrl, setCurrentEmbedUrl] = useState<string | null>(null);
    const currentTrackRef = useRef<Track | null>(null);
    const setWarmWebViewReady = useSoundCloudPreloadStore(s => s.setWarmWebViewReady);

    // PlaybackController integration
    const setPlaybackState = usePlaybackController(s => s.setPlaybackState);
    const setProgress = usePlaybackController(s => s.setProgress);
    const setDuration = usePlaybackController(s => s.setDuration);
    const setError = usePlaybackController(s => s.setError);
    const currentSource = usePlaybackController(s => s.currentSource);
    const next = usePlaybackController(s => s.next);
    const resetSilentRetryCount = usePlaybackController(s => s.resetSilentRetryCount);

    // Debug store integration
    const updateSoundCloudDebug = usePlaybackDebugStore(s => s.updateSoundCloudDebug);
    const setActiveAudioSource = usePlaybackDebugStore(s => s.setActiveAudioSource);
    const setWebViewMediaStatus = usePlaybackDebugStore(s => s.setWebViewMediaStatus);
    const setPlaybackTimeAdvancing = usePlaybackDebugStore(s => s.setPlaybackTimeAdvancing);
    const setRetryCount = usePlaybackDebugStore(s => s.setRetryCount);

    // Only handle events if SoundCloud is the active source
    const isSoundCloudActive = currentSource === 'soundcloud';

    // Silent playback detection state
    const silentRetryCountRef = useRef(0);
    const playStartTimeRef = useRef<number | null>(null);
    const lastProgressRef = useRef(0);
    const silentCheckTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const hasReceivedProgressRef = useRef(false);

    // Clear silent check timeout
    const clearSilentCheck = useCallback(() => {
      if (silentCheckTimeoutRef.current) {
        clearTimeout(silentCheckTimeoutRef.current);
        silentCheckTimeoutRef.current = null;
      }
    }, []);

    // Start silent playback detection after play
    const startSilentCheck = useCallback(() => {
      clearSilentCheck();
      hasReceivedProgressRef.current = false;
      playStartTimeRef.current = Date.now();

      silentCheckTimeoutRef.current = setTimeout(() => {
        // Check if we've received any progress updates
        if (!hasReceivedProgressRef.current && isSoundCloudActive) {
          console.log('[SoundCloud Pool] Silent playback detected! No progress after', SILENT_CHECK_DELAY, 'ms');
          console.log('[SoundCloud Pool] Retry count:', silentRetryCountRef.current);

          // Update debug state
          updateSoundCloudDebug({ silentPlaybackDetected: true, currentTimeAdvancing: false });
          setPlaybackTimeAdvancing(false);

          if (silentRetryCountRef.current < MAX_SILENT_RETRIES) {
            // Auto-retry by reloading the embed
            silentRetryCountRef.current++;
            setRetryCount(silentRetryCountRef.current);
            console.log('[SoundCloud Pool] Auto-retrying playback...');

            // Reload the WebView
            webViewRef.current?.reload();
          } else {
            // Max retries reached
            console.log('[SoundCloud Pool] Max silent retries reached');
            onSilentPlayback?.();
            setError('SoundCloud playback failed. Try opening in SoundCloud app.');
            setPlaybackState('error');
            setWebViewMediaStatus('blocked');
          }
        }
      }, SILENT_CHECK_DELAY);
    }, [clearSilentCheck, isSoundCloudActive, onSilentPlayback, setError, setPlaybackState, updateSoundCloudDebug, setPlaybackTimeAdvancing, setRetryCount, setWebViewMediaStatus]);

    // Cleanup on unmount
    useEffect(() => {
      return () => {
        clearSilentCheck();
      };
    }, [clearSilentCheck]);

    const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        if (data.type === 'warm') {
          console.log('[SoundCloud Pool] Widget API ready');
          setIsWarm(true);
          setWarmWebViewReady(true);
        } else if (data.type === 'ready') {
          console.log('[SoundCloud Pool] Track ready');
          onReady?.();
          updateSoundCloudDebug({ widgetReady: true });
          setWebViewMediaStatus('ready');

          // Auto-play when ready
          setTimeout(() => {
            webViewRef.current?.injectJavaScript('if(window.widget){window.widget.play();}; true;');
          }, 100);
        } else if (data.type === 'play') {
          console.log('[SoundCloud Pool] Play event received');
          onPlay?.();
          silentRetryCountRef.current = 0;
          resetSilentRetryCount();
          updateSoundCloudDebug({ playCommandSent: true, currentTimeAdvancing: false });
          setRetryCount(0);

          // Start checking for silent playback
          if (isSoundCloudActive) {
            setPlaybackState('buffering');
            startSilentCheck();
          }
        } else if (data.type === 'pause') {
          console.log('[SoundCloud Pool] Pause event');
          clearSilentCheck();
          onPause?.();
          if (isSoundCloudActive) {
            setPlaybackState('paused');
            setPlaybackTimeAdvancing(false);
          }
        } else if (data.type === 'finish') {
          console.log('[SoundCloud Pool] Finish event');
          clearSilentCheck();
          onFinish?.();
          if (isSoundCloudActive) {
            setPlaybackState('ended');
            next();
          }
        } else if (data.type === 'error') {
          console.log('[SoundCloud Pool] Error:', data.message);
          clearSilentCheck();
          onError?.(data.message);
          if (isSoundCloudActive) {
            setError(data.message);
            setPlaybackState('error');
            setWebViewMediaStatus('error');
          }
        } else if (data.type === 'timeUpdate') {
          const currentTime = data.currentTime || 0;
          const duration = data.duration || 0;

          onTimeUpdate?.(currentTime, duration);

          if (isSoundCloudActive) {
            // SoundCloud returns time in ms
            const progressSec = currentTime / 1000;
            setProgress(progressSec);

            if (duration > 0) {
              setDuration(duration / 1000);
            }

            // Check for actual progress (audio is playing)
            if (data.positionChanged && currentTime > lastProgressRef.current) {
              lastProgressRef.current = currentTime;
              hasReceivedProgressRef.current = true;

              // Update debug state
              updateSoundCloudDebug({
                currentTimeAdvancing: true,
                lastPosition: currentTime,
                silentPlaybackDetected: false
              });
              setPlaybackTimeAdvancing(true);
              setWebViewMediaStatus('playing');

              // First progress after play - confirm we're actually playing
              const playbackState = usePlaybackController.getState().playbackState;
              if (playbackState === 'buffering') {
                console.log('[SoundCloud Pool] Audio confirmed playing - progress detected');
                setPlaybackState('playing');
                clearSilentCheck();
              }
            }
          }
        }

        // Forward to external handler
        onMessage?.(event);
      } catch {
        // Ignore parse errors
      }
    }, [onMessage, onReady, onPlay, onPause, onFinish, onError, onTimeUpdate, setWarmWebViewReady, isSoundCloudActive, setPlaybackState, setProgress, setDuration, setError, next, startSilentCheck, clearSilentCheck, resetSilentRetryCount, updateSoundCloudDebug, setPlaybackTimeAdvancing, setRetryCount, setWebViewMediaStatus, onSilentPlayback]);

    // Handle WebView load completion - inject widget setup script
    const handleLoadEnd = useCallback(() => {
      console.log('[SoundCloud Pool] WebView loaded, injecting widget setup');
      webViewRef.current?.injectJavaScript(WIDGET_SETUP_SCRIPT);
    }, []);

    // Create adapter for PlaybackController
    const adapter: PlayerAdapter = {
      prepare: async (track: Track) => {
        currentTrackRef.current = track;
        silentRetryCountRef.current = 0;
        lastProgressRef.current = 0;
        hasReceivedProgressRef.current = false;

        if (track.soundcloudUrl) {
          console.log('[SoundCloud Pool] Loading track:', track.title);
          const embedUrl = buildEmbedUrl(track.soundcloudUrl, false);
          setCurrentEmbedUrl(embedUrl);

          if (isSoundCloudActive) {
            setPlaybackState('loading');
            setActiveAudioSource('soundcloud');
            setWebViewMediaStatus('loading');
            updateSoundCloudDebug({ embedLoaded: true, playCommandSent: false });
          }
        }
      },
      play: async () => {
        hasReceivedProgressRef.current = false;
        webViewRef.current?.injectJavaScript('if(window.widget){window.widget.play();}; true;');
      },
      pause: async () => {
        clearSilentCheck();
        webViewRef.current?.injectJavaScript('if(window.widget){window.widget.pause();}; true;');
      },
      stop: async () => {
        clearSilentCheck();
        webViewRef.current?.injectJavaScript('if(window.widget){window.widget.pause();}; true;');
      },
      seek: async (seconds: number) => {
        webViewRef.current?.injectJavaScript(`if(window.widget){window.widget.seekTo(${seconds * 1000});}; true;`);
      },
      setVolume: () => {
        // SoundCloud widget doesn't support volume control via API
      },
      dispose: async () => {
        clearSilentCheck();
        webViewRef.current?.injectJavaScript('if(window.widget){window.widget.pause();}; true;');
      },
    };

    // Register adapter with PlaybackController
    useEffect(() => {
      registerSoundCloudAdapter(adapter);
      console.log('[SoundCloud Pool] Adapter registered');
      return () => {
        registerSoundCloudAdapter(null);
        clearSilentCheck();
      };
    }, [clearSilentCheck]);

    useImperativeHandle(ref, () => ({
      loadTrack: (embedUrl: string) => {
        console.log('[SoundCloud Pool] Loading track by embed URL');
        silentRetryCountRef.current = 0;
        setCurrentEmbedUrl(embedUrl);
      },
      loadTrackByUrl: (soundcloudUrl: string) => {
        console.log('[SoundCloud Pool] Loading track by URL');
        silentRetryCountRef.current = 0;
        const embedUrl = buildEmbedUrl(soundcloudUrl, false);
        setCurrentEmbedUrl(embedUrl);
      },
      play: () => {
        hasReceivedProgressRef.current = false;
        webViewRef.current?.injectJavaScript('if(window.widget){window.widget.play();}; true;');
      },
      pause: () => {
        clearSilentCheck();
        webViewRef.current?.injectJavaScript('if(window.widget){window.widget.pause();}; true;');
      },
      seek: (ms: number) => {
        webViewRef.current?.injectJavaScript(`if(window.widget){window.widget.seekTo(${ms});}; true;`);
      },
      isWarm: () => isWarm,
      getStatus: () => {
        webViewRef.current?.injectJavaScript(`
          if(window.widget){
            window.widget.getPosition(function(pos){
              window.widget.getDuration(function(dur){
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'status',
                  position: pos,
                  duration: dur
                }));
              });
            });
          }
          true;
        `);
      },
      forceReload: () => {
        webViewRef.current?.reload();
      },
    }));

    // If no embed URL yet, render a placeholder
    if (!currentEmbedUrl) {
      return (
        <View style={[styles.container, !visible && styles.hidden, style]}>
          <View style={styles.placeholder} />
        </View>
      );
    }

    return (
      <View style={[styles.container, !visible && styles.hidden, style]}>
        <WebView
          ref={webViewRef}
          source={{ uri: currentEmbedUrl }}
          style={styles.webView}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          javaScriptEnabled
          domStorageEnabled
          onMessage={handleMessage}
          onLoadEnd={handleLoadEnd}
          scrollEnabled={false}
          bounces={false}
          onError={(e) => {
            console.log('[SoundCloud Pool] WebView error:', e.nativeEvent);
            onError?.(e.nativeEvent.description || 'WebView error');
          }}
        />
      </View>
    );
  }
);

SoundCloudWebViewPool.displayName = 'SoundCloudWebViewPool';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  hidden: {
    // iOS blocks media from 1x1/opacity-0 WebViews.
    // Position off-screen with real dimensions so the widget can play audio.
    position: 'absolute',
    left: -500,
    top: -500,
    width: 320,
    height: 180,
  },
  webView: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  placeholder: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
});

export default SoundCloudWebViewPool;
