import Foundation

public enum MentorAPIError: Error, LocalizedError, Sendable {
  case invalidURL
  case httpStatus(Int, String)
  case decoding(String)
  case transport(String)

  public var errorDescription: String? {
    switch self {
    case .invalidURL:
      return "导师服务地址无效"
    case .httpStatus(let code, let body):
      return "导师服务 HTTP \(code)：\(body)"
    case .decoding(let message):
      return "无法解析导师回复：\(message)"
    case .transport(let message):
      return "无法连接导师服务：\(message)"
    }
  }
}

/// Talks to the Node mentor agent (`npm run agent`, default port 8787).
/// Decision/state machine stays in TypeScript (`src/services/mentor.ts`).
public struct MentorAPIClient: Sendable {
  public var baseURL: URL
  public var session: URLSession

  public init(baseURL: URL = URL(string: "http://127.0.0.1:8787")!, session: URLSession = .shared) {
    self.baseURL = baseURL
    self.session = session
  }

  private var decoder: JSONDecoder {
    let d = JSONDecoder()
    return d
  }

  private var encoder: JSONEncoder {
    let e = JSONEncoder()
    return e
  }

  public func health() async throws -> Bool {
    let url = baseURL.appendingPathComponent("api/health")
    let (data, response) = try await data(for: URLRequest(url: url))
    guard let http = response as? HTTPURLResponse, http.statusCode == 200 else { return false }
    return (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["ok"] as? Bool == true
  }

  public func status(accessToken: String? = nil) async throws -> MentorAgentStatus {
    let url = baseURL.appendingPathComponent("api/mentor/status")
    var request = URLRequest(url: url)
    if let accessToken, !accessToken.isEmpty {
      request.httpMethod = "POST"
      request.setValue("application/json", forHTTPHeaderField: "Content-Type")
      request.httpBody = try encoder.encode(["accessToken": accessToken])
    }
    let (data, response) = try await data(for: request)
    try ensureOK(response, data: data)
    do {
      return try decoder.decode(MentorAgentStatus.self, from: data)
    } catch {
      throw MentorAPIError.decoding(Self.describeDecoding(error))
    }
  }

  public func turn(_ body: MentorTurnRequest) async throws -> MentorTurnResponse {
    let url = baseURL.appendingPathComponent("api/mentor/turn")
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try encoder.encode(body)
    let (data, response) = try await data(for: request)
    try ensureOK(response, data: data)
    do {
      return try decoder.decode(MentorTurnResponse.self, from: data)
    } catch {
      throw MentorAPIError.decoding(Self.describeDecoding(error))
    }
  }

  public func evaluateInterventions(_ body: InterventionEvalRequest) async throws -> InterventionEvalResponse {
    let url = baseURL.appendingPathComponent("api/mentor/interventions")
    var request = URLRequest(url: url)
    request.httpMethod = "POST"
    request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    request.httpBody = try encoder.encode(body)
    let (data, response) = try await data(for: request)
    try ensureOK(response, data: data)
    do {
      return try decoder.decode(InterventionEvalResponse.self, from: data)
    } catch {
      throw MentorAPIError.decoding(Self.describeDecoding(error))
    }
  }

  /// Short, readable DecodingError summary (avoid dumping Swift debug dumps into the UI).
  static func describeDecoding(_ error: Error) -> String {
    guard let decoding = error as? DecodingError else {
      return error.localizedDescription
    }
    switch decoding {
    case .typeMismatch(let type, let context):
      let path = codingPath(context.codingPath)
      return "字段类型不符：\(path.isEmpty ? "?" : path) 期望 \(type)"
    case .valueNotFound(let type, let context):
      let path = codingPath(context.codingPath)
      return "缺少值：\(path.isEmpty ? "?" : path) 期望 \(type)"
    case .keyNotFound(let key, let context):
      let path = codingPath(context.codingPath + [key])
      return "缺少字段：\(path)"
    case .dataCorrupted(let context):
      let path = codingPath(context.codingPath)
      if path.isEmpty {
        return "数据无法解析"
      }
      return "数据无法解析：\(path)"
    @unknown default:
      return "数据无法解析"
    }
  }

  private static func codingPath(_ path: [CodingKey]) -> String {
    var parts: [String] = []
    for key in path {
      if let index = key.intValue {
        if parts.isEmpty {
          parts.append("[\(index)]")
        } else {
          parts[parts.count - 1] += "[\(index)]"
        }
      } else if !key.stringValue.isEmpty {
        parts.append(key.stringValue)
      }
    }
    return parts.joined(separator: ".")
  }

  private func data(for request: URLRequest) async throws -> (Data, URLResponse) {
    do {
      return try await session.data(for: request)
    } catch {
      throw MentorAPIError.transport(error.localizedDescription)
    }
  }

  private func ensureOK(_ response: URLResponse, data: Data) throws {
    guard let http = response as? HTTPURLResponse else { return }
    guard (200..<300).contains(http.statusCode) else {
      let body = String(data: data, encoding: .utf8) ?? ""
      throw MentorAPIError.httpStatus(http.statusCode, body)
    }
  }
}
