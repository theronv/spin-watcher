import SwiftUI

@main
struct NeedleDropApp: App {

    @State private var pendingToken: String? = nil

    var body: some Scene {
        WindowGroup {
            ContentView(pendingToken: $pendingToken)
                .ignoresSafeArea()
                .onOpenURL { url in
                    // Capture the Bearer token from the OAuth deep-link callback:
                    //   needledrop://?token=<signed-token>
                    guard
                        url.scheme == "needledrop",
                        let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
                        let tokenItem = components.queryItems?.first(where: { $0.name == "token" }),
                        let token = tokenItem.value, !token.isEmpty
                    else { return }

                    pendingToken = token
                }
        }
    }
}
