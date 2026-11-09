import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { parseCoordinates } from '../src/utils/shopLocation.js';
const require = createRequire(import.meta.url);
const config = require('tailwindcss/loadConfig')(fileURLToPath(new URL('../tailwind.config.js', import.meta.url)));
const colors = config.theme.extend.colors;
function luminance(hex) { const rgb = hex.slice(1).match(/../g).map((v) => parseInt(v, 16) / 255).map((v) => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; }
function ratio(a, b) { const values = [luminance(a), luminance(b)].sort((a,b) => b-a); return (values[0] + .05) / (values[1] + .05); }
for (const [foreground, background] of [['text-primary','surface'],['text-secondary','surface'],['text-muted','surface'],['primary','surface'],['primary-bright','primary-wash'],['status-pending-text','status-pending-bg'],['status-active-text','status-active-bg'],['status-ready-text','status-ready-bg'],['error-text','error-bg']]) assert(ratio(colors[foreground], colors[background]) >= 4.5, `${foreground}/${background} contrast`);
assert(ratio(colors['border-strong'], colors.surface) >= 3);
assert(ratio('#ffffff', colors.primary) >= 4.5);
assert.equal(colors.background, '#FAFAF7');
assert.deepEqual(parseCoordinates('0', '0'), {lat:0,lng:0});
for(const [lat,lng] of [['', '1'],['  ','0'],['91','0'],['0','181'],['NaN','0'],['0','Infinity']]) assert.equal(parseCoordinates(lat,lng),null);
console.log('Vendor theme contrast and coordinate validation checks passed.');
