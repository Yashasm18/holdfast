// End-to-end check: loads the built extension into Chromium and drives the
// background worker through the same messages the popup and options page use.
// Run with `npm run e2e` after `npm run build`.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { chromium } from "playwright-core";

const server = createServer((req, res) => res.end(`<title>site</title>${req.headers.host}${req.url}`));
await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
const port = server.address().port;
const site = (host, path = "/") => `http://${host}:${port}${path}`;

const extension = resolve("dist/extension");
const context = await chromium.launchPersistentContext(await mkdtemp(join(tmpdir(), "holdfast-e2e-")), {
  executablePath: process.env.CHROME_PATH || chromium.executablePath(),
  headless: true,
  args: [
    `--disable-extensions-except=${extension}`,
    `--load-extension=${extension}`,
    // *.test hosts resolve to the local server, so no real network is needed.
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
  await tab.goto(url).catch(() => {}); // a redirect to the block page aborts the original navigation
  await tab.waitForLoadState();
  return tab.url();
}
const isBlocked = (url) => url.startsWith(`chrome-extension://${extensionId}/blocked.html`);

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push(`ok   ${name}`);
  } catch (error) {
    results.push(`FAIL ${name}\n     ${error.message}`);
  }
}

const block = {
  id: "e2e",
  name: "E2E",
  websites: ["distracting.test"],
  exceptions: ["distracting.test/allowed"],
  schedule: [],
  runningUntil: null,
  lock: { type: "none" },
};

try {
  await check("an inactive block lets pages load", async () => {
    await send({ type: "save", block });
    assert.equal(isBlocked(await visit(site("distracting.test"))), false);
  });

  await check("starting a block redirects the site and its subdomains", async () => {
    const r = await send({ type: "start", id: "e2e", minutes: 5, lock: { type: "randomText", length: 30 } });
    assert.equal(r.verdict.ok, true);
    assert.equal(isBlocked(await visit(site("distracting.test"))), true);
    assert.equal(isBlocked(await visit(site("www.distracting.test", "/watch?v=1"))), true);
  });

  await check("exceptions and unrelated sites still load", async () => {
    assert.equal(isBlocked(await visit(site("distracting.test", "/allowed/page"))), false);
    assert.equal(isBlocked(await visit(site("work.test"))), false);
  });

  await check("tabs already open on a blocked site are redirected", async () => {
    await send({ type: "stop", id: "e2e" }).then(async (r) => {
      // Unlock through the random-text challenge, then reopen the site while unblocked.
      await send({ type: "stop", id: "e2e", answer: r.challengeText });
    });
    await visit(site("distracting.test", "/already-open"));
    await send({ type: "start", id: "e2e", minutes: 5, lock: { type: "none" } });
    await tab.waitForURL((url) => isBlocked(url.href), { timeout: 5000 });
  });

  await check("a random-text lock needs the exact text", async () => {
    await send({ type: "stop", id: "e2e" }); // unlock the "none" run
    await send({ type: "start", id: "e2e", minutes: 5, lock: { type: "randomText", length: 30 } });
    const first = await send({ type: "stop", id: "e2e" });
    assert.equal(first.verdict.ok, false);
    assert.equal(first.challengeText.length, 30);
    const wrong = await send({ type: "stop", id: "e2e", answer: "nope" });
    assert.equal(wrong.verdict.ok, false);
    const right = await send({ type: "stop", id: "e2e", answer: first.challengeText });
    assert.equal(right.verdict.ok, true);
    assert.equal(isBlocked(await visit(site("distracting.test"))), false);
  });

  await check("a timer lock can't be stopped, deleted, or loosened", async () => {
    await send({ type: "start", id: "e2e", minutes: 5, lock: { type: "timer", until: 0 } });
    assert.equal((await send({ type: "stop", id: "e2e" })).verdict.ok, false);
    assert.equal((await send({ type: "delete", id: "e2e" })).verdict.ok, false);
    const { blocks } = await send({ type: "list" });
    const current = blocks[0].block;
    const loosened = await send({ type: "save", block: { ...current, websites: [] } });
    assert.equal(loosened.verdict.ok, false);
    const stricter = await send({ type: "save", block: { ...current, websites: [...current.websites, "more.test"] } });
    assert.equal(stricter.verdict.ok, true);
    assert.equal(isBlocked(await visit(site("more.test"))), true);
  });
} finally {
  console.log(results.join("\n"));
  await context.close();
  server.close();
}

if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);
