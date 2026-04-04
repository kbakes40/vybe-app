import React, {
  useRef,
  useCallback,
  useState,
  forwardRef,
  useImperativeHandle,
  useLayoutEffect,
  useEffect,
} from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Track } from '@/types/music';
import { usePlaybackController, registerYouTubeAdapter, PlayerAdapter } from '@/stores/playbackController';

export type YouTubeIframePlayerRef = {
  loadVideoById: (videoId: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
};

export function sanitizeYouTubeVideoId(id: string): string | null {
  return /^[a-zA-Z0-9_-]{6,32}$/.test(id) ? id : null;
}

export const youtubeIframePlayerBridgeRef: { current: YouTubeIframePlayerRef | null } = {
  current: null,
};

const WARM_WEBVIEW_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    #yt-hidden-root {
      position: fixed;
      top: 0;
      left: 0;
      width: 1px;
      height: 1px;
      opacity: 0;
      pointer-events: none;
      overflow: hidden;
    }
  </style>
</head>
<body>
  <div id="yt-hidden-root"></div>
  <script>
  (function() {
    var player = null;
    var isPlayerReady = false;
    var pendingLoadId = null;
    var pendingPlay = false;
    var timeUpdateInterval = null;

    function clearTimeInterval() {
      if (timeUpdateInterval) { clearInterval(timeUpdateInterval); timeUpdateInterval = null; }
    }

    function startTimeUpdates() {
      clearTimeInterval();
      timeUpdateInterval = setInterval(function() {
        if (!player || !player.getCurrentTime) return;
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'timeUpdate',
            currentTime: player.getCurrentTime(),
            duration: player.getDuration()
          }));
        } catch (e) {}
      }, 500);
    }

    function onPlayerReady() {
      isPlayerReady = true;
      try {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'ready',
          loadTime: 0,
          duration: player && player.getDuration ? player.getDuration() : 0
        }));
      } catch (e) {}
      startTimeUpdates();
      if (pendingLoadId) {
        var id = pendingLoadId; pendingLoadId = null;
        try { player.loadVideoById(id); } catch (e) {}
      }
      if (pendingPlay && player && player.playVideo) {
        pendingPlay = false;
        try { player.playVideo(); } catch (e) {}
      }
    }

    function onPlayerStateChange(e) {
      var YTP = (window.YT && window.YT.PlayerState) || { PLAYING: 1, PAUSED: 2, ENDED: 0, BUFFERING: 3, UNSTARTED: -1, CUED: 5 };
      var isPlaying = (e.data === YTP.PLAYING);
      var map = { '-1':'idle','0':'ended','1':'playing','2':'paused','3':'buffering','5':'idle' };
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'stateChange',
        state: e.data,
        isPlaying: isPlaying,
        playbackState: map[e.data.toString()] || 'idle'
      }));
    }

    function onPlayerError(e) {
      var getErrorMessage = function(code) {
        switch(code) {
          case 2: return 'Invalid video ID';
          case 5: return 'HTML5 player error';
          case 100: return 'Video not found or private';
          case 101: case 150: return 'Video not embeddable';
          default: return 'Unknown error';
        }
      };
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'error', error: e.data, message: getErrorMessage(e.data)
      }));
    }

    function createHiddenPlayer() {
      if (player) return;
      player = new YT.Player('yt-hidden-root', {
        width: '1', height: '1',
        playerVars: {
          playsinline: 1, controls: 0, modestbranding: 1,
          rel: 0, fs: 0, iv_load_policy: 3, origin: 'https://vybe.app'
        },
        events: {
          onReady: onPlayerReady,
          onStateChange: onPlayerStateChange,
          onError: onPlayerError
        }
      });
    }

    function bootstrapApi() {
      if (window.YT && window.YT.Player) {
        createHiddenPlayer();
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'apiReady' }));
        return;
      }
      var prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = function() {
        try { if (typeof prev === 'function') prev(); } catch (x) {}
        createHiddenPlayer();
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'apiReady' }));
      };
      if (!window.__vybeYtIframeApiInjected) {
        window.__vybeYtIframeApiInjected = true;
        var tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        var firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      }
    }

    bootstrapApi();

    window.loadVideoByIdForPool = function(videoId) {
      if (!videoId) return;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'loadStart' }));
      pendingPlay = true;
      if (!player || !isPlayerReady) { pendingLoadId = videoId; return; }
      try { player.loadVideoById(videoId); } catch (e) {}
    };

    window.playVideo = function() {
      if (!player) return;
      if (!isPlayerReady) { pendingPlay = true; return; }
      pendingPlay = false;
      try { player.playVideo(); } catch (e) {}
    };

    window.pauseVideo = function() {
      pendingPlay = false;
      if (!player) return;
      try { player.pauseVideo(); } catch (e) {}
    };

    window.stopVideo = function() {
      pendingPlay = false; pendingLoadId = null; clearTimeInterval();
      if (player && isPlayerReady) { try { player.stopVideo(); } catch (e) {} }
    };

    window.seekTo = function(seconds) {
      if (player && isPlayerReady) { try { player.seekTo(seconds, true); } catch (e) {} }
    };

    window.setVolume = function(value) {
      if (player && isPlayerReady) { try { player.setVolume(value * 100); } catch (e) {} }
    };

    window.getStatus = function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'status', isPlayerReady: isPlayerReady, hasPlayer: !!player
      }));
    };

    setTimeout(function() {
      if (!window.YT) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'apiError', message: 'YouTube API load timeout'
        }));
      }
    }, 10000);
  })();
  </script>
</body>
</html>
`;

export interface YouTubeWebViewPoolRef {
  loadVideo: (videoId: string, autoplay?: boolean) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (seconds: number) => void;
  setVolume: (value: number) => void;
  isReady: () => boolean;
  getStatus: () => void;
}

interface YouTubeWebViewPoolProps {
  visible?: boolean;
  style?: object;
}

export const YouTubeWebViewPool = forwardRef<YouTubeWebViewPoolRef, YouTubeWebViewPoolProps>(
  ({ visible = false, style }, ref) => {
    const webViewRef = useRef<WebView>(null);
    const [isApiReady, setIsApiReady] = useState(false);
    const [isPlayerReady, setIsPlayerReady] = useState(false);

    const setPlaybackState = usePlaybackController(s => s.setPlaybackState);
    const setProgress = usePlaybackController(s => s.setProgress);
    const setDuration = usePlaybackController(s => s.setDuration);
    const setError = usePlaybackController(s => s.setError);
    const next = usePlaybackController(s => s.next);

    // Stable adapter — created once, always reads live webViewRef.current
    const adapterRef = useRef<PlayerAdapter>({
      prepare: async (track: Track) => {
        const rawId = track.youtubeMusicId || track.youtubeId;
        const videoId = sanitizeYouTubeVideoId(rawId || '');
        if (videoId) {
          webViewRef.current?.injectJavaScript(
            `window.loadVideoByIdForPool&&window.loadVideoByIdForPool('${videoId}'); true;`
          );
        }
      },
      play: async () => {
        console.log('[YouTube Pool] adapter.play → playVideo');
        webViewRef.current?.injectJavaScript(
          'try{window.playVideo&&window.playVideo();}catch(e){} true;'
        );
      },
      pause: async () => {
        console.log('[YouTube Pool] adapter.pause → pauseVideo');
        webViewRef.current?.injectJavaScript(
          'try{window.pauseVideo&&window.pauseVideo();}catch(e){} true;'
        );
      },
      stop: async () => {
        webViewRef.current?.injectJavaScript(
          'try{window.stopVideo&&window.stopVideo();}catch(e){} true;'
        );
      },
      seek: async (seconds: number) => {
        webViewRef.current?.injectJavaScript(
          `try{window.seekTo&&window.seekTo(${seconds});}catch(e){} true;`
        );
      },
      setVolume: (value: number) => {
        webViewRef.current?.injectJavaScript(
          `try{window.setVolume&&window.setVolume(${value});}catch(e){} true;`
        );
      },
      dispose: async () => {
        webViewRef.current?.injectJavaScript(
          'try{window.stopVideo&&window.stopVideo();}catch(e){} true;'
        );
      },
    });

    // Register adapter as soon as API is ready — stable ref identity
    useEffect(() => {
      if (isApiReady) {
        registerYouTubeAdapter(adapterRef.current);
        console.log('[YouTube Pool] Adapter registered');
      }
      return () => {
        registerYouTubeAdapter(null);
      };
    }, [isApiReady]);

    // Bridge ref for external callers
    useLayoutEffect(() => {
      const bridge: YouTubeIframePlayerRef = {
        loadVideoById: (videoId: string) => {
          const id = sanitizeYouTubeVideoId(videoId);
          if (!id) return;
          webViewRef.current?.injectJavaScript(
            `try{window.loadVideoByIdForPool&&window.loadVideoByIdForPool('${id}');}catch(e){} true;`
          );
        },
        playVideo: () =>
          webViewRef.current?.injectJavaScript(
            'try{window.playVideo&&window.playVideo();}catch(e){} true;'
          ),
        pauseVideo: () =>
          webViewRef.current?.injectJavaScript(
            'try{window.pauseVideo&&window.pauseVideo();}catch(e){} true;'
          ),
      };
      youtubeIframePlayerBridgeRef.current = bridge;
      return () => {
        youtubeIframePlayerBridgeRef.current = null;
      };
    }, []);

    const handleMessage = useCallback(
      (event: { nativeEvent: { data: string } }) => {
        try {
          const data = JSON.parse(event.nativeEvent.data);
          const currentSource = usePlaybackController.getState().currentSource;
          const isYouTubeActive = currentSource === 'youtube' || currentSource === 'youtube_music';

          if (data.type === 'apiReady') {
            console.log('[YouTube Pool] API ready');
            setIsApiReady(true);
          } else if (data.type === 'ready') {
            console.log('[YouTube Pool] Player ready');
            setIsPlayerReady(true);
            if (isYouTubeActive && data.duration) {
              setDuration(data.duration);
            }
          } else if (data.type === 'stateChange') {
            console.log('[YouTube Pool] State:', data.playbackState, 'isPlaying:', data.isPlaying);
            if (isYouTubeActive) {
              const st = data.state as number;
              if (st === 3) {
                setPlaybackState('buffering');
              } else if (data.isPlaying === true) {
                setPlaybackState('playing');
              } else if (st === 0) {
                setPlaybackState('paused');
                next();
              } else {
                setPlaybackState('paused');
              }
            }
          } else if (data.type === 'error') {
            console.log('[YouTube Pool] Error:', data.message);
            if (isYouTubeActive) {
              setError(data.message);
              setPlaybackState('error');
            }
          } else if (data.type === 'timeUpdate') {
            if (isYouTubeActive) {
              setProgress(data.currentTime);
              if (data.duration > 0) {
                setDuration(data.duration);
              }
            }
          }
        } catch {
          // ignore parse errors
        }
      },
      [setPlaybackState, setProgress, setDuration, setError, next]
    );

    useImperativeHandle(
      ref,
      () => ({
        loadVideo: (videoId: string, _autoplay = true) => {
          const id = sanitizeYouTubeVideoId(videoId);
          if (!id) return;
          webViewRef.current?.injectJavaScript(
            `try{window.loadVideoByIdForPool&&window.loadVideoByIdForPool('${id}');}catch(e){} true;`
          );
        },
        play: () => {
          webViewRef.current?.injectJavaScript(
            'try{window.playVideo&&window.playVideo();}catch(e){} true;'
          );
        },
        pause: () => {
          webViewRef.current?.injectJavaScript(
            'try{window.pauseVideo&&window.pauseVideo();}catch(e){} true;'
          );
        },
        stop: () => {
          webViewRef.current?.injectJavaScript(
            'try{window.stopVideo&&window.stopVideo();}catch(e){} true;'
          );
        },
        seek: (seconds: number) => {
          webViewRef.current?.injectJavaScript(
            `try{window.seekTo&&window.seekTo(${seconds});}catch(e){} true;`
          );
        },
        setVolume: (value: number) => {
          webViewRef.current?.injectJavaScript(
            `try{window.setVolume&&window.setVolume(${value});}catch(e){} true;`
          );
        },
        isReady: () => isApiReady && isPlayerReady,
        getStatus: () => {
          webViewRef.current?.injectJavaScript(
            'try{window.getStatus&&window.getStatus();}catch(e){} true;'
          );
        },
      }),
      [isApiReady, isPlayerReady]
    );

    return (
      <View style={[styles.container, !visible && styles.hidden, style]}>
        <WebView
          ref={webViewRef}
          source={{ html: WARM_WEBVIEW_HTML }}
          style={styles.webView}
          allowsInlineMediaPlayback
          mediaPlaybackRequiresUserAction={false}
          onMessage={handleMessage}
          scrollEnabled={false}
          bounces={false}
          onError={(e) => console.log('[YouTube Pool] WebView error:', e.nativeEvent)}
        />
      </View>
    );
  }
);

YouTubeWebViewPool.displayName = 'YouTubeWebViewPool';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0A' },
  hidden: {
    // iOS blocks media from 1x1/opacity-0 WebViews.
    // Position off-screen with real dimensions so the IFrame player can play audio.
    position: 'absolute',
    left: -500,
    top: -500,
    width: 320,
    height: 180,
  },
  webView: { flex: 1, backgroundColor: '#0A0A0A' },
});

export default YouTubeWebViewPool;
