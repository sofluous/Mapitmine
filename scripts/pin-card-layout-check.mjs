import { readFile } from "node:fs/promises";

const fixture = await readFile(new URL("../qa/pin-card-layout.html", import.meta.url), "utf8");

const required = [
  "Pin Card Layout QA",
  "grid-template-areas:",
  '"icon date"',
  '"icon bottom"',
  '"description description"',
  "grid-template-columns: minmax(0, 1fr) auto minmax(max-content, 52%)",
  "grid-template-columns: repeat(3, max-content)",
  "grid-template-columns: 1ch minmax(3ch, max-content)",
  ".pin-card.is-hovered",
  ".pin-card.is-selected",
  ".pin-card.is-editing",
  "Narrow Panel",
  "Very Long Settlement Name",
];

const missing = required.filter((snippet) => !fixture.includes(snippet));
if (missing.length) {
  console.error("Pin card QA fixture is missing expected layout coverage:");
  for (const snippet of missing) console.error(`- ${snippet}`);
  process.exit(1);
}

console.log("Pin card layout fixture check passed.");
