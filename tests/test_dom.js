const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function readFile(file) { return fs.readFileSync(path.join(__dirname, '..', file), 'utf8'); }

const html = readFile('index.html').replace(/<script src="[^"]+"><\/script>/g, '');
const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/' });
const { window } = dom;

// jsdom doesn't implement these — stub them so app.js doesn't throw on boot.
window.URL.createObjectURL = () => 'blob:fake';
window.URL.revokeObjectURL = () => {};
window.navigator.clipboard = { writeText: async () => {} };
window.requestAnimationFrame = () => 0; // prevent the render loop from spinning forever in this test

let errors = [];
window.addEventListener('error', (e) => errors.push(e.error || e.message));

const combined = [readFile('components.js'), readFile('engine.js'), readFile('app.js')].join('\n;\n');
try {
  window.eval(combined);
} catch (e) {
  errors.push(e);
}

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name); }
}

check('No script errors during boot', errors.length === 0);
if (errors.length) console.log(errors);

const doc = window.document;

// Palette built with every category
check('Palette has all category headers', doc.querySelectorAll('.cat-header').length === window.CATEGORIES.length);
const totalPaletteItems = Object.values(window.PALETTE_ORDER).reduce((s, a) => s + a.length, 0);
check('Palette has an item for every registered component', doc.querySelectorAll('.palette-item').length === totalPaletteItems);
check('Every COMPONENT_TYPES entry appears in PALETTE_ORDER', Object.keys(window.COMPONENT_TYPES).length === totalPaletteItems);

// Add one of every component type via the real palette-click path, verify it renders without throwing
let added = 0;
Object.keys(window.COMPONENT_TYPES).forEach((typeKey) => {
  try {
    window.addNodeFromPalette(typeKey);
    added++;
  } catch (e) {
    console.log('FAIL adding', typeKey, e.message);
  }
});
check('Every component type can be added without error', added === Object.keys(window.COMPONENT_TYPES).length);
check('DOM has a .node element for each added component', doc.querySelectorAll('.node').length === added);

// Wire two of them together via the real engine API (UI drag-drop isn't simulated here, engine already unit-tested)
const ids = Object.keys(window.graph.nodes);
const switchNode = Object.values(window.graph.nodes).find((n) => n.type === 'switch_');
const andNode = Object.values(window.graph.nodes).find((n) => n.type === 'andGate');
if (switchNode && andNode) {
  window.graph.addWire(switchNode.id, 'out', andNode.id, 'in1');
  window.graph.addWire(switchNode.id, 'out', andNode.id, 'in2');
  switchNode.state.on = true;
  for (let i = 0; i < 5; i++) window.graph.tick(0.05);
  check('Wired AND gate produces correct live output', andNode.outputs.out === 10);
}

// Run the actual render functions used by the live loop
try {
  window.renderAllWires();
  window.refreshPortBadges();
  Object.values(window.graph.nodes).forEach((n) => window.nodeEls[n.id] && window.nodeEls[n.id].dyn.update());
  check('renderAllWires / refreshPortBadges / dyn.update run without throwing', true);
} catch (e) {
  check('renderAllWires / refreshPortBadges / dyn.update run without throwing', false);
  console.log(e);
}

// Inspector rendering for a node and a wire
try {
  window.selectThing('node', andNode.id);
  check('Inspector renders for a node', doc.getElementById('inspector').innerHTML.includes('AND Gate'));
  const wireId = Object.keys(window.graph.wires)[0];
  window.selectThing('wire', wireId);
  check('Inspector renders for a wire', doc.getElementById('inspector').innerHTML.includes('Wire'));
  window.deselect();
} catch (e) {
  check('Inspector rendering works', false);
  console.log(e);
}

// Export -> human readable JSON -> Import round trip through the real UI functions
try {
  const exportObj = window.buildExportObject();
  const text = JSON.stringify(exportObj, null, 2);
  check('Export JSON is valid and pretty-printed (indented)', text.includes('\n  "nodes"') || text.includes('\n  "_format"'));
  check('Export JSON has human-readable component names', exportObj.nodes.every((n) => typeof n.name === 'string' && n.name.length > 0));
  const beforeNodeCount = Object.keys(window.graph.nodes).length;
  const beforeWireCount = Object.keys(window.graph.wires).length;
  window.importFromObject(JSON.parse(text));
  check('Import restores same node count', Object.keys(window.graph.nodes).length === beforeNodeCount);
  check('Import restores same wire count', Object.keys(window.graph.wires).length === beforeWireCount);
  check('Import restores DOM nodes', doc.querySelectorAll('.node').length === beforeNodeCount);
} catch (e) {
  check('Export/Import round trip works', false);
  console.log(e);
}

// Wire priority badge appears for multi-wire ports after import
try {
  const g = window.graph;
  Object.keys(g.nodes).forEach((id) => window.deleteNode(id));
  const n1 = g.addNode('numberInterface', 0, 0);
  const n2 = g.addNode('numberInterface', 0, 100);
  const t = g.addNode('tether', 300, 0);
  window.renderNode(n1); window.renderNode(n2); window.renderNode(t);
  g.addWire(n1.id, 'out', t.id, 'in');
  g.addWire(n2.id, 'out', t.id, 'in');
  window.refreshPortBadges();
  const badge = window.nodeEls[t.id].portEls['in_badge'];
  check('Priority badge shows count 2 for double-wired input', badge.style.display === 'flex' && badge.textContent === '2');
} catch (e) {
  check('Priority badge logic works', false);
  console.log(e);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
