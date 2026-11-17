---
name: checklist-review
description: Use when the user wants to choose, include, exclude, or check off multiple options (for example tech stacks, features, or tools) in Human Review instead of reviewing a regular document.
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

The `checked` field is optional. All choices are **independent checkboxes**, not radio buttons, and can be changed freely. The user can **Comment** on a whole group or a particular option in the live Human Review session; each annotation anchors to that group's or option's stable ID. Generate the review artifact with the installed runner:

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

The JSON result includes `selectedIds` and labeled `selections` with group IDs. **Also process `pages[].comments` from the same poll**: group comments anchor to `#hr-group-<id>`, and option comments to `#hr-choice-<id>`. These annotations remain separate from the checked choices and can express exceptions or requested changes. Apply the selections and their associated comments together, then run `human-review poll <artifact> --ack --timeout 600`. If the user has not sent the review, do not infer choices from an unmodified artifact. Offline HTML supports checkbox selection; annotations require a live Human Review session.
