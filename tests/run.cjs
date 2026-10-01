const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const files = fs.readdirSync(__dirname).filter(file => /\.test\.(?:js|mjs)$/.test(file)).map(file => path.join(__dirname, file));
const result = spawnSync(process.execPath, ['--test', ...files], { cwd:path.resolve(__dirname, '..'), stdio:'inherit' });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
