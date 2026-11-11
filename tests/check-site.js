/* Verify all external browser scripts and generated source bundle. */
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const assert = require('assert');
const root = path.join(__dirname, '..');
const site = path.join(root, 'site');
const html = fs.readFileSync(path.join(site, 'index.html'), 'utf8');
const imports = [...html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["'][^>]*><\/script>/gi)].map(x => x[1]);
assert.deepStrictEqual(imports, ['js/prefs.js', 'js/app.js', 'js/brain.js']);
assert.ok(html.includes('href="styles.css"'), 'External stylesheet missing');
assert.ok(fs.statSync(path.join(site, 'styles.css')).size > 0);
for (const src of imports) {
  if (src.includes('..') || src.startsWith('/')) throw new Error('Unsafe script path');
  new vm.Script(fs.readFileSync(path.join(site, src), 'utf8'), { filename: src });
}
const manifest = JSON.parse(fs.readFileSync(path.join(site, 'src/manifest.json'), 'utf8'));
assert.strictEqual(manifest.output, 'site/js/app.js');
const joined = manifest.sources.map(s => {
  if (!/^site\/src\/[a-z-]+\.js$/.test(s)) throw new Error('Unsafe module path: ' + s);
  return fs.readFileSync(path.join(root, s), 'utf8');
}).join('');
assert.strictEqual(fs.readFileSync(path.join(root, manifest.output), 'utf8'), joined,
  'Browser bundle stale: run tools/build-site.ps1');
console.log('Browser CSS, scripts and source bundle OK');
