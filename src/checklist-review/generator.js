import fs from "node:fs";
import path from "node:path";
import { openBrowser } from "../browser-open.js";

const FORMAT = "human-review.checklist/v1";
const ID = /^[a-z0-9][a-z0-9._:-]*$/i;
const escapeHtml = text => String(text).replace(/[&<>"']/g, char =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
const isRecord = value => value && typeof value === "object" && !Array.isArray(value);
const sectionsFor = input => Array.isArray(input.questions)
  ? input.questions.map(question => ({
    id: question.id,
    title: question.prompt,
    items: question.options,
    type: question.type ?? "single",
  }))
  : input.groups.map(group => ({ ...group, type: "multiple" }));

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
.question-hint { color: #bdd0e7; font-size: .86rem; margin: -.25rem 0 .85rem; }
.question-number { color: #a8c8f3; margin-right: .4rem; }
.question-nav { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; padding: 0 0 1.25rem; }
.question-progress { margin: 0; color: #a8c8f3; font-size: .9rem; font-weight: 650; }
.question-actions { display: flex; gap: .65rem; }
.question-actions button { min-height: 2.75rem; padding: .65rem 1.25rem; border: 1px solid #5d81ad;
  border-radius: 9px; background: #293c55; color: #eaf1fb; cursor: pointer; font: inherit; }
.question-actions button:last-child { background: #2b4e75; border-color: #91bbef; }
.question-actions button:hover { border-color: #b6d6ff; }
.question-actions button:focus-visible { outline: 2px solid #96c4ff; outline-offset: 2px; }
.question-complete { padding: 1.5rem; border: 1px solid #465e78; border-radius: 12px; background: #172435; }
.question-complete h2 { margin-top: 0; }
[hidden] { display: none !important; }
.annotate { flex: none; min-height: 2.75rem; padding: .6rem .85rem; color: #e3efff;
  background: #293c55; border: 1px solid #5d81ad; border-radius: 8px; cursor: pointer; font: inherit; font-size: .875rem; }
.annotate:hover { background: #35547a; border-color: #97c5ff; }
.annotate:focus-visible { outline: 2px solid #96c4ff; outline-offset: 2px; }
.option-row[data-eh-el] .option, fieldset[data-eh-el] { border-color: #e5b369; }
@media (max-width: 460px) { .option-row { flex-wrap: wrap; } .annotate { margin-inline-start: auto; } }
footer { padding-block: 1rem; border-top: 1px solid #475a70; }
@media (forced-colors: active) { .option:has(input:checked) { border: 2px solid Highlight; } }
`;

const QUESTIONNAIRE_SCRIPT = `
(() => {
  const form = document.querySelector("form.checklist");
  const steps = [...form.querySelectorAll("fieldset[data-hr-group]")];
  const progress = document.getElementById("hr-question-progress");
  const back = document.getElementById("hr-question-back");
  const next = document.getElementById("hr-question-next");
  const complete = document.getElementById("hr-question-complete");
  let active = 0;

  const show = (index, moveFocus = true) => {
    active = index;
    steps.forEach((step, position) => { step.hidden = position !== active; });
    const finished = active === steps.length;
    complete.hidden = !finished;
    back.hidden = active === 0;
    next.hidden = finished;
    progress.textContent = finished ? "Review complete" : "Question " + (active + 1) + " of " + steps.length;
    if (moveFocus) (finished ? complete.querySelector("h2") : steps[active].querySelector("legend")).focus();
  };

  form.addEventListener("click", event => {
    if (event.target.matches('input[type="radio"][data-hr-choice]') &&
        steps[active]?.contains(event.target)) show(active + 1);
  });
  back.addEventListener("click", () => show(active - 1));
  next.addEventListener("click", () => show(active + 1));
  show(0, false);
})();
`;

export function validateChecklistInput(input) {
  if (!isRecord(input) || typeof input.title !== "string" || !input.title.trim()) {
    throw new TypeError("Review requires a title.");
  }
  const hasQuestions = Object.hasOwn(input, "questions");
  const hasGroups = Object.hasOwn(input, "groups");
  if (hasQuestions === hasGroups || !Array.isArray(hasQuestions ? input.questions : input.groups)) {
    throw new TypeError("Provide either questionnaire questions or checklist groups.");
  }
  if (input.description !== undefined && typeof input.description !== "string") throw new TypeError("Invalid description.");
  const groupIds = new Set();
  const choiceIds = new Set();
  for (const group of sectionsFor(input)) {
    if (!group || typeof group.title !== "string" || !group.title.trim() || !ID.test(group.id || "")) {
      throw new TypeError("Invalid question/group title or ID.");
    }
    if (groupIds.has(group.id)) throw new TypeError("Duplicate question/group ID.");
    groupIds.add(group.id);
    if (!["single", "multiple"].includes(group.type)) {
      throw new TypeError("Question type must be single or multiple.");
    }
    if (!Array.isArray(group.items)) throw new TypeError("Question options/group items must be an array.");
    let defaults = 0;
    for (const item of group.items) {
      if (!isRecord(item) || !ID.test(item.id || "") || typeof item.label !== "string" || !item.label.trim()) {
        throw new TypeError("Invalid choice ID or label.");
      }
      if (choiceIds.has(item.id)) throw new TypeError("Duplicate choice ID.");
      choiceIds.add(item.id);
      if (item.description !== undefined && typeof item.description !== "string") throw new TypeError("Invalid choice description.");
      if (item.checked !== undefined && typeof item.checked !== "boolean") throw new TypeError("Invalid checked state.");
      if (item.checked) defaults += 1;
    }
    if (group.type === "single" && defaults > 1) {
      throw new TypeError("Single-answer question cannot have multiple selected defaults.");
    }
  }
  return input;
}

export function createChecklistReviewHtml(input) {
  const checklist = validateChecklistInput(input);
  const questionnaire = Array.isArray(checklist.questions);
  const annotateButton = label => `<button type="button" class="annotate" data-hr-annotate
    aria-label="Comment on ${escapeHtml(label)}">Comment</button>`;
  const groups = sectionsFor(checklist).map((group, index) => `
    <fieldset id="hr-group-${group.id}" data-hr-group="${group.id}"
      data-hr-annotatable="${escapeHtml(group.title)}"${questionnaire ? ` aria-describedby="hr-hint-${group.id}"` : ""}>
      <legend${questionnaire ? ' tabindex="-1"' : ""}>${questionnaire ? `<span class="question-number">${index + 1}.</span> ` : ""}${escapeHtml(group.title)}</legend>
      <div class="group-actions">${annotateButton(group.title)}</div>
      ${questionnaire ? `<p id="hr-hint-${group.id}" class="question-hint">${group.type === "single" ? "Choose one answer" : "Choose all that apply"}</p>` : ""}
      <div class="options">${group.items.map(item => `
        <div class="option-row" id="hr-choice-${item.id}"
          data-hr-annotatable="${escapeHtml(item.label)}">
          <label class="option">
            <input type="${group.type === "single" ? "radio" : "checkbox"}"
              name="${questionnaire ? `answer-${group.id}` : "choices"}"
              value="${item.id}" data-hr-choice="${item.id}"${item.checked ? " checked" : ""}>
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
<title>${escapeHtml(checklist.title)} — ${questionnaire ? "Questionnaire" : "Checklist"} Review</title><style>${CHECKLIST_CSS}</style></head>
<body><main><header><div class="eyebrow">HUMAN REVIEW / ${questionnaire ? "QUESTIONNAIRE" : "CHECKLIST"}</div>
<h1>${escapeHtml(checklist.title)}</h1>
${checklist.description ? `<p class="intro">${escapeHtml(checklist.description)}</p>` : ""}
<p class="hint">${questionnaire ? "Answer one question at a time." : "Check all that apply."} Use Send in Human Review to return your selections to the agent.</p>
</header><form class="checklist" aria-label="Review selections">${groups}</form>
${questionnaire ? `<nav class="question-nav" aria-label="Question navigation">
  <p class="question-progress" id="hr-question-progress" role="status" aria-live="polite"></p>
  <div class="question-actions">
    <button type="button" id="hr-question-back" hidden>Back</button>
    <button type="button" id="hr-question-next">Continue</button>
  </div>
</nav>
<section class="question-complete" id="hr-question-complete" hidden>
  <h2 tabindex="-1">Questions complete</h2>
  <p>Use Send in Human Review to share your answers. You can go back to change them.</p>
</section>` : ""}
<footer>Selections save automatically in live Human Review.</footer></main>
<script type="application/json" id="hr-checklist-manifest">${manifest}</script>${questionnaire ? `<script>${QUESTIONNAIRE_SCRIPT}</script>` : ""}</body></html>`;
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
  const groups = sectionsFor(checklist);
  const selections = groups.flatMap(group => group.items
    .filter(item => checked.has(item.id))
    .map(item => ({ id: item.id, label: item.label, groupId: group.id, group: group.title })));
  const result = { title: checklist.title, selectedIds: selections.map(item => item.id), selections };
  if (Array.isArray(checklist.questions)) {
    result.answers = groups.map(group => ({
      questionId: group.id,
      prompt: group.title,
      type: group.type,
      selectedIds: group.items.filter(item => checked.has(item.id)).map(item => item.id),
    }));
  }
  return result;
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
