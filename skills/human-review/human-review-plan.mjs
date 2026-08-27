#!/usr/bin/env node
import { runCli } from "./generator.mjs";
runCli().then((code) => { process.exitCode = code; }).catch((error) => { console.error(error.message || error); process.exitCode = 1; });
