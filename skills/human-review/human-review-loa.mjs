#!/usr/bin/env node
import { runCli } from "./loa-generator.mjs";
runCli().then((code) => { process.exitCode = code; }).catch((error) => { console.error(error.message || error); process.exitCode = 1; });
