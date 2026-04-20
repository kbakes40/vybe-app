import Foundation
import MediaPlayer
import AVFoundation
import UIKit
import React

/// PILL_IGNITION_V9 — **Music** Now Playing / Dynamic Island via `MPNowPlayingInfoCenter`.
///
/// This is **not** ActivityKit: fields here are **not** `VybeActivityAttributes`.
/// `VybeActivityAttributes` + `ActivityKit` apply only to **download** progress
/// (`VybeDownloadActivityModule` + `VybeDownloadWidgetExtension`). JS must pass
/// non-empty **title**, **artist**, and a resolvable **https** artwork URL for
/// best Island elevation (see `loadArtworkAsync`).
///
/// iOS auto-creates the Dynamic Island music pill only when ALL of these hold:
///   1. MPNowPlayingInfoCenter has title + artist + artwork
///   2. AVAudioSession is .playback and active
///   3. At least one MPRemoteCommandCenter command is enabled with a handler
/// Without #3 iOS treats the audio as "headless" and refuses to elevate.
@objc(VybeNowPlayingActivity)
class VybeNowPlayingActivityModule: RCTEventEmitter {

  private var isActive = false
  private var currentArtworkURL: String = ""
  private var artworkTask: URLSessionDataTask?
  private var commandsConfigured = false

  override func supportedEvents() -> [String]! {
    return [
      "VybeRemotePlay",
      "VybeRemotePause",
      "VybeRemoteTogglePlayPause",
      "VybeRemoteNextTrack",
      "VybeRemotePreviousTrack",
    ]
  }

  override static func requiresMainQueueSetup() -> Bool {
    return false
  }

  @objc func startNowPlaying(
    _ trackName: String,
    artistName: String,
    artworkUrl: String,
    duration: Double,
    albumTitle: String
  ) {
    print("--- NATIVE ACTIVITY REQUESTED ---")
    isActive = true
    ensurePlaybackSession()
    setupRemoteCommandsOnce()
    NSLog("[VybeNowPlaying] startNowPlaying track=\"\(trackName)\" art=\(artworkUrl.isEmpty ? "<EMPTY>" : artworkUrl)")

    // Clobber metadata on every start — track changes must reflect immediately.
    var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
    info[MPMediaItemPropertyTitle] = trackName
    info[MPMediaItemPropertyArtist] = artistName
    let album = albumTitle.trimmingCharacters(in: .whitespacesAndNewlines)
    if !album.isEmpty {
      info[MPMediaItemPropertyAlbumTitle] = album
    } else {
      info.removeValue(forKey: MPMediaItemPropertyAlbumTitle)
    }
    info[MPMediaItemPropertyPlaybackDuration] = duration
    info[MPNowPlayingInfoPropertyPlaybackRate] = 1.0
    info[MPNowPlayingInfoPropertyMediaType] = NSNumber(value: MPMediaType.music.rawValue)
    // Drop the previous track's artwork the moment the URL changes so the
    // Dynamic Island doesn't flash stale art while the new image downloads.
    if artworkUrl != currentArtworkURL {
      info[MPMediaItemPropertyArtwork] = nil
    }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info

    loadArtworkAsync(urlString: artworkUrl)
  }

  @objc func updateNowPlaying(
    _ isPlaying: Bool,
    progress: Double,
    elapsed: Double,
    total: Double,
    trackName: String,
    artistName: String,
    albumTitle: String
  ) {
    guard isActive else { return }
    var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
    info[MPMediaItemPropertyTitle] = trackName
    info[MPMediaItemPropertyArtist] = artistName
    let album = albumTitle.trimmingCharacters(in: .whitespacesAndNewlines)
    if !album.isEmpty {
      info[MPMediaItemPropertyAlbumTitle] = album
    } else {
      info.removeValue(forKey: MPMediaItemPropertyAlbumTitle)
    }
    info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = elapsed
    info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
    if total > 0 { info[MPMediaItemPropertyPlaybackDuration] = total }
    info[MPNowPlayingInfoPropertyMediaType] = NSNumber(value: MPMediaType.music.rawValue)
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }

  @objc func endNowPlaying() {
    isActive = false
    artworkTask?.cancel()
    artworkTask = nil
    // Leave MPNowPlayingInfoCenter populated — it clears when audio stops.
    // The Dynamic Island pill disappears naturally when the audio session ends.
  }

  /// PILL_LOCK_V2 — hard reset for sign-out / auth surfaces: clears lock-screen
  /// metadata so nothing remains “stuck” above the hardware pill.
  @objc func terminateAllNowPlayingMetadata() {
    isActive = false
    artworkTask?.cancel()
    artworkTask = nil
    currentArtworkURL = ""
    MPNowPlayingInfoCenter.default().nowPlayingInfo = [:]
    NSLog("[VybeNowPlaying] terminateAllNowPlayingMetadata — MPNowPlaying cleared")
  }

  /// Persists the JS theme accent for native listeners / future chrome. System
  /// Dynamic Island music UI is not user-tintable via Now Playing metadata.
  @objc func updateAccentColor(_ hex: String) {
    let trimmed = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    UserDefaults.standard.set(trimmed, forKey: "vybe_accent_hex")
    // Same value for any future native chrome (e.g. widget / extension progress tint).
    UserDefaults.standard.set(trimmed, forKey: "vybe_accent_progress_hex")
    NotificationCenter.default.post(
      name: Notification.Name("VybeAccentColorChanged"),
      object: nil,
      userInfo: ["hex": trimmed]
    )
    NSLog("[VybeNowPlaying] updateAccentColor hex=\"\(trimmed)\"")
  }

  // MARK: – Private

  private func setupRemoteCommandsOnce() {
    if commandsConfigured { return }
    commandsConfigured = true
    let center = MPRemoteCommandCenter.shared()

    center.playCommand.isEnabled = true
    center.playCommand.addTarget { [weak self] _ in
      self?.sendEvent(withName: "VybeRemotePlay", body: nil)
      return .success
    }

    center.pauseCommand.isEnabled = true
    center.pauseCommand.addTarget { [weak self] _ in
      self?.sendEvent(withName: "VybeRemotePause", body: nil)
      return .success
    }

    center.togglePlayPauseCommand.isEnabled = true
    center.togglePlayPauseCommand.addTarget { [weak self] _ in
      self?.sendEvent(withName: "VybeRemoteTogglePlayPause", body: nil)
      return .success
    }

    center.nextTrackCommand.isEnabled = true
    center.nextTrackCommand.addTarget { [weak self] _ in
      self?.sendEvent(withName: "VybeRemoteNextTrack", body: nil)
      return .success
    }

    center.previousTrackCommand.isEnabled = true
    center.previousTrackCommand.addTarget { [weak self] _ in
      self?.sendEvent(withName: "VybeRemotePreviousTrack", body: nil)
      return .success
    }

    NSLog("[VybeNowPlaying] MPRemoteCommandCenter handlers registered")
  }

  private func ensurePlaybackSession() {
    let session = AVAudioSession.sharedInstance()
    do {
      if session.category != .playback {
        try session.setCategory(.playback, mode: .default, options: [])
      }
      try session.setActive(true)
      NSLog("[VybeNowPlaying] AVAudioSession playback active")
    } catch {
      NSLog("[VybeNowPlaying] AVAudioSession activation failed: \(error.localizedDescription)")
    }
  }

  private func loadArtworkAsync(urlString: String) {
    artworkTask?.cancel()
    artworkTask = nil
    currentArtworkURL = urlString

    guard !urlString.isEmpty else {
      NSLog("[VybeNowPlaying] artwork skipped: empty URL")
      return
    }
    guard let url = URL(string: urlString) else {
      NSLog("[VybeNowPlaying] artwork skipped: bad URL format \"\(urlString)\"")
      return
    }
    guard url.scheme == "http" || url.scheme == "https" else {
      NSLog("[VybeNowPlaying] artwork skipped: non-http scheme \"\(url.scheme ?? "<nil>")\" in \"\(urlString)\"")
      return
    }

    let task = URLSession.shared.dataTask(with: url) { [weak self] data, _, error in
      guard let self = self else { return }
      if let error = error {
        NSLog("[VybeNowPlaying] artwork fetch failed: \(error.localizedDescription)")
        return
      }
      guard let data = data, let image = UIImage(data: data) else {
        NSLog("[VybeNowPlaying] artwork decode failed (\(data?.count ?? 0) bytes)")
        return
      }
      // Race guard: if the user skipped to a newer track while we were
      // downloading, drop this image so we don't stomp the current track's art.
      guard self.currentArtworkURL == urlString else { return }
      let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
      DispatchQueue.main.async {
        guard self.isActive, self.currentArtworkURL == urlString else { return }
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        info[MPMediaItemPropertyArtwork] = artwork
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
      }
    }
    artworkTask = task
    task.resume()
  }
}
