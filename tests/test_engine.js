const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'http://localhost/' });
const { window } = dom;

function readFile(file) { return fs.readFileSync(path.join(__dirname, '..', file), 'utf8'); }

const combined = [
  readFile('components.js'),
  readFile('engine.js'),
  'window.COMPONENT_TYPES = COMPONENT_TYPES; window.CATEGORIES = CATEGORIES; window.PALETTE_ORDER = PALETTE_ORDER; window.Graph = Graph;',
].join('\n;\n');
dom.window.eval(combined);

const Graph = window.Graph;
const COMPONENT_TYPES = window.COMPONENT_TYPES;

function approxEqual(a, b, eps = 1e-6) { return Math.abs(a - b) < eps; }

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name); }
}

// ---- Test 1: AND gate ----
{
  const g = new Graph();
  const sw1 = g.addNode('switch_', 0, 0);
  const sw2 = g.addNode('switch_', 0, 100);
  const and = g.addNode('andGate', 200, 0);
  g.addWire(sw1.id, 'out', and.id, 'in1');
  g.addWire(sw2.id, 'out', and.id, 'in2');
  // both off
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('AND gate: both off -> 0', and.outputs.out === 0);
  sw1.state.on = true; sw2.state.on = true;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('AND gate: both on -> 10', and.outputs.out === 10);
  sw2.state.on = false;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('AND gate: one on -> 0', and.outputs.out === 0);
}

// ---- Test 2: OR gate ----
{
  const g = new Graph();
  const sw1 = g.addNode('switch_', 0, 0);
  const sw2 = g.addNode('switch_', 0, 100);
  const or = g.addNode('orGate', 200, 0);
  g.addWire(sw1.id, 'out', or.id, 'in1');
  g.addWire(sw2.id, 'out', or.id, 'in2');
  sw1.state.on = true;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('OR gate: one on -> 10', or.outputs.out === 10);
}

// ---- Test 3: XOR gate ----
{
  const g = new Graph();
  const sw1 = g.addNode('switch_', 0, 0);
  const sw2 = g.addNode('switch_', 0, 100);
  const xor = g.addNode('xorGate', 200, 0);
  g.addWire(sw1.id, 'out', xor.id, 'in1');
  g.addWire(sw2.id, 'out', xor.id, 'in2');
  sw1.state.on = true; sw2.state.on = true;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('XOR gate: both on -> 0', xor.outputs.out === 0);
  sw2.state.on = false;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('XOR gate: one on -> 10', xor.outputs.out === 10);
}

// ---- Test 4: NOT gate ----
{
  const g = new Graph();
  const sw1 = g.addNode('switch_', 0, 0);
  const not = g.addNode('notGate', 200, 0);
  g.addWire(sw1.id, 'out', not.id, 'in');
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('NOT gate: off -> 10', not.outputs.out === 10);
  sw1.state.on = true;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('NOT gate: on -> 0', not.outputs.out === 0);
}

// ---- Test 5: XAND (XNOR) gate ----
{
  const g = new Graph();
  const sw1 = g.addNode('switch_', 0, 0);
  const sw2 = g.addNode('switch_', 0, 100);
  const xand = g.addNode('xandGate', 200, 0);
  g.addWire(sw1.id, 'out', xand.id, 'in1');
  g.addWire(sw2.id, 'out', xand.id, 'in2');
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('XAND gate: both 0 -> 10', xand.outputs.out === 10);
  sw1.state.on = true;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('XAND gate: unequal -> 0', xand.outputs.out === 0);
  sw2.state.on = true;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('XAND gate: equal nonzero -> that value', xand.outputs.out === 10);
}

// ---- Test 6: Wire priority (multiple wires into one input) ----
{
  const g = new Graph();
  const sw1 = g.addNode('numberInterface', 0, 0); sw1.state.value = 3;
  const sw2 = g.addNode('numberInterface', 0, 100); sw2.state.value = 7;
  const tether = g.addNode('tether', 200, 0);
  const w1 = g.addWire(sw1.id, 'out', tether.id, 'in');
  const w2 = g.addWire(sw2.id, 'out', tether.id, 'in');
  for (let i = 0; i < 3; i++) g.tick(0.05);
  // newest wire (w2) should be top priority by default
  check('Priority: newest wire wins by default', tether.outputs.out === 7);
  check('Priority list has 2 entries', tether.inputPriority['in'].length === 2);
  // reorder: move w1 to top
  const arr = tether.inputPriority['in'];
  const idx1 = arr.indexOf(w1.id);
  arr.splice(idx1, 1); arr.unshift(w1.id);
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('Priority: after reorder, w1 wins', tether.outputs.out === 3);
  // remove top wire, should fall back to remaining wire
  g.removeWire(w1.id);
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('Priority: after removing top wire, falls back', tether.outputs.out === 7);
}

// ---- Test 7: Sustainer holds signal ----
{
  const g = new Graph();
  const btn = g.addNode('button', 0, 0);
  const sus = g.addNode('sustainer', 200, 0);
  sus.params.duration = 0.2;
  g.addWire(btn.id, 'out', sus.id, 'in');
  btn.state.pressed = true;
  g.tick(0.05);
  btn.state.pressed = false;
  g.tick(0.05); // input now 0, but sustainer should still output 10
  check('Sustainer: holds after input drops', sus.outputs.out === 10);
  for (let i = 0; i < 10; i++) g.tick(0.05); // advance past duration
  check('Sustainer: releases after duration', sus.outputs.out === 0);
}

// ---- Test 8: Relay ----
{
  const g = new Graph();
  const sig = g.addNode('numberInterface', 0, 0); sig.state.value = 5;
  const act = g.addNode('switch_', 0, 100);
  const relay = g.addNode('relay', 200, 0);
  g.addWire(sig.id, 'out', relay.id, 'signal');
  g.addWire(act.id, 'out', relay.id, 'activate');
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('Relay: inactive -> 0', relay.outputs.out === 0);
  act.state.on = true;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('Relay: active -> passes signal', relay.outputs.out === 5);
}

// ---- Test 9: Calculator (no negative, no div by zero) ----
{
  const g = new Graph();
  const a = g.addNode('numberInterface', 0, 0); a.state.value = 3;
  const b = g.addNode('numberInterface', 0, 100); b.state.value = 5;
  const calc = g.addNode('calculator', 200, 0);
  calc.state.value = 'sub'; // 3 - 5 = -2 -> should output 0 (no negative signals)
  g.addWire(a.id, 'out', calc.id, 'in1');
  g.addWire(b.id, 'out', calc.id, 'in2');
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('Calculator: negative result -> 0', calc.outputs.out === 0);
  calc.state.value = 'add';
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('Calculator: 3+5=8', calc.outputs.out === 8);
  calc.state.value = 'div'; b.state.value = 0;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('Calculator: div by zero -> 0', calc.outputs.out === 0);
}

// ---- Test 10: Memory Cell ----
{
  const g = new Graph();
  const data = g.addNode('numberInterface', 0, 0); data.state.value = 42;
  const write = g.addNode('button', 0, 100);
  const mem = g.addNode('memoryCell', 200, 0);
  g.addWire(data.id, 'out', mem.id, 'data');
  g.addWire(write.id, 'out', mem.id, 'write');
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('MemoryCell: starts at 0', mem.outputs.out === 0);
  write.state.pressed = true;
  g.tick(0.05);
  write.state.pressed = false;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('MemoryCell: stores 42 on write', mem.outputs.out === 42);
  data.state.value = 99; // changing data after write should NOT change stored value
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('MemoryCell: holds value after data changes', mem.outputs.out === 42);
}

// ---- Test 11: Serialize / Deserialize round trip ----
{
  const g = new Graph();
  const sw1 = g.addNode('switch_', 10, 20);
  const and = g.addNode('andGate', 200, 20);
  const w = g.addWire(sw1.id, 'out', and.id, 'in1');
  sw1.state.on = true;
  const json = g.toJSON();
  const g2 = Graph.fromJSON(json);
  check('Round-trip: node count matches', Object.keys(g2.nodes).length === 2);
  check('Round-trip: wire count matches', Object.keys(g2.wires).length === 1);
  const sw1b = Object.values(g2.nodes).find((n) => n.type === 'switch_');
  check('Round-trip: control state preserved', sw1b.state.on === true);
}

// ---- Test 12: Binary Input/Output ----
{
  const g = new Graph();
  const bin = g.addNode('binaryInput', 0, 0);
  bin.state.bits = [1, 0, 1, 0, 0, 0, 0, 0]; // bits 0 and 2 set -> 1+4=5
  const out = g.addNode('binaryOutput', 200, 0);
  g.addWire(bin.id, 'out', out.id, 'in');
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('BinaryInput: bits -> decimal 5', bin.outputs.out === 5);
  check('BinaryOutput: decimal 5 -> bits [1,0,1,0,0,0,0,0]', JSON.stringify(out.display.bits) === JSON.stringify([1,0,1,0,0,0,0,0]));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
