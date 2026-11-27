// Runs unit tests and the headless gameplay test.
import { spawnSync } from 'node:child_process';
const run = (args) => spawnSync('node', args, { stdio: 'inherit' }).status;
const a = run(['tests/unit.mjs']);
const b = run(['tests/gameplay.mjs', 'tests/out/gp']);
process.exit(a || b ? 1 : 0);
