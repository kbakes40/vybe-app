import Foundation
import ActivityKit

/// Canonical ActivityKit attributes for Vybe download Live Activities.
///
/// This file is compiled into **both** the `vibecode` app target and the
/// `VybeDownloadWidgetExtension` so `Activity.request` and
/// `ActivityConfiguration(for:)` resolve the identical type.
///
/// `VybeDownloadAttributes` is a public typealias to this struct for
/// existing call sites.
@available(iOS 16.1, *)
public struct VybeActivityAttributes: ActivityAttributes {
    public typealias ContentState = DownloadState

    /// Mutable state — progress, labels, and optional artwork for Dynamic Island.
    public struct DownloadState: Codable, Hashable {
        public var progress: Double
        public var statusText: String
        public var isComplete: Bool
        public var trackTitle: String
        public var artistName: String
        /// HTTPS artwork URL for compact Dynamic Island leading art (may be empty).
        public var artworkURL: String
        /// Up to 3 short lines for the expanded island feed (keep each ≤ 60 chars for payload limits).
        public var recentPosts: [String]

        public init(
            progress: Double,
            statusText: String,
            isComplete: Bool = false,
            trackTitle: String = "",
            artistName: String = "",
            artworkURL: String = "",
            recentPosts: [String] = []
        ) {
            self.progress = progress
            self.statusText = statusText
            self.isComplete = isComplete
            self.trackTitle = trackTitle
            self.artistName = artistName
            self.artworkURL = artworkURL
            self.recentPosts = recentPosts
        }
    }

    /// Static metadata from when the activity was requested.
    public var trackTitle: String
    public var artistName: String
    public var artworkURL: String

    public init(trackTitle: String, artistName: String, artworkURL: String = "") {
        self.trackTitle = trackTitle
        self.artistName = artistName
        self.artworkURL = artworkURL
    }
}
