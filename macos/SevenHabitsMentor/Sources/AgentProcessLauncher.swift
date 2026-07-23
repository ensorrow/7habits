import Foundation

/// Ensures the mentor HTTP agent (:8787) is running for out-of-box use.
///
/// Priority:
/// 1. Reuse an already-listening agent
/// 2. Extract bundled `MentorAgent.tgz` from the app Resources → Application Support, then spawn
/// 3. Fall back to `npm run agent` from a developer repo checkout (optional)
@MainActor
final class AgentProcessLauncher {
  private static let repoPathKey = "sevenhabits.agentRepoPath"
  private static let autoStartKey = "sevenhabits.agentAutoStart"
  private static let patKey = "sevenhabits.qoderPat"
  private static let runtimeDirName = "SevenHabitsMentor"
  private static let bundleArchiveName = "MentorAgent.tgz"

  private var process: Process?
  private(set) var startedByApp = false
  private(set) var lastError: String?
  private(set) var runtimeSource: String = "none"

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

  var bundledArchiveURL: URL? {
    Bundle.main.url(forResource: "MentorAgent", withExtension: "tgz")
      ?? Bundle.main.resourceURL?.appendingPathComponent(Self.bundleArchiveName)
  }

  var hasBundledRuntime: Bool {
    guard let url = bundledArchiveURL else { return false }
    return FileManager.default.fileExists(atPath: url.path)
  }

  /// Ensure :8787 is up — reuse, spawn bundled runtime, or fall back to repo npm.
  func ensureRunning(healthCheck: () async -> Bool) async -> Bool {
    lastError = nil
    if await healthCheck() {
      if runtimeSource == "none" { runtimeSource = "existing" }
      return true
    }
    guard autoStart else {
      lastError = "导师服务未启动，且已关闭自动拉起。"
      return false
    }

    do {
      if hasBundledRuntime {
        let runURL = try prepareBundledRuntime()
        try startProcess(executable: runURL, arguments: [], currentDirectory: runURL.deletingLastPathComponent())
        runtimeSource = "bundled"
      } else {
        try startRepoNpmProcess()
        runtimeSource = "repo-npm"
      }
    } catch {
      lastError = error.localizedDescription
      return false
    }

    let deadline = Date().addingTimeInterval(25)
    while Date() < deadline {
      if await healthCheck() {
        startedByApp = true
        return true
      }
      if process?.isRunning != true {
        lastError = lastError
          ?? "导师进程已退出。若使用内置运行时，请查看 Console / 缓存日志；开发模式请确认仓库已 npm install。"
        return false
      }
      try? await Task.sleep(nanoseconds: 400_000_000)
    }
    lastError = "导师服务启动超时（25s）。"
    return false
  }

  func stopIfManaged() {
    guard startedByApp, let process, process.isRunning else { return }
    process.terminate()
    self.process = nil
    startedByApp = false
  }

  // MARK: - Bundled runtime (open-box)

  /// Extract MentorAgent.tgz into Application Support when VERSION changes.
  @discardableResult
  func prepareBundledRuntime() throws -> URL {
    guard let archive = bundledArchiveURL,
          FileManager.default.fileExists(atPath: archive.path)
    else {
      throw LaunchError.missingBundle("App 内未找到 MentorAgent.tgz（构建时需运行 npm run package:agent）。")
    }

    let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first
      ?? URL(fileURLWithPath: NSTemporaryDirectory())
    let root = support
      .appendingPathComponent(Self.runtimeDirName, isDirectory: true)
      .appendingPathComponent("runtime", isDirectory: true)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)

    let versionFileInArchive = try peekArchiveVersion(archive: archive)
    let dest = root.appendingPathComponent(versionFileInArchive, isDirectory: true)
    let runURL = dest.appendingPathComponent("run")
    let marker = dest.appendingPathComponent("VERSION")

    if !FileManager.default.fileExists(atPath: runURL.path)
      || (try? String(contentsOf: marker, encoding: .utf8))?
      .trimmingCharacters(in: .whitespacesAndNewlines) != versionFileInArchive
    {
      if FileManager.default.fileExists(atPath: dest.path) {
        try FileManager.default.removeItem(at: dest)
      }
      try FileManager.default.createDirectory(at: dest, withIntermediateDirectories: true)
      try extractTarball(archive: archive, to: dest)
      try FileManager.default.setAttributes(
        [.posixPermissions: 0o755],
        ofItemAtPath: runURL.path
      )
      let nodeBin = dest.appendingPathComponent("bin/node").path
      if FileManager.default.fileExists(atPath: nodeBin) {
        try FileManager.default.setAttributes([.posixPermissions: 0o755], ofItemAtPath: nodeBin)
      }
      // Drop older runtime versions (keep current only).
      if let kids = try? FileManager.default.contentsOfDirectory(
        at: root,
        includingPropertiesForKeys: nil
      ) {
        for child in kids where child.lastPathComponent != versionFileInArchive {
          try? FileManager.default.removeItem(at: child)
        }
      }
    }

    guard FileManager.default.isExecutableFile(atPath: runURL.path)
      || FileManager.default.fileExists(atPath: runURL.path)
    else {
      throw LaunchError.extractFailed("解压后缺少 run 启动脚本。")
    }
    return runURL
  }

  private func peekArchiveVersion(archive: URL) throws -> String {
    // `tar -xzOf archive VERSION` reads one member without full extract.
    let proc = Process()
    proc.executableURL = URL(fileURLWithPath: "/usr/bin/tar")
    proc.arguments = ["-xzOf", archive.path, "VERSION"]
    let pipe = Pipe()
    proc.standardOutput = pipe
    proc.standardError = Pipe()
    try proc.run()
    proc.waitUntilExit()
    let data = pipe.fileHandleForReading.readDataToEndOfFile()
    let text = String(data: data, encoding: .utf8)?
      .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    if proc.terminationStatus != 0 || text.isEmpty {
      return "bundle-default"
    }
    return text
  }

  private func extractTarball(archive: URL, to dest: URL) throws {
    let proc = Process()
    proc.executableURL = URL(fileURLWithPath: "/usr/bin/tar")
    proc.arguments = ["-xzf", archive.path, "-C", dest.path]
    let err = Pipe()
    proc.standardError = err
    try proc.run()
    proc.waitUntilExit()
    if proc.terminationStatus != 0 {
      let msg = String(data: err.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
      throw LaunchError.extractFailed("解压 MentorAgent.tgz 失败：\(msg)")
    }
  }

  // MARK: - Spawn

  private func startProcess(executable: URL, arguments: [String], currentDirectory: URL) throws {
    if let existing = process, existing.isRunning { return }

    let proc = Process()
    proc.executableURL = executable
    proc.arguments = arguments
    proc.currentDirectoryURL = currentDirectory
    var env = ProcessInfo.processInfo.environment
    env["PATH"] = Self.enrichedPATH(from: env["PATH"])
    env["MENTOR_AGENT_PORT"] = "8787"
    let pat = qoderPat.trimmingCharacters(in: .whitespacesAndNewlines)
    if !pat.isEmpty {
      env["QODER_PAT"] = pat
      env["QODER_PERSONAL_ACCESS_TOKEN"] = pat
    }
    proc.environment = env

    let logDir = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first
      ?? URL(fileURLWithPath: NSTemporaryDirectory())
    try FileManager.default.createDirectory(at: logDir, withIntermediateDirectories: true)
    let logFile = logDir.appendingPathComponent("sevenhabits-agent.log")
    FileManager.default.createFile(atPath: logFile.path, contents: nil)
    let handle = try FileHandle(forWritingTo: logFile)
    try handle.seekToEnd()
    proc.standardOutput = handle
    proc.standardError = handle

    proc.terminationHandler = { [weak self] finished in
      guard let self else { return }
      Task { @MainActor in
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

  private func startRepoNpmProcess() throws {
    let root = repoPath.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !root.isEmpty else {
      throw LaunchError.noRepo(
        "没有内置 MentorAgent.tgz，也未配置仓库路径。请重新安装带运行时的 App，或在设置里填入仓库根目录。"
      )
    }
    let rootURL = URL(fileURLWithPath: root, isDirectory: true)
    guard FileManager.default.fileExists(atPath: rootURL.appendingPathComponent("package.json").path)
    else {
      throw LaunchError.noRepo("路径无效或缺少 package.json：\(root)")
    }

    // /bin/zsh -lc so Homebrew/nvm PATH works for developer fallback.
    try startProcess(
      executable: URL(fileURLWithPath: "/bin/zsh"),
      arguments: ["-lc", "npm run agent"],
      currentDirectory: rootURL
    )
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
    let nvmVersions = "\(home)/.nvm/versions/node"
    if let dirs = try? FileManager.default.contentsOfDirectory(atPath: nvmVersions) {
      if let latest = dirs.sorted().last {
        parts.insert("\(nvmVersions)/\(latest)/bin", at: 0)
      }
    }
    return parts.joined(separator: ":")
  }

  enum LaunchError: Error, LocalizedError {
    case noRepo(String)
    case missingBundle(String)
    case extractFailed(String)
    var errorDescription: String? {
      switch self {
      case .noRepo(let message), .missingBundle(let message), .extractFailed(let message):
        return message
      }
    }
  }
}
