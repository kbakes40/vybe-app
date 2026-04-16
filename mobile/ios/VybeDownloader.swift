import Foundation
import React
import UIKit

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

  // Background session reactivation — iOS invokes
  // `application(_:handleEventsForBackgroundURLSession:completionHandler:)`
  // when it wakes us to handle pending download events. AppDelegate sets
  // this, and we fire it once our URLSession finishes replaying events.
  static var backgroundCompletionHandler: (() -> Void)?

  // MARK: RCTEventEmitter

  override func supportedEvents() -> [String]! {
    return ["onDownloadProgress", "onDownloadComplete", "onDownloadError"]
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

    // Start the Live Activity (relabels if one is already alive).
    if #available(iOS 16.1, *) {
      VybeDownloadActivityModule.swiftStart(trackTitle: trackTitle, artistName: artistName)
    }

    let task = session.downloadTask(with: url)
    let taskId = task.taskIdentifier

    stateLock.lock()
    metaByTaskId[taskId] = DownloadMeta(
      trackId: trackId, destPath: destPath,
      trackTitle: trackTitle, artistName: artistName
    )
    metaByTrackId[trackId] = taskId
    promiseByTaskId[taskId] = (resolver, rejecter)
    stateLock.unlock()

    task.resume()
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

    if #available(iOS 16.1, *) {
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
    let promise = promiseByTaskId[taskId]
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

    stateLock.lock()
    metaByTaskId.removeValue(forKey: taskId)
    metaByTrackId.removeValue(forKey: meta.trackId)
    promiseByTaskId.removeValue(forKey: taskId)
    lastProgressSendByTaskId.removeValue(forKey: taskId)
    stateLock.unlock()

    if #available(iOS 16.1, *) {
      VybeDownloadActivityModule.swiftEnd(success: true)
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
    stateLock.lock()
    let meta = metaByTaskId.removeValue(forKey: taskId)
    let promise = promiseByTaskId.removeValue(forKey: taskId)
    lastProgressSendByTaskId.removeValue(forKey: taskId)
    if let meta = meta { metaByTrackId.removeValue(forKey: meta.trackId) }
    stateLock.unlock()

    if #available(iOS 16.1, *) {
      VybeDownloadActivityModule.swiftEnd(success: false)
    }

    if let meta = meta {
      sendEvent(withName: "onDownloadError", body: [
        "trackId": meta.trackId,
        "error": error.localizedDescription,
      ])
    }
    promise?.1("DOWNLOAD_FAILED", error.localizedDescription, error)
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
