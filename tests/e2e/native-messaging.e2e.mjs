// End-to-end check of extension ⇄ macOS agent sync over native messaging.
// Registers the locally built agent as a native messaging host inside a
// throwaway browser profile, so nothing is installed on this machine.
// Run with `npm run e2e:agent` (builds the extension and the agent first).
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { access, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const EXTENSION_ID = "heobnbeibkeonkmhacjdplleondionnd"; // pinned by the key in static/manifest.json
const agent = resolve("agent/macos/.build/debug/holdfast-agent");
await access(agent).catch(() => {
  throw new Error(`${agent} is missing: run \`swift build\` in agent/macos first`);
});

const server = createServer((req, res) => res.end(`<title>site</title>${req.headers.host}${req.url}`));
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const port = server.address().port;
const site = (host, path = "/") => `http://${host}:${port}${path}`;

// The agent's data directory (HOLDFAST_HOME) and the browser profile are both temporary.
const agentHome = await mkdtemp(join(tmpdir(), "holdfast-agent-e2e-"));
const profile = await mkdtemp(join(tmpdir(), "holdfast-native-e2e-"));

// Chromium looks for per-user hosts in <user data dir>/NativeMessagingHosts.
await mkdir(join(profile, "NativeMessagingHosts"));
await writeFile(
  join(profile, "NativeMessagingHosts", "app.holdfast.agent.json"),
  JSON.stringify({
    name: "app.holdfast.agent",
    description: "Holdfast agent (e2e)",
    path: agent,
    type: "stdio",
    allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
  }),
);

// The agent already holds a locked block this fresh browser profile has never seen,
// as if the extension had been removed and reinstalled mid-lock.
const lockedElsewhere = {
  id: "kept-by-agent",
  name: "Kept by agent",
  websites: ["restored.test"],
  exceptions: [],
  schedule: [],
  runningUntil: Date.now() + 60 * 60_000,
  lock: { type: "untilEnd" },
};
await writeFile(join(agentHome, "blocks.json"), JSON.stringify({ version: 1, blocks: [lockedElsewhere] }));

const extension = resolve("dist/extension");
const context = await chromium.launchPersistentContext(profile, {
  executablePath: process.env.CHROME_PATH || chromium.executablePath(),
  headless: true,
  env: { ...process.env, HOLDFAST_HOME: agentHome }, // inherited by the native host process
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
    "--host-resolver-rules=MAP *.test 127.0.0.1",
  ],
});

const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
const extensionId = new URL(worker.url()).host;
const ui = await context.newPage();
await ui.goto(`chrome-extension://${extensionId}/options.html`);
const send = (request) => ui.evaluate((r) => chrome.runtime.sendMessage(r), request);
const tab = await context.newPage();
async function visit(url) {
  await tab.goto(url).catch(() => {});
  await tab.waitForLoadState();
  return tab.url();
}
const isBlocked = (url) => url.startsWith(`chrome-extension://${extensionId}/blocked.html`);
const agentBlocks = async () => JSON.parse(await readFile(join(agentHome, "blocks.json"), "utf8")).blocks;

async function eventually(fn, what, timeout = 10_000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}: ${error.message}`);
      await new Promise((ok) => setTimeout(ok, 200));
    }
  }
}

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(`ok   ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}\n     ${error.message}`);
  }
}

try {
  await check("the extension ID is pinned by the manifest key", async () => {
    assert.equal(extensionId, EXTENSION_ID);
  });

  await check("a locked block the browser lost is restored from the agent", async () => {
    await eventually(async () => {
      const { blocks } = await send({ type: "list" });
      const restored = blocks.find((s) => s.block.id === lockedElsewhere.id);
      assert.ok(restored, "block not restored yet");
      assert.equal(restored.locked, true);
    }, "the restored block");
    await eventually(async () => assert.equal(isBlocked(await visit(site("restored.test"))), true), "blocking");
  });

  await check("saving a block in the extension writes it to the agent", async () => {
    const fresh = { ...lockedElsewhere, id: "fresh", name: "Fresh", websites: ["fresh.test"], apps: ["com.example.Game"], runningUntil: null, lock: { type: "none" } };
    assert.equal((await send({ type: "save", block: fresh })).verdict.ok, true);
    await eventually(async () => {
      const stored = await agentBlocks();
      assert.deepEqual(stored.find((b) => b.id === "fresh")?.apps, ["com.example.Game"]);
      assert.ok(stored.some((b) => b.id === lockedElsewhere.id), "locked block dropped");
    }, "blocks.json to update");
  });

  await check("the agent remembers which extension synced", async () => {
    const ids = JSON.parse(await readFile(join(agentHome, "extensions.json"), "utf8"));
    assert.deepEqual(ids, [EXTENSION_ID]);
  });
} finally {
  console.log(results.join("\n"));
  await context.close();
  server.close();
}

if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);
