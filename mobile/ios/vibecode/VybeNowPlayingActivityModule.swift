import Foundation
import MediaPlayer
import React

/// Manages the Now Playing Live Activity state.
/// On iOS 16.1+ with the audio background mode, iOS automatically shows a
/// music pill in the Dynamic Island when MPNowPlayingInfoCenter has active info.
/// This module updates that info center and exposes the activity lifecycle to JS.
@objc(VybeNowPlayingActivity)
class VybeNowPlayingActivityModule: NSObject {

  private var isActive = false

  @objc func startNowPlaying(
    _ trackName: String,
    artistName: String,
    artworkUrl: String,
    duration: Double
  ) {
    isActive = true
    // Refresh MPNowPlayingInfoCenter to ensure the Dynamic Island pill appears.
    var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
    if info[MPMediaItemPropertyTitle] == nil {
      info[MPMediaItemPropertyTitle] = trackName
      info[MPMediaItemPropertyArtist] = artistName
      info[MPMediaItemPropertyPlaybackDuration] = duration
      info[MPNowPlayingInfoPropertyPlaybackRate] = 1.0
      MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
  }

  @objc func updateNowPlaying(
    _ isPlaying: Bool,
    progress: Double,
    elapsed: Double,
    total: Double,
    trackName: String,
    artistName: String
  ) {
    guard isActive else { return }
    var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
    info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = elapsed
    info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
    if total > 0 { info[MPMediaItemPropertyPlaybackDuration] = total }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }

  @objc func endNowPlaying() {
    isActive = false
    // Leave MPNowPlayingInfoCenter populated — it clears when audio stops.
    // The Dynamic Island pill will disappear naturally when the audio session ends.
  }

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
