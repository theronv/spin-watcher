import SwiftUI
import WebKit

// ── Server URL ────────────────────────────────────────────────────────────────
private let serverURL = "https://needle-drop.com"

// ─── WebView ──────────────────────────────────────────────────────────────────

struct WebView: UIViewRepresentable {

    let url: URL
    @Binding var pendingToken: String?

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeUIView(context: Context) -> WKWebView {
        let config = WKWebViewConfiguration()
        config.allowsInlineMediaPlayback = true
        config.mediaTypesRequiringUserActionForPlayback = []

        let prefs = WKWebpagePreferences()
        prefs.allowsContentJavaScript = true
        config.defaultWebpagePreferences = prefs

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.047, green: 0.039, blue: 0.027, alpha: 1) // #0c0a07

        webView.load(URLRequest(url: url, cachePolicy: .reloadIgnoringLocalCacheData))
        context.coordinator.webView = webView
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {
        guard let token = pendingToken else { return }
        // Navigate back to the app with the token as a query param.
        // page.tsx reads ?nd_token= on mount, stores it in localStorage, strips the URL.
        let encoded = token.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? ""
        if let url = URL(string: "\(serverURL)/?nd_token=\(encoded)") {
            webView.load(URLRequest(url: url))
        }
        DispatchQueue.main.async { self.pendingToken = nil }
    }

    // ── Coordinator ────────────────────────────────────────────────────────────

    class Coordinator: NSObject, WKNavigationDelegate {

        weak var webView: WKWebView?

        func webView(_ webView: WKWebView,
                     didFailProvisionalNavigation navigation: WKNavigation!,
                     withError error: Error) {
            let html = """
            <html>
            <head>
              <meta name="viewport" content="width=device-width, initial-scale=1">
              <style>
                body {
                  background: #0c0a07;
                  color: #3a2c14;
                  font-family: -apple-system, monospace;
                  display: flex;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  height: 100vh;
                  margin: 0;
                  gap: 12px;
                  font-size: 13px;
                  letter-spacing: 0.1em;
                  text-align: center;
                  padding: 24px;
                }
                p { color: #C9A84C; font-size: 15px; }
              </style>
            </head>
            <body>
              <p>CANNOT CONNECT</p>
              <span>\(serverURL)</span>
              <span style="margin-top:8px">Check your internet connection<br>and try again.</span>
            </body>
            </html>
            """
            webView.loadHTMLString(html, baseURL: nil)
        }
    }
}

// ─── ContentView ──────────────────────────────────────────────────────────────

struct ContentView: View {
    @Binding var pendingToken: String?

    var body: some View {
        WebView(url: URL(string: serverURL)!, pendingToken: $pendingToken)
            .ignoresSafeArea()
            .background(Color(red: 0.047, green: 0.039, blue: 0.027))
    }
}
