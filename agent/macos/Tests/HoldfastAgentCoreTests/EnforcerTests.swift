import Foundation
import Testing
@testable import HoldfastAgentCore

@Suite struct EnforcerTests {
    let now = Date(timeIntervalSince1970: 1_800_000_000)
    var later: Double { now.epochMilliseconds + 3_600_000 }
    let steam = RunningApp(bundleID: "com.valvesoftware.steam", pid: 10)
    let terminal = RunningApp(bundleID: "com.apple.Terminal", pid: 11)
    let chrome = RunningApp(bundleID: "com.google.Chrome", pid: 12)
    let finder = RunningApp(bundleID: "com.apple.finder", pid: 13)
    let ids: Set<String> = ["heobnbeibkeonkmhacjdplleondionnd"]

    func decide(_ blocks: [Block], config: AgentConfig = AgentConfig(), lacks: Bool = true, ids: Set<String>? = nil) -> [String] {
        appsToQuit(blocks: blocks, config: config, running: [steam, terminal, chrome, finder], now: now,
                   knownExtensionIDs: ids ?? self.ids) { _ in lacks }
            .map(\.app.bundleID)
    }

    @Test func quitsAppsInActiveBlocksOnly() {
        let active = Block(id: "a", apps: ["COM.valvesoftware.Steam"], runningUntil: later)
        let off = Block(id: "b", apps: ["com.apple.Terminal"])
        #expect(decide([active, off]) == ["com.valvesoftware.steam"])
    }

    @Test func strictAppsAndBrowsersOnlyWhileLocked() {
        let strict = AgentConfig(quitWhileLocked: AgentConfig.strictApps)
        let unlocked = Block(id: "a", runningUntil: later)
        #expect(decide([unlocked], config: strict).isEmpty)
        let locked = Block(id: "a", runningUntil: later, lock: .untilEnd)
        #expect(decide([locked], config: strict) == ["com.apple.Terminal", "com.google.Chrome"])
    }

    @Test func browsersWithTheExtensionStayOpen() {
        let locked = Block(id: "a", runningUntil: later, lock: .untilEnd)
        #expect(decide([locked], lacks: false).isEmpty)
    }

    @Test func browserCheckNeedsAKnownExtensionAndTheSetting() {
        let locked = Block(id: "a", runningUntil: later, lock: .untilEnd)
        #expect(decide([locked], ids: []).isEmpty)
        #expect(decide([locked], config: AgentConfig(closeBrowsersWithoutExtension: false)).isEmpty)
    }

    @Test func neverQuitsProtectedApps() {
        let block = Block(id: "a", apps: ["com.apple.finder"], runningUntil: later, lock: .untilEnd)
        #expect(!decide([block]).contains("com.apple.finder"))
    }

    @Test func configDefaultsFillMissingFields() throws {
        let config = try JSONDecoder().decode(AgentConfig.self, from: Data(#"{"quitWhileLocked":["x"]}"#.utf8))
        #expect(config == AgentConfig(quitWhileLocked: ["x"]))
    }
}

@Suite struct ChromiumProfilesTests {
    let id = "heobnbeibkeonkmhacjdplleondionnd"

    func json(_ text: String) -> JSONValue { try! JSONValue.parse(Data(text.utf8)) }

    @Test func openProfilesFallBackSensibly() {
        #expect(ChromiumProfiles.openProfiles(localState: json(#"{"profile":{"last_active_profiles":["Default","Profile 2"]}}"#))
            == ["Default", "Profile 2"])
        #expect(ChromiumProfiles.openProfiles(localState: json(#"{"profile":{"last_used":"Profile 3"}}"#)) == ["Profile 3"])
        #expect(ChromiumProfiles.openProfiles(localState: nil) == ["Default"])
    }

    @Test func detectsInstalledEnabledAndDisabled() {
        let enabled = json(#"{"extensions":{"settings":{"\#(id)":{"location":4,"path":"/x"}}}}"#)
        let disabledList = json(#"{"extensions":{"settings":{"\#(id)":{"disable_reasons":[1]}}}}"#)
        let disabledMask = json(#"{"extensions":{"settings":{"\#(id)":{"disable_reasons":1}}}}"#)
        let disabledState = json(#"{"extensions":{"settings":{"\#(id)":{"state":0}}}}"#)
        let other = json(#"{"extensions":{"settings":{"someotherextensionid":{}}}}"#)
        #expect(ChromiumProfiles.hasExtension(preferences: [enabled], ids: [id]))
        #expect(!ChromiumProfiles.hasExtension(preferences: [enabled, disabledList], ids: [id]))
        #expect(!ChromiumProfiles.hasExtension(preferences: [disabledMask], ids: [id]))
        #expect(!ChromiumProfiles.hasExtension(preferences: [disabledState], ids: [id]))
        #expect(!ChromiumProfiles.hasExtension(preferences: [other], ids: [id]))
        #expect(!ChromiumProfiles.hasExtension(preferences: [], ids: [id]))
    }

    @Test func findsOpenProfilesMissingTheExtension() throws {
        let dir = tempPaths().home
        let write = { (path: String, text: String) in
            let url = dir.appendingPathComponent(path)
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try Data(text.utf8).write(to: url)
        }
        try write("Local State", #"{"profile":{"last_active_profiles":["Default","Profile 1"]}}"#)
        try write("Default/Secure Preferences", #"{"extensions":{"settings":{"\#(id)":{"location":4}}}}"#)
        try write("Profile 1/Preferences", #"{"extensions":{"settings":{}}}"#)
        try write("Profile 2/Preferences", #"{"extensions":{"settings":{}}}"#) // not open: ignored
        #expect(ChromiumProfiles.profilesMissingExtension(userDataDirectory: dir, ids: [id]) == ["Profile 1"])
    }
}
