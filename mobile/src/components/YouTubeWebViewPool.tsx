import React, { useRef, useCallback, useState, forwardRef, useImperativeHandle } from 'react';
import { View, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Track } from '@/types/music';
import { usePlaybackController, registerYouTubeAdapter, PlayerAdapter } from '@/stores/playbackController';

/**
 * YouTube WebView Pool
 *
 * Manages a pre-warmed WebView for instant YouTube/YouTube Music playback.
 * The warm WebView loads the YouTube IFrame API script ahead of time,
 * so when the user taps play, only the video ID needs to be loaded.
 *
 * Implements the PlayerAdapter interface for the unified PlaybackController.
 */

// HTML that pre-loads the YouTube IFrame API (no video loaded)
const WARM_WEBVIEW_HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: 100%;
      height: 100%;
      background: #0A0A0A;
      overflow: hidden;
    }
    #player {
      width: 100%;
      height: 100%;
      display: none;
    }
    #status {
      color: #666;
      font-family: system-ui;
      font-size: 12px;
      text-align: center;
      padding-top: 40%;
    }
  </style>
</head>
<body>
  <div id="status">Warming up...</div>
  <div id="player"></div>
  <script>
    var player = null;
    var isApiReady = false;
    var isPlayerReady = false;
    var currentVideoId = null;
    var loadStartTime = 0;
    var timeUpdateInterval = null;

    function log(msg) {
      console.log('[YouTube Warm] ' + msg);
    }

    // Load YouTube IFrame API
    var tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    var firstScriptTag = document.getElementsByTagName('script')[0];
    firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

    // Called by YouTube API when ready
    function onYouTubeIframeAPIReady() {
      log('IFrame API ready');
      isApiReady = true;
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'apiReady' }));
      document.getElementById('status').textContent = 'Ready';
    }

    // Create player with video ID
    window.loadVideo = function(videoId, autoplay) {
      loadStartTime = Date.now();
      log('Loading video: ' + videoId + ', autoplay: ' + autoplay);

      // Notify loading started
      window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'loadStart' }));

      document.getElementById('status').style.display = 'none';
      document.getElementById('player').style.display = 'block';

      currentVideoId = videoId;
      isPlayerReady = false;

      // Clear previous time updates
      if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
        timeUpdateInterval = null;
      }

      if (player) {
        // Reuse existing player - just load new video
        log('Reusing existing player');
        if (autoplay) {
          player.loadVideoById(videoId);
        } else {
          player.cueVideoById(videoId);
        }
      } else {
        // Create new player
        log('Creating new player');
        player = new YT.Player('player', {
          videoId: videoId,
          playerVars: {
            'autoplay': autoplay ? 1 : 0,
            'playsinline': 1,
            'controls': 0,
            'modestbranding': 1,
            'rel': 0,
            'showinfo': 0,
            'fs': 0,
            'iv_load_policy': 3,
            'origin': 'https://vybe.app'
          },
          events: {
            'onReady': onPlayerReady,
            'onStateChange': onPlayerStateChange,
            'onError': onPlayerError
          }
        });
      }
    };

    function onPlayerReady(event) {
      var loadTime = Date.now() - loadStartTime;
      log('Player READY in ' + loadTime + 'ms');
      isPlayerReady = true;

      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'ready',
        loadTime: loadTime,
        duration: player.getDuration()
      }));

      // Start time update interval
      timeUpdateInterval = setInterval(function() {
        if (player && player.getCurrentTime) {
          try {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'timeUpdate',
              currentTime: player.getCurrentTime(),
              duration: player.getDuration()
            }));
          } catch(e) {
            log('Time update error: ' + e.message);
          }
        }
      }, 500);
    }

    function onPlayerStateChange(event) {
      log('State change: ' + event.data);
      // YouTube states: -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
      var stateMap = {
        '-1': 'idle',
        '0': 'ended',
        '1': 'playing',
        '2': 'paused',
        '3': 'buffering',
        '5': 'idle'
      };
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'stateChange',
        state: event.data,
        playbackState: stateMap[event.data.toString()] || 'idle'
      }));
    }

    function onPlayerError(event) {
      log('Error: ' + event.data);
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'error',
        error: event.data,
        message: getErrorMessage(event.data)
      }));
    }

    function getErrorMessage(code) {
      switch(code) {
        case 2: return 'Invalid video ID';
        case 5: return 'HTML5 player error';
        case 100: return 'Video not found or private';
        case 101:
        case 150: return 'Video not embeddable';
        default: return 'Unknown error';
      }
    }

    window.playVideo = function() {
      if (player && isPlayerReady) {
        log('Playing');
        player.playVideo();
      } else {
        log('Cannot play - player not ready');
      }
    };

    window.pauseVideo = function() {
      if (player) {
        log('Pausing');
        player.pauseVideo();
      }
    };

    window.stopVideo = function() {
      if (player) {
        log('Stopping');
        player.stopVideo();
      }
      if (timeUpdateInterval) {
        clearInterval(timeUpdateInterval);
        timeUpdateInterval = null;
      }
    };

    window.seekTo = function(seconds) {
      if (player) {
        player.seekTo(seconds, true);
      }
    };

    window.setVolume = function(value) {
      if (player) {
        player.setVolume(value * 100);
      }
    };

    window.getStatus = function() {
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'status',
        isApiReady: isApiReady,
        isPlayerReady: isPlayerReady,
        currentVideoId: currentVideoId
      }));
    };

    // Timeout for API load
    setTimeout(function() {
      if (!isApiReady) {
        log('API load timeout');
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'apiError',
          message: 'YouTube API load timeout'
        }));
      }
    }, 10000);
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
    const currentTrackRef = useRef<Track | null>(null);

    const setPlaybackState = usePlaybackController(s => s.setPlaybackState);
    const setProgress = usePlaybackController(s => s.setProgress);
    const setDuration = usePlaybackController(s => s.setDuration);
    const setError = usePlaybackController(s => s.setError);
    const currentSource = usePlaybackController(s => s.currentSource);
    const next = usePlaybackController(s => s.next);

    // Only handle events if YouTube is the active source
    const isYouTubeActive = currentSource === 'youtube' || currentSource === 'youtube_music';

    const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);

        if (data.type === 'apiReady') {
          console.log('[YouTube Pool] API ready');
          setIsApiReady(true);
        } else if (data.type === 'apiError') {
          console.log('[YouTube Pool] API error:', data.message);
        } else if (data.type === 'loadStart') {
          console.log('[YouTube Pool] Load started');
          if (isYouTubeActive) {
            setPlaybackState('loading');
          }
        } else if (data.type === 'ready') {
          console.log('[YouTube Pool] Player ready, loadTime:', data.loadTime);
          setIsPlayerReady(true);
          if (isYouTubeActive && data.duration) {
            setDuration(data.duration);
          }
        } else if (data.type === 'stateChange') {
          console.log('[YouTube Pool] State:', data.playbackState);
          if (isYouTubeActive) {
            setPlaybackState(data.playbackState);
            if (data.state === 0) {
              // Video ended
              next();
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
        } else if (data.type === 'status') {
          console.log('[YouTube Pool] Status:', data);
        }
      } catch {
        // Ignore parse errors
      }
    }, [isYouTubeActive, setPlaybackState, setProgress, setDuration, setError, next]);

    // Create adapter for PlaybackController
    const adapter: PlayerAdapter = {
      prepare: async (track: Track) => {
        currentTrackRef.current = track;
        const videoId = track.youtubeMusicId || track.youtubeId;
        if (videoId) {
          webViewRef.current?.injectJavaScript(`loadVideo('${videoId}', false); true;`);
        }
      },
      play: async () => {
        webViewRef.current?.injectJavaScript('playVideo(); true;');
      },
      pause: async () => {
        webViewRef.current?.injectJavaScript('pauseVideo(); true;');
      },
      stop: async () => {
        webViewRef.current?.injectJavaScript('stopVideo(); true;');
      },
      seek: async (seconds: number) => {
        webViewRef.current?.injectJavaScript(`seekTo(${seconds}); true;`);
      },
      setVolume: (value: number) => {
        webViewRef.current?.injectJavaScript(`setVolume(${value}); true;`);
      },
      dispose: async () => {
        webViewRef.current?.injectJavaScript('stopVideo(); true;');
      },
    };

    // Register adapter with PlaybackController
    React.useEffect(() => {
      if (isApiReady) {
        registerYouTubeAdapter(adapter);
        console.log('[YouTube Pool] Adapter registered');
      }
      return () => {
        registerYouTubeAdapter(null);
      };
    }, [isApiReady]);

    useImperativeHandle(ref, () => ({
      loadVideo: (videoId: string, autoplay = true) => {
        console.log('[YouTube Pool] Loading video:', videoId);
        webViewRef.current?.injectJavaScript(`loadVideo('${videoId}', ${autoplay}); true;`);
      },
      play: () => {
        webViewRef.current?.injectJavaScript('playVideo(); true;');
      },
      pause: () => {
        webViewRef.current?.injectJavaScript('pauseVideo(); true;');
      },
      stop: () => {
        webViewRef.current?.injectJavaScript('stopVideo(); true;');
      },
      seek: (seconds: number) => {
        webViewRef.current?.injectJavaScript(`seekTo(${seconds}); true;`);
      },
      setVolume: (value: number) => {
        webViewRef.current?.injectJavaScript(`setVolume(${value}); true;`);
      },
      isReady: () => isApiReady && isPlayerReady,
      getStatus: () => {
        webViewRef.current?.injectJavaScript('getStatus(); true;');
      },
    }));

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
          onError={(e) => {
            console.log('[YouTube Pool] WebView error:', e.nativeEvent);
          }}
        />
      </View>
    );
  }
);

YouTubeWebViewPool.displayName = 'YouTubeWebViewPool';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  hidden: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  webView: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
});

export default YouTubeWebViewPool;
