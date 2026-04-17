import WidgetKit
import SwiftUI
import ActivityKit

/// This file lives in the VybeDownloadWidget target (widget extension).
/// It renders the download Live Activity in 3 presentations:
///   1. Compact/minimal Dynamic Island (icon + tiny progress indicator)
///   2. Expanded Dynamic Island (track name + progress bar + percent)
///   3. Lock Screen banner (same layout as expanded, larger)
///
/// Data flows from the main app via ActivityKit:
///   Activity<VybeDownloadAttributes>.request(...)  → this widget renders
///   activity.update(using:)                        → body re-renders

@main
struct VybeDownloadWidgetBundle: WidgetBundle {
    var body: some Widget {
        if #available(iOS 16.1, *) {
            VybeDownloadWidget()
        }
    }
}

@available(iOS 16.1, *)
struct VybeDownloadWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: VybeDownloadAttributes.self) { context in
            // MARK: Lock Screen / Banner
            LockScreenView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.85))
                .activitySystemActionForegroundColor(Color.white)
        } dynamicIsland: { context in
            DynamicIsland {
                // MARK: Expanded (user long-presses or pill expands)
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: context.state.isComplete ? "checkmark.circle.fill" : "arrow.down.circle.fill")
                        .font(.title2)
                        .foregroundColor(Self.vybePurple)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(Int(context.state.progress * 100))%")
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .foregroundColor(.white)
                        .monospacedDigit()
                        .lineLimit(1)
                        .fixedSize(horizontal: true, vertical: false)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(context.state.trackTitle.isEmpty ? context.attributes.trackTitle : context.state.trackTitle)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(.white)
                            .lineLimit(1)
                            .truncationMode(.tail)
                        Text(context.state.artistName.isEmpty ? context.attributes.artistName : context.state.artistName)
                            .font(.system(size: 12))
                            .foregroundColor(.white.opacity(0.6))
                            .lineLimit(1)
                            .truncationMode(.tail)
                        if context.state.queueTotal > 1 {
                            Text("Downloading \(context.state.queuePosition) of \(context.state.queueTotal)")
                                .font(.system(size: 11, weight: .medium, design: .rounded))
                                .foregroundColor(.white.opacity(0.45))
                                .lineLimit(1)
                        }
                        ProgressView(value: context.state.progress)
                            .progressViewStyle(.linear)
                            .tint(Self.vybePurple)
                    }
                    .padding(.horizontal, 4)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                // MARK: Compact (normal Dynamic Island pill when collapsed)
                Image(systemName: context.state.isComplete ? "checkmark" : "arrow.down")
                    .foregroundColor(Self.vybePurple)
                    .font(.system(size: 12, weight: .bold))
            } compactTrailing: {
                Text("\(Int(context.state.progress * 100))%")
                    .font(.system(size: 12, weight: .semibold, design: .rounded))
                    .foregroundColor(.white)
                    .monospacedDigit()
            } minimal: {
                // MARK: Minimal (when another activity is also live)
                Image(systemName: context.state.isComplete ? "checkmark" : "arrow.down")
                    .foregroundColor(Self.vybePurple)
            }
            .keylineTint(Self.vybePurple)
        }
    }

    static var vybePurple: Color { Color(red: 0.545, green: 0.361, blue: 0.965) } // #8B5CF6
}

// MARK: Lock Screen rendering

@available(iOS 16.1, *)
struct LockScreenView: View {
    let context: ActivityViewContext<VybeDownloadAttributes>

    private var vybePurple: Color { Color(red: 0.545, green: 0.361, blue: 0.965) }

    var body: some View {
        HStack(spacing: 12) {
            ZStack {
                Circle()
                    .fill(vybePurple.opacity(0.2))
                    .frame(width: 44, height: 44)
                Image(systemName: context.state.isComplete ? "checkmark.circle.fill" : "arrow.down.circle.fill")
                    .font(.title2)
                    .foregroundColor(vybePurple)
            }

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(context.state.trackTitle.isEmpty ? context.attributes.trackTitle : context.state.trackTitle)
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    Spacer()
                    Text("\(Int(context.state.progress * 100))%")
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .foregroundColor(.white.opacity(0.85))
                        .monospacedDigit()
                }
                Text(context.state.artistName.isEmpty ? context.attributes.artistName : context.state.artistName)
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.55))
                    .lineLimit(1)
                if context.state.queueTotal > 1 {
                    Text("Downloading \(context.state.queuePosition) of \(context.state.queueTotal)")
                        .font(.caption2)
                        .foregroundColor(.white.opacity(0.45))
                }
                ProgressView(value: context.state.progress)
                    .progressViewStyle(.linear)
                    .tint(vybePurple)
                Text(context.state.statusText)
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.4))
            }
        }
        .padding(16)
    }
}
