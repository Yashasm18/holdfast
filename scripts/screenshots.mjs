// Regenerates the README images in docs/images from the real extension, the real
// agent and real command output. Nothing is mocked: the browser shots drive the
// built extension with the agent attached over native messaging, and the
// terminal shots render the captured output of the commands they name.
//
//   npm run build && swift build --package-path agent/macos && node scripts/screenshots.mjs
//
// Pass --app-demo to also record the agent quitting TextEdit (opens TextEdit on
// this Mac; skipped if TextEdit is already running).
import { execFile, execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { chromium } from "playwright-core";

const run = promisify(execFile);
const out = resolve("docs/images");
const agent = resolve("agent/macos/.build/debug/holdfast-agent");
const EXTENSION_ID = "heobnbeibkeonkmhacjdplleondionnd";
await mkdir(out, { recursive: true });

const agentHome = await mkdtemp(join(tmpdir(), "holdfast-shots-agent-"));
const profile = await mkdtemp(join(tmpdir(), "holdfast-shots-profile-"));
await mkdir(join(profile, "NativeMessagingHosts"));
await writeFile(
  join(profile, "NativeMessagingHosts", "app.holdfast.agent.json"),
  JSON.stringify({ name: "app.holdfast.agent", description: "Holdfast agent", path: agent, type: "stdio", allowed_origins: [`chrome-extension://${EXTENSION_ID}/`] }),
);

const extension = resolve("dist/extension");
const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.CHROME_PATH || chromium.executablePath(),
  headless: true,
  deviceScaleFactor: 2,
  env: { ...process.env, HOLDFAST_HOME: agentHome },
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
    // Never touch the real network: every host resolves to nowhere.
    "--host-resolver-rules=MAP * 127.0.0.1",
  ],
});
// The worker can start before we listen for it, so check again if the event never comes.
const worker =
  context.serviceWorkers()[0] ??
  (await context.waitForEvent("serviceworker", { timeout: 10_000 }).catch(() => context.serviceWorkers()[0]));
const base = `chrome-extension://${new URL(worker.url()).host}`;
const page = await context.newPage();
await page.goto(`${base}/options.html`);
const send = (request) => page.evaluate((r) => chrome.runtime.sendMessage(r), request);

const weekdays = [1, 2, 3, 4, 5].map((day) => ({ day, start: 9 * 60, end: 17 * 60 }));
await send({
  type: "save",
  block: {
    id: "deep-work",
    name: "Deep work",
    websites: ["youtube.com", "reddit.com", "x.com", "news.ycombinator.com"],
    exceptions: ["reddit.com/r/swift"],
    apps: ["com.valvesoftware.steam", "com.hnc.Discord"],
    schedule: weekdays,
    runningUntil: null,
    lock: { type: "none" },
  },
});
await send({ type: "start", id: "deep-work", minutes: 50, lock: { type: "randomText", length: 30 } });
await send({
  type: "save",
  block: { id: "games", name: "Games", websites: ["store.steampowered.com"], exceptions: [], apps: ["com.valvesoftware.steam"], schedule: [], runningUntil: null, lock: { type: "none" } },
});

// Options page: the editor, with the locked block and its app list.
await page.setViewportSize({ width: 900, height: 900 });
await page.reload();
await page.waitForSelector(".card");
await page.locator(".card").first().screenshot({ path: join(out, "options.png") });

// Popup, then the random-text challenge you get when you try to stop a locked block.
const popup = await context.newPage();
await popup.setViewportSize({ width: 368, height: 420 });
await popup.goto(`${base}/popup.html`);
await popup.waitForSelector(".card");
await popup.screenshot({ path: join(out, "popup.png"), fullPage: true });
await popup.getByRole("button", { name: "Stop" }).click();
await popup.waitForSelector(".challenge");
await popup.screenshot({ path: join(out, "popup-challenge.png"), fullPage: true });

// What you see when you go to a blocked site.
const tab = await context.newPage();
await tab.setViewportSize({ width: 900, height: 300 });
await tab.goto("https://www.youtube.com/").catch(() => {});
await tab.waitForURL((url) => url.href.startsWith(`${base}/blocked.html`));
await tab.evaluate(() => {
  document.querySelector("#quote").textContent = "The thing you were avoiding is still there. Go do it.";
});
await tab.screenshot({ path: join(out, "blocked.png") });

// The agent's own view of the blocks the extension just synced to it.
const status = (await run(agent, ["status"], { env: { ...process.env, HOLDFAST_HOME: agentHome } })).stdout;
await context.close();

// ---------------------------------------------------------------------------
// Terminal shots: real output, rendered as a terminal window.

const strip = (text) => text.replace(/\x1b\[[0-9;]*m/g, "").replace(/\r/g, "");
async function capture(command, args, filter, options = {}) {
  const result = await run(command, args, { maxBuffer: 1 << 26, ...options }).catch((error) => error);
  const text = strip(`${result.stdout ?? ""}${result.stderr ?? ""}`);
  return text.split("\n").filter(filter);
}

const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
function colorize(line) {
  const html = escape(line);
  if (/^\$ /.test(line)) return `<span class="cmd">${html}</span>`;
  if (/(^ok |✔|✓|passed|Passed| ok$)/.test(line)) return `<span class="ok">${html}</span>`;
  if (/(FAIL|✘|error)/.test(line)) return `<span class="bad">${html}</span>`;
  if (/quitting|locked\]/.test(line)) return `<span class="warn">${html}</span>`;
  return html;
}
async function terminal(file, title, lines) {
  const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || chromium.executablePath() });
  const shot = await browser.newPage({ deviceScaleFactor: 2, viewport: { width: 860, height: 200 } });
  await shot.setContent(`<!doctype html><style>
    body { margin: 0; padding: 18px; background: transparent; font: 13px/1.55 ui-monospace, Menlo, monospace; }
    .win { background: #1e1f24; color: #d6d8de; border-radius: 10px; box-shadow: 0 8px 28px rgba(0,0,0,.28); overflow: hidden; }
    .bar { background: #2b2d33; padding: 9px 12px; display: flex; align-items: center; gap: 7px; color: #9aa0ab; font: 12px -apple-system, system-ui, sans-serif; }
    .dot { width: 12px; height: 12px; border-radius: 50%; } .bar span:last-child { margin-left: 10px; }
    pre { margin: 0; padding: 14px 16px; white-space: pre-wrap; word-break: break-word; }
    .cmd { color: #8ab4ff; } .ok { color: #7fd88f; } .bad { color: #ff8a80; } .warn { color: #ffcc66; }
  </style><div class="win"><div class="bar"><i class="dot" style="background:#ff5f57"></i><i class="dot" style="background:#febc2e"></i><i class="dot" style="background:#28c840"></i><span>${escape(title)}</span></div><pre>${lines.map(colorize).join("\n")}</pre></div>`);
  await shot.locator("body").screenshot({ path: join(out, file), omitBackground: true });
  await browser.close();
}

const vitest = await capture("npx", ["vitest", "run"], (l) => /✓|Test Files|Tests /.test(l));
const swift = await capture("agent/macos/test.sh", [], (l) => /Suite .* passed|Test run with/.test(l));
await terminal("tests.png", "Unit tests: TypeScript core and Swift agent", [
  "$ npm test",
  ...vitest.map((l) => l.trimEnd()),
  "",
  "$ npm run test:agent",
  ...swift.map((l) => l.replace(/ after [0-9.]+ seconds/, "").trim()),
]);

const e2e = await capture("node", ["tests/e2e/extension.e2e.mjs"], (l) => /^(ok|FAIL)/.test(l));
const native = await capture("node", ["tests/e2e/native-messaging.e2e.mjs"], (l) => /^(ok|FAIL)/.test(l));
await terminal("e2e.png", "End-to-end in real Chromium", [
  "$ npm run e2e",
  ...e2e,
  "",
  "$ npm run e2e:agent    # extension ⇄ macOS agent over native messaging",
  ...native,
]);

const agentLines = ["$ holdfast-agent status", ...status.trimEnd().split("\n").map((l) => l.replace(agentHome, "~/Library/Application Support/Holdfast"))];

if (process.argv.includes("--app-demo")) {
  const running = await run("pgrep", ["-x", "TextEdit"]).then(() => true, () => false);
  if (running) {
    console.log("TextEdit is running; skipping the app demo.");
  } else {
    const demoHome = await mkdtemp(join(tmpdir(), "holdfast-shots-demo-"));
    await writeFile(join(demoHome, "agent.json"), JSON.stringify({ closeBrowsersWithoutExtension: false, pollSeconds: 1 }));
    await writeFile(join(demoHome, "blocks.json"), JSON.stringify({ version: 1, blocks: [
      { id: "demo", name: "Writing time", apps: ["com.apple.TextEdit"], schedule: [], runningUntil: Date.now() + 120_000, lock: { type: "none" } },
    ] }));
    const daemon = execFile(agent, ["run"], { env: { ...process.env, HOLDFAST_HOME: demoHome } });
    let log = "";
    daemon.stderr.on("data", (chunk) => (log += chunk));
    await new Promise((ok) => setTimeout(ok, 1000));
    execFileSync("open", ["-g", "-a", "TextEdit"]);
    await new Promise((ok) => setTimeout(ok, 3000));
    daemon.kill();
    agentLines.push("", "$ holdfast-agent run    # a block lists com.apple.TextEdit; then open TextEdit", ...log.trimEnd().split("\n").map((l) => l.replace(demoHome, "~/Library/Application Support/Holdfast")));
  }
}
await terminal("agent.png", "macOS agent", agentLines);

console.log(`Wrote images to ${out}`);
console.log((await readFile(join(agentHome, "blocks.json"), "utf8")).length > 0 ? "Agent received the synced blocks." : "");
