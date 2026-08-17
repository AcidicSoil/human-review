#!/usr/bin/env node

import path from "node:path";
import { fileURLToPath } from "node:url";
import { runCli } from "./generator.js";

export { REVIEW_CSS, createReviewHtml, generateReviewArtifact } from "./generator.js";

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}
