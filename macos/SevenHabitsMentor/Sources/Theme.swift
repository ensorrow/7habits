import SwiftUI
import AppKit
import SevenHabitsCore

/// Quiet-study palette shared across the macOS shell (aligned with web L2).
enum MentorTheme {
  static let paper = Color(red: 0.929, green: 0.945, blue: 0.933) // #edf1ee
  static let surface = Color(red: 0.984, green: 0.988, blue: 0.984) // #fbfcfb
  static let surfaceElevated = Color.white
  static let ink = Color(red: 0.071, green: 0.094, blue: 0.086) // #121816
  static let inkSoft = Color(red: 0.173, green: 0.220, blue: 0.200) // #2c3833
  static let muted = Color(red: 0.361, green: 0.416, blue: 0.388) // #5c6a63
  static let accent = Color(red: 0.059, green: 0.290, blue: 0.235) // #0F4A3C
  static let accentSoft = Color(red: 0.847, green: 0.922, blue: 0.890) // #d8ebe3
  static let accentWash = Color(red: 0.059, green: 0.290, blue: 0.235).opacity(0.08)
  static let mentorWash = Color(red: 0.894, green: 0.937, blue: 0.914) // #e4efe9
  static let line = Color.black.opacity(0.10)
  static let lineStrong = Color.black.opacity(0.16)
  static let warn = Color(red: 0.561, green: 0.247, blue: 0.204) // #8f3f34
  static let warnSoft = Color(red: 0.96, green: 0.91, blue: 0.82)

  static let radius: CGFloat = 8
  static let radiusSm: CGFloat = 5

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
      .font(.system(size: size * 0.55, weight: .bold, design: .serif))
      .foregroundStyle(Color.white.opacity(0.96))
      .frame(width: size, height: size)
      .background(MentorTheme.accent)
      .clipShape(RoundedRectangle(cornerRadius: size * 0.22, style: .continuous))
  }
}

struct MentorSectionCard<Content: View>: View {
  let title: String
  @ViewBuilder var content: () -> Content

  var body: some View {
    VStack(alignment: .leading, spacing: 10) {
      Text(title)
        .font(.system(.headline, design: .serif).weight(.semibold))
        .foregroundStyle(MentorTheme.ink)
      content()
    }
    .frame(maxWidth: .infinity, alignment: .leading)
    .padding(14)
    .background(MentorTheme.surfaceElevated)
    .overlay(
      RoundedRectangle(cornerRadius: MentorTheme.radius, style: .continuous)
        .strokeBorder(MentorTheme.line, lineWidth: 1)
    )
    .clipShape(RoundedRectangle(cornerRadius: MentorTheme.radius, style: .continuous))
  }
}

struct MentorPrimaryButtonStyle: ButtonStyle {
  @Environment(\.isEnabled) private var isEnabled

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.body.weight(.semibold))
      .padding(.horizontal, 14)
      .padding(.vertical, 8)
      .background(MentorTheme.accent.opacity(isEnabled ? (configuration.isPressed ? 0.85 : 1) : 0.4))
      .foregroundStyle(Color.white.opacity(0.96))
      .clipShape(RoundedRectangle(cornerRadius: MentorTheme.radiusSm, style: .continuous))
  }
}

struct MentorGhostButtonStyle: ButtonStyle {
  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.body.weight(.medium))
      .padding(.horizontal, 12)
      .padding(.vertical, 7)
      .background(configuration.isPressed ? MentorTheme.accentWash : MentorTheme.surfaceElevated)
      .foregroundStyle(MentorTheme.inkSoft)
      .overlay(
        RoundedRectangle(cornerRadius: MentorTheme.radiusSm, style: .continuous)
          .strokeBorder(MentorTheme.lineStrong, lineWidth: 1)
      )
      .clipShape(RoundedRectangle(cornerRadius: MentorTheme.radiusSm, style: .continuous))
  }
}
