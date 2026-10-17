const fs = require('node:fs');
const path = require('node:path');
const source = JSON.parse(fs.readFileSync(path.join(__dirname, '../design/local-figma/variables.json'), 'utf8'));
const semantic = source.find(set => set.name === 'Printlly / Semantics');
const lookup = new Map(semantic.variables.map(variable => [variable.name, variable]));
function value(name, mode = 'Light') {
  const resolved = lookup.get(name)?.values.find(entry => entry.mode === mode)?.resolved;
  if (!resolved) throw Error(`Missing design variable ${name}/${mode}`);
  return resolved.hex ?? resolved.floatValue ?? resolved.textValue;
}
const colorAliases = {
  canvas: 'surface/page', surface: 'surface/default', surfaceRaised: 'surface/lavender',
  selection: 'surface/selected', subtle: 'surface/subtle', hero: 'surface/hero',
  textPrimary: 'text/primary', textSecondary: 'text/secondary', textMuted: 'text/muted',
  action: 'action/default', actionPressed: 'action/pressed', actionDisabled: 'action/disabled',
  onAction: 'text/on-action', onAccent: 'text/on-accent', onSelection: 'text/action',
  controlBorder: 'border/control', border: 'border/default', divider: 'border/subtle', focus: 'border/focus',
  accentLime: 'surface/lime', accentApricot: 'surface/apricot', lavender: 'surface/lavender',
  error: 'status/error', errorSurface: 'status/error-surface',
  success: 'status/success', successSurface: 'status/success-surface',
  info: 'status/info', infoSurface: 'status/info-surface',
  chatOutgoing: 'chat/outgoing', chatIncoming: 'chat/incoming',
};
const colors = Object.fromEntries(['Light', 'Dark'].map(mode => [mode.toLowerCase(),
  Object.fromEntries(Object.entries(colorAliases).map(([alias, name]) => [alias, value(name, mode)]))]));
const type = { displayFamily: value('type/display-family'), bodyFamily: value('type/body-family') };
for (const role of ['caption', 'small', 'body', 'heading-sm', 'heading-md', 'heading-lg', 'display', 'hero']) {
  type[role] = { size: value(`type/${role}/size`), lineHeight: value(`type/${role}/line`) };
}
const tokens = {
  source: { fileKey: 'GLk1d6IiNCnsEFIEIVogwm', localFile: 'design/local-figma/printlly.fig',
    semanticsCollection: semantic.name, semanticsId: semantic.id, colorAliases },
  colors,
  spacing: Object.fromEntries([4,8,12,16,24,32,48,64,96].map(n => [n, value(`spacing/${n}`)])),
  radius: { square: value('radius/square'), button: value('radius/button'), control: value('radius/control-large'),
    default: value('radius/default'), large: value('radius/large') },
  minTarget: value('control/min-target'), type,
  motion: Object.fromEntries(['instant','fast','standard','deliberate'].map(key => [key, value(`motion/${key}`)])),
  sourceVariables: source.filter(set => set.name !== 'Printlly / Prototype state').map(set => ({
    id: set.id, name: set.name, modes: set.modes,
    variables: set.variables.map(variable => ({ id: variable.id, name: variable.name, type: variable.type,
      values: variable.values.map(entry => ({ mode: entry.mode, value: entry.resolved?.hex ?? entry.resolved?.floatValue ?? entry.resolved?.textValue,
        alias: entry.raw?.value?.alias?.guid ? `${entry.raw.value.alias.guid.sessionID}:${entry.raw.value.alias.guid.localID}` : null })) })),
  })),
};
fs.writeFileSync(path.join(__dirname, 'design-tokens.json'), JSON.stringify(tokens, null, 2) + '\n');
console.log('Generated shared tokens from 73 decoded semantic variables.');
