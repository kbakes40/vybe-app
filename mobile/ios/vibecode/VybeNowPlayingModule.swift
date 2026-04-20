import Foundation
import MediaPlayer
import AVFoundation
import AVKit
import React

@objc(VybeNowPlaying)
class VybeNowPlayingModule: RCTEventEmitter {

  private var commandHandlers: [Any] = []

  // Native keep-alive timer — fires every 1 s on main run loop,
  // bypasses JS background throttling so Apple TV stays populated.
  private var keepAliveTimer: Timer?
  private var timerStartElapsed: Double = 0
  private var timerStartWallTime: Date?
  private var timerIsPlaying: Bool = false

  override func supportedEvents() -> [String]! {
    return ["onRemotePlay", "onRemotePause", "onRemoteNext", "onRemotePrevious", "onRemoteSeek", "onAirPlayConnected", "onAirPlayDisconnected"]
  }

  override init() {
    super.init()
    setupRemoteCommands()
    NotificationCenter.default.addObserver(
      self,
      selector: #selector(handleRouteChange(_:)),
      name: AVAudioSession.routeChangeNotification,
      object: nil
    )
  }

  deinit {
    NotificationCenter.default.removeObserver(self)
    keepAliveTimer?.invalidate()
    keepAliveTimer = nil
  }

  // MARK: – AirPlay Detection

  @objc private func handleRouteChange(_ notification: Notification) {
    let isAirPlay = AVAudioSession.sharedInstance().currentRoute.outputs.contains {
      $0.portType == .airPlay
    }
    sendEvent(withName: isAirPlay ? "onAirPlayConnected" : "onAirPlayDisconnected", body: nil)
  }

  // MARK: – Remote Command Center

  private func setupRemoteCommands() {
    let cc = MPRemoteCommandCenter.shared()

    cc.playCommand.isEnabled = true
    cc.pauseCommand.isEnabled = true
    cc.nextTrackCommand.isEnabled = true
    cc.previousTrackCommand.isEnabled = true
    cc.changePlaybackPositionCommand.isEnabled = true
    cc.stopCommand.isEnabled = false
    cc.togglePlayPauseCommand.isEnabled = false

    commandHandlers.append(cc.playCommand.addTarget { [weak self] _ in
      self?.sendEvent(withName: "onRemotePlay", body: nil)
      return .success
    })
    commandHandlers.append(cc.pauseCommand.addTarget { [weak self] _ in
      self?.sendEvent(withName: "onRemotePause", body: nil)
      return .success
    })
    commandHandlers.append(cc.nextTrackCommand.addTarget { [weak self] _ in
      self?.sendEvent(withName: "onRemoteNext", body: nil)
      return .success
    })
    commandHandlers.append(cc.previousTrackCommand.addTarget { [weak self] _ in
      self?.sendEvent(withName: "onRemotePrevious", body: nil)
      return .success
    })
    commandHandlers.append(cc.changePlaybackPositionCommand.addTarget { [weak self] event in
      guard let e = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
      self?.sendEvent(withName: "onRemoteSeek", body: ["position": e.positionTime])
      return .success
    })
  }

  // MARK: – Exported Methods

  @objc func updateNowPlaying(
    _ trackTitle: String,
    artistName: String,
    artworkUrl: String,
    duration: Double,
    currentTime: Double,
    isPlaying: Bool
  ) {
    print("--- NATIVE ACTIVITY REQUESTED ---")
    // Merge into existing metadata — do **not** replace the whole dictionary.
    // JS calls `VybeNowPlaying.updateNowPlaying` then `VybeNowPlayingActivity.startNowPlaying`;
    // a full replace here races on `DispatchQueue.main.async` and can strip
    // `MPNowPlayingInfoPropertyMediaType` + artwork the Activity module just set,
    // which prevents Dynamic Island elevation.
    DispatchQueue.main.async {
      var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
      info[MPMediaItemPropertyTitle] = trackTitle
      info[MPMediaItemPropertyArtist] = artistName
      info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentTime
      info[MPMediaItemPropertyPlaybackDuration] = duration
      info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
      info[MPNowPlayingInfoPropertyDefaultPlaybackRate] = 1.0
      info[MPNowPlayingInfoPropertyMediaType] = NSNumber(value: MPMediaType.music.rawValue)
      MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }

    // Load artwork — use Data(contentsOf:) for local file:// paths, URLSession for remote
    guard !artworkUrl.isEmpty, let url = URL(string: artworkUrl) else { return }

    func applyArtwork(_ image: UIImage) {
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
          applyArtwork(image)
        }
      }
    } else {
      URLSession.shared.dataTask(with: url) { data, response, error in
        if let error = error {
          print("[VybeNowPlaying] Artwork download error: \(error.localizedDescription) for \(url)")
          return
        }
        if let httpResp = response as? HTTPURLResponse, httpResp.statusCode != 200 {
          print("[VybeNowPlaying] Artwork HTTP \(httpResp.statusCode) for \(url)")
          return
        }
        guard let data = data, let image = UIImage(data: data) else {
          print("[VybeNowPlaying] Artwork invalid image data for \(url)")
          return
        }
        print("[VybeNowPlaying] ✅ Artwork applied (\(Int(image.size.width))x\(Int(image.size.height))) for \(url)")
        applyArtwork(image)
      }.resume()
    }
  }

  @objc func updateProgress(_ currentTime: Double, isPlaying: Bool) {
    DispatchQueue.main.async {
      var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
      info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentTime
      info[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? 1.0 : 0.0
      MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
  }

  // Set artwork from a base64-encoded JPEG/PNG string — no URLSession, no network dependency
  @objc func setArtworkBase64(_ base64String: String) {
    guard let data = Data(base64Encoded: base64String),
          let image = UIImage(data: data) else { return }
    let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
    DispatchQueue.main.async {
      var updated = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
      updated[MPMediaItemPropertyArtwork] = artwork
      MPNowPlayingInfoCenter.default().nowPlayingInfo = updated
    }
  }

  // Set artwork from a URL — file:// uses Data(contentsOf:), https:// uses URLSession
  @objc func setArtwork(_ artworkUrl: String) {
    guard !artworkUrl.isEmpty, let url = URL(string: artworkUrl) else { return }
    let apply = { (data: Data) in
      guard let image = UIImage(data: data) else { return }
      let artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
      DispatchQueue.main.async {
        var updated = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        updated[MPMediaItemPropertyArtwork] = artwork
        MPNowPlayingInfoCenter.default().nowPlayingInfo = updated
      }
    }
    if url.isFileURL {
      DispatchQueue.global(qos: .userInitiated).async {
        if let data = try? Data(contentsOf: url) { apply(data) }
      }
    } else {
      URLSession.shared.dataTask(with: url) { data, _, _ in
        if let data = data { apply(data) }
      }.resume()
    }
  }

  // MARK: – Keep-Alive Timer
  // Runs natively on the main run loop every 1 s, independent of JS execution.
  // This keeps MPNowPlayingInfoCenter alive on Apple TV even when the JS thread is suspended.

  @objc func startKeepAlive(_ elapsed: Double, isPlaying: Bool) {
    timerStartElapsed = elapsed
    timerStartWallTime = Date()
    timerIsPlaying = isPlaying

    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.keepAliveTimer?.invalidate()
      let timer = Timer(timeInterval: 1.0, repeats: true) { [weak self] _ in
        guard let self = self else { return }
        var info = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [:]
        if self.timerIsPlaying, let wallStart = self.timerStartWallTime {
          let wallElapsed = Date().timeIntervalSince(wallStart)
          info[MPNowPlayingInfoPropertyElapsedPlaybackTime] = self.timerStartElapsed + wallElapsed
        }
        info[MPNowPlayingInfoPropertyPlaybackRate] = self.timerIsPlaying ? 1.0 : 0.0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
      }
      // .common mode fires even during scroll / interactive gestures
      RunLoop.main.add(timer, forMode: .common)
      self.keepAliveTimer = timer
    }
  }

  @objc func stopKeepAlive() {
    DispatchQueue.main.async { [weak self] in
      self?.keepAliveTimer?.invalidate()
      self?.keepAliveTimer = nil
    }
  }

  @objc func clearNowPlaying() {
    keepAliveTimer?.invalidate()
    keepAliveTimer = nil
    DispatchQueue.main.async {
      MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }
  }

  // MARK: – Route Picker
  // Present the system AirPlay / Bluetooth audio route picker so users
  // can switch output without going to Control Center.

  @objc func showRoutePicker() {
    DispatchQueue.main.async {
      // AVRoutePickerView is the only public API to trigger the route
      // picker programmatically. We create a hidden one, add it to the
      // window, simulate a tap on its internal button, then remove it.
      let picker = AVRoutePickerView(frame: .zero)
      picker.isHidden = true

      guard let window = UIApplication.shared.connectedScenes
        .compactMap({ $0 as? UIWindowScene })
        .flatMap({ $0.windows })
        .first(where: { $0.isKeyWindow }) else { return }

      window.addSubview(picker)

      // The AVRoutePickerView contains a UIButton — find and tap it.
      for subview in picker.subviews {
        if let button = subview as? UIButton {
          button.sendActions(for: .touchUpInside)
          break
        }
      }

      // Remove after a short delay so the picker has time to present.
      DispatchQueue.main.asyncAfter(deadline: .now() + 1.0) {
        picker.removeFromSuperview()
      }
    }
  }

  override static func requiresMainQueueSetup() -> Bool {
    return false
  }
}
