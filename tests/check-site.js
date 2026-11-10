/* Syntax check for all inline script elements in Yaeri's browser bundle. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'site', 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)];
if (scripts.length < 2) throw new Error('Expected inline application scripts');
for (const [index, script] of scripts.entries()) {
  new vm.Script(script[1], { filename: 'site/index.html#script-' + index });
}
console.log('JavaScript syntax OK (' + scripts.length + ' scripts)');
