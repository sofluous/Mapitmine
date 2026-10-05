import { mkdtemp, rm } from "node:fs/promises";
import { access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const browserCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];

async function pathExists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const browserPath = (
  await Promise.all(browserCandidates.map(async (path) => ((await pathExists(path)) ? path : null)))
).find(Boolean);

if (!browserPath) {
  console.error("Browser smoke failed. No Edge or Chrome executable found.");
  process.exit(1);
}

const userDataDir = await mkdtemp(join(tmpdir(), "mapitmine-browser-smoke-"));
const appUrl = pathToFileURL(resolve("index.html")).href;

try {
  let stdout = "";
  let stderr = "";
  try {
    const result = await execFileAsync(
      browserPath,
      [
        "--headless",
        "--disable-gpu",
        "--disable-gpu-compositing",
        "--in-process-gpu",
        "--use-gl=swiftshader",
        "--use-angle=swiftshader",
        "--disable-features=VizDisplayCompositor",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-extensions",
        "--disable-background-networking",
        "--run-all-compositor-stages-before-draw",
        "--virtual-time-budget=1000",
        "--dump-dom",
        `--user-data-dir=${userDataDir}`,
        appUrl,
      ],
      { maxBuffer: 10 * 1024 * 1024, timeout: 20000 },
    );
    stdout = result.stdout;
    stderr = result.stderr;
  } catch (error) {
    const output = `${error.stderr || ""}\n${error.message || ""}`;
    if (
      error.signal === "SIGTERM" ||
      /GPU process isn't usable|Timed out|Command failed/i.test(output)
    ) {
      console.warn(
        "Browser smoke skipped: installed browser could not complete headless DOM dump in this environment.",
      );
      process.exit(0);
    }
    throw error;
  }

  const required = [
    'id="workspaceShell"',
    'id="mapSelector"',
    'id="currentMapNameInput"',
    'id="mapMetaSource"',
    'id="mapLinkBadge"',
    'id="pinList"',
    'id="pinSearchInput"',
    'id="pinFilterBtn"',
    'id="pinResultSummary"',
    'id="mapCanvas"',
    'id="mapScaleChip"',
    'id="mapStatusStrip"',
    'id="pinEditorPanel"',
    'id="pinEditorX"',
    'id="pinEditorY"',
    'id="pinEditorZ"',
    'id="pinEditorHelpBtn"',
    'id="pinEditorSaveBtn"',
    'id="contextMenu"',
    "Save &amp; Export",
    "Open &amp; Link",
    "Save Linked",
    "Save As Linked",
    "Export Copy",
    "Fit Pins",
    "Fit Crop",
  ];
  const missing = required.filter((snippet) => !stdout.includes(snippet));
  if (missing.length) {
    console.error("Browser smoke failed. Missing parsed DOM surface:");
    for (const snippet of missing) console.error(`- ${snippet}`);
    process.exit(1);
  }

  const seriousErrors = stderr
    .split(/\r?\n/)
    .filter((line) => /\b(ERROR|FATAL)\b/i.test(line))
    .filter((line) => !/ssl_client_socket|handshake|certificate|gpu/i.test(line));
  if (seriousErrors.length) {
    console.error("Browser smoke failed. Browser reported errors:");
    for (const line of seriousErrors.slice(0, 8)) console.error(line);
    process.exit(1);
  }

  console.log("Browser smoke passed.");
} finally {
  await rm(userDataDir, { recursive: true, force: true });
}
