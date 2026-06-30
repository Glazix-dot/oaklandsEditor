const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', { runScripts: 'outside-only', url: 'http://localhost/' });
const w = dom.window;

function readFile(f) { return fs.readFileSync(path.join(__dirname, '..', f), 'utf8'); }
w.eval([readFile('components.js'), readFile('engine.js')].join('\n;\n'));

const Graph = w.Graph;
const COMPONENT_TYPES = w.COMPONENT_TYPES;

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log('PASS:', name); }
  else { fail++; console.log('FAIL:', name); }
}

// ---- AND Gate ----
{
  const g = new Graph();
  const n1 = g.addNode('numberInterface', 0, 0); n1.state.value = 10;
  const n2 = g.addNode('numberInterface', 0, 100); n2.state.value = 10;
  const and = g.addNode('andGate', 200, 0);
  g.addWire(n1.id, 'out', and.id, 'in1');
  g.addWire(n2.id, 'out', and.id, 'in2');
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('AND gate: equal nonzero -> that value', and.outputs.out === 10);
  n2.state.value = 5;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('AND gate: unequal -> 0', and.outputs.out === 0);
  n1.state.value = 0; n2.state.value = 0;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('AND gate: both 0 -> 0', and.outputs.out === 0);
}

// ---- OR Gate ----
{
  const g = new Graph();
  const n1 = g.addNode('numberInterface', 0, 0); n1.state.value = 7;
  const n2 = g.addNode('numberInterface', 0, 100); n2.state.value = 3;
  const or = g.addNode('orGate', 200, 0);
  g.addWire(n1.id, 'out', or.id, 'in1');
  g.addWire(n2.id, 'out', or.id, 'in2');
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('OR gate: outputs highest (7)', or.outputs.out === 7);
}

// ---- NOT Gate ----
{
  const g = new Graph();
  const sw = g.addNode('switch_', 0, 0);
  const not = g.addNode('notGate', 200, 0);
  g.addWire(sw.id, 'out', not.id, 'in');
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('NOT: off -> 10', not.outputs.out === 10);
  sw.state.on = true;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('NOT: on -> 0', not.outputs.out === 0);
}

// ---- XOR Gate ----
{
  const g = new Graph();
  const s1 = g.addNode('switch_', 0, 0); s1.state.on = true;
  const s2 = g.addNode('switch_', 0, 100); s2.state.on = true;
  const xor = g.addNode('xorGate', 200, 0);
  g.addWire(s1.id, 'out', xor.id, 'in1');
  g.addWire(s2.id, 'out', xor.id, 'in2');
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('XOR: both on -> 0', xor.outputs.out === 0);
  s2.state.on = false;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('XOR: one on -> 10', xor.outputs.out === 10);
}

// ---- XAND Gate ----
{
  const g = new Graph();
  const n1 = g.addNode('numberInterface', 0, 0); n1.state.value = 0;
  const n2 = g.addNode('numberInterface', 0, 100); n2.state.value = 0;
  const xand = g.addNode('xandGate', 200, 0);
  g.addWire(n1.id, 'out', xand.id, 'in1');
  g.addWire(n2.id, 'out', xand.id, 'in2');
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('XAND: both 0 -> 10', xand.outputs.out === 10);
  n1.state.value = 10;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('XAND: unequal -> 0', xand.outputs.out === 0);
  n2.state.value = 10;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('XAND: equal nonzero -> that value', xand.outputs.out === 10);
}

// ---- Greater Than Gate ----
{
  const g = new Graph();
  const a = g.addNode('numberInterface', 0, 0); a.state.value = 8;
  const b = g.addNode('numberInterface', 0, 100); b.state.value = 3;
  const gt = g.addNode('greaterThanGate', 200, 0);
  g.addWire(a.id, 'out', gt.id, 'in1');
  g.addWire(b.id, 'out', gt.id, 'in2');
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('GreaterThan: A>B -> A value', gt.outputs.out === 8);
  a.state.value = 2;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('GreaterThan: A<B -> 0', gt.outputs.out === 0);
}

// ---- Binary Input (5-port, weighted) ----
{
  const g = new Graph();
  const sw16 = g.addNode('switch_', 0, 0); sw16.state.on = true;   // +16
  const sw4 = g.addNode('switch_', 0, 100); sw4.state.on = true;   // +4
  const bin = g.addNode('binaryInput', 200, 0);
  g.addWire(sw16.id, 'out', bin.id, 'b16');
  g.addWire(sw4.id, 'out', bin.id, 'b4');
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('BinaryInput: b16+b4 -> 20', bin.outputs.out === 20);
}

// ---- Binary Output (5-port) ----
{
  const g = new Graph();
  const n = g.addNode('numberInterface', 0, 0); n.state.value = 10; // 10 = 8+2 = b8+b2
  const out = g.addNode('binaryOutput', 200, 0);
  g.addWire(n.id, 'out', out.id, 'in');
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('BinaryOutput: 10 -> b2=10', out.outputs.b2 === 10);
  check('BinaryOutput: 10 -> b8=10', out.outputs.b8 === 10);
  check('BinaryOutput: 10 -> b1=0', out.outputs.b1 === 0);
  check('BinaryOutput: 10 -> b4=0', out.outputs.b4 === 0);
  check('BinaryOutput: 10 -> b16=0', out.outputs.b16 === 0);
}

// ---- Wire priority (execution order) ----
{
  const g = new Graph();
  const n3 = g.addNode('numberInterface', 0, 0); n3.state.value = 3;
  const n7 = g.addNode('numberInterface', 0, 100); n7.state.value = 7;
  const tet = g.addNode('tether', 200, 0);
  const w1 = g.addWire(n3.id, 'out', tet.id, 'in');
  const w2 = g.addWire(n7.id, 'out', tet.id, 'in');
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('Priority: newest wire (w2=7) wins by default', tet.outputs.out === 7);
  // Reorder: move w1 to front
  const arr = tet.inputPriority['in'];
  const idx = arr.indexOf(w1.id);
  arr.splice(idx, 1); arr.unshift(w1.id);
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('Priority: after reorder, w1 (3) wins', tet.outputs.out === 3);
}

// ---- Button 1-second pulse ----
{
  const g = new Graph();
  const btn = g.addNode('button', 0, 0);
  btn.state.pressed = true;
  g.tick(0.05); // first tick while pressed → starts 1s pulse
  btn.state.pressed = false;
  // Pulse should still be live 0.8s after the initial press
  for (let i = 0; i < 16; i++) g.tick(0.05); // 16*0.05 = 0.8s more → total 0.85s
  check('Button: pulse active 0.85s after press', btn.outputs.out === 10);
  for (let i = 0; i < 4; i++) g.tick(0.05); // 4*0.05 = 0.2s more → total 1.05s
  check('Button: pulse ends after 1 second', btn.outputs.out === 0);
}

// ---- Sustainer ----
{
  const g = new Graph();
  const sw = g.addNode('switch_', 0, 0);
  const sus = g.addNode('sustainer', 200, 0); sus.params.duration = 0.2;
  g.addWire(sw.id, 'out', sus.id, 'in');
  sw.state.on = true;
  for (let i = 0; i < 3; i++) g.tick(0.05); // 0.15s
  sw.state.on = false;
  g.tick(0.05); // 0.20s — input gone, sustainer should hold
  check('Sustainer: holds after input drops', sus.outputs.out === 10);
  for (let i = 0; i < 6; i++) g.tick(0.05); // 0.50s — well past 0.2s duration
  check('Sustainer: releases after duration', sus.outputs.out === 0);
}

// ---- Relay ----
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

// ---- Calculator (Exponentiation + negative suppression) ----
{
  const g = new Graph();
  const a = g.addNode('numberInterface', 0, 0); a.state.value = 3;
  const b = g.addNode('numberInterface', 0, 100); b.state.value = 2;
  const calc = g.addNode('calculator', 200, 0);
  g.addWire(a.id, 'out', calc.id, 'in1');
  g.addWire(b.id, 'out', calc.id, 'in2');
  calc.state.value = 'pow';
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('Calculator: 3^2=9', calc.outputs.out === 9);
  calc.state.value = 'sub'; b.state.value = 9;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('Calculator: negative result -> 0', calc.outputs.out === 0);
  calc.state.value = 'div'; b.state.value = 0;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('Calculator: div by zero -> 0', calc.outputs.out === 0);
}

// ---- Memory Cell (DATA/RESET, latch once) ----
{
  const g2 = new Graph();
  const src = g2.addNode('numberInterface', 0, 0); src.state.value = 0; // start LOW so first tick doesn't immediately latch
  const resetBtn = g2.addNode('switch_', 0, 200);
  const mem2 = g2.addNode('memoryCell', 300, 0);
  g2.addWire(src.id, 'out', mem2.id, 'data');
  g2.addWire(resetBtn.id, 'out', mem2.id, 'reset');
  for (let i = 0; i < 3; i++) g2.tick(0.05);
  check('MemoryCell: starts at 0', mem2.outputs.out === 0);
  // Now raise DATA — this is the rising edge that should capture it
  src.state.value = 42;
  for (let i = 0; i < 3; i++) g2.tick(0.05);
  check('MemoryCell: captures data on rising edge', mem2.outputs.out === 42);
  src.state.value = 99; // change source — should not update since hasValue=true
  for (let i = 0; i < 3; i++) g2.tick(0.05);
  check('MemoryCell: ignores further data once stored', mem2.outputs.out === 42);
  resetBtn.state.on = true; // RESET
  g2.tick(0.05);
  resetBtn.state.on = false;
  for (let i = 0; i < 3; i++) g2.tick(0.05);
  check('MemoryCell: RESET clears to 0', mem2.outputs.out === 0);
}

// ---- T-Flip Flop ----
{
  const g = new Graph();
  const sw = g.addNode('switch_', 0, 0);
  const ff = g.addNode('tFlipFlop', 200, 0);
  g.addWire(sw.id, 'out', ff.id, 'in');
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('T-FF: starts off', ff.outputs.out === 0);
  sw.state.on = true;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('T-FF: toggles on rising edge', ff.outputs.out === 10);
  sw.state.on = false;
  for (let i = 0; i < 2; i++) g.tick(0.05);
  sw.state.on = true;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('T-FF: toggles again on second pulse', ff.outputs.out === 0);
}

// ---- Signal Lock ----
{
  const g = new Graph();
  const data = g.addNode('numberInterface', 0, 0); data.state.value = 7;
  const en = g.addNode('switch_', 0, 100);
  const sl = g.addNode('signalLock', 200, 0);
  g.addWire(data.id, 'out', sl.id, 'data');
  g.addWire(en.id, 'out', sl.id, 'enable');
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('SignalLock: disabled -> 0', sl.outputs.out === 0);
  en.state.on = true;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('SignalLock: enabled -> passes data', sl.outputs.out === 7);
  data.state.value = 0; // drop data, enable still active
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('SignalLock: latches last value when data drops', sl.outputs.out === 7);
  en.state.on = false;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('SignalLock: 0 when disabled', sl.outputs.out === 0);
}

// ---- Incrementor ----
{
  const g = new Graph();
  const addBtn = g.addNode('switch_', 0, 0);
  const rstBtn = g.addNode('switch_', 0, 100);
  const inc = g.addNode('incrementor', 200, 0);
  g.addWire(addBtn.id, 'out', inc.id, 'add');
  g.addWire(rstBtn.id, 'out', inc.id, 'reset');
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('Incrementor: starts at 0', inc.outputs.out === 0);
  addBtn.state.on = true;
  g.tick(0.05); addBtn.state.on = false;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('Incrementor: +10 adds 1', inc.outputs.out === 1);
  addBtn.state.on = true;
  g.tick(0.05); addBtn.state.on = false;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('Incrementor: second +10 gives 2', inc.outputs.out === 2);
  rstBtn.state.on = true;
  g.tick(0.05); rstBtn.state.on = false;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('Incrementor: RESET -> 0', inc.outputs.out === 0);
}

// ---- Randomizer ----
{
  const g = new Graph();
  const n = g.addNode('numberInterface', 0, 0); n.state.value = 10;
  const rnd = g.addNode('randomizer', 200, 0);
  g.addWire(n.id, 'out', rnd.id, 'in');
  // Start from zero, then give it a rising edge
  n.state.value = 0;
  for (let i = 0; i < 3; i++) g.tick(0.05);
  n.state.value = 10; // rising edge
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('Randomizer: value in [0, 10]', rnd.outputs.out >= 0 && rnd.outputs.out <= 10);
  const v1 = rnd.outputs.out;
  // Value should be stable while input stays high
  for (let i = 0; i < 10; i++) g.tick(0.05);
  check('Randomizer: value stable while input held', rnd.outputs.out === v1);
}

// ---- Wireless Transmitter/Receiver ----
{
  const g = new Graph();
  const n = g.addNode('numberInterface', 0, 0); n.state.value = 6;
  const tx = g.addNode('wirelessTransmitter', 200, 0); tx.params.keyphrase = 'test1';
  const rx = g.addNode('wirelessReceiver', 400, 0); rx.params.keyphrase = 'test1';
  g.addWire(n.id, 'out', tx.id, 'in');
  for (let i = 0; i < 3; i++) g.tick(0.05);
  check('Wireless: receiver picks up transmitter value', rx.outputs.out === 6);
}

// ---- JSON round-trip (anchors, seq) ----
{
  const g = new Graph();
  const sw = g.addNode('switch_', 0, 0); sw.state.on = true;
  const not = g.addNode('notGate', 200, 0);
  const w = g.addWire(sw.id, 'out', not.id, 'in', '#ff0000');
  w.anchors = [{ x: 100, y: 50 }];
  const json = g.toJSON();
  const g2 = Graph.fromJSON(json);
  const w2 = Object.values(g2.wires)[0];
  check('Round-trip: anchor preserved', w2.anchors && w2.anchors.length === 1 && w2.anchors[0].x === 100);
  check('Round-trip: wire color preserved', w2.color === '#ff0000');
  check('Round-trip: switch state preserved', Object.values(g2.nodes).find(n => n.type === 'switch_').state.on === true);
}

// ---- Price list completeness ----
{
  const missing = Object.entries(COMPONENT_TYPES).filter(([k, v]) => v.price === undefined);
  check('All components have a price field (null is OK, undefined means missing)', missing.length === 0);
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail > 0 ? 1 : 0);
