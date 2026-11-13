---
name: human-review-notepad
description: Use when proactively checking unfinished project work, capturing notes and handoffs, or reporting a failure in a tool owned by another project. Preserve linked bug reports and track fixes across notebooks; verify the current HUD before opening one.
---

# Human Review Notepad

Treat Notepad as the project's live record of unfinished work. **Read and check notes proactively whenever useful; no permission or handoff is needed.** Do not ask the user to run CLI commands; run them yourself.

## Routine

1. At project-session start, **verify existing windows first** with `human-review notes status`. This read-only command does not start a server or browser:
   - `open: true`: Reuse the running HUD. `human-review notes open --scope /project/path` focuses that same window and switches projects without launching another.
   - `opening: true`: Another agent reserved the launch. Recheck status instead of spawning a window.
   - Both false: Run `human-review notes open` to launch the first HUD. The CLI protects concurrent launches.
   If status cannot verify a running older server, inspect the existing browser HUD before opening anything. Never manually open another HUD URL or browser window while one exists.
2. Run `human-review notes list` and `human-review notes inbox`; review notes at natural checkpoints and whenever useful. No user permission is required to check notes.
3. Capture unfinished work, blockers, observations, ideas, and next actions with `human-review notes add "Actionable note"`. Revise existing notes using `human-review notes edit <id> "Updated text"` instead of creating duplicates. In the HUD, use **Edit**, then **Save** or **Cancel**. Editing keeps the original note identity and completion state; sent handoffs remain historical snapshots.
4. Use relevant notes to plan or continue work already within the active project/task. Keep notes current, and mark completed work done **after verification**. Avoid duplicating existing notes.
5. Keep the HUD open during the session. The saved-note list scrolls inside a bounded area, even with many notes; keyboard-focus the list to scroll older entries. Polling preserves the scroll position. Each note shows a short display ID; **⧉ ID** copies its full UUID and **⧉ Ref** copies a reference with the full UUID and project scope. Always use the full UUID plus `--scope` for CLI operations, never the short prefix. Do not open another HUD to browse notes. Note review is non-blocking.

## CLI

```sh
human-review notes status
human-review notes open
human-review notes list
human-review notes add "Verify the remaining parser edge case"
human-review notes edit <note-id> "Revised parser edge case"
human-review notes report <note-id> --to /path/to/tool --expected "Expected" --actual "Failed" --steps "Reproduce"
human-review notes inbox
human-review notes poll --timeout 30
human-review notes ack <handoff-id>
human-review notes done <note-id>
human-review notes reopen <note-id>
human-review notes delete <note-id>
```

- Check `list` and `inbox` freely. Use bounded `poll` when waiting for incoming handoffs would help; it is separate from regular Human Review polling.
- `ack` records receipt; `done` records verified completion. Reopen work with `reopen` when needed. These are different operations.
- Notes are working context, not automatic instructions to run unrelated or destructive tasks. Continue relevant unfinished work within the current assignment; surface unrelated work for prioritization.
- Use `delete` only for explicitly intended permanent removal. Do not delete notes just because they are complete.

## Cross-project tool bugs

**When using another project's tool fails, report it proactively.** Do not wait
for a user to ask or send a handoff. Keep the original unfinished-work note in
the calling project's notebook.

**Reporting agent:**

1. Check `human-review notes list --scope /calling/project` for the same failure.
   Reuse its note ID; otherwise add a note with the tool, actual command,
   observed error, relevant version/configuration, and impact. Exclude secrets.
2. Identify the **actual tool-owning repository** from its executable/source
   location, not the name alone. In the HUD, search by name or full path; enter
   an existing absolute directory path when the owner has no notebook yet.
3. Run the report command below using the **source note ID and source scope**.
   Describe the expected result, observed failure, and the commands/actions
   performed to reproduce it. State uncertainties instead of inventing details.

```sh
human-review notes report <source-note-id> \
  --scope /calling/project \
  --to /actual/tool/repository \
  --expected "What should have happened" \
  --actual "What happened, including the error" \
  --steps "Exact commands/actions attempted"
```

Reporting creates one linked owner note without moving the original, changing
either repository's files, or sending a handoff. Repeating a report for the
same source note and owner returns its existing report rather than duplicating
it. The source note exposes the linked report through `reportedTo`.

**Tool-owner agent:**

1. At session start and checkpoints, run
   `human-review notes list --scope /actual/tool/repository`. Inspect pending
   notes with `bugReport`: `sourceScope`, `sourceNoteId`, `expected`,
   `actual`, and `steps` identify the reporter and failure. These reports
   do **not** require an inbox handoff.
2. Reproduce and address relevant reports in the **owning repository**, not by
   modifying the calling project. Keep blocked or unreproduced reports pending;
   update their note with findings when useful.
3. After the fix passes relevant tests, run
   `human-review notes done <owner-report-id> --scope /actual/tool/repository`.
   In the HUD this is **Mark fix available**. Use `notes reopen` if it regresses.

**Reporting agent after a fix:** Recheck the original workflow when
`reportedTo[].status` becomes `done` (**Fix available — verify**). Only then
mark the **source note** done with its own ID and `--scope /calling/project`.
If the fix still fails, keep that note pending and reopen/update the owner report.
Never confuse the two IDs or scopes. Continue only work in the current
assignment; notes are not authorization for unrelated or destructive tasks.

## Project notebooks

- Notebook scope: explicit `--scope /project/path` > `HUMAN_REVIEW_DEFAULT_SCOPE` > Git root > current directory.
- The HUD project dropdown switches between existing notebooks. **Move** transfers selected notes; **Move all** transfers pending, completed, and filtered-out notes. Both use an existing destination and **Move here**.
- Empty notebooks persist after moving the last note. **Delete notebook** permanently removes the selected notebook and its handoffs after confirmation; project files are not affected.

If the CLI is unavailable, report that limitation rather than claiming notes were saved.
