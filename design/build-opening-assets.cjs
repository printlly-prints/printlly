const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const ids = ['284-498', '284-501', '284-505', '284-510', '284-516', '284-521', '265-493'];
const vectors = ids.map(id => fs.readFileSync(path.join(__dirname, 'local-figma', 'assets', `vector-${id}.svg`), 'utf8'));
fs.writeFileSync(path.join(root, 'userapp', 'assets', 'opening-vectors.js'),
  '// Exact SVG geometry extracted from the current local Figma file.\n' +
  '// Reproduce with node design/build-opening-assets.cjs.\n' +
  `export const openingVectors = ${JSON.stringify(vectors, null, 2)};\n`);
