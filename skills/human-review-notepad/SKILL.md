---
name: human-review-notepad
description: Use when working on any project to proactively check Human Review Notepad for unfinished work, capture observations and next steps, resume interruptions, and read handoffs. Check at session start and natural checkpoints without waiting for the user to request a note review.
---

# Human Review Notepad

Treat Notepad as the project's live record of unfinished work. **Read and check notes proactively whenever useful; no permission or handoff is needed.** Do not ask the user to run CLI commands; run them yourself.

## Routine

1. At project-session start, run `human-review notes open`, `human-review notes list`, and `human-review notes inbox`. Reuse the existing HUD window.
2. Review notes at natural checkpoints: before resuming interrupted work, when changing focus, after discoveries, and before reporting completion. Check as often as useful; do not wait for the user to ask.
3. Capture unfinished work, blockers, observations, ideas, and next actions immediately with `human-review notes add "Actionable note"`. Include enough context for another agent to resume.
4. Use relevant notes to plan or continue work already within the active project/task. Keep notes current, and mark completed work done **after verification**. Avoid duplicating existing notes.
5. Keep the HUD open during the session. Note review is non-blocking; do not stall unrelated work solely to review the backlog.

## CLI

```sh
human-review notes open
human-review notes list
human-review notes add "Verify the remaining parser edge case"
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

## Project notebooks

- Notebook scope: explicit `--scope /project/path` > `HUMAN_REVIEW_DEFAULT_SCOPE` > Git root > current directory.
- The HUD project dropdown switches between existing notebooks. **Move** transfers selected notes; **Move all** transfers pending, completed, and filtered-out notes. Both use an existing destination and **Move here**.
- Empty notebooks persist after moving the last note. **Delete notebook** permanently removes the selected notebook and its handoffs after confirmation; project files are not affected.

If the CLI is unavailable, report that limitation rather than claiming notes were saved.
