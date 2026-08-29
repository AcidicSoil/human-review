# Human Review plugin skill guide

Human Review ships as a skills-only ChatGPT/Codex plugin. The plugin has three focused user-facing entry skills for normal use, plus compatibility and host-support skills that exist to make those workflows work reliably.

## Install the plugin

Add this repository as a Codex plugin marketplace, then install Human Review:

```sh
codex plugin marketplace add AcidicSoil/human-review
codex plugin add human-review@human-review
```

For a local checkout, pass its absolute path to `codex plugin marketplace add` instead of `AcidicSoil/human-review`. Restart the ChatGPT desktop app after installation so the plugin inventory is refreshed.

If you only need the standalone Human Review skill rather than the plugin package, the existing global setup remains available:

```sh
npx -y human-review setup --global
```

## Choose the entry skill

Use the narrowest entry skill that matches the artifact you want to review.

### `ordinary-review`

Use this for an HTML file, rendered Markdown file, or localhost page when you want the normal browser feedback loop.

```text
@Human Review — ordinary-review: Review ./prototype.html and apply my browser feedback.
```

The ordinary workflow is the right choice when the main job is direct page editing, comments, or reviewing a running local route.

### `planning-review`

Use this for plans, specifications, PRDs, roadmaps, or implementation proposals that should become a self-contained editable review artifact.

```text
@Human Review — planning-review: Turn docs/implementation-plan.md into an editable review artifact.
```

Planning artifacts embed their editor runtime and support section navigation, review actions, discussions, reviewed-HTML export, and clean PRD export. They are designed to remain usable from `file://` without requiring a separate development server.

### `loa-review`

Use this when the deliverable is a structured List of Actions and you want actions to reference available plugins or skills.

```text
@Human Review — loa-review: Build a reviewable LOA for shipping the settings feature. Populate the component rail from my installed Codex plugins and skills.
```

When an explicit catalog is not supplied, the current LOA workflow can discover the installed/enabled Codex plugin inventory and resolve nested `SKILL.md` packages for the component rail. Existing references that are missing from the current catalog remain visible as unavailable rather than being silently removed.

The LOA artifact is a review/composition surface. It does not install or execute the plugins or skills placed on actions.

## Compatibility and support skills

Two additional skill directories are shipped with the plugin but are not the three focused entry points above.

- `human-review` is the backwards-compatible umbrella skill and shared runtime support for existing `/human-review` workflows.
- `host-workspace-operator` teaches plugin workflows to use host-provided read, search, file, shell, and Python capabilities safely when those capabilities are available. It does not grant filesystem permissions of its own.

For normal requests, select `ordinary-review`, `planning-review`, or `loa-review` directly. Use the umbrella skill only when preserving an existing `/human-review` workflow or when a host routes through it for compatibility.

## Which workflow should I use?

| You need to… | Use |
| --- | --- |
| Review or edit an HTML/Markdown file | `ordinary-review` |
| Review a localhost page | `ordinary-review` |
| Turn a plan/spec/PRD into an editable offline artifact | `planning-review` |
| Export a reviewed planning document as clean Markdown | `planning-review` |
| Review and reorder a structured action list | `loa-review` |
| Attach installed plugin/skill references to LOA actions | `loa-review` |
| Preserve an older `/human-review` invocation | `human-review` compatibility skill |

## Runtime boundary

The plugin is skills-only. Its skills describe how to use Human Review and the capabilities supplied by the current host. Host file, search, shell, or Python access must actually be available before a workflow can claim to have used it. Human Review does not invent or grant those host capabilities.

For the complete browser editor, planning artifact, LOA data model, and standalone CLI details, see the repository `README.md` and the individual `skills/*/SKILL.md` files.