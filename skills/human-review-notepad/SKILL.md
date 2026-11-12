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
5. Keep the HUD open during the session. Note review is non-blocking; do not stall unrelated work solely to review the backlog.

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

When a tool belonging to another project fails during intended use, record the
unfinished issue in the current project's notebook immediately. **Report issue**
on that note in the HUD, or run `notes report` with the tool owner's directory,
expected behavior, observed failure, and reproducible steps. Search the project
picker by name or directory; it shows full paths to distinguish duplicate names.
Select the verified tool owner, or enter its existing directory path directly if
it has no notebook. Never infer ownership from a project name alone. Reporting
creates no project files.

The tool owner's notebook receives a linked actionable report. Agents working on
that tool should check these incoming notes proactively and fix reproducible
problems in their own project. After verifying the repair, mark the report Done
(**Mark fix available**). The reporter then sees **Fix available — verify**.
The original note stays pending until the reporting project confirms the fix
in its own environment. No automatic handoff or unrelated work execution occurs.

## Project notebooks

- Notebook scope: explicit `--scope /project/path` > `HUMAN_REVIEW_DEFAULT_SCOPE` > Git root > current directory.
- The HUD project dropdown switches between existing notebooks. **Move** transfers selected notes; **Move all** transfers pending, completed, and filtered-out notes. Both use an existing destination and **Move here**.
- Empty notebooks persist after moving the last note. **Delete notebook** permanently removes the selected notebook and its handoffs after confirmation; project files are not affected.

If the CLI is unavailable, report that limitation rather than claiming notes were saved.
