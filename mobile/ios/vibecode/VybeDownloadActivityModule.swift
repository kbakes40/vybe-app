import Foundation
import ActivityKit
import React
import UserNotifications

/// Download progress Live Activity — renders in the Dynamic Island + Lock
/// Screen via the `VybeDownloadWidget` extension target.
///
/// JS bridge (unchanged for compatibility with downloadsStore):
///   startActivity(title, artist)
///   updateProgress(progress, statusText)
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
  static var _lastQueuePosition: Int = 1
  static var _lastQueueTotal: Int = 1
  static var _lastDownloadTrackId: String = ""

  // Monotonic token bumped by every startActivity/endActivity call. The
  // delayed end task re-checks this before actually tearing down — if the
  // token changed, a new download took over the pill and we MUST NOT end.
  private static var _endToken: UInt64 = 0

  // MARK: – Public API (called from JS via the bridge)

  @objc func startActivity(_ trackTitle: String, artistName: String) {
    guard #available(iOS 16.1, *) else { return }
    // Update cached title/artist SYNCHRONOUSLY (not inside the Task) so the
    // very next updateProgress call that JS fires — which may execute its
    // Task before our startActivity Task reaches the MainActor — already
    // sees the new track's title. This eliminates the race where Swift
    // would overwrite a freshly-written progress value with progress=0.
    Self._lastTrackTitle = trackTitle
    Self._lastArtistName = artistName
    Self._lastQueuePosition = 1
    Self._lastQueueTotal = 1
    Self._lastDownloadTrackId = ""
    Self._endToken &+= 1

    Task { @MainActor in
      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

      let attributes = VybeDownloadAttributes(trackTitle: trackTitle, artistName: artistName)
      let initialState = VybeDownloadAttributes.DownloadState(
        progress: 0.0,
        statusText: "Starting…",
        isComplete: false,
        trackTitle: trackTitle,
        artistName: artistName,
        queuePosition: 1,
        queueTotal: 1
      )
      do {
        let activity = try Activity<VybeDownloadAttributes>.request(
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

  @objc func updateProgress(_ progress: Double, statusText: String) {
    guard #available(iOS 16.1, *) else { return }
    Task { @MainActor in
      guard let activity = Self._currentActivity as? Activity<VybeDownloadAttributes> else { return }
      let clamped = max(0.0, min(1.0, progress))
      let state = VybeDownloadAttributes.DownloadState(
        progress: clamped,
        statusText: statusText,
        isComplete: clamped >= 0.999,
        trackTitle: Self._lastTrackTitle,
        artistName: Self._lastArtistName,
        queuePosition: Self._lastQueuePosition,
        queueTotal: Self._lastQueueTotal
      )
      await activity.update(using: state)
    }
  }

  @objc func endActivity(_ success: Bool) {
    guard #available(iOS 16.1, *) else { return }
    Self.swiftEnd(success: success, trackId: Self._lastDownloadTrackId, completion: nil)
  }

  @objc static func requiresMainQueueSetup() -> Bool { return false }

  // MARK: – Notifications (lock screen cleanup)

  static func removeDeliveredNotifications(forTrackId trackId: String) {
    guard !trackId.isEmpty else { return }
    UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: [trackId])
  }

  // MARK: – Static helpers for Swift-to-Swift calls (VybeDownloader)

  @available(iOS 16.1, *)
  static func swiftStart(trackTitle: String, artistName: String) {
    swiftStart(
      trackTitle: trackTitle, artistName: artistName,
      trackId: "", queuePosition: 1, queueTotal: 1
    )
  }

  @available(iOS 16.1, *)
  static func swiftStart(
    trackTitle: String,
    artistName: String,
    trackId: String,
    queuePosition: Int,
    queueTotal: Int
  ) {
    _lastTrackTitle = trackTitle
    _lastArtistName = artistName
    _lastDownloadTrackId = trackId
    _lastQueuePosition = max(1, queuePosition)
    _lastQueueTotal = max(1, queueTotal)
    _endToken &+= 1

    Task { @MainActor in
      // Previous activity should already be ended by `swiftEnd` before the
      // serial queue starts the next job. If one is still referenced (e.g.
      // process restart), tear it down so we never stack two pills.
      if let stale = _currentActivity as? Activity<VybeDownloadAttributes> {
        await stale.end(using: stale.contentState, dismissalPolicy: .immediate)
        _currentActivity = nil
      }

      guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }

      let attributes = VybeDownloadAttributes(trackTitle: trackTitle, artistName: artistName)
      let qLine = queueTotal > 1 ? " · \(_lastQueuePosition) of \(_lastQueueTotal)" : ""
      let initialState = VybeDownloadAttributes.DownloadState(
        progress: 0.0,
        statusText: "Starting…\(qLine)",
        isComplete: false,
        trackTitle: trackTitle,
        artistName: artistName,
        queuePosition: _lastQueuePosition,
        queueTotal: _lastQueueTotal
      )
      do {
        let activity = try Activity<VybeDownloadAttributes>.request(
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
      guard let activity = _currentActivity as? Activity<VybeDownloadAttributes> else { return }
      let clamped = max(0.0, min(1.0, progress))
      let state = VybeDownloadAttributes.DownloadState(
        progress: clamped,
        statusText: statusText,
        isComplete: clamped >= 0.999,
        trackTitle: _lastTrackTitle,
        artistName: _lastArtistName,
        queuePosition: _lastQueuePosition,
        queueTotal: _lastQueueTotal
      )
      await activity.update(using: state)
    }
  }

  /// Ends the Live Activity immediately so the Dynamic Island slot frees
  /// before the next serial download starts. `completion` always runs on the main actor.
  @available(iOS 16.1, *)
  static func swiftEnd(success: Bool, trackId: String, completion: (() -> Void)?) {
    Task { @MainActor in
      defer { completion?() }

      guard let activity = _currentActivity as? Activity<VybeDownloadAttributes> else { return }

      let finalState = VybeDownloadAttributes.DownloadState(
        progress: success ? 1.0 : 0.0,
        statusText: success ? "Downloaded" : "Failed",
        isComplete: success,
        trackTitle: _lastTrackTitle,
        artistName: _lastArtistName,
        queuePosition: _lastQueuePosition,
        queueTotal: _lastQueueTotal
      )
      await activity.end(using: finalState, dismissalPolicy: .immediate)
      removeDeliveredNotifications(forTrackId: trackId)
      if let current = _currentActivity as? Activity<VybeDownloadAttributes>, current === activity {
        _currentActivity = nil
      }
    }
  }

  @available(iOS 16.1, *)
  static func swiftEnd(success: Bool) {
    swiftEnd(success: success, trackId: _lastDownloadTrackId, completion: nil)
  }
}
