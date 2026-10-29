import { validateLoaInput } from "./loa-review/generator.js";

export const STRUCTURED_FORMAT = "human-review.snapshot/v1";

/** Parse an untrusted browser snapshot at the server boundary. */
export function parseStructuredSnapshot(input, expectedMode) {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new TypeError("Invalid review snapshot");
  if (input.format !== STRUCTURED_FORMAT || input.mode !== expectedMode || expectedMode === "dom") {
    throw new TypeError("Unsupported review mode or format");
  }
  if (typeof input.baseHash !== "string" || !/^[a-f0-9]{40}$/.test(input.baseHash)) {
    throw new TypeError("Invalid base revision");
  }
  if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
    throw new TypeError("Invalid expected revision");
  }
  const document = input.mode === "loa"
    ? validateLoaInput(input.document)
    : input.document;
  if (input.mode === "planning" && (!document || typeof document !== "object" || Array.isArray(document))) {
    throw new TypeError("Invalid planning document");
  }
  return { format: STRUCTURED_FORMAT, mode: input.mode, document, baseHash: input.baseHash, expectedRevision: input.expectedRevision };
}
