import { readFile } from "node:fs/promises";

const fixture = await readFile(
  new URL("../qa/editor-maps-layout.html", import.meta.url),
  "utf8",
);

const required = [
  "Editor And Maps Layout QA",
  "pin-editor-coords",
  'href="../src/editor-fields.css"',
  'class="editor-property-pair"',
  'class="editor-field-label"',
  'class="editor-disclosure"',
  'class="pin-editor-actions editor-footer"',
  'class="editor-field editor-swatch"',
  'class="editor-field editor-icon"',
  'value="-123456789"',
  'value="-987654321"',
  "map-action-grid",
  "map-gallery-card",
  "Updated now",
  "@media (max-width: 520px)",
  'class="editor-secondary"',
  "More",
];

const forbidden = ["pinEditorSubtitle", "pinEditorStatus", "pinEditorValidation"];

const missing = required.filter((snippet) => !fixture.includes(snippet));
const presentForbidden = forbidden.filter((snippet) => fixture.includes(snippet));

if (missing.length || presentForbidden.length) {
  if (missing.length) {
    console.error("UI layout QA fixture is missing expected coverage:");
    for (const snippet of missing) console.error(`- ${snippet}`);
  }
  if (presentForbidden.length) {
    console.error("UI layout QA fixture still contains removed editor readouts:");
    for (const snippet of presentForbidden) console.error(`- ${snippet}`);
  }
  process.exit(1);
}

console.log("UI layout fixture check passed.");
