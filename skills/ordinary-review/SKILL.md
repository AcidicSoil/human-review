---
name: ordinary-review
description: Use when the user wants to visually review or edit an HTML file, rendered Markdown file, or localhost page and return live feedback to the agent.
---

# Ordinary Review

Use Human Review's live browser feedback loop for ordinary HTML, Markdown, or localhost pages.

Run the workflow yourself. Do not ask the user to run a Human Review CLI command.

Resolve the review target from the user's query and current project context. If a clear file or localhost URL is already given, do not ask the user to repeat it.

Open the target:

```sh
npx -y human-review <target>
```

Then poll for the user's edits and comments:

```sh
npx -y human-review poll <target> --timeout 600
```

Apply every returned edit/comment to the canonical source. Preserve direct user edits exactly. For localhost URLs, change the actual component/template source, never the rendered response.

After applying a batch, acknowledge it and wait for the next one:

```sh
npx -y human-review poll <target> --ack --timeout 600
```

Repeat on timeout. Stop when the review closes.
