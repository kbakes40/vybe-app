import Foundation
import ActivityKit
import React

/// Download progress Live Activity — renders in the Dynamic Island + Lock
/// Screen via the `VybeDownloadWidget` extension target.
///
/// JS bridge (`VybeDownloadActivityModule.m`):
///   startActivity(title, artist, artworkURL)
///   updateProgress(progress, statusText, recentPosts)
///   endActivity(success)
///
/// On iOS 16.1+ this uses real ActivityKit. On older iOS or when Live
/// Activities are disabled in Settings, the module silently no-ops —
/// users fall back to the blue-icon drift animation as confirmation.
@objc(VybeDownloadActivity)
class VybeDownloadActivityModule: NSObject {

  // Cached reference to the currently-running activity so update/end
  // can find it. Only one download activity alive at a time — if a
  // second download starts before the first finishes, the first ends
  // immediately.
  private static var _currentActivity: Any?

  // Cached last-known title/artist so progress updates preserve them and
  // Download All batches can swap title without restarting the activity.
  // Internal (not private) so VybeDownloader can update them per-track in
  // batch mode without going through the full start/update handshake.
  static var _lastTrackTitle: String = ""
  static var _lastArtistName: String = ""
  static var _lastArtworkURL: String = ""

  /// Default expanded-island feed (≤60 chars each); JS may override via `updateProgress`.
  private static let kDefaultIslandFeed: [String] = [
    "DaVinci · Machined Cyan 2.1 — tighter vault handoffs.",
    "Krak Coffee · Winter roast — Vybe Alerts partner taps.",
    "STAK · Stacked plates pop-up — RSVP this weekend.",
  ].map { String($0.prefix(60)) }

  static var _lastRecentPosts: [String] = kDefaultIslandFeed

  /// Coerce RN `NSArray` of strings → max 3 lines, each capped at 60 UTF-16 chars.
  private static func parsePostsArray(_ raw: NSArray) -> [String] {
    var out: [String] = []
    out.reserveCapacity(3)
    for i in 0..<min(raw.count, 8) {
      guard let s = raw[i] as? String else { continue }
      let t = String(s.prefix(60))
      if !t.isEmpty { out.append(t) }
      if out.count >= 3 { break }
    }
    return out
  }

  // Monotonic token bumped by every startActivity/endActivity call. The
  // delayed end task re-checks this before actually tearing down — if the
  // token changed, a new download took over the pill and we MUST NOT end.
  private static var _endToken: UInt64 = 0

  // MARK: – Public API (called from JS via the bridge)

  @objc func startActivity(_ trackTitle: String, artistName: String, artworkURL: String?) {
    guard #available(iOS 16.1, *) else { return }
    let art = artworkURL ?? ""
    // Update cached title/artist SYNCHRONOUSLY (not inside the Task) so the
    // very next updateProgress call that JS fires — which may execute its
    // Task before our startActivity Task reaches the MainActor — already
    // sees the new track's title. This eliminates the race where Swift
    // would overwrite a freshly-written progress value with progress=0.
    Self._lastTrackTitle = trackTitle
    Self._lastArtistName = artistName
    Self._lastArtworkURL = art
    Self._lastRecentPosts = Self.kDefaultIslandFeed
    Self._endToken &+= 1

    Task { @MainActor in
      // Batch case: pill is already live. Do NOT push a state update here —
      // the next updateProgress call will carry the new title/artist along
      // with the real progress value, so there's only one write path and
      // no chance of resetting progress back to 0.
      if #available(iOS 16.2, *),
         Self._currentActivity as? Activity<VybeActivityAttributes> != nil {
        return
      }

      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

      let attributes = VybeActivityAttributes(trackTitle: trackTitle, artistName: artistName, artworkURL: art)
      let initialState = VybeActivityAttributes.DownloadState(
        progress: 0.0,
        statusText: "Starting…",
        isComplete: false,
        trackTitle: trackTitle,
        artistName: artistName,
        artworkURL: art,
        recentPosts: Self._lastRecentPosts
      )
      do {
        let activity = try Activity<VybeActivityAttributes>.request(
          attributes: attributes,
          contentState: initialState,
          pushType: nil
        )
        Self._currentActivity = activity
      } catch {
        NSLog("[VybeDownloadActivity] start failed: \(error.localizedDescription)")
      }
    }
  }

  @objc func updateProgress(_ progress: Double, statusText: String, recentPosts: NSArray?) {
    guard #available(iOS 16.1, *) else { return }
    Task { @MainActor in
      if let arr = recentPosts, arr.count > 0 {
        let parsed = Self.parsePostsArray(arr)
        if !parsed.isEmpty {
          Self._lastRecentPosts = parsed
        }
      }
      guard let activity = Self._currentActivity as? Activity<VybeActivityAttributes> else { return }
      let clamped = max(0.0, min(1.0, progress))
      let state = VybeActivityAttributes.DownloadState(
        progress: clamped,
        statusText: statusText,
        isComplete: clamped >= 0.999,
        trackTitle: Self._lastTrackTitle,
        artistName: Self._lastArtistName,
        artworkURL: Self._lastArtworkURL,
        recentPosts: Self._lastRecentPosts
      )
      await activity.update(using: state)
    }
  }

  /// PILL_LOCK_V2 — end all `VybeActivityAttributes` Live Activities (sign-out).
  @objc func terminateAllActivities() {
    guard #available(iOS 16.1, *) else { return }
    Self._endToken &+= 1
    Task { @MainActor in
      if #available(iOS 16.2, *) {
        for activity in Activity<VybeActivityAttributes>.activities {
          await activity.end(nil, dismissalPolicy: .immediate)
        }
      } else if let act = Self._currentActivity as? Activity<VybeActivityAttributes> {
        await act.end(nil, dismissalPolicy: .immediate)
      }
      Self._currentActivity = nil
    }
  }

  @objc func endActivity(_ success: Bool) {
    guard #available(iOS 16.1, *) else { return }
    Task { @MainActor in
      guard let activity = Self._currentActivity as? Activity<VybeActivityAttributes> else { return }

      // First: short grace window (400ms). If a new startActivity fires
      // during this window (Download All batch), the token bumps and we
      // bail WITHOUT pushing the "Downloaded" state — the pill flows
      // directly from the previous track's progress into the next track's
      // starting state with no flicker.
      let tokenAtEnd = Self._endToken
      try? await Task.sleep(nanoseconds: 400_000_000)
      if Self._endToken != tokenAtEnd { return }

      // No follow-up download — this was a real end. Push "Downloaded"
      // state, let it linger so the user sees completion, then dismiss.
      let finalState = VybeActivityAttributes.DownloadState(
        progress: success ? 1.0 : 0.0,
        statusText: success ? "Downloaded" : "Failed",
        isComplete: success,
        trackTitle: Self._lastTrackTitle,
        artistName: Self._lastArtistName,
        artworkURL: Self._lastArtworkURL,
        recentPosts: Self._lastRecentPosts
      )
      await activity.update(using: finalState)
      try? await Task.sleep(nanoseconds: 1_600_000_000)
      if Self._endToken != tokenAtEnd { return }
      await activity.end(using: finalState, dismissalPolicy: .immediate)
      if let current = Self._currentActivity as? Activity<VybeActivityAttributes>, current === activity {
        Self._currentActivity = nil
      }
    }
  }

  @objc static func requiresMainQueueSetup() -> Bool { return false }

  // MARK: – Static helpers for Swift-to-Swift calls (VybeDownloader)
  // Same logic as the @objc instance methods but callable from other Swift
  // classes without going through the RN bridge.

  @available(iOS 16.1, *)
  static func swiftStart(trackTitle: String, artistName: String, artworkURL: String = "") {
    _lastTrackTitle = trackTitle
    _lastArtistName = artistName
    _lastArtworkURL = artworkURL
    _lastRecentPosts = kDefaultIslandFeed
    _endToken &+= 1
    Task { @MainActor in
      if #available(iOS 16.2, *), _currentActivity as? Activity<VybeActivityAttributes> != nil {
        return
      }
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
      let attributes = VybeActivityAttributes(trackTitle: trackTitle, artistName: artistName, artworkURL: artworkURL)
      let initialState = VybeActivityAttributes.DownloadState(
        progress: 0.0, statusText: "Starting…", isComplete: false,
        trackTitle: trackTitle, artistName: artistName, artworkURL: artworkURL,
        recentPosts: _lastRecentPosts
      )
      do {
        let activity = try Activity<VybeActivityAttributes>.request(
          attributes: attributes, contentState: initialState, pushType: nil
        )
        _currentActivity = activity
      } catch {
        NSLog("[VybeDownloadActivity] swiftStart failed: \(error.localizedDescription)")
      }
    }
  }

  @available(iOS 16.1, *)
  static func swiftUpdate(progress: Double, statusText: String) {
    Task { @MainActor in
      guard let activity = _currentActivity as? Activity<VybeActivityAttributes> else { return }
      let clamped = max(0.0, min(1.0, progress))
      let state = VybeActivityAttributes.DownloadState(
        progress: clamped, statusText: statusText,
        isComplete: clamped >= 0.999,
        trackTitle: _lastTrackTitle, artistName: _lastArtistName, artworkURL: _lastArtworkURL,
        recentPosts: _lastRecentPosts
      )
      await activity.update(using: state)
    }
  }

  @available(iOS 16.1, *)
  static func swiftEnd(success: Bool) {
    Task { @MainActor in
      guard let activity = _currentActivity as? Activity<VybeActivityAttributes> else { return }
      let tokenAtEnd = _endToken
      try? await Task.sleep(nanoseconds: 400_000_000)
      if _endToken != tokenAtEnd { return }
      let finalState = VybeActivityAttributes.DownloadState(
        progress: success ? 1.0 : 0.0,
        statusText: success ? "Downloaded" : "Failed",
        isComplete: success,
        trackTitle: _lastTrackTitle, artistName: _lastArtistName, artworkURL: _lastArtworkURL,
        recentPosts: _lastRecentPosts
      )
      await activity.update(using: finalState)
      try? await Task.sleep(nanoseconds: 1_600_000_000)
      if _endToken != tokenAtEnd { return }
      await activity.end(using: finalState, dismissalPolicy: .immediate)
      if let current = _currentActivity as? Activity<VybeActivityAttributes>, current === activity {
        _currentActivity = nil
      }
    }
  }
}
