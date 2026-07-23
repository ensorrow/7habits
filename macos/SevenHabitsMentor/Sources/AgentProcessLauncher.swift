import Foundation

/// Spawns `npm run agent` for self-use so the menu-bar app does not require a manual terminal.
///
/// Expects the git repo root (with `package.json` name `seven-habits-mentor`).
/// GUI apps often lack Homebrew/nvm on `PATH`, so we launch via `/bin/zsh -lc`.
@MainActor
final class AgentProcessLauncher {
  private static let repoPathKey = "sevenhabits.agentRepoPath"
  private static let autoStartKey = "sevenhabits.agentAutoStart"
  private static let patKey = "sevenhabits.qoderPat"

  private var process: Process?
  private(set) var startedByApp = false
  private(set) var lastError: String?

  var repoPath: String {
    get {
      if let saved = UserDefaults.standard.string(forKey: Self.repoPathKey), !saved.isEmpty {
        return saved
      }
      return Self.discoverRepoRoot()?.path ?? ""
    }
    set {
      UserDefaults.standard.set(newValue, forKey: Self.repoPathKey)
    }
  }

  var autoStart: Bool {
    get {
      if UserDefaults.standard.object(forKey: Self.autoStartKey) == nil { return true }
      return UserDefaults.standard.bool(forKey: Self.autoStartKey)
    }
    set { UserDefaults.standard.set(newValue, forKey: Self.autoStartKey) }
  }

  var qoderPat: String {
    get { UserDefaults.standard.string(forKey: Self.patKey) ?? "" }
    set { UserDefaults.standard.set(newValue, forKey: Self.patKey) }
  }

  var isRunning: Bool {
    process?.isRunning == true
  }

  /// Ensure :8787 is up — reuse an existing agent, or spawn one from the repo.
  func ensureRunning(healthCheck: () async -> Bool) async -> Bool {
    lastError = nil
    if await healthCheck() {
      return true
    }
    guard autoStart else {
      lastError = "导师服务未启动，且已关闭自动拉起。可在设置里开启，或手动 `npm run agent`。"
      return false
    }
    do {
      try startProcess()
    } catch {
      lastError = error.localizedDescription
      return false
    }
    let deadline = Date().addingTimeInterval(20)
    while Date() < deadline {
      if await healthCheck() {
        startedByApp = true
        return true
      }
      if process?.isRunning != true {
        lastError = lastError ?? "导师进程已退出。请确认仓库路径下已 `npm install`，且本机有 Node/npm。"
        return false
      }
      try? await Task.sleep(nanoseconds: 400_000_000)
    }
    lastError = "导师服务启动超时（20s）。请检查设置里的仓库路径与 Node 环境。"
    return false
  }

  func stopIfManaged() {
    guard startedByApp, let process, process.isRunning else { return }
    process.terminate()
    self.process = nil
    startedByApp = false
  }

  private func startProcess() throws {
    if let existing = process, existing.isRunning { return }

    let root = repoPath.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !root.isEmpty else {
      throw LaunchError.noRepo(
        "未找到仓库路径。请在设置里填入 7habits 仓库根目录（含 package.json）。"
      )
    }
    let rootURL = URL(fileURLWithPath: root, isDirectory: true)
    let packageJSON = rootURL.appendingPathComponent("package.json")
    guard FileManager.default.fileExists(atPath: packageJSON.path) else {
      throw LaunchError.noRepo("路径无效或缺少 package.json：\(root)")
    }

    let proc = Process()
    proc.executableURL = URL(fileURLWithPath: "/bin/zsh")
    // Login shell picks up Homebrew / nvm from the user's shell profile.
    proc.arguments = ["-lc", "npm run agent"]
    proc.currentDirectoryURL = rootURL
    var env = ProcessInfo.processInfo.environment
    env["PATH"] = Self.enrichedPATH(from: env["PATH"])
    env["MENTOR_AGENT_PORT"] = "8787"
    let pat = qoderPat.trimmingCharacters(in: .whitespacesAndNewlines)
    if !pat.isEmpty {
      env["QODER_PAT"] = pat
      env["QODER_PERSONAL_ACCESS_TOKEN"] = pat
    }
    proc.environment = env

    // Avoid pipe back-pressure stalling Node when nobody reads stdout.
    let logDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
      ?? URL(fileURLWithPath: NSTemporaryDirectory())
    let logFile = logDir.appendingPathComponent("sevenhabits-agent.log")
    FileManager.default.createFile(atPath: logFile.path, contents: nil)
    let handle = try FileHandle(forWritingTo: logFile)
    try handle.seekToEnd()
    proc.standardOutput = handle
    proc.standardError = handle

    proc.terminationHandler = { [weak self] finished in
      Task { @MainActor in
        guard let self else { return }
        if self.process == finished {
          self.process = nil
          if finished.terminationStatus != 0, self.lastError == nil {
            self.lastError =
              "导师进程退出（code \(finished.terminationStatus)）。日志：\(logFile.path)"
          }
        }
      }
    }

    try proc.run()
    process = proc
    startedByApp = true
  }

  static func discoverRepoRoot() -> URL? {
    if let env = ProcessInfo.processInfo.environment["SEVEN_HABITS_REPO"]?
      .trimmingCharacters(in: .whitespacesAndNewlines),
      !env.isEmpty
    {
      let url = URL(fileURLWithPath: env, isDirectory: true)
      if isMentorRepo(url) { return url }
    }

    var url = Bundle.main.bundleURL
    for _ in 0..<16 {
      url.deleteLastPathComponent()
      if isMentorRepo(url) { return url }
    }

    let home = FileManager.default.homeDirectoryForCurrentUser
    let guesses = [
      home.appendingPathComponent("7habits"),
      home.appendingPathComponent("code/7habits"),
      home.appendingPathComponent("src/7habits"),
      home.appendingPathComponent("Developer/7habits"),
      home.appendingPathComponent("Projects/7habits"),
    ]
    return guesses.first(where: isMentorRepo)
  }

  private static func isMentorRepo(_ url: URL) -> Bool {
    let pkg = url.appendingPathComponent("package.json")
    guard let data = try? Data(contentsOf: pkg),
          let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let name = json["name"] as? String
    else { return false }
    return name == "seven-habits-mentor"
  }

  private static func enrichedPATH(from existing: String?) -> String {
    let home = FileManager.default.homeDirectoryForCurrentUser.path
    var parts: [String] = [
      "/opt/homebrew/bin",
      "/usr/local/bin",
      "\(home)/.local/bin",
      "/usr/bin",
      "/bin",
    ]
    if let existing, !existing.isEmpty {
      parts.append(existing)
    }
    // Latest nvm node bin if present
    let nvmVersions = "\(home)/.nvm/versions/node"
    if let dirs = try? FileManager.default.contentsOfDirectory(atPath: nvmVersions) {
      let latest = dirs.sorted().last
      if let latest {
        parts.insert("\(nvmVersions)/\(latest)/bin", at: 0)
      }
    }
    return parts.joined(separator: ":")
  }

  enum LaunchError: Error, LocalizedError {
    case noRepo(String)
    var errorDescription: String? {
      switch self {
      case .noRepo(let message): return message
      }
    }
  }
}
