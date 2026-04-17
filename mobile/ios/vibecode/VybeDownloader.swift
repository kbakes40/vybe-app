import Foundation
import React
import UIKit

// Instant-start AV tuning for expo-av (AVQueuePlayer / AVURLAsset) is applied in
// VybeAVPlayerTuning.m so playback begins with minimal buffering.

/// Native background downloader using URLSession.background. Unlike JS-driven
/// downloads (expo-file-system), the OS keeps these alive when the user
/// backgrounds the app, and delegate callbacks run on Swift — so the
/// Dynamic Island Live Activity stays live with real-time progress.
///
/// JS API (via bridge):
///   VybeDownloader.startDownload({ url, destPath, trackId, trackTitle, artistName })
///     → Promise<{ success: true, filePath, fileSize, fileFormat }>
///   VybeDownloader.cancelDownload(trackId)
///   Events: onDownloadProgress, onDownloadComplete, onDownloadError
@objc(VybeDownloader)
class VybeDownloader: RCTEventEmitter, URLSessionDownloadDelegate {

  // MARK: Session

  private static let sessionIdentifier = "com.vibecode.vybe.downloads"

  private lazy var session: URLSession = {
    let config = URLSessionConfiguration.background(withIdentifier: Self.sessionIdentifier)
    config.sessionSendsLaunchEvents = true
    config.isDiscretionary = false
    config.allowsCellularAccess = true
    config.waitsForConnectivity = true
    return URLSession(configuration: config, delegate: self, delegateQueue: nil)
  }()

  /// Foreground / ephemeral session for short Range fetches only. Keeps
  /// instant-play buffers off the background download pipeline used for
  /// full `startDownload` / Now Playing–critical work.
  private lazy var prefetchSession: URLSession = {
    let config = URLSessionConfiguration.ephemeral
    config.allowsCellularAccess = true
    config.waitsForConnectivity = true
    config.httpMaximumConnectionsPerHost = 5
    config.networkServiceType = .background
    config.timeoutIntervalForRequest = 60
    return URLSession(configuration: config)
  }()

  private let prefetchQueue: OperationQueue = {
    let q = OperationQueue()
    q.name = "com.vybe.prefetch"
    q.maxConcurrentOperationCount = 5
    q.qualityOfService = .utility
    return q
  }()

  // MARK: Per-task bookkeeping

  private struct DownloadMeta {
    let trackId: String
    let destPath: String      // absolute file path (may end .m4a)
    let trackTitle: String
    let artistName: String
  }

  private let stateLock = NSLock()
  private var metaByTaskId: [Int: DownloadMeta] = [:]
  private var metaByTrackId: [String: Int] = [:]  // for cancel
  private var promiseByTaskId: [Int: (RCTPromiseResolveBlock, RCTPromiseRejectBlock)] = [:]
  private var lastProgressSendByTaskId: [Int: Date] = [:]
  private let progressThrottleSec: TimeInterval = 0.2

  /// One background download task at a time — avoids iOS throttling / Live
  /// Activity pile-up when users queue many tracks.
  private struct SerialDownloadJob {
    let url: URL
    let destPath: String
    let trackId: String
    let trackTitle: String
    let artistName: String
    let queuePosition: Int
    let queueTotal: Int
    let resolver: RCTPromiseResolveBlock?
    let rejecter: RCTPromiseRejectBlock?
  }

  private let serialLock = NSLock()
  private var serialPending: [SerialDownloadJob] = []
  private var serialIsActive = false

  private var lastProgressSnapshot: [Int: Double] = [:]
  private var watchdogWorkItems: [Int: DispatchWorkItem] = [:]
  private let watchdogLock = NSLock()

  // Background session reactivation — iOS invokes
  // `application(_:handleEventsForBackgroundURLSession:completionHandler:)`
  // when it wakes us to handle pending download events. AppDelegate sets
  // this, and we fire it once our URLSession finishes replaying events.
  static var backgroundCompletionHandler: (() -> Void)?

  // MARK: RCTEventEmitter

  override func supportedEvents() -> [String]! {
    return [
      "onDownloadProgress", "onDownloadComplete", "onDownloadError",
      "onPrefetchProgress", "onPrefetchReady", "onPrefetchError",
    ]
  }

  @objc override static func requiresMainQueueSetup() -> Bool { return false }

  override init() {
    super.init()
    // Touch the lazy session so iOS re-registers us as the delegate for
    // any in-flight tasks that survived app launch.
    _ = session
  }

  // MARK: JS API

  @objc(startDownload:resolver:rejecter:)
  func startDownload(_ params: NSDictionary,
                     resolver: @escaping RCTPromiseResolveBlock,
                     rejecter: @escaping RCTPromiseRejectBlock) {
    guard let urlString = params["url"] as? String,
          let url = URL(string: urlString),
          let destPathRaw = params["destPath"] as? String,
          let trackId = params["trackId"] as? String else {
      rejecter("BAD_PARAMS", "url, destPath, trackId required", nil)
      return
    }
    let trackTitle = (params["trackTitle"] as? String) ?? "Unknown track"
    let artistName = (params["artistName"] as? String) ?? ""
    let destPath = destPathRaw.replacingOccurrences(of: "file://", with: "")

    enqueueSerialDownload(SerialDownloadJob(
      url: url,
      destPath: destPath,
      trackId: trackId,
      trackTitle: trackTitle,
      artistName: artistName,
      queuePosition: 1,
      queueTotal: 1,
      resolver: resolver,
      rejecter: rejecter
    ))
  }

  // MARK: Batch Download — enqueued; only one URLSession task runs at a time.

  @objc(startBatchDownload:resolver:rejecter:)
  func startBatchDownload(_ items: NSArray,
                          resolver: @escaping RCTPromiseResolveBlock,
                          rejecter: @escaping RCTPromiseRejectBlock) {
    _ = rejecter
    var parsed: [(url: URL, destPath: String, trackId: String, trackTitle: String, artistName: String)] = []
    for case let params as NSDictionary in items {
      guard let urlString = params["url"] as? String,
            let url = URL(string: urlString),
            let destPathRaw = params["destPath"] as? String,
            let trackId = params["trackId"] as? String else { continue }
      let trackTitle = (params["trackTitle"] as? String) ?? "Unknown track"
      let artistName = (params["artistName"] as? String) ?? ""
      let destPath = destPathRaw.replacingOccurrences(of: "file://", with: "")
      parsed.append((url, destPath, trackId, trackTitle, artistName))
    }
    let total = parsed.count
    guard total > 0 else {
      resolver(["started": 0])
      return
    }
    for (idx, row) in parsed.enumerated() {
      enqueueSerialDownload(SerialDownloadJob(
        url: row.url,
        destPath: row.destPath,
        trackId: row.trackId,
        trackTitle: row.trackTitle,
        artistName: row.artistName,
        queuePosition: idx + 1,
        queueTotal: total,
        resolver: nil,
        rejecter: nil
      ))
    }
    resolver(["started": NSNumber(value: total)])
  }

  private func enqueueSerialDownload(_ job: SerialDownloadJob) {
    serialLock.lock()
    serialPending.append(job)
    serialLock.unlock()
    pumpSerialDownloadQueue()
  }

  private func pumpSerialDownloadQueue() {
    serialLock.lock()
    if serialIsActive {
      serialLock.unlock()
      return
    }
    guard let job = serialPending.first else {
      serialLock.unlock()
      return
    }
    serialPending.removeFirst()
    serialIsActive = true
    serialLock.unlock()
    beginUrlSessionDownload(for: job)
  }

  private func serialDownloadFinished() {
    serialLock.lock()
    serialIsActive = false
    serialLock.unlock()
    pumpSerialDownloadQueue()
  }

  private func beginUrlSessionDownload(for job: SerialDownloadJob) {
    if #available(iOS 16.1, *) {
      VybeDownloadActivityModule.swiftStart(
        trackTitle: job.trackTitle,
        artistName: job.artistName,
        trackId: job.trackId,
        queuePosition: job.queuePosition,
        queueTotal: job.queueTotal
      )
    }

    let task = session.downloadTask(with: job.url)
    let taskId = task.taskIdentifier

    stateLock.lock()
    metaByTaskId[taskId] = DownloadMeta(
      trackId: job.trackId, destPath: job.destPath,
      trackTitle: job.trackTitle, artistName: job.artistName
    )
    metaByTrackId[job.trackId] = taskId
    if let res = job.resolver, let rej = job.rejecter {
      promiseByTaskId[taskId] = (res, rej)
    }
    stateLock.unlock()

    lastProgressSnapshot[taskId] = -1.0
    armDownloadWatchdog(taskId: taskId, trackId: job.trackId)

    task.resume()
  }

  // MARK: Stall watchdog (15s without meaningful progress → cancel task)

  private func armDownloadWatchdog(taskId: Int, trackId: String) {
    watchdogLock.lock()
    watchdogWorkItems[taskId]?.cancel()
    let work = DispatchWorkItem { [weak self] in
      self?.handleWatchdogStall(taskId: taskId)
    }
    watchdogWorkItems[taskId] = work
    watchdogLock.unlock()
    DispatchQueue.global(qos: .utility).asyncAfter(deadline: .now() + 15, execute: work)
  }

  private func bumpDownloadWatchdogProgress(taskId: Int, trackId: String, progress: Double) {
    stateLock.lock()
    let prev = lastProgressSnapshot[taskId] ?? -1.0
    if progress > prev + 0.0005 {
      lastProgressSnapshot[taskId] = progress
      stateLock.unlock()
      armDownloadWatchdog(taskId: taskId, trackId: trackId)
    } else {
      stateLock.unlock()
    }
  }

  private func clearDownloadWatchdog(taskId: Int) {
    watchdogLock.lock()
    watchdogWorkItems[taskId]?.cancel()
    watchdogWorkItems.removeValue(forKey: taskId)
    watchdogLock.unlock()
    stateLock.lock()
    lastProgressSnapshot.removeValue(forKey: taskId)
    stateLock.unlock()
  }

  private func handleWatchdogStall(taskId: Int) {
    session.getAllTasks { tasks in
      for t in tasks where t.taskIdentifier == taskId {
        t.cancel()
      }
    }
  }

  @objc(cancelDownload:)
  func cancelDownload(_ trackId: String) {
    stateLock.lock()
    let taskId = metaByTrackId[trackId]
    stateLock.unlock()
    guard let taskId else { return }
    session.getAllTasks { tasks in
      for t in tasks where t.taskIdentifier == taskId {
        t.cancel()
      }
    }
  }

  // MARK: Prefetch (Range GET via proxy/CDN — does not use background session)

  /// Tiny first range for fastest first sample; probe step may widen for stability.
  private static let prefetchMinBytes = 24 * 1024
  private static let prefetchMaxBytes = 2 * 1024 * 1024
  private static let prefetchDefaultRangeEnd = 32 * 1024 - 1

  @objc(prefetchAudioBuffers:resolver:rejecter:)
  func prefetchAudioBuffers(_ items: NSArray,
                            resolver: @escaping RCTPromiseResolveBlock,
                            rejecter: @escaping RCTPromiseRejectBlock) {
    var queued = 0
    for case let dict as NSDictionary in items {
      guard let trackId = dict["trackId"] as? String,
            let streamUrl = dict["streamUrl"] as? String,
            let destPathRaw = dict["destPath"] as? String else { continue }
      let destPath = destPathRaw.replacingOccurrences(of: "file://", with: "")
      queued += 1
      let url = streamUrl
      let tid = trackId
      let path = destPath
      let op = BlockOperation()
      op.addExecutionBlock { [weak self, weak op] in
        guard let self else { return }
        self.runPrefetchOperation(trackId: tid, streamUrl: url, destPath: path) {
          op?.isCancelled ?? true
        }
      }
      prefetchQueue.addOperation(op)
    }
    resolver(["queued": NSNumber(value: queued)])
  }

  @objc(cancelPrefetchQueue)
  func cancelPrefetchQueue() {
    prefetchQueue.cancelAllOperations()
    prefetchSession.getAllTasks { tasks in
      tasks.forEach { $0.cancel() }
    }
  }

  private func runPrefetchOperation(
    trackId: String,
    streamUrl: String,
    destPath: String,
    isCancelled: () -> Bool
  ) {
    guard let url = URL(string: streamUrl) else {
      DispatchQueue.main.async {
        self.sendEvent(withName: "onPrefetchError", body: ["trackId": trackId, "error": "bad_url"])
      }
      return
    }

    let fm = FileManager.default
    if fm.fileExists(atPath: destPath) {
      DispatchQueue.main.async {
        self.sendEvent(withName: "onPrefetchProgress", body: ["trackId": trackId, "progress": 1.0])
        self.sendEvent(withName: "onPrefetchReady", body: ["trackId": trackId])
      }
      return
    }

    let prefetchPath = destPath + ".prefetch"
    if let attrs = try? fm.attributesOfItem(atPath: prefetchPath),
       let sz = attrs[.size] as? NSNumber,
       sz.intValue >= Self.prefetchMinBytes {
      DispatchQueue.main.async {
        self.sendEvent(withName: "onPrefetchProgress", body: ["trackId": trackId, "progress": 1.0])
        self.sendEvent(withName: "onPrefetchReady", body: ["trackId": trackId])
      }
      return
    }

    var rangeEnd = Self.prefetchDefaultRangeEnd
    var probeReq = URLRequest(url: url)
    probeReq.setValue("bytes=0-0", forHTTPHeaderField: "Range")
    probeReq.timeoutInterval = 45
    let semProbe = DispatchSemaphore(value: 0)
    var probeResp: URLResponse?
    let probeTask = prefetchSession.dataTask(with: probeReq) { _, resp, _ in
      probeResp = resp
      semProbe.signal()
    }
    probeTask.priority = URLSessionTask.highPriority
    probeTask.resume()
    _ = semProbe.wait(timeout: .now() + 50)

    if isCancelled() {
      return
    }

    if let http = probeResp as? HTTPURLResponse, http.statusCode == 206 {
      if let cr = http.value(forHTTPHeaderField: "Content-Range"),
         let total = Self.parseContentRangeTotal(cr), total > 0 {
        let twenty = Int(Double(total) * 0.2)
        let capped = min(Self.prefetchMaxBytes, max(Self.prefetchMinBytes, twenty))
        rangeEnd = max(0, capped - 1)
      }
    }

    DispatchQueue.main.async {
      self.sendEvent(withName: "onPrefetchProgress", body: ["trackId": trackId, "progress": 0.08])
    }

    var req = URLRequest(url: url)
    req.setValue("bytes=0-\(rangeEnd)", forHTTPHeaderField: "Range")
    req.timeoutInterval = 90

    let sem = DispatchSemaphore(value: 0)
    var outData: Data?
    var outErr: Error?
    let dataTask = prefetchSession.dataTask(with: req) { data, _, err in
      outData = data
      outErr = err
      sem.signal()
    }
    dataTask.priority = URLSessionTask.highPriority
    dataTask.resume()
    _ = sem.wait(timeout: .now() + 120)

    if isCancelled() {
      return
    }

    guard outErr == nil, let data = outData, data.count >= 32 * 1024 else {
      if let err = outErr {
        DispatchQueue.main.async {
          self.sendEvent(withName: "onPrefetchError", body: [
            "trackId": trackId,
            "error": err.localizedDescription,
          ])
        }
      }
      return
    }

    let parent = URL(fileURLWithPath: destPath).deletingLastPathComponent()
    try? fm.createDirectory(at: parent, withIntermediateDirectories: true)
    try? fm.removeItem(atPath: prefetchPath)
    do {
      try data.write(to: URL(fileURLWithPath: prefetchPath), options: .atomic)
    } catch {
      DispatchQueue.main.async {
        self.sendEvent(withName: "onPrefetchError", body: [
          "trackId": trackId,
          "error": error.localizedDescription,
        ])
      }
      return
    }

    DispatchQueue.main.async {
      self.sendEvent(withName: "onPrefetchProgress", body: ["trackId": trackId, "progress": 1.0])
      self.sendEvent(withName: "onPrefetchReady", body: ["trackId": trackId])
    }
  }

  private static func parseContentRangeTotal(_ header: String) -> Int? {
    guard let slash = header.lastIndex(of: "/") else { return nil }
    let tail = header[header.index(after: slash)...].trimmingCharacters(in: .whitespaces)
    if tail == "*" { return nil }
    return Int(tail)
  }

  // MARK: URLSessionDownloadDelegate — progress

  func urlSession(_ session: URLSession,
                  downloadTask: URLSessionDownloadTask,
                  didWriteData bytesWritten: Int64,
                  totalBytesWritten: Int64,
                  totalBytesExpectedToWrite: Int64) {
    guard totalBytesExpectedToWrite > 0 else { return }
    let progress = Double(totalBytesWritten) / Double(totalBytesExpectedToWrite)
    let taskId = downloadTask.taskIdentifier

    let now = Date()
    stateLock.lock()
    let last = lastProgressSendByTaskId[taskId] ?? .distantPast
    let shouldSend = progress >= 0.999 || now.timeIntervalSince(last) >= progressThrottleSec
    if shouldSend { lastProgressSendByTaskId[taskId] = now }
    let meta = metaByTaskId[taskId]
    stateLock.unlock()
    guard shouldSend, let meta = meta else { return }

    bumpDownloadWatchdogProgress(taskId: taskId, trackId: meta.trackId, progress: progress)

    if #available(iOS 16.1, *) {
      // Relabel the pill with this track's title (handles batch — each
      // concurrent task pushes its own title when it reports progress).
      VybeDownloadActivityModule._lastTrackTitle = meta.trackTitle
      VybeDownloadActivityModule._lastArtistName = meta.artistName
      let pct = Int(progress * 100)
      let status = "\(meta.trackTitle) · \(pct)%"
      VybeDownloadActivityModule.swiftUpdate(progress: progress, statusText: status)
    }

    sendEvent(withName: "onDownloadProgress", body: [
      "trackId": meta.trackId,
      "progress": progress,
    ])
  }

  // MARK: URLSessionDownloadDelegate — completion

  func urlSession(_ session: URLSession,
                  downloadTask: URLSessionDownloadTask,
                  didFinishDownloadingTo location: URL) {
    let taskId = downloadTask.taskIdentifier
    stateLock.lock()
    let meta = metaByTaskId[taskId]
    stateLock.unlock()
    guard let meta = meta else { return }

    // Determine actual extension from Content-Type
    let response = downloadTask.response as? HTTPURLResponse
    let ct = response?.value(forHTTPHeaderField: "Content-Type")?.lowercased() ?? ""
    let isMP3 = ct.contains("mpeg") || ct.contains("mp3")
    var finalPath = meta.destPath
    if isMP3 && finalPath.hasSuffix(".m4a") {
      finalPath = String(finalPath.dropLast(3)) + "mp3"
    }

    let finalURL = URL(fileURLWithPath: finalPath)
    let fm = FileManager.default

    // Ensure parent dir exists
    let parent = finalURL.deletingLastPathComponent()
    try? fm.createDirectory(at: parent, withIntermediateDirectories: true)

    // Move the temp download into place (iOS deletes `location` shortly after this returns).
    try? fm.removeItem(at: finalURL)
    do {
      try fm.moveItem(at: location, to: finalURL)
    } catch {
      finishFailure(taskId: taskId, error: error)
      return
    }

    let attrs = (try? fm.attributesOfItem(atPath: finalURL.path)) ?? [:]
    let fileSize = (attrs[.size] as? NSNumber)?.int64Value ?? 0

    clearDownloadWatchdog(taskId: taskId)

    stateLock.lock()
    metaByTaskId.removeValue(forKey: taskId)
    metaByTrackId.removeValue(forKey: meta.trackId)
    let promise = promiseByTaskId.removeValue(forKey: taskId)
    lastProgressSendByTaskId.removeValue(forKey: taskId)
    stateLock.unlock()

    if #available(iOS 16.1, *) {
      VybeDownloadActivityModule.swiftEnd(success: true, trackId: meta.trackId) { [weak self] in
        self?.serialDownloadFinished()
      }
    } else {
      serialDownloadFinished()
    }

    sendEvent(withName: "onDownloadComplete", body: [
      "trackId": meta.trackId,
      "filePath": "file://" + finalURL.path,
      "fileSize": NSNumber(value: fileSize),
      "fileFormat": isMP3 ? "MP3" : "M4A",
    ])

    promise?.0([
      "success": true,
      "filePath": "file://" + finalURL.path,
      "fileSize": NSNumber(value: fileSize),
      "fileFormat": isMP3 ? "MP3" : "M4A",
    ])
  }

  // MARK: URLSessionTaskDelegate — error path

  func urlSession(_ session: URLSession,
                  task: URLSessionTask,
                  didCompleteWithError error: Error?) {
    guard let error = error else { return }  // success handled above
    finishFailure(taskId: task.taskIdentifier, error: error)
  }

  private func finishFailure(taskId: Int, error: Error) {
    clearDownloadWatchdog(taskId: taskId)
    stateLock.lock()
    let meta = metaByTaskId.removeValue(forKey: taskId)
    let promise = promiseByTaskId.removeValue(forKey: taskId)
    lastProgressSendByTaskId.removeValue(forKey: taskId)
    if let meta = meta { metaByTrackId.removeValue(forKey: meta.trackId) }
    stateLock.unlock()

    if let meta = meta {
      sendEvent(withName: "onDownloadError", body: [
        "trackId": meta.trackId,
        "error": error.localizedDescription,
      ])
      promise?.1("DOWNLOAD_FAILED", error.localizedDescription, error)
      if #available(iOS 16.1, *) {
        VybeDownloadActivityModule.swiftEnd(success: false, trackId: meta.trackId) { [weak self] in
          self?.serialDownloadFinished()
        }
      } else {
        serialDownloadFinished()
      }
    } else {
      promise?.1("DOWNLOAD_FAILED", error.localizedDescription, error)
      serialDownloadFinished()
    }
  }

  // MARK: URLSessionDelegate — background session wake

  func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
    DispatchQueue.main.async {
      if let handler = Self.backgroundCompletionHandler {
        handler()
        Self.backgroundCompletionHandler = nil
      }
    }
  }
}
