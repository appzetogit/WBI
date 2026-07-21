#!/usr/bin/env node
/**
 * Deploy check: npm packages + route files on disk + enterprise/B2B spine loads.
 */
'use strict';

const fs = require('fs');
const path = require('path');

require('./assertServerDeps');

const backendRoot = path.join(__dirname, '..');
const serverPath = path.join(backendRoot, 'server.js');
const src = fs
  .readFileSync(serverPath, 'utf8')
  .split('\n')
  .filter((line) => !/^\s*\/\//.test(line))
  .join('\n');

const routeRe = /require\(\s*['"](\.\/routes\/[^'"]+)['"]\s*\)/g;
const seen = new Set();
const routes = [];
let m;
while ((m = routeRe.exec(src)) !== null) {
  if (seen.has(m[1])) continue;
  seen.add(m[1]);
  routes.push(m[1]);
}

let failed = 0;
for (const rel of routes) {
  const base = path.join(backendRoot, rel.replace(/^\.\//, ''));
  const exists = [base, `${base}.js`].some((p) => fs.existsSync(p));
  if (!exists) {
    console.error('[verify] Missing route file:', rel);
    failed += 1;
  }
}

const spine = [
  './routes/b2b-routes/jobs.routes',
  './routes/admin-routes/enterpriseB2BFlow.routes',
  './controllers/b2bControllers/b2bJobController',
  './services/enterpriseB2BOrchestrator.service'
];

for (const rel of spine) {
  try {
    require(path.join(backendRoot, rel));
  } catch (e) {
    console.error('[verify] Spine load failed:', rel);
    console.error(e.message);
    failed += 1;
  }
}

if (failed) {
  console.error(`[verify] ${failed} check(s) failed`);
  process.exit(1);
}

console.log(`[verify] OK — ${routes.length} route files present, B2B/enterprise spine loads`);
process.exit(0);
