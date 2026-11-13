---
name: human-review-notepad
description: Use when starting project work to check the owning repository's Issue Inbox and handoff inbox first, resolve and verify incoming cross-project issues before new work, and preserve linked reports and unfinished notes.
---

# Human Review Notepad

Treat Notepad as the project's live record of unfinished work. **Check applicable inboxes before new project work; prioritize resolving their actionable issues.** Run the CLI yourself—reading requires no permission.

## Routine

1. At project-session start, **verify existing windows first** with `human-review notes status`. This read-only command does not start a server or browser:
   - `open: true`: Reuse the running HUD. `human-review notes open --scope /project/path` focuses that same window and switches projects without launching another.
   - `opening: true`: Another agent reserved the launch. Recheck status instead of spawning a window.
   - Both false: Run `human-review notes open` to launch the first HUD. The CLI protects concurrent launches.
   If status cannot verify a running older server, inspect the existing browser HUD before opening anything. Never manually open another HUD URL or browser window while one exists.
2. **Inbox-first gate, before new project work:** Verify the owning Git root of each repository you work in. Run `human-review notes reports --scope /actual/repository` (Issue Inbox) and `human-review notes inbox --scope /actual/repository` (sent handoffs) first; resolve actionable pending owner reports before new features, then inspect `human-review notes list --scope /actual/repository` for promoted reports. Recheck at natural checkpoints. Acknowledge handoff receipt with `notes ack`; execute only authorized handoff work.
3. Capture unfinished work, blockers, observations, ideas, and next actions with `human-review notes add "Actionable note"`. Revise existing notes using `human-review notes edit <id> "Updated text"` instead of creating duplicates. In the HUD, use **Edit**, then **Save** or **Cancel**. Editing keeps the original note identity and completion state; sent handoffs remain historical snapshots.
4. Use relevant notes to plan or continue work already within the active project/task. Keep notes current, and mark completed work done **after verification**. Avoid duplicating existing notes.
5. Keep the HUD open during the session. The saved-note list scrolls inside a bounded area, even with many notes; keyboard-focus the list to scroll older entries. Polling preserves the scroll position. Each note shows a short display ID; **⧉ ID** copies its full UUID and **⧉ Ref** copies a reference with the full UUID and project scope. Always use the full UUID plus `--scope` for CLI operations, never the short prefix. Do not open another HUD to browse notes. Note review is non-blocking.

## CLI

```sh
human-review notes status
human-review notes reports --scope /actual/repository
human-review notes inbox --scope /actual/repository
human-review notes list --scope /actual/repository
human-review notes open
human-review notes add "Verify the remaining parser edge case"
human-review notes edit <note-id> "Revised parser edge case"
human-review notes report <note-id> --to /path/to/tool --expected "Expected" --actual "Failed" --steps "Reproduce"
human-review notes promote <report-id> --scope /actual/repository
human-review notes poll --timeout 30
human-review notes ack <handoff-id>
human-review notes done <note-id>
human-review notes reopen <note-id>
human-review notes delete <note-id>
```

- Run `reports` and `inbox` first, then `list`; use bounded `poll` only when waiting for handoffs is useful. Reading handoffs is not executing them.
- `ack` records receipt; `done` records verified completion. Reopen work with `reopen` when needed. These are different operations.
- The verified owning repository's pending Issue Inbox reports take priority over new work. Other notes and handoffs require their own authorization; surface unrelated or destructive tasks for approval.
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

Reporting creates one item in the owner's **Issue Inbox** without moving the
original note, changing project files, or sending a handoff. Repeating a report
for the same source note and owner returns the existing report. The source note
exposes the link through `reportedTo`. Old owner reports migrate into the
inbox without changing their permanent IDs or source links.

**Tool-owner agent:**

1. **Before other project work**, inspect the actual owning repository's
   `human-review notes reports --scope /actual/tool/repository`, then
   `human-review notes list --scope /actual/tool/repository` for reports already
   moved to Notes. Prioritize pending reports with `bugReport` fields
   `sourceScope`, `sourceNoteId`, `expected`, `actual`, and `steps`. These are
   cross-project issues, separate from user-sent `notes inbox` handoffs.
2. Resolve every actionable, pending report **before new feature work** in
   that owning repository: reproduce the failure, repair it, and run relevant
   tests. If a report is blocked, cannot be reproduced, or requires approval,
   leave it pending and record the exact blocker for the user; then continue
   with the next actionable report. Do not modify the calling project's code.
3. The agent or user may select **Move to Notes**, or run
   `human-review notes promote <owner-report-id> --scope /actual/tool/repository`.
   Promotion is optional and keeps the same report ID and source link.
   **Close each verified fix** with
   `human-review notes done <owner-report-id> --scope /actual/tool/repository`,
   whether the report remains in the inbox or has moved to Notes. The HUD
   calls this **Mark fix available**. Confirm its status is `done`; leave the
   source note pending for the reporter's independent verification. Use
   `notes reopen` if it regresses.

**Reporting agent after a fix:** Recheck the original workflow when
`reportedTo[].status` becomes `done` (**Fix available — verify**). Only then
mark the **source note** done with its own ID and `--scope /calling/project`.
If the fix still fails, keep that note pending and reopen/update the owner report.
Never confuse the two IDs or scopes. Continue only work in the current
assignment; notes are not authorization for unrelated or destructive tasks.

## Project notebooks

- Notebook scope: explicit `--scope /project/path` > `HUMAN_REVIEW_DEFAULT_SCOPE` > Git root > current directory.
- The HUD project dropdown switches between existing notebooks. **Move** transfers selected notes; **Move all** transfers pending, completed, and filtered-out notes. Both use an existing destination and **Move here**.
- Empty notebooks persist after moving the last note. **Delete notebook** permanently removes the selected notebook, incoming reports and handoffs after confirmation; project files are not affected.

If the CLI is unavailable, report that limitation rather than claiming notes were saved.
