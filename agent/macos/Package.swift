// swift-tools-version:6.0
import PackageDescription

// Xcode finds swift-testing on its own. The standalone Command Line Tools ship it
// too but leave it off the default search paths; test.sh sets HOLDFAST_CLT_TESTING
// when the active developer directory is the Command Line Tools.
let cltDeveloper = "/Library/Developer/CommandLineTools/Library/Developer"
let needsCLTTesting = Context.environment["HOLDFAST_CLT_TESTING"] == "1"
let testSwiftSettings: [SwiftSetting] = needsCLTTesting
    ? [.unsafeFlags(["-F", "\(cltDeveloper)/Frameworks"])] : []
let testLinkerSettings: [LinkerSetting] = needsCLTTesting
    ? [.unsafeFlags(["-F", "\(cltDeveloper)/Frameworks",
                     "-Xlinker", "-rpath", "-Xlinker", "\(cltDeveloper)/Frameworks",
                     "-Xlinker", "-rpath", "-Xlinker", "\(cltDeveloper)/usr/lib"])] : []

let package = Package(
    name: "holdfast-agent",
    platforms: [.macOS(.v13)],
    products: [
        .executable(name: "holdfast-agent", targets: ["holdfast-agent"]),
    ],
    targets: [
        // Everything testable without AppKit: block model, lock semantics, storage, protocols.
        .target(name: "HoldfastAgentCore"),
        .executableTarget(name: "holdfast-agent", dependencies: ["HoldfastAgentCore"]),
        .testTarget(
            name: "HoldfastAgentCoreTests",
            dependencies: ["HoldfastAgentCore"],
            swiftSettings: testSwiftSettings,
            linkerSettings: testLinkerSettings
        ),
    ],
    swiftLanguageModes: [.v5]
)
