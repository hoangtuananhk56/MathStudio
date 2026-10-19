// MathStudio local web server for Windows (offline version).
//
// Word loads an add-in from an https:// address. The offline version serves the add-in from
// this computer instead of the internet: https://localhost:44317, only reachable from this
// computer (it listens on the loopback address), started at sign-in, no window.
//
// The address needs a certificate Word trusts. --install-cert makes one just for this computer:
// a "MathStudio Local CA" certificate, trusted for this user, signs a certificate for localhost;
// the CA's private key is thrown away right after, so it cannot sign anything else.
//
// MathStudioServer.exe                 serve the "site" folder next to this program
// MathStudioServer.exe --root <dir>    serve another folder
// MathStudioServer.exe --install-cert  make and trust the certificate (Windows asks to confirm)
// MathStudioServer.exe --remove-cert   remove it
// MathStudioServer.exe --make-pfx <file> / --pfx <file>   (testing) a certificate in a file, not trusted
//
// Build: powershell -File tools/server-win/build.ps1
using System;
using System.Collections.Generic;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Net.Sockets;
using System.Security.Authentication;
using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text;
using System.Threading;

[assembly: System.Reflection.AssemblyTitle("MathStudio Server")]
[assembly: System.Reflection.AssemblyVersion("1.0.0.0")]

namespace MathStudio
{
    internal static class Server
    {
        public const int Port = 44317;
        private const string CaName = "CN=MathStudio Local CA, O=MathStudio";
        private const string LeafName = "CN=localhost, O=MathStudio";

        private static string _root;
        private static X509Certificate2 _cert;

        private static readonly Dictionary<string, string> Types = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            { ".html", "text/html; charset=utf-8" }, { ".htm", "text/html; charset=utf-8" },
            { ".js", "text/javascript; charset=utf-8" }, { ".mjs", "text/javascript; charset=utf-8" },
            { ".css", "text/css; charset=utf-8" }, { ".json", "application/json; charset=utf-8" },
            { ".xml", "application/xml; charset=utf-8" }, { ".txt", "text/plain; charset=utf-8" }, { ".md", "text/plain; charset=utf-8" },
            { ".wasm", "application/wasm" }, { ".onnx", "application/octet-stream" }, { ".bin", "application/octet-stream" },
            { ".gz", "application/gzip" }, { ".traineddata", "application/octet-stream" },
            { ".png", "image/png" }, { ".jpg", "image/jpeg" }, { ".jpeg", "image/jpeg" }, { ".gif", "image/gif" },
            { ".svg", "image/svg+xml" }, { ".ico", "image/x-icon" }, { ".webp", "image/webp" },
            { ".woff", "font/woff" }, { ".woff2", "font/woff2" }, { ".otf", "font/otf" }, { ".ttf", "font/ttf" },
        };

        private static int Main(string[] args)
        {
            string root = Path.Combine(AppDomain.CurrentDomain.BaseDirectory, "site");
            for (int i = 0; i < args.Length; i++)
            {
                switch (args[i].ToLowerInvariant())
                {
                    case "--install-cert": return InstallCert() ? 0 : 1;
                    case "--remove-cert": RemoveCert(); return 0;
                    case "--root": if (i + 1 < args.Length) root = args[++i]; break;
                    case "--pfx": if (i + 1 < args.Length) _cert = new X509Certificate2(args[++i], "", X509KeyStorageFlags.UserKeySet); break;
                    case "--make-pfx":
                        if (i + 1 >= args.Length) return 1;
                        X509Certificate2 ca, leaf;
                        MakeCerts(out ca, out leaf);
                        File.WriteAllBytes(args[i + 1], leaf.Export(X509ContentType.Pfx, ""));
                        return 0;
                }
            }
            bool created;
            using (var mutex = new Mutex(true, "MathStudio.Server.SingleInstance", out created))
            {
                if (!created) return 0; // already running
                _root = Path.GetFullPath(root).TrimEnd('\\') + "\\";
                if (_cert == null) _cert = FindLeaf();
                if (_cert == null)
                {
                    if (!InstallCert()) return 1;
                    _cert = FindLeaf();
                }
                var listeners = new List<TcpListener> { new TcpListener(IPAddress.Loopback, Port) };
                if (Socket.OSSupportsIPv6) listeners.Add(new TcpListener(IPAddress.IPv6Loopback, Port));
                var threads = new List<Thread>();
                foreach (var l in listeners)
                {
                    try { l.Start(); }
                    catch (SocketException) { continue; } // that address family is not available
                    var t = new Thread(() => Accept(l)) { IsBackground = true };
                    t.Start();
                    threads.Add(t);
                }
                if (threads.Count == 0) return 1;
                foreach (var t in threads) t.Join();
            }
            return 0;
        }

        /* ------------------------------------------------------------------ certificate */

        private static X509Certificate2 FindLeaf()
        {
            var store = new X509Store(StoreName.My, StoreLocation.CurrentUser);
            store.Open(OpenFlags.ReadOnly);
            try
            {
                foreach (var c in store.Certificates)
                    if (c.Subject == LeafName && c.HasPrivateKey && c.NotAfter > DateTime.Now.AddDays(1) && Trusted(c)) return c;
                return null;
            }
            finally { store.Close(); }
        }

        /** Signed by our CA, and the CA is trusted. */
        private static bool Trusted(X509Certificate2 leaf)
        {
            var store = new X509Store(StoreName.Root, StoreLocation.CurrentUser);
            store.Open(OpenFlags.ReadOnly);
            try
            {
                foreach (var ca in store.Certificates)
                    if (ca.Subject == CaName && leaf.Issuer == CaName && ca.NotAfter > DateTime.Now) return true;
                return false;
            }
            finally { store.Close(); }
        }

        private static bool InstallCert()
        {
            RemoveCert();
            X509Certificate2 ca, leaf;
            MakeCerts(out ca, out leaf);
            // through a PFX so the key is kept in this user's key store (Schannel needs that)
            string pw = Guid.NewGuid().ToString("N");
            var kept = new X509Certificate2(leaf.Export(X509ContentType.Pfx, pw), pw,
                X509KeyStorageFlags.UserKeySet | X509KeyStorageFlags.PersistKeySet) { FriendlyName = "MathStudio (localhost)" };
            var root = new X509Store(StoreName.Root, StoreLocation.CurrentUser);
            root.Open(OpenFlags.ReadWrite);
            try { root.Add(ca); } // Windows asks the user to confirm
            catch (CryptographicException) { return false; } // the user said no
            finally { root.Close(); }
            var my = new X509Store(StoreName.My, StoreLocation.CurrentUser);
            my.Open(OpenFlags.ReadWrite);
            try { my.Add(kept); }
            finally { my.Close(); }
            return true;
        }

        /** A new CA (public part only: its private key is gone once this returns) and a localhost certificate it signed. */
        private static void MakeCerts(out X509Certificate2 caPublic, out X509Certificate2 leaf)
        {
            DateTimeOffset now = DateTimeOffset.UtcNow.AddDays(-1);
            using (var caKey = RSA.Create())
            using (var leafKey = RSA.Create())
            {
                caKey.KeySize = 2048;
                leafKey.KeySize = 2048;
                var caReq = new CertificateRequest(CaName, caKey, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
                caReq.CertificateExtensions.Add(new X509BasicConstraintsExtension(true, true, 0, true));
                caReq.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.KeyCertSign | X509KeyUsageFlags.CrlSign, true));
                caReq.CertificateExtensions.Add(new X509SubjectKeyIdentifierExtension(caReq.PublicKey, false));
                using (var ca = caReq.CreateSelfSigned(now, now.AddYears(20)))
                {
                    var req = new CertificateRequest(LeafName, leafKey, HashAlgorithmName.SHA256, RSASignaturePadding.Pkcs1);
                    var san = new SubjectAlternativeNameBuilder();
                    san.AddDnsName("localhost");
                    san.AddIpAddress(IPAddress.Loopback);
                    san.AddIpAddress(IPAddress.IPv6Loopback);
                    req.CertificateExtensions.Add(san.Build());
                    req.CertificateExtensions.Add(new X509BasicConstraintsExtension(false, false, 0, true));
                    req.CertificateExtensions.Add(new X509KeyUsageExtension(X509KeyUsageFlags.DigitalSignature | X509KeyUsageFlags.KeyEncipherment, true));
                    req.CertificateExtensions.Add(new X509EnhancedKeyUsageExtension(new OidCollection { new Oid("1.3.6.1.5.5.7.3.1") }, false));
                    var serial = new byte[16];
                    using (var rng = RandomNumberGenerator.Create()) rng.GetBytes(serial);
                    serial[0] &= 0x7f;
                    using (var signed = req.Create(ca, now, now.AddYears(10), serial))
                        leaf = signed.CopyWithPrivateKey(leafKey);
                    caPublic = new X509Certificate2(ca.Export(X509ContentType.Cert)) { FriendlyName = "MathStudio Local CA" };
                }
            }
        }

        private static void RemoveCert()
        {
            foreach (var pair in new[] { Tuple.Create(StoreName.My, LeafName), Tuple.Create(StoreName.Root, CaName) })
            {
                var store = new X509Store(pair.Item1, StoreLocation.CurrentUser);
                store.Open(OpenFlags.ReadWrite);
                try
                {
                    foreach (var c in store.Certificates.Find(X509FindType.FindBySubjectDistinguishedName, pair.Item2, false))
                    {
                        try { store.Remove(c); } catch (CryptographicException) { /* the user said no */ }
                    }
                }
                finally { store.Close(); }
            }
        }

        /* ------------------------------------------------------------------ serving */

        private static void Accept(TcpListener listener)
        {
            for (;;)
            {
                TcpClient client;
                try { client = listener.AcceptTcpClient(); }
                catch (SocketException) { continue; }
                ThreadPool.QueueUserWorkItem(_ => Serve(client));
            }
        }

        private static void Serve(TcpClient client)
        {
            try
            {
                using (client)
                using (var ssl = new SslStream(client.GetStream(), false))
                {
                    client.ReceiveTimeout = 30000;
                    client.SendTimeout = 30000;
                    ssl.AuthenticateAsServer(_cert, false, SslProtocols.Tls12, false);
                    var reader = new Reader(ssl);
                    for (;;)
                    {
                        string line = reader.Line();
                        if (line == null) return;
                        if (line.Length == 0) continue;
                        var headers = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
                        for (string h; (h = reader.Line()) != null && h.Length > 0;)
                        {
                            int c = h.IndexOf(':');
                            if (c > 0) headers[h.Substring(0, c).Trim()] = h.Substring(c + 1).Trim();
                        }
                        string[] parts = line.Split(' ');
                        if (parts.Length < 3) return;
                        string connection;
                        bool keep = !(headers.TryGetValue("Connection", out connection) && connection.Equals("close", StringComparison.OrdinalIgnoreCase))
                                    && parts[2] == "HTTP/1.1";
                        // a request body is not expected; skip it if one is sent
                        string length;
                        long skip;
                        if (headers.TryGetValue("Content-Length", out length) && long.TryParse(length, out skip)) reader.Skip(skip);
                        Respond(ssl, parts[0], parts[1], keep);
                        if (!keep) return;
                    }
                }
            }
            catch (IOException) { }
            catch (AuthenticationException) { }
            catch (ObjectDisposedException) { }
            catch (SocketException) { }
        }

        private static void Respond(Stream s, string method, string target, bool keep)
        {
            bool head = method == "HEAD";
            if (method != "GET" && !head)
            {
                Send(s, 405, "Method Not Allowed", "text/plain", Encoding.ASCII.GetBytes("GET only"), keep, false, "Allow: GET, HEAD\r\n");
                return;
            }
            string file = Resolve(target);
            if (file == null)
            {
                Send(s, 404, "Not Found", "text/plain", Encoding.ASCII.GetBytes("Not found"), keep, head, null);
                return;
            }
            string type;
            if (!Types.TryGetValue(Path.GetExtension(file), out type)) type = "application/octet-stream";
            using (var f = new FileStream(file, FileMode.Open, FileAccess.Read, FileShare.Read | FileShare.Delete))
            {
                var header = "HTTP/1.1 200 OK\r\nContent-Type: " + type + "\r\nContent-Length: " + f.Length +
                             "\r\nCache-Control: no-cache\r\nX-Content-Type-Options: nosniff\r\nConnection: " + (keep ? "keep-alive" : "close") + "\r\n\r\n";
                var hb = Encoding.ASCII.GetBytes(header);
                s.Write(hb, 0, hb.Length);
                if (!head) f.CopyTo(s, 65536);
                s.Flush();
            }
        }

        /** The file for a request path, inside the served folder only. */
        private static string Resolve(string target)
        {
            int q = target.IndexOfAny(new[] { '?', '#' });
            if (q >= 0) target = target.Substring(0, q);
            if (!target.StartsWith("/")) return null;
            string rel;
            try { rel = Uri.UnescapeDataString(target).TrimStart('/').Replace('/', '\\'); }
            catch (UriFormatException) { return null; }
            if (rel.IndexOf('\0') >= 0 || rel.Contains(":")) return null;
            string full;
            try { full = Path.GetFullPath(Path.Combine(_root, rel)); }
            catch (Exception) { return null; }
            if (!full.StartsWith(_root, StringComparison.OrdinalIgnoreCase) && full + "\\" != _root) return null;
            if (Directory.Exists(full)) full = Path.Combine(full, "index.html");
            return File.Exists(full) ? full : null;
        }

        private static void Send(Stream s, int code, string reason, string type, byte[] body, bool keep, bool head, string extra)
        {
            var header = "HTTP/1.1 " + code + " " + reason + "\r\nContent-Type: " + type + "\r\nContent-Length: " + body.Length + "\r\n" +
                         (extra ?? "") + "Connection: " + (keep ? "keep-alive" : "close") + "\r\n\r\n";
            var hb = Encoding.ASCII.GetBytes(header);
            s.Write(hb, 0, hb.Length);
            if (!head) s.Write(body, 0, body.Length);
            s.Flush();
        }
    }

    /** Reads request lines from the TLS stream (header lines are ASCII). */
    internal sealed class Reader
    {
        private readonly Stream _s;
        private readonly byte[] _buf = new byte[8192];
        private int _pos, _len;

        public Reader(Stream s) { _s = s; }

        private bool Fill()
        {
            _pos = 0;
            _len = _s.Read(_buf, 0, _buf.Length);
            return _len > 0;
        }

        public string Line()
        {
            var sb = new StringBuilder();
            for (;;)
            {
                if (_pos >= _len && !Fill()) return sb.Length > 0 ? sb.ToString() : null;
                byte b = _buf[_pos++];
                if (b == '\n') return sb.ToString().TrimEnd('\r');
                if (sb.Length > 16384) throw new IOException("header line too long");
                sb.Append((char)b);
            }
        }

        public void Skip(long n)
        {
            while (n > 0)
            {
                if (_pos >= _len && !Fill()) return;
                int take = (int)Math.Min(n, _len - _pos);
                _pos += take;
                n -= take;
            }
        }
    }
}
