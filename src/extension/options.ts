import type { Block, ScheduleWindow, Weekday } from "../core/types";
import { send, type BlockStatus } from "./messages";
import { $, describeLock, el, lockFromSelect, lockSelect } from "./ui";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const toTime = (minute: number) =>
  `${String(Math.floor(minute / 60) % 24).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
const fromTime = (value: string, fallback: number) => {
  const [h, m] = value.split(":").map(Number);
  return h === undefined || m === undefined || Number.isNaN(h) ? fallback : h * 60 + m;
};
const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

function newBlock(): Block {
  return {
    id: crypto.randomUUID(),
    name: "New block",
    websites: [],
    exceptions: [],
    schedule: [],
    runningUntil: null,
    lock: { type: "none" },
  };
}

async function render(): Promise<void> {
  const response = await send({ type: "list" });
  if (response.type !== "list") return;
  $("#blocks").replaceChildren(...response.blocks.map(editor));
}

// The editor offers one daily window applied to the chosen days. The background
// rejects the save if it would loosen a locked block.
function editor({ block, active, locked }: BlockStatus): HTMLElement {
  const first = block.schedule[0];
  const name = el("input", { value: block.name });
  const websites = el("textarea", { value: block.websites.join("\n") });
  const exceptions = el("textarea", { value: block.exceptions.join("\n") });
  const apps = el("textarea", { value: (block.apps ?? []).join("\n"), placeholder: "com.valvesoftware.steam" });
  const start = el("input", { type: "time", value: toTime(first?.start ?? 9 * 60) });
  const end = el("input", { type: "time", value: toTime(first?.end ?? 17 * 60) });
  const dayBoxes = DAYS.map((label, day) =>
    el("input", { type: "checkbox", checked: block.schedule.some((w) => w.day === day) }),
  );
  const lock = lockSelect(block.lock, { allowTimer: false });
  const error = el("p", { className: "error" });

  const save = el("button", { className: "primary", textContent: "Save" });
  save.onclick = async () => {
    const startMinute = fromTime(start.value, 9 * 60);
    const endMinute = fromTime(end.value, 17 * 60) || 1440;
    const schedule: ScheduleWindow[] = dayBoxes.flatMap((box, day) =>
      box.checked ? [{ day: day as Weekday, start: startMinute, end: endMinute }] : [],
    );
    const updated: Block = {
      ...block,
      name: name.value.trim() || "Untitled block",
      websites: lines(websites.value),
      exceptions: lines(exceptions.value),
      apps: lines(apps.value),
      schedule,
      lock: lockFromSelect(lock),
    };
    const result = await send({ type: "save", block: updated });
    if (result.type === "result" && !result.verdict.ok) {
      error.textContent = result.verdict.reason;
      return;
    }
    await render();
  };

  const remove = el("button", { className: "danger", textContent: "Delete", disabled: locked });
  remove.onclick = async () => {
    if (!confirm(`Delete "${block.name}"?`)) return;
    const result = await send({ type: "delete", id: block.id });
    if (result.type === "result" && !result.verdict.ok) error.textContent = result.verdict.reason;
    else await render();
  };

  const status = active ? (locked ? `Locked · ${describeLock(block.lock)}` : "Active now") : "Off";
  return el(
    "section",
    { className: "card" },
    el("div", { className: "row spread" }, name, el("span", { className: active ? "pill on" : "pill", textContent: status })),
    locked ? el("p", { className: "muted", textContent: "This block is locked: you can add websites or extend the schedule, but not loosen it." }) : "",
    el(
      "div",
      { className: "grid" },
      el("div", {}, el("label", { textContent: "Block these websites" }), websites),
      el("div", {}, el("label", { textContent: "Always allow (exceptions)" }), exceptions),
    ),
    el("label", { textContent: "Quit these Mac apps (bundle IDs, needs the macOS agent)" }),
    apps,
    el("label", { textContent: "Schedule" }),
    el(
      "div",
      { className: "row" },
      el("div", { className: "days" }, ...dayBoxes.map((box, day) => el("label", {}, box, DAYS[day]!))),
      "from",
      start,
      "to",
      end,
    ),
    el("label", { textContent: "Lock while scheduled" }),
    lock,
    error,
    el("div", { className: "row" }, save, remove),
  );
}

$("#new").onclick = async () => {
  await send({ type: "save", block: newBlock() });
  await render();
};

void render();
