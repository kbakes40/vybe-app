import Foundation
import MediaPlayer
import UIKit
import React

/// Syncs **Now Playing** metadata with `MPNowPlayingInfoCenter`, which drives the
/// system media card, Lock Screen controls, and the **Dynamic Island** music pill.
///
/// Note: This is **not** an ActivityKit `ActivityConfiguration` — that pattern is
/// used by `VybeDownloadWidget` for download progress. Playback uses the system
/// Now Playing surface instead.
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

    DispatchQueue.main.async {
      var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
      info[MPMediaItemPropertyTitle] = trackName
      info[MPMediaItemPropertyArtist] = artistName
      info[MPMediaItemPropertyPlaybackDuration] = max(0, duration)
      info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = 0
      info[MPNowPlayingInfoPropertyPlaybackRate] = 1.0
      info[MPNowPlayingInfoPropertyDefaultPlaybackRate] = 1.0
      MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    Self.attachArtwork(from: artworkUrl)
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
    DispatchQueue.main.async {
      var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
      if !trackName.isEmpty { info[MPMediaItemPropertyTitle] = trackName }
      if !artistName.isEmpty { info[MPMediaItemPropertyArtist] = artistName }
      info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = max(0, elapsed)
      info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
      info[MPNowPlayingInfoPropertyDefaultPlaybackRate] = 1.0
      if total > 0 { info[MPMediaItemPropertyPlaybackDuration] = total }
      // `progress` (0…1) kept for ABI compatibility with JS; elapsed + duration are authoritative.
      _ = progress
      MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
  }

  @objc func endNowPlaying() {
    isActive = false
  }

  @objc static func requiresMainQueueSetup() -> Bool {
    return false
  }

  /// Loads artwork into `MPMediaItemPropertyArtwork` (UIImage in memory).
  /// Remote `https` URLs are fetched here so the system can render them in the Island;
  /// ActivityKit **widgets** still need App Group + files — this path is Now Playing only.
  private static func attachArtwork(from artworkUrl: String) {
    guard !artworkUrl.isEmpty, let url = URL(string: artworkUrl) else { return }

    func apply(_ image: UIImage) {
      let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
      DispatchQueue.main.async {
        var updated = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        updated[MPMediaItemPropertyArtwork] = artwork
        MPNowPlayingInfoCenter.default().nowPlayingInfo = updated
      }
    }

    if url.isFileURL {
      DispatchQueue.global(qos: .userInitiated).async {
        if let data = try? Data(contentsOf: url), let image = UIImage(data: data) {
          apply(image)
        }
      }
      return
    }

    URLSession.shared.dataTask(with: url) { data, response, error in
      if let error = error {
        print("[VybeNowPlayingActivity] artwork error: \(error.localizedDescription)")
        return
      }
      if let http = response as? HTTPURLResponse, http.statusCode != 200 {
        print("[VybeNowPlayingActivity] artwork HTTP \(http.statusCode)")
        return
      }
      guard let data = data, let image = UIImage(data: data) else { return }
      apply(image)
    }.resume()
  }
}
