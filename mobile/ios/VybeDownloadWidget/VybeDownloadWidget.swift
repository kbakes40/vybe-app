import WidgetKit
import SwiftUI
import ActivityKit

/// Machined cyan (matches in-app headline pulse).
private enum MachinedPalette {
    static let cyan = Color(red: 0.40, green: 0.91, blue: 0.98) // #67E8F9
    static let oledBlack = Color.black
}

// MARK: - Dynamic Island artwork (compact leading)

@available(iOS 16.1, *)
private struct CompactAlbumArt: View {
    let urlString: String
    let isComplete: Bool
    var side: CGFloat = 26

    var body: some View {
        Group {
            if let u = URL(string: urlString), !urlString.isEmpty, u.scheme == "https" || u.scheme == "http" {
                AsyncImage(url: u) { phase in
                    switch phase {
                    case .success(let image):
                        image
                            .resizable()
                            .scaledToFill()
                    default:
                        placeholder
                    }
                }
            } else {
                placeholder
            }
        }
        .frame(width: side, height: side)
        .clipShape(RoundedRectangle(cornerRadius: side * 0.22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: side * 0.22, style: .continuous)
                .stroke(MachinedPalette.cyan.opacity(0.55), lineWidth: 0.5)
        )
    }

    private var placeholder: some View {
        ZStack {
            MachinedPalette.oledBlack
            Image(systemName: isComplete ? "checkmark.circle.fill" : "arrow.down.circle.fill")
                .font(.system(size: max(12, side * 0.48), weight: .semibold))
                .foregroundStyle(MachinedPalette.cyan)
        }
    }
}

// MARK: - Expanded marquee line (horizontal scroll illusion)

/// Brand / activity lines in the expanded Dynamic Island (max 3, each ≤ 60 chars).
@available(iOS 16.1, *)
private struct IslandFeedCarousel: View {
    let posts: [String]

    private var lines: [String] {
        if posts.isEmpty {
            return [
                "DaVinci · Machined Cyan 2.1 — tighter vault handoffs.",
                "Krak Coffee · Winter roast — Vybe Alerts partner taps.",
                "STAK · Stacked plates pop-up — RSVP this weekend.",
            ].map { String($0.prefix(60)) }
        }
        return Array(posts.prefix(3)).map { String($0.prefix(60)) }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            ForEach(Array(lines.enumerated()), id: \.offset) { _, line in
                lineView(line)
            }
        }
    }

    @ViewBuilder
    private func lineView(_ line: String) -> some View {
        Group {
            if #available(iOSApplicationExtension 17.0, *) {
                Text(line)
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .foregroundColor(.white.opacity(0.9))
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    // ContentTransition has no .push(from:) — that API lives on AnyTransition.
                    // .opacity is the cleanest swap for a Text content-change animation here.
                    .contentTransition(.opacity)
            } else {
                Text(line)
                    .font(.system(size: 10, weight: .semibold, design: .rounded))
                    .foregroundColor(.white.opacity(0.9))
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

@available(iOS 16.1, *)
private struct MachinedMarqueeLine: View {
    let text: String
    let font: Font

    var body: some View {
        GeometryReader { geo in
            let w = geo.size.width
            TimelineView(.animation(minimumInterval: 1.0 / 30.0, paused: false)) { timeline in
                let title = text.isEmpty ? "Vybe" : text
                let t = timeline.date.timeIntervalSinceReferenceDate
                // Smooth loop: ~14pt/s when overflow; still when short
                let speed: CGFloat = 14
                let estimatedChar: CGFloat = 8.2
                let textW = max(w, CGFloat(title.count) * estimatedChar)
                let overflow = max(0, textW - w + 12)
                let period = Double(overflow) / Double(speed) + 2.5
                let phase = period > 0 ? CGFloat(t.truncatingRemainder(dividingBy: period)) / CGFloat(period) : 0
                let x = -phase * overflow

                Text(title)
                    .font(font)
                    .foregroundColor(.white)
                    .lineLimit(1)
                    .fixedSize(horizontal: true, vertical: false)
                    .offset(x: overflow > 1 ? x : 0)
                    .frame(width: w, alignment: .leading)
                    .clipped()
            }
        }
        .frame(height: 22)
    }
}

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
        ActivityConfiguration(for: VybeActivityAttributes.self) { context in
            LockScreenView(context: context)
                .activityBackgroundTint(Color.black.opacity(0.92))
                .activitySystemActionForegroundColor(Color.white)
                .containerBackground(.black, for: .widget)
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    CompactAlbumArt(
                        urlString: resolvedArtworkURL(context),
                        isComplete: context.state.isComplete
                    )
                    .padding(.leading, 2)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    Text("\(Int(context.state.progress * 100))%")
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .foregroundColor(MachinedPalette.cyan)
                        .monospacedDigit()
                        .lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 8) {
                        IslandFeedCarousel(posts: context.state.recentPosts)
                        MachinedMarqueeLine(
                            text: displayTitle(context),
                            font: .system(size: 15, weight: .semibold)
                        )
                        MachinedMarqueeLine(
                            text: displayArtist(context),
                            font: .system(size: 12, weight: .medium)
                        )
                        .opacity(0.72)
                        ProgressView(value: context.state.progress)
                            .progressViewStyle(.linear)
                            .tint(MachinedPalette.cyan)
                    }
                    .padding(.top, 38)
                    .padding(.horizontal, 10)
                    .padding(.bottom, 10)
                    .frame(minHeight: 160, alignment: .top)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .animation(.spring(response: 0.4, dampingFraction: 0.84), value: context.state.recentPosts)
                    .overlay(
                        TimelineView(.animation(minimumInterval: 1.0 / 24.0, paused: false)) { timeline in
                            // Triangle-wave breathe on a 1.3s cycle: opacity 0.8 ↔ 1.0.
                            // No sin import needed; keeps the widget's math surface minimal.
                            let t = timeline.date.timeIntervalSinceReferenceDate
                            let cycle: Double = 1.3
                            let phase = t.truncatingRemainder(dividingBy: cycle) / cycle
                            let tri = phase < 0.5 ? phase * 2 : (1 - phase) * 2
                            let breathe = 0.8 + 0.2 * tri
                            RoundedRectangle(cornerRadius: 14, style: .continuous)
                                .stroke(MachinedPalette.cyan, lineWidth: 1)
                                .opacity(breathe)
                                .drawingGroup()
                        }
                    )
                }
            } compactLeading: {
                CompactAlbumArt(
                    urlString: resolvedArtworkURL(context),
                    isComplete: context.state.isComplete
                )
                .padding(.top, 2)
            } compactTrailing: {
                VStack {
                    Text("V")
                        .font(.system(size: 15, weight: .black, design: .rounded))
                        .foregroundStyle(MachinedPalette.cyan)
                }
                .frame(height: 24)
                .padding(.top, 2)
            } minimal: {
                Text("V")
                    .font(.system(size: 12, weight: .heavy, design: .rounded))
                    .foregroundStyle(MachinedPalette.cyan)
            }
            .keylineTint(MachinedPalette.cyan)
        }
    }
}

@available(iOS 16.1, *)
private func displayTitle(_ context: ActivityViewContext<VybeActivityAttributes>) -> String {
    let s = context.state.trackTitle.isEmpty ? context.attributes.trackTitle : context.state.trackTitle
    return s.isEmpty ? "Vybe" : s
}

@available(iOS 16.1, *)
private func displayArtist(_ context: ActivityViewContext<VybeActivityAttributes>) -> String {
    context.state.artistName.isEmpty ? context.attributes.artistName : context.state.artistName
}

@available(iOS 16.1, *)
private func resolvedArtworkURL(_ context: ActivityViewContext<VybeActivityAttributes>) -> String {
    let u = context.state.artworkURL.isEmpty ? context.attributes.artworkURL : context.state.artworkURL
    return u
}

// MARK: - Lock Screen

@available(iOS 16.1, *)
struct LockScreenView: View {
    let context: ActivityViewContext<VybeActivityAttributes>

    var body: some View {
        HStack(spacing: 12) {
            CompactAlbumArt(
                urlString: resolvedArtworkURL(context),
                isComplete: context.state.isComplete,
                side: 44
            )

            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(displayTitle(context))
                        .font(.system(size: 15, weight: .semibold))
                        .foregroundColor(.white)
                        .lineLimit(1)
                    Spacer()
                    Text("\(Int(context.state.progress * 100))%")
                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                        .foregroundColor(MachinedPalette.cyan)
                        .monospacedDigit()
                }
                Text(displayArtist(context))
                    .font(.system(size: 12))
                    .foregroundColor(.white.opacity(0.55))
                    .lineLimit(1)
                ProgressView(value: context.state.progress)
                    .progressViewStyle(.linear)
                    .tint(MachinedPalette.cyan)
                Text(context.state.statusText)
                    .font(.caption2)
                    .foregroundColor(.white.opacity(0.4))
            }
        }
        .padding(16)
    }
}
