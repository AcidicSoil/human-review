---
name: checklist-review
description: Use when the user wants a Human Review checklist or multiple-choice questionnaire, with single-answer radio questions, multi-answer checkbox questions, and per-choice annotations.
---

# Checklist Review

Create a **dedicated selection review** rather than a Notepad entry, Planning document, or LOA. Run the workflow yourself. Do not ask the user to run the CLI.

Prepare a JSON file using the user's actual options. Group related choices; keep a stable, unique `id` for every group and option. Do not add technologies or requirements the user did not supply or request.

```json
{
  "title": "Technology choices",
  "description": "Check every technology to include.",
  "groups": [
    {
      "id": "frontend",
      "title": "Frontend",
      "items": [
        { "id": "react", "label": "React" },
        { "id": "vue", "label": "Vue", "description": "Alternative UI framework" }
      ]
    },
    {
      "id": "database",
      "title": "Database",
      "items": [
        { "id": "postgresql", "label": "PostgreSQL", "checked": true }
      ]
    }
  ]
}
```

For a **multiple-choice questionnaire**, supply `questions` instead of `groups`:

```json
{
  "title": "Architecture decisions",
  "questions": [
    {
      "id": "frontend",
      "prompt": "Which UI framework should we use?",
      "type": "single",
      "options": [
        { "id": "react", "label": "React" },
        { "id": "vue", "label": "Vue" }
      ]
    },
    {
      "id": "storage",
      "prompt": "Which storage systems should we include?",
      "type": "multiple",
      "options": [
        { "id": "postgresql", "label": "PostgreSQL" },
        { "id": "redis", "label": "Redis" }
      ]
    }
  ]
}
```

Each question has a stable ID, prompt, and options. `single` (the default) uses **radio buttons**; `multiple` uses **checkboxes**. `checked` preselects an option, with at most one default in a single-answer question. Existing `groups` checklists still use independent checkboxes and produce the same output. Use only real options from the request.

Questionnaires show one question at a time. Radio answers advance on selection;
multiple-answer checkboxes remain on the question until **Continue**. **Back**
allows corrections; unanswered questions can be skipped. The reviewer must still
press **Send** after the final question. Keep separate decisions in separate
questions rather than cramming unrelated choices into one. Grouped checklists
retain their all-groups view.

The reviewer can **Comment** on any question/group or individual option; annotations anchor to stable IDs in the same live feedback session. Generate either artifact with the installed runner:

```sh
node "$SKILLS_ROOT/human-review/human-review-checklist.mjs" path/to/options.json path/to/options.checklist.review.html --no-open
human-review path/to/options.checklist.review.html
human-review poll path/to/options.checklist.review.html --timeout 600
```

Set `SKILLS_ROOT` to the parent directory of the installed `checklist-review` skill directory. The generated HTML is self-contained and uses Human Review's existing **ordinary DOM review** persistence; it is not an LOA or Planning structured snapshot. The user's checked values are saved in the reviewed HTML and delivered as edits via the normal Human Review feedback loop.

Once the user clicks **Send**, read the reviewed HTML and extract the selected IDs:

```sh
node "$SKILLS_ROOT/human-review/human-review-checklist.mjs" --extract path/to/options.checklist.review.html
```

The JSON result keeps `selectedIds` and labeled `selections` for compatibility. Questionnaires additionally return `answers[]`, containing each `questionId`, `prompt`, `type`, and `selectedIds` (including unanswered questions as empty arrays). **Also process `pages[].comments` from the same poll**: question/group comments anchor to `#hr-group-<id>`, and option comments to `#hr-choice-<id>`. These annotations remain separate from the checked choices and can express exceptions or requested changes. Apply the selections and their associated comments together, then run `human-review poll <artifact> --ack --timeout 600`. If the user has not sent the review, do not infer choices from an unmodified artifact. Offline HTML supports checkbox selection; annotations require a live Human Review session.
