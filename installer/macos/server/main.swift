// MathStudio local web server for macOS (offline version, experimental).
//
// Serves the add-in from this Mac on https://localhost:44317 (loopback only), so Word needs
// no internet connection. Started for each signed-in user by the LaunchAgent
// vn.mathstudio.server; the certificate is made by the package's postinstall script.
//
//   MathStudioServer [site-folder] [certificate.p12]
//
// Build (in CI, see build-pkg.sh): swiftc -O main.swift -o MathStudioServer
import Foundation
import Network
import Security

let app = "/Library/Application Support/MathStudio"
let args = CommandLine.arguments
let root = URL(fileURLWithPath: args.count > 1 ? args[1] : "\(app)/site").standardizedFileURL.path
let p12 = args.count > 2 ? args[2] : "\(app)/localhost.p12"

let types: [String: String] = [
    "html": "text/html; charset=utf-8", "htm": "text/html; charset=utf-8",
    "js": "text/javascript; charset=utf-8", "mjs": "text/javascript; charset=utf-8",
    "css": "text/css; charset=utf-8", "json": "application/json; charset=utf-8",
    "xml": "application/xml; charset=utf-8", "txt": "text/plain; charset=utf-8", "md": "text/plain; charset=utf-8",
    "wasm": "application/wasm", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif",
    "svg": "image/svg+xml", "ico": "image/x-icon", "webp": "image/webp",
    "woff": "font/woff", "woff2": "font/woff2", "otf": "font/otf", "ttf": "font/ttf",
]

func identity() -> sec_identity_t? {
    guard let data = FileManager.default.contents(atPath: p12) else { return nil }
    var items: CFArray?
    let options = [kSecImportExportPassphrase as String: "mathstudio"] as CFDictionary
    guard SecPKCS12Import(data as CFData, options, &items) == errSecSuccess,
          let list = items as? [[String: Any]], let first = list.first,
          let id = first[kSecImportItemIdentity as String] else { return nil }
    return sec_identity_create(id as! SecIdentity)
}

/// The file for a request path, inside the site folder only.
func resolve(_ target: String) -> String? {
    var path = target
    if let q = path.firstIndex(where: { $0 == "?" || $0 == "#" }) { path = String(path[..<q]) }
    guard path.hasPrefix("/"), let decoded = path.removingPercentEncoding, !decoded.contains("\0") else { return nil }
    var full = URL(fileURLWithPath: root + decoded).standardizedFileURL.path
    guard full == root || full.hasPrefix(root + "/") else { return nil }
    var dir: ObjCBool = false
    if FileManager.default.fileExists(atPath: full, isDirectory: &dir), dir.boolValue { full += "/index.html" }
    return FileManager.default.fileExists(atPath: full) ? full : nil
}

func response(_ code: Int, _ reason: String, _ type: String, _ length: Int, keep: Bool) -> Data {
    let head = "HTTP/1.1 \(code) \(reason)\r\nContent-Type: \(type)\r\nContent-Length: \(length)\r\n" +
        "Cache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\nConnection: \(keep ? "keep-alive" : "close")\r\n\r\n"
    return head.data(using: .ascii)!
}

final class Client {
    let conn: NWConnection
    var buffer = Data()

    init(_ conn: NWConnection) { self.conn = conn }

    func start() {
        conn.stateUpdateHandler = { [self] state in
            if case .failed = state { conn.cancel() }
        }
        conn.start(queue: .global())
        receive()
    }

    func receive() {
        conn.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [self] data, _, done, error in
            if let data = data { buffer.append(data) }
            if error != nil || (done && buffer.isEmpty) { conn.cancel(); return }
            handle(done: done)
        }
    }

    func handle(done: Bool) {
        let end = Data("\r\n\r\n".utf8)
        guard let r = buffer.range(of: end) else {
            if buffer.count > 65536 || done { conn.cancel() } else { receive() }
            return
        }
        let head = String(decoding: buffer[..<r.lowerBound], as: UTF8.self)
        buffer.removeSubrange(..<r.upperBound)
        let lines = head.components(separatedBy: "\r\n")
        let parts = lines[0].split(separator: " ").map(String.init)
        guard parts.count >= 3 else { conn.cancel(); return }
        let close = lines.dropFirst().contains { $0.lowercased().hasPrefix("connection:") && $0.lowercased().contains("close") }
        let keep = !close && parts[2] == "HTTP/1.1" && !done
        let method = parts[0]
        var out: Data
        if method != "GET" && method != "HEAD" {
            let body = Data("GET only".utf8)
            out = response(405, "Method Not Allowed", "text/plain", body.count, keep: keep) + body
        } else if let file = resolve(parts[1]), let body = try? Data(contentsOf: URL(fileURLWithPath: file), options: .alwaysMapped) {
            let ext = (file as NSString).pathExtension.lowercased()
            out = response(200, "OK", types[ext] ?? "application/octet-stream", body.count, keep: keep)
            if method == "GET" { out.append(body) }
        } else {
            let body = Data("Not found".utf8)
            out = response(404, "Not Found", "text/plain", body.count, keep: keep)
            if method == "GET" { out.append(body) }
        }
        conn.send(content: out, completion: .contentProcessed { [self] _ in
            if keep { buffer.isEmpty ? receive() : handle(done: false) } else { conn.cancel() }
        })
    }
}

guard let id = identity() else {
    FileHandle.standardError.write("MathStudioServer: no certificate at \(p12)\n".data(using: .utf8)!)
    exit(1)
}
let tls = NWProtocolTLS.Options()
sec_protocol_options_set_local_identity(tls.securityProtocolOptions, id)
sec_protocol_options_set_min_tls_protocol_version(tls.securityProtocolOptions, .TLSv12)
let params = NWParameters(tls: tls, tcp: NWProtocolTCP.Options())
params.requiredInterfaceType = .loopback
params.allowLocalEndpointReuse = true
let listener = try NWListener(using: params, on: 44317)
listener.newConnectionHandler = { Client($0).start() }
listener.stateUpdateHandler = { state in
    if case .failed(let e) = state {
        FileHandle.standardError.write("MathStudioServer: \(e)\n".data(using: .utf8)!)
        exit(1) // launchd starts it again
    }
}
listener.start(queue: .main)
dispatchMain()
