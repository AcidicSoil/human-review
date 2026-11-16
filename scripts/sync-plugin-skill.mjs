import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { installLoaRuntime, installPlanRuntime, installChecklistRuntime, readSkill } from "../src/setup.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const skillDir = path.join(root, "skills", "human-review");
const skillFile = path.join(skillDir, "SKILL.md");

fs.mkdirSync(skillDir, { recursive: true });
installPlanRuntime(skillDir);
installLoaRuntime(skillDir);
installChecklistRuntime(skillDir);

const packagedSkill = readSkill()
  .replace(
    "`human-review-plan` is installed beside this skill. Run it directly:",
    "The plugin bundles the planning runtime beside this skill. Set `SKILL_DIR` to the absolute directory containing this loaded `SKILL.md`, then run:",
  )
  .replaceAll(
    "human-review-plan path/to/plan.md",
    'node "$SKILL_DIR/human-review-plan.mjs" path/to/plan.md',
  )
  .replaceAll(
    "human-review-loa path/to/loa.json",
    'node "$SKILL_DIR/human-review-loa.mjs" path/to/loa.json',
  )
  .replaceAll(
    "human-review-checklist path/to/options.json",
    'node "$SKILL_DIR/human-review-checklist.mjs" path/to/options.json',
  );

fs.writeFileSync(skillFile, packagedSkill);
