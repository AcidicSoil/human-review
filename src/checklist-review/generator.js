import fs from "node:fs";
import path from "node:path";
import { openBrowser } from "../browser-open.js";

const FORMAT = "human-review.checklist/v1";
const ID = /^[a-z0-9][a-z0-9._:-]*$/i;
const escapeHtml = text => String(text).replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const isRecord = value => value && typeof value === "object" && !Array.isArray(value);

export const CHECKLIST_CSS = `
:root { color-scheme: dark; font-family: ui-sans-serif, system-ui, sans-serif; background: #101720; color: #eaf1fb; }
* { box-sizing: border-box; }
body { margin: 0; padding: clamp(1rem, 3vw, 2.5rem); }
main { margin-inline: auto; max-width: 860px; }
header { padding-block: .75rem 1.25rem; border-bottom: 1px solid #475a70; }
h1 { margin: .5rem 0; font-size: clamp(1.5rem, 3vw, 2.25rem); }
.eyebrow { color: #a8c8f3; font-weight: 700; font-size: .8rem; letter-spacing: .08em; }
.intro, .hint, footer { color: #c6d4e7; line-height: 1.55; }
.hint, footer { font-size: .875rem; }
.checklist { display: grid; gap: 1.25rem; padding-block: 1.5rem; }
fieldset { min-width: 0; padding: 1rem; margin: 0; border: 1px solid #465e78; border-radius: 12px; background: #172435; }
legend { padding-inline: .5rem; color: #f4f7ff; font-size: 1.1rem; font-weight: 700; }
.options { display: grid; gap: .6rem; }
.group-actions { display: flex; justify-content: end; margin: -.25rem 0 .75rem; }
.option-row { display: flex; align-items: center; gap: .65rem; min-width: 0; }
.option { flex: 1; min-width: 0; display: flex; align-items: center; gap: 1rem; min-height: 3rem; padding: .85rem 1rem;
  border: 1px solid #45617e; border-radius: 9px; background: #22334a; cursor: pointer; }
.option:hover { border-color: #91bbef; }
.option:has(input:checked) { border-color: #9dc8ff; background: #2b4e75; }
.option:focus-within { outline: 2px solid #96c4ff; outline-offset: 2px; }
.option input { flex: none; inline-size: 1.3rem; block-size: 1.3rem; accent-color: #7fb6ff; cursor: pointer; }
.option-copy { display: grid; gap: .2rem; min-width: 0; overflow-wrap: anywhere; }
.option-title { font-weight: 650; }
.option-description { color: #cfdeef; line-height: 1.45; font-size: .875rem; }
.annotate { flex: none; min-height: 2.75rem; padding: .6rem .85rem; color: #e3efff;
  background: #293c55; border: 1px solid #5d81ad; border-radius: 8px; cursor: pointer; font: inherit; font-size: .875rem; }
.annotate:hover { background: #35547a; border-color: #97c5ff; }
.annotate:focus-visible { outline: 2px solid #96c4ff; outline-offset: 2px; }
.option-row[data-eh-el] .option, fieldset[data-eh-el] { border-color: #e5b369; }
@media (max-width: 460px) { .option-row { flex-wrap: wrap; } .annotate { margin-inline-start: auto; } }
footer { padding-block: 1rem; border-top: 1px solid #475a70; }
@media (forced-colors: active) { .option:has(input:checked) { border: 2px solid Highlight; } }
`;

export function validateChecklistInput(input) {
  if (!isRecord(input) || typeof input.title !== "string" || !input.title.trim() || !Array.isArray(input.groups)) {
    throw new TypeError("Checklist requires a title and groups.");
  }
  if (input.description !== undefined && typeof input.description !== "string") throw new TypeError("Invalid description.");
  const groupIds = new Set();
  const choiceIds = new Set();
  for (const group of input.groups) {
    if (!isRecord(group) || typeof group.title !== "string" || !group.title.trim() || !ID.test(group.id || "")) {
      throw new TypeError("Invalid group title or ID.");
    }
    if (groupIds.has(group.id)) throw new TypeError("Duplicate group ID.");
    groupIds.add(group.id);
    if (!Array.isArray(group.items)) throw new TypeError("Group items must be an array.");
    for (const item of group.items) {
      if (!isRecord(item) || !ID.test(item.id || "") || typeof item.label !== "string" || !item.label.trim()) {
        throw new TypeError("Invalid choice ID or label.");
      }
      if (choiceIds.has(item.id)) throw new TypeError("Duplicate choice ID.");
      choiceIds.add(item.id);
      if (item.description !== undefined && typeof item.description !== "string") throw new TypeError("Invalid choice description.");
      if (item.checked !== undefined && typeof item.checked !== "boolean") throw new TypeError("Invalid checked state.");
    }
  }
  return input;
}

export function createChecklistReviewHtml(input) {
  const checklist = validateChecklistInput(input);
  const annotateButton = label => `<button type="button" class="annotate" data-hr-annotate
    aria-label="Comment on ${escapeHtml(label)}">Comment</button>`;
  const groups = checklist.groups.map(group => `
    <fieldset id="hr-group-${group.id}" data-hr-group="${group.id}"
      data-hr-annotatable="${escapeHtml(group.title)}">
      <legend>${escapeHtml(group.title)}</legend>
      <div class="group-actions">${annotateButton(group.title)}</div>
      <div class="options">${group.items.map(item => `
        <div class="option-row" id="hr-choice-${item.id}"
          data-hr-annotatable="${escapeHtml(item.label)}">
          <label class="option">
            <input type="checkbox" name="choices" value="${item.id}" data-hr-choice="${item.id}"${item.checked ? " checked" : ""}>
            <span class="option-copy"><span class="option-title">${escapeHtml(item.label)}</span>
              ${item.description ? `<span class="option-description">${escapeHtml(item.description)}</span>` : ""}</span>
          </label>
          ${annotateButton(item.label)}
        </div>`).join("")}
      </div>
    </fieldset>`).join("");
  const manifest = JSON.stringify({ format: FORMAT, checklist }).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(checklist.title)} — Checklist Review</title><style>${CHECKLIST_CSS}</style></head>
<body><main><header><div class="eyebrow">HUMAN REVIEW / CHECKLIST</div>
<h1>${escapeHtml(checklist.title)}</h1>
${checklist.description ? `<p class="intro">${escapeHtml(checklist.description)}</p>` : ""}
<p class="hint">Check all that apply. Use Send in Human Review to return your selections to the agent.</p>
</header><form class="checklist" aria-label="Review selections">${groups}</form>
<footer>Selections save automatically in live Human Review.</footer></main>
<script type="application/json" id="hr-checklist-manifest">${manifest}</script></body></html>`;
}

export function readChecklistSelections(html) {
  const match = html.match(/<script type="application\/json" id="hr-checklist-manifest">([\s\S]*?)<\/script>/);
  if (!match) throw new TypeError("Missing checklist manifest.");
  const { format, checklist } = JSON.parse(match[1]);
  if (format !== FORMAT) throw new TypeError("Unsupported checklist format.");
  validateChecklistInput(checklist);
  const checked = new Set();
  for (const [, tag, id] of html.matchAll(/(<input\b[^>]*\bdata-hr-choice="([^"]+)"[^>]*>)/gi)) {
    if (/(?:^|\s)checked(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?(?=\s|\/?>)/i.test(tag)) checked.add(id);
  }
  const selections = checklist.groups.flatMap(group => group.items
    .filter(item => checked.has(item.id))
    .map(item => ({ id: item.id, label: item.label, groupId: group.id, group: group.title })));
  return { title: checklist.title, selectedIds: selections.map(item => item.id), selections };
}

export async function generateChecklistArtifact(inputFile, outputFile) {
  const input = path.resolve(inputFile);
  const output = path.resolve(outputFile || input.replace(/\.json$/i, "") + ".checklist.review.html");
  fs.writeFileSync(output, createChecklistReviewHtml(JSON.parse(fs.readFileSync(input, "utf8"))));
  return { output };
}

export async function runCli(argv = process.argv.slice(2)) {
  if (!argv.length || argv.some(arg => arg === "--help" || arg === "-h")) {
    console.log("Usage: human-review-checklist <choices.json> [output.review.html] [--no-open]\n       human-review-checklist --extract <reviewed.html> [output.json]");
    return argv.length ? 0 : 1;
  }
  if (argv[0] === "--extract") {
    if (!argv[1]) throw new TypeError("Reviewed HTML file required.");
    const selections = readChecklistSelections(fs.readFileSync(argv[1], "utf8"));
    if (argv[2]) fs.writeFileSync(argv[2], JSON.stringify(selections, null, 2) + "\n");
    else console.log(JSON.stringify(selections, null, 2));
    return 0;
  }
  const outputFile = argv.slice(1).find(arg => arg !== "--no-open");
  const { output } = await generateChecklistArtifact(argv[0], outputFile);
  console.log(output);
  if (!argv.includes("--no-open")) openBrowser(output);
  return 0;
}
