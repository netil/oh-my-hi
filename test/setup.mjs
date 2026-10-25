// Test isolation: every test process gets its own temporary output directory so
// builds, cache wipes and DB writes never touch the developer's real output/
// (wiping output/cache while keeping output/db made the next real build take the
// first-run path and re-accumulate usage). Loaded via `node --import` for each
// test file; child builds inherit OMH_OUTPUT_DIR through process.env.
import fs from 'fs';
import os from 'os';
import path from 'path';

process.env.OMH_OUTPUT_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'omh-test-out-'));
// Builds spawned by tests must not start a server or open a browser tab: a temp
// output dir has no server lock file, which the build reads as "first run, open it".
process.env.CI = '1';

process.on('exit', () => {
  try { fs.rmSync(process.env.OMH_OUTPUT_DIR, { recursive: true, force: true }); } catch {}
});
