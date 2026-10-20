import { $ } from "./ui";

const NUDGES = [
  "The thing you were avoiding is still there. Go do it.",
  "Five more minutes of focus beats five more minutes of scrolling.",
  "You set this block for a reason. Future you says thanks.",
  "Boredom is where the good ideas start.",
];

function blockedHost(): string {
  try {
    return new URL(location.hash.slice(1)).hostname;
  } catch {
    return "this page";
  }
}

$("#url").textContent = blockedHost();
$("#quote").textContent = NUDGES[Math.floor(Math.random() * NUDGES.length)]!;
