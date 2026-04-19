import Foundation
import ActivityKit

/// Shared ActivityKit attributes for the Vybe download Live Activity.
///
/// This file is added to BOTH the main `vibecode` target AND the
/// `VybeDownloadWidget` widget extension so both can reference the same
/// attribute + content state types.
///
/// How the two pieces connect:
/// - Main app calls `Activity<VybeDownloadAttributes>.request(...)` to start
/// - Widget extension subscribes via `ActivityConfiguration(for: VybeDownloadAttributes.self)`
/// - Main app calls `activity.update(...)` to push new progress values
/// - Dynamic Island + Lock Screen auto-rerender via the widget's SwiftUI body
@available(iOS 16.1, *)
public struct VybeDownloadAttributes: ActivityAttributes {
    public typealias ContentState = DownloadState

    /// Mutable state — updated as the download progresses.
    /// Track title + artist live here (not in attributes) so a single pill
    /// can re-label itself as each track in a Download All batch starts.
    public struct DownloadState: Codable, Hashable {
        public var progress: Double
        public var statusText: String
        public var isComplete: Bool
        public var trackTitle: String
        public var artistName: String

        public init(progress: Double, statusText: String, isComplete: Bool = false, trackTitle: String = "", artistName: String = "") {
            self.progress = progress
            self.statusText = statusText
            self.isComplete = isComplete
            self.trackTitle = trackTitle
            self.artistName = artistName
        }
    }

    /// Fallback values used only by widget rendering when state is missing them
    /// (older pills created before title moved to state).
    public var trackTitle: String
    public var artistName: String

    public init(trackTitle: String, artistName: String) {
        self.trackTitle = trackTitle
        self.artistName = artistName
    }
}
