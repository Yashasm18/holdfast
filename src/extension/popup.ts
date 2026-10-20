import { send, type BlockStatus } from "./messages";
import { $, describeLock, el, lockFromSelect, lockSelect } from "./ui";

const error = $("#error");

async function render(): Promise<void> {
  const response = await send({ type: "list" });
  if (response.type !== "list") return;
  const list = $("#blocks");
  list.replaceChildren();

  if (response.blocks.length === 0) {
    list.append(
      el("p", { className: "muted" }, "No blocks yet. ", el("a", { href: "options.html", target: "_blank" }, "Create your first block"), "."),
    );
  }
  for (const status of response.blocks) list.append(card(status));
}

function card({ block, active, locked }: BlockStatus): HTMLElement {
  const header = el(
    "div",
    { className: "row spread" },
    el("h2", { textContent: block.name }),
    el("span", { className: active ? "pill on" : "pill", textContent: active ? (locked ? "Locked" : "Active") : "Off" }),
  );
  const node = el("div", { className: "card" }, header);

  if (active) {
    if (block.runningUntil && block.runningUntil > Date.now()) {
      node.append(el("p", { className: "muted", textContent: `Until ${new Date(block.runningUntil).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · ${describeLock(block.lock)}` }));
    }
    const stop = el("button", { textContent: "Stop" });
    stop.onclick = () => void stopBlock(block.id, node);
    node.append(stop);
    return node;
  }

  const minutes = el("input", { type: "number", min: "1", value: "25", className: "minutes" });
  const lock = lockSelect(block.lock);
  const startButton = el("button", { className: "primary", textContent: "Start" });
  startButton.onclick = async () => {
    const result = await send({ type: "start", id: block.id, minutes: Math.max(1, Number(minutes.value) || 25), lock: lockFromSelect(lock) });
    error.textContent = result.type === "result" && !result.verdict.ok ? result.verdict.reason : "";
    await render();
  };
  node.append(el("div", { className: "row" }, "Block for", minutes, "minutes"), el("div", { className: "row gap-top" }, lock, startButton));
  return node;
}

async function stopBlock(id: string, node: HTMLElement, answer?: string): Promise<void> {
  const result = await send({ type: "stop", id, answer });
  if (result.type !== "result") return;
  if (result.verdict.ok) {
    error.textContent = "";
    return render();
  }
  error.textContent = result.verdict.reason;
  if (result.challengeText) showChallenge(id, node, result.challengeText);
}

function showChallenge(id: string, node: HTMLElement, text: string): void {
  $(".challenge", node)?.remove();
  // Not selectable and paste is blocked, so the text has to be typed by hand.
  const target = el("p", { textContent: text, className: "challenge-text" });
  const input = el("textarea", { placeholder: "Type the text above exactly" });
  input.onpaste = (e) => e.preventDefault();
  const submit = el("button", { textContent: "Unlock" });
  submit.onclick = () => void stopBlock(id, node, input.value);
  node.append(el("div", { className: "challenge" }, target, input, submit));
}

void render();
