const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

function readFile(file) { return fs.readFileSync(path.join(__dirname, '..', file), 'utf8'); }

const html = readFile('index.html').replace(/<script src="[^"]+"><\/script>/g, '');
const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/' });
const { window } = dom;

window.URL.createObjectURL = () => 'blob:fake';
window.URL.revokeObjectURL = () => {};
window.navigator.clipboard = { writeText: async () => {} };
window.requestAnimationFrame = () => 0;

let errors = [];
window.addEventListener('error', (e) => errors.push(e.error || e.message));

const combined = [readFile('components.js'), readFile('engine.js'), readFile('app.js')].join('\n;\n');
try { window.eval(combined); } catch (e) { errors.push(e); }

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name); }
}

check('No script errors during boot', errors.length === 0);
if (errors.length) console.log(errors);

const doc = window.document;

// ---- Palette completeness ----
check('Palette has all category headers', doc.querySelectorAll('.cat-header').length === window.CATEGORIES.length);
const totalPaletteItems = Object.values(window.PALETTE_ORDER).reduce((s, a) => s + a.length, 0);
check('Palette has an item for every registered component', doc.querySelectorAll('.palette-item').length === totalPaletteItems);
check('Every COMPONENT_TYPES entry appears in PALETTE_ORDER', Object.keys(window.COMPONENT_TYPES).length === totalPaletteItems);

// ---- Palette price tags ----
const pricedItems = Array.from(doc.querySelectorAll('.palette-item .pprice')).filter((el) => el.textContent.trim() !== '' );
check('Palette shows a price tag for every item (priced or n/a)', pricedItems.length === totalPaletteItems);

// ---- Add every component type ----
let added = 0;
Object.keys(window.COMPONENT_TYPES).forEach((typeKey) => {
  try { window.addNodeFromPalette(typeKey); added++; }
  catch (e) { console.log('FAIL adding', typeKey, e.message); }
});
check('Every component type can be added without error', added === Object.keys(window.COMPONENT_TYPES).length);
check('DOM has a .node element for each added component', doc.querySelectorAll('.node').length === added);

// ---- Click-to-wire (the Mac-friendly two-click method) ----
const switchNode = Object.values(window.graph.nodes).find((n) => n.type === 'switch_');
const andNode = Object.values(window.graph.nodes).find((n) => n.type === 'andGate');
let wireOk = false;
try {
  window.handlePortClick(switchNode.id, 'out', 'out');
  window.handlePortClick(andNode.id, 'x', 'in');
  window.handlePortClick(switchNode.id, 'out', 'out');
  window.handlePortClick(andNode.id, 'y', 'in');
  wireOk = Object.values(window.graph.wires).filter((w) => w.to.node === andNode.id).length === 2;
} catch (e) { console.log(e); }
check('Click-then-click wiring creates wires', wireOk);
switchNode.state.on = true;
for (let i = 0; i < 5; i++) window.graph.tick(0.05);
check('Wired AND gate produces correct live output', andNode.outputs.out === 10);

// ---- Equation display on gate nodes ----
try {
  const gtNode = Object.values(window.graph.nodes).find((n) => n.type === 'greaterThanGate');
  const html = window.nodeEls[gtNode.id].el.innerHTML;
  check('Greater Than gate node shows its equation (Y > X)', html.includes('Y &gt; X') || html.includes('Y > X'));
} catch (e) {
  check('Greater Than gate node shows its equation (Y > X)', false);
  console.log(e);
}

// ---- Removed components absent from palette ----
check('Joystick is not in the palette', !doc.querySelector('.palette-item[data-type="joystick"]'));
check('Conveyors are not in the palette', !doc.querySelector('.palette-item[data-type="fourWayConveyor"]'));

// ---- Wire anchor (waypoint) ----
const firstWire = Object.values(window.graph.wires)[0];
try {
  window.addAnchorNearest(firstWire, 250, 80);
  check('Wire anchor can be added', firstWire.anchors.length === 1);
} catch (e) {
  check('Wire anchor can be added', false);
  console.log(e);
}

// ---- Multi-select / marquee logic / duplicate ----
try {
  const ids = Object.keys(window.graph.nodes).slice(0, 3);
  window.clearMultiSelect();
  ids.forEach((id) => window.toggleMultiSelect(id));
  check('Multi-select tracks 3 nodes', window.multiSelected.size === 3);
  const beforeCount = Object.keys(window.graph.nodes).length;
  window.duplicateSelection();
  check('Duplicate adds new nodes for each selected', Object.keys(window.graph.nodes).length === beforeCount + 3);
  check('Duplicate selects the new clones', window.multiSelected.size === 3);
} catch (e) {
  check('Multi-select + duplicate works', false);
  console.log(e);
}

// ---- Right-click delete (node + wire) ----
try {
  const beforeNodes = Object.keys(window.graph.nodes).length;
  const victim = Object.values(window.graph.nodes).find((n) => n.type === 'notGate');
  const el = window.nodeEls[victim.id].el;
  const evt = new window.MouseEvent('contextmenu', { bubbles: true, cancelable: true });
  el.dispatchEvent(evt);
  check('Right-click deletes a node', Object.keys(window.graph.nodes).length === beforeNodes - 1);
} catch (e) {
  check('Right-click deletes a node', false);
  console.log(e);
}

// ---- Inspector rendering ----
try {
  window.selectThing('node', andNode.id);
  check('Inspector renders for a node', doc.getElementById('inspector').innerHTML.includes('AND Gate'));
  check('Inspector shows price info', doc.getElementById('inspector').innerHTML.includes('170') || doc.getElementById('inspector').innerHTML.includes("Alan's"));
  const wireId = Object.keys(window.graph.wires)[0];
  window.selectThing('wire', wireId);
  check('Inspector renders for a wire', doc.getElementById('inspector').innerHTML.includes('Wire'));
  window.deselect();
} catch (e) {
  check('Inspector rendering works', false);
  console.log(e);
}

// ---- Cost summary ----
try {
  window.openCostModal();
  const body = doc.getElementById('costBody').innerHTML;
  const total = doc.getElementById('costTotal').textContent;
  check('Cost modal populates rows', body.length > 0);
  check('Cost modal shows a $ total', total.includes('$'));
} catch (e) {
  check('Cost summary works', false);
  console.log(e);
}

// ---- Export / Import round trip (human-readable) ----
try {
  const exportObj = window.buildExportObject();
  const text = JSON.stringify(exportObj, null, 2);
  check('Export JSON is indented (human-readable)', text.includes('\n  "nodes"') || text.includes('\n  "_format"'));
  check('Export JSON has human-readable component names', exportObj.nodes.every((n) => typeof n.name === 'string' && n.name.length > 0));
  check('Export JSON preserves wire anchors', exportObj.wires.some((w) => Array.isArray(w.anchors)));
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

// ---- Wire priority badge after import ----
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

// ---- Port hover tooltip text ----
try {
  const g = window.graph;
  Object.keys(g.nodes).forEach((id) => window.deleteNode(id));
  const mem = g.addNode('memoryCell', 0, 0);
  window.renderNode(mem);
  const portEl = window.nodeEls[mem.id].portEls['data'];
  const evt = new window.MouseEvent('mouseenter', { bubbles: true });
  portEl.dispatchEvent(evt);
  const tooltipText = doc.getElementById('tooltip').innerHTML;
  check('Hovering a port shows a specific description, not just the label', tooltipText.toLowerCase().includes('stor') || tooltipText.toLowerCase().includes('captur'));
} catch (e) {
  check('Port hover tooltip works', false);
  console.log(e);
}

// ---- Credits present ----
try {
  const bodyHtml = doc.body.innerHTML;
  check('Glazix credit appears on the page', bodyHtml.includes('Glazix'));
  check('Discord contact appears on the page', bodyHtml.includes('_glazix'));
} catch (e) {
  check('Credits present', false);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
