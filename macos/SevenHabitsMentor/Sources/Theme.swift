import SwiftUI
import AppKit
import SevenHabitsCore

/// Quiet-study palette for the macOS shell.
enum MentorTheme {
  static let paper = Color(red: 0.910, green: 0.925, blue: 0.914) // cooler stone
  static let paperDeep = Color(red: 0.855, green: 0.882, blue: 0.863)
  static let surface = Color(red: 0.976, green: 0.980, blue: 0.976)
  static let surfaceElevated = Color.white
  static let ink = Color(red: 0.055, green: 0.078, blue: 0.071)
  static let inkSoft = Color(red: 0.165, green: 0.210, blue: 0.192)
  static let muted = Color(red: 0.345, green: 0.400, blue: 0.373)
  static let accent = Color(red: 0.047, green: 0.255, blue: 0.204) // #0C4134
  static let accentSoft = Color(red: 0.820, green: 0.906, blue: 0.867)
  static let accentWash = Color(red: 0.047, green: 0.255, blue: 0.204).opacity(0.10)
  static let mentorWash = Color(red: 0.870, green: 0.925, blue: 0.898)
  static let line = Color.black.opacity(0.09)
  static let lineStrong = Color.black.opacity(0.15)
  static let warn = Color(red: 0.561, green: 0.247, blue: 0.204)
  static let warnSoft = Color(red: 0.96, green: 0.91, blue: 0.82)

  static let radius: CGFloat = 6
  static let radiusSm: CGFloat = 4

  static func levelLabel(_ level: EmotionalLevel) -> String {
    switch level {
    case .stranger: return "初识"
    case .acquainted: return "相识"
    case .trusted: return "信任"
    case .deep: return "深交"
    }
  }

  static func hexColor(_ hex: String) -> Color {
    var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
    if s.hasPrefix("#") { s.removeFirst() }
    guard s.count == 6, let value = Int(s, radix: 16) else { return accent }
    let r = Double((value >> 16) & 0xFF) / 255
    let g = Double((value >> 8) & 0xFF) / 255
    let b = Double(value & 0xFF) / 255
    return Color(red: r, green: g, blue: b)
  }
}

struct MentorMark: View {
  var size: CGFloat = 32

  var body: some View {
    Text("7")
      .font(.system(size: size * 0.52, weight: .bold, design: .serif))
      .foregroundStyle(Color.white.opacity(0.97))
      .frame(width: size, height: size)
      .background(MentorTheme.accent)
      .clipShape(RoundedRectangle(cornerRadius: size * 0.18, style: .continuous))
  }
}

/// Single continuous panel — not a floating card stack.
struct MentorPanel<Content: View>: View {
  @ViewBuilder var content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: 0) {
      content()
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .background(MentorTheme.surfaceElevated)
    .overlay(
      RoundedRectangle(cornerRadius: MentorTheme.radius, style: .continuous)
        .strokeBorder(MentorTheme.lineStrong, lineWidth: 1)
    )
    .clipShape(RoundedRectangle(cornerRadius: MentorTheme.radius, style: .continuous))
    .shadow(color: Color.black.opacity(0.05), radius: 18, y: 8)
  }
}

struct MentorSectionHeader: View {
  let title: String
  var subtitle: String? = nil

  var body: some View {
    VStack(alignment: .leading, spacing: 3) {
      Text(title)
        .font(.system(size: 13, weight: .bold, design: .default))
        .tracking(0.8)
        .textCase(.uppercase)
        .foregroundStyle(MentorTheme.accent)
      if let subtitle {
        Text(subtitle)
          .font(.caption)
          .foregroundStyle(MentorTheme.muted)
      }
    }
  }
}

struct MentorHairline: View {
  var body: some View {
    Rectangle()
      .fill(MentorTheme.line)
      .frame(height: 1)
  }
}

struct MentorPrimaryButtonStyle: ButtonStyle {
  @Environment(\.isEnabled) private var isEnabled

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.callout.weight(.semibold))
      .padding(.horizontal, 14)
      .padding(.vertical, 8)
      .background(MentorTheme.accent.opacity(isEnabled ? (configuration.isPressed ? 0.88 : 1) : 0.38))
      .foregroundStyle(Color.white.opacity(0.97))
      .clipShape(RoundedRectangle(cornerRadius: MentorTheme.radiusSm, style: .continuous))
  }
}

struct MentorGhostButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.callout.weight(.medium))
      .padding(.horizontal, 12)
      .padding(.vertical, 7)
      .background(configuration.isPressed ? MentorTheme.accentWash : MentorTheme.accentSoft.opacity(0.35))
      .foregroundStyle(MentorTheme.inkSoft)
      .overlay(
        RoundedRectangle(cornerRadius: MentorTheme.radiusSm, style: .continuous)
          .strokeBorder(MentorTheme.accent.opacity(0.22), lineWidth: 1)
      )
      .clipShape(RoundedRectangle(cornerRadius: MentorTheme.radiusSm, style: .continuous))
  }
}

struct MentorTabButton: View {
  let title: String
  let selected: Bool
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      Text(title)
        .font(.callout.weight(selected ? .semibold : .medium))
        .foregroundStyle(selected ? MentorTheme.accent : MentorTheme.muted)
        .padding(.horizontal, 12)
        .padding(.vertical, 7)
        .background(selected ? MentorTheme.accentWash : Color.clear)
        .overlay(alignment: .bottom) {
          Rectangle()
            .fill(selected ? MentorTheme.accent : Color.clear)
            .frame(height: 2)
        }
    }
    .buttonStyle(.plain)
  }
}
