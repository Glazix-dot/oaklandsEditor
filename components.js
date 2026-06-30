/* =========================================================================
   OAKLANDS LOGIC EDITOR — COMPONENT REGISTRY
   =========================================================================
   Every component sold at Alan's AutoLogistics is defined here: its ports
   (inputs/outputs), price, configurable parameters, the on-node control
   widget (button/slider/dropdown/etc), and its simulation step() function.

   Prices and behaviors are based on the in-game item descriptions. Each
   component has a `note` (shown in its info tooltip) explaining exactly
   how it works, and flagging anywhere this tool has to approximate
   something that can't be represented in a 2D web simulator (e.g. physical
   laser hit-detection, Roblox image rendering, security camera feeds).
   ========================================================================= */

// Where every component on this page is actually bought in-game.
const SHOP_INFO = {
  name: "Alan's AutoLogistics",
  location: 'Finlay Island, near the entrance to the Acid Wastes',
};

const PORT_W = 14; // visual port square size

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------
// CATEGORIES (palette sections)
// ---------------------------------------------------------------------
const CATEGORIES = [
  { id: 'inputs', label: 'Inputs & Sensors' },
  { id: 'gates', label: 'Logic Gates' },
  { id: 'processors', label: 'Processors' },
  { id: 'structures', label: 'Structures (Outputs)' },
  { id: 'other', label: 'Other Devices' },
];

function ports(...defs) {
  return defs.map((d) => ({ id: d[0], label: d[1], dir: d[2] }));
}

// =========================================================================
// COMPONENT TYPES
// =========================================================================
const COMPONENT_TYPES = {

  // ----------------------------------------------------------------- INPUTS
  button: {
    name: 'Button', category: 'inputs', color: '#d9534f', w: 120, h: 80, price: 140,
    note: 'Activates an output of 10.0 for exactly 1 second when pressed — the pulse runs its full second even if you release early.',
    ports: ports(['out', 'OUT', 'out']),
    control: { type: 'momentary', label: 'PRESS' },
    init: () => ({ pressed: false, wasPressed: false, pulseUntil: 0 }),
    step(state, ins, params, t) {
      if (state.pressed && !state.wasPressed) state.pulseUntil = t + 1.0;
      state.wasPressed = state.pressed;
      return { out: t < state.pulseUntil ? 10 : 0 };
    },
  },

  switch_: {
    name: 'Switch', category: 'inputs', color: '#d9534f', w: 110, h: 80, price: 140,
    note: 'Toggles between an output of 0.0 and 10.0.',
    ports: ports(['out', 'OUT', 'out']),
    control: { type: 'toggle', label: 'ON/OFF' },
    init: () => ({ on: false }),
    step(state) { return { out: state.on ? 10 : 0 }; },
  },

  pressurePad: {
    name: 'Pressure Pad', category: 'inputs', color: '#d9534f', w: 130, h: 80, price: 200,
    note: 'Activates an output of 10.0 while a player or object is standing on it, 0 once they step off.',
    ports: ports(['out', 'OUT', 'out']),
    control: { type: 'momentary', label: 'STEP ON' },
    init: () => ({ pressed: false }),
    step(state) { return { out: state.pressed ? 10 : 0 }; },
  },

  slider: {
    name: 'Slider', category: 'inputs', color: '#d9534f', w: 150, h: 90, price: 220,
    note: 'Outputs a signal from 0.0\u201310.0 depending on the slider\u2019s position.',
    ports: ports(['out', 'OUT', 'out']),
    control: { type: 'slider', min: 0, max: 10, step: 0.1 },
    init: () => ({ value: 0 }),
    step(state) { return { out: state.value }; },
  },

  lock: {
    name: 'Lock', category: 'inputs', color: '#d9534f', w: 140, h: 90, price: 430,
    note: 'A structure that comes with a key: outputs 10.0 when the lock is turned. The signal can stay activated even if the key is removed while it\u2019s turned.',
    ports: ports(['out', 'OUT', 'out']),
    control: { type: 'toggle', label: 'TURN KEY' },
    init: () => ({ on: false }),
    step(state) { return { out: state.on ? 10 : 0 }; },
  },

  daylightSensor: {
    name: 'Daylight Sensor', category: 'inputs', color: '#d9534f', w: 160, h: 100, price: 320,
    note: 'Outputs a number from 0 up to (but not including) 24, matching the current in-game time of day.',
    ports: ports(['out', 'OUT', 'out']),
    control: { type: 'slider', min: 0, max: 23.99, step: 0.1, label: 'Time of day (h)' },
    init: () => ({ value: 12 }),
    step(state) { return { out: Math.round(state.value * 100) / 100 }; },
  },

  proximitySensor: {
    name: 'Proximity Sensor', category: 'inputs', color: '#d9534f', w: 170, h: 100, price: 600,
    note: 'Outputs a signal if a player is within 15 studs: 10.0 for the property owner, 5.0 for a trusted player, 1.0 for an untrusted player.',
    ports: ports(['out', 'OUT', 'out']),
    control: {
      type: 'select', label: 'Nearby player',
      options: [['none', 'Nobody nearby (0)'], ['owner', 'Owner (10)'], ['trusted', 'Trusted (5)'], ['untrusted', 'Untrusted (1)']],
    },
    init: () => ({ value: 'none' }),
    step(state) {
      const map = { none: 0, owner: 10, trusted: 5, untrusted: 1 };
      return { out: map[state.value] ?? 0 };
    },
  },

  weatherSensor: {
    name: 'Weather Sensor', category: 'inputs', color: '#d9534f', w: 170, h: 100, price: 350,
    note: 'Outputs a signal from 1\u20136: 1 sunny, 2 cloudy, 3 rain, 4 thunderstorm, 5 aurora borealis, 6 for the rare falling star event.',
    ports: ports(['out', 'OUT', 'out']),
    control: {
      type: 'select', label: 'Weather',
      options: [['1', 'Sunny (1)'], ['2', 'Cloudy (2)'], ['3', 'Rain (3)'], ['4', 'Thunderstorm (4)'], ['5', 'Aurora Borealis (5)'], ['6', 'Falling Star (6)']],
    },
    init: () => ({ value: '1' }),
    step(state) { return { out: parseInt(state.value, 10) || 1 }; },
  },

  commander: {
    name: 'Commander', category: 'inputs', color: '#d9534f', w: 180, h: 120, price: 735,
    note: 'Also called the Chat Commander: activates when the assigned phrase appears anywhere in a chat message. Outputs 10.0 if the owner said it, 1.0 if another player said it. A momentary pulse, returning to 0 about 0.5s later.',
    ports: ports(['out', 'OUT', 'out']),
    params: [{ key: 'phrase', label: 'Phrase', type: 'text', default: 'open' }],
    control: { type: 'commanderTrigger' },
    init: () => ({ pulseUntil: 0, pulseValue: 0 }),
    step(state, ins, params, t) {
      return { out: t < state.pulseUntil ? state.pulseValue : 0 };
    },
  },

  // ------------------------------------------------------------ LOGIC GATES
  andGate: {
    name: 'AND Gate', category: 'gates', color: '#5bc0de', w: 130, h: 100, price: 170,
    note: 'Activates an output equal to X (= Y) when both inputs are greater than 0.0 and equal to each other.',
    equation: 'X = Y',
    ports: ports(['x', 'X', 'in'], ['y', 'Y', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) {
      const { x = 0, y = 0 } = ins;
      return { out: (x === y && x > 0) ? x : 0 };
    },
  },

  notGate: {
    name: 'NOT Gate', category: 'gates', color: '#5bc0de', w: 120, h: 90, price: 120,
    note: 'Activates an output of 0.0 when the input is greater than 0.0; otherwise outputs 10.0.',
    equation: 'NOT X',
    ports: ports(['x', 'X', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) { return { out: (ins.x || 0) > 0 ? 0 : 10 }; },
  },

  orGate: {
    name: 'OR Gate', category: 'gates', color: '#5bc0de', w: 130, h: 100, price: 170,
    note: 'Activates the highest value of the two inputs.',
    equation: 'max(X, Y)',
    ports: ports(['x', 'X', 'in'], ['y', 'Y', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) {
      const { x = 0, y = 0 } = ins;
      return { out: Math.max(x, y) };
    },
  },

  xorGate: {
    name: 'XOR Gate', category: 'gates', color: '#5bc0de', w: 130, h: 100, price: 170,
    note: 'Outputs 10.0 when exactly one of the two inputs is active (greater than 0), matching a standard binary XOR truth table.',
    equation: 'X \u2295 Y',
    ports: ports(['x', 'X', 'in'], ['y', 'Y', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) {
      const a = (ins.x || 0) > 0, b = (ins.y || 0) > 0;
      return { out: (a !== b) ? 10 : 0 };
    },
  },

  xandGate: {
    name: 'XAND Gate', category: 'gates', color: '#5bc0de', w: 130, h: 100, price: 170,
    note: 'Similar to the AND Gate, but it also outputs 10.0 when both inputs are equal to 0.0 (an AND Gate + NOT Gate combined).',
    equation: 'X = Y',
    ports: ports(['x', 'X', 'in'], ['y', 'Y', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) {
      const { x = 0, y = 0 } = ins;
      if (x === y) return { out: x === 0 ? 10 : x };
      return { out: 0 };
    },
  },

  greaterThanGate: {
    name: 'Greater Than Gate', category: 'gates', color: '#5bc0de', w: 150, h: 100, price: 270,
    note: 'Outputs Y\u2019s value if Y is greater than X; otherwise outputs 0.',
    equation: 'Y > X',
    ports: ports(['y', 'Y', 'in'], ['x', 'X', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) {
      const { x = 0, y = 0 } = ins;
      return { out: y > x ? y : 0 };
    },
  },

  binaryInput: {
    name: 'Binary Input', category: 'gates', color: '#5bc0de', w: 190, h: 150, price: 290,
    note: 'Takes in up to 5 bits over 5 wired inputs (weights 16, 8, 4, 2, 1 left to right) and outputs their sum as a linear signal — e.g. activating the 16 and 4 inputs outputs 20.',
    ports: ports(['b16', '16', 'in'], ['b8', '8', 'in'], ['b4', '4', 'in'], ['b2', '2', 'in'], ['b1', '1', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) {
      const weights = { b16: 16, b8: 8, b4: 4, b2: 2, b1: 1 };
      let v = 0;
      Object.keys(weights).forEach((k) => { if ((ins[k] || 0) > 0) v += weights[k]; });
      return { out: v };
    },
  },

  binaryOutput: {
    name: 'Binary Output', category: 'gates', color: '#5bc0de', w: 190, h: 150, price: 290,
    note: 'Takes in a linear signal and outputs it as up to 5 bits (weights 1, 2, 4, 8, 16 left to right) — e.g. an input of 10 activates the 2 and 8 outputs.',
    ports: ports(['in', 'IN', 'in'], ['b1', '1', 'out'], ['b2', '2', 'out'], ['b4', '4', 'out'], ['b8', '8', 'out'], ['b16', '16', 'out']),
    step(state, ins) {
      const v = Math.max(0, Math.floor(ins.in || 0));
      const bitOf = (w) => ((v & w) > 0) ? 10 : 0;
      return { b1: bitOf(1), b2: bitOf(2), b4: bitOf(4), b8: bitOf(8), b16: bitOf(16) };
    },
  },

  // -------------------------------------------------------------- PROCESSORS
  calculator: {
    name: 'Calculator', category: 'processors', color: '#f0ad4e', w: 160, h: 120, price: 275,
    note: 'Applies math to the two inputs (left \u2218 right): Addition, Subtraction, Multiplication, Division, or Exponentiation. There are no negative signals — a negative result, or dividing by zero, emits nothing.',
    ports: ports(['in1', 'A', 'in'], ['in2', 'B', 'in'], ['out', 'OUT', 'out']),
    control: { type: 'select', label: 'Op', options: [['add', '+'], ['sub', '\u2212'], ['mul', '\u00d7'], ['div', '\u00f7'], ['pow', '^']] },
    init: () => ({ value: 'add' }),
    step(state, ins) {
      const a = ins.in1 || 0, b = ins.in2 || 0;
      let r;
      switch (state.value) {
        case 'add': r = a + b; break;
        case 'sub': r = a - b; break;
        case 'mul': r = a * b; break;
        case 'div': r = b === 0 ? NaN : a / b; break;
        case 'pow': r = Math.pow(a, b); break;
        default: r = 0;
      }
      if (!Number.isFinite(r) || r < 0) r = 0;
      return { out: Math.round(r * 1000) / 1000 };
    },
  },

  sustainer: {
    name: 'Sustainer', category: 'processors', color: '#f0ad4e', w: 150, h: 110, price: 260,
    note: 'Holds an input signal for the configured amount of time after it drops, then releases back to 0.',
    ports: ports(['in', 'IN', 'in'], ['out', 'OUT', 'out']),
    params: [{ key: 'duration', label: 'Sustain (s)', type: 'number', default: 2, min: 0, max: 180 }],
    init: () => ({ value: 0, releaseAt: 0 }),
    step(state, ins, params, t) {
      const input = ins.in || 0;
      if (input > 0) { state.value = input; state.releaseAt = t + params.duration; }
      return { out: (t < state.releaseAt) ? state.value : 0 };
    },
  },

  incrementor: {
    name: 'Incrementer', category: 'processors', color: '#f0ad4e', w: 160, h: 130, price: 275,
    note: 'The left ADD input increases the stored output value by (input \u00f7 10) every time it pulses, so a normal 10 signal adds exactly 1. The right RESET input clears it back to 0. If both fire on the same tick, whichever wire was connected first is processed first.',
    ports: ports(['add', 'ADD', 'in'], ['reset', 'RESET', 'in'], ['out', 'OUT', 'out']),
    init: () => ({ count: 0, wasAdd: false, wasReset: false }),
    step(state, ins, params, t, dt, globalState, portOrder) {
      const addActive = (ins.add || 0) > 0;
      const resetActive = (ins.reset || 0) > 0;
      const addEdge = addActive && !state.wasAdd;
      const resetEdge = resetActive && !state.wasReset;
      const order = (portOrder && portOrder.length) ? portOrder : ['add', 'reset'];
      order.forEach((portId) => {
        if (portId === 'reset' && resetEdge) { state.count = 0; }
        else if (portId === 'add' && addEdge) { state.count += (ins.add || 0) / 10; }
      });
      state.wasAdd = addActive;
      state.wasReset = resetActive;
      return { out: Math.round(state.count * 1000) / 1000 };
    },
  },

  relay: {
    name: 'Relay', category: 'processors', color: '#f0ad4e', w: 150, h: 100, price: 275,
    note: 'When the right (ACTIVATE) input is higher than 0.0, the output becomes the left (SIGNAL) input\u2019s value.',
    ports: ports(['signal', 'SIGNAL', 'in'], ['activate', 'ACTIVATE', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) {
      const sig = ins.signal || 0, act = ins.activate || 0;
      return { out: act > 0 ? sig : 0 };
    },
  },

  blocker: {
    name: 'Blocker', category: 'processors', color: '#f0ad4e', w: 150, h: 100, price: 300,
    note: 'When the right (BLOCK) input is 0.0, the left (SIGNAL) input is passed through to the output.',
    ports: ports(['signal', 'SIGNAL', 'in'], ['block', 'BLOCK', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) {
      const sig = ins.signal || 0, blk = ins.block || 0;
      return { out: blk > 0 ? 0 : sig };
    },
  },

  zeroTick: {
    name: 'Zero Tick', category: 'processors', color: '#f0ad4e', w: 150, h: 90, price: 87,
    note: 'Outputs the inputted signal for exactly 0.1 seconds every time it newly becomes active, then drops back to 0 — handy for breaking feedback loops.',
    ports: ports(['in', 'IN', 'in'], ['out', 'OUT', 'out']),
    init: () => ({ wasActive: false, pulseUntil: 0, pulseValue: 0 }),
    step(state, ins, params, t) {
      const v = ins.in || 0;
      const active = v > 0;
      if (active && !state.wasActive) { state.pulseUntil = t + 0.1; state.pulseValue = v; }
      state.wasActive = active;
      return { out: t < state.pulseUntil ? state.pulseValue : 0 };
    },
  },

  numberInterface: {
    name: 'Number Interface', category: 'processors', color: '#f0ad4e', w: 170, h: 110, price: 260,
    note: 'Lets you input large numbers directly, outputting that exact number as a constant signal — no inputs needed.',
    ports: ports(['out', 'OUT', 'out']),
    control: { type: 'number', min: -999999999999, max: 999999999999, step: 1 },
    init: () => ({ value: 10 }),
    step(state) { return { out: state.value }; },
  },

  delay: {
    name: 'Delay', category: 'processors', color: '#f0ad4e', w: 150, h: 110, price: 260,
    note: 'Outputs the input value again after the configured amount of time has passed.',
    ports: ports(['in', 'IN', 'in'], ['out', 'OUT', 'out']),
    params: [{ key: 'seconds', label: 'Delay (s)', type: 'number', default: 1, min: 0, max: 180 }],
    init: () => ({ queue: [], lastOut: 0 }),
    step(state, ins, params, t) {
      state.queue.push({ t: t + params.seconds, v: ins.in || 0 });
      while (state.queue.length && state.queue[0].t <= t) {
        state.lastOut = state.queue.shift().v;
      }
      return { out: state.lastOut };
    },
  },

  frequency: {
    name: 'Frequency', category: 'processors', color: '#f0ad4e', w: 160, h: 110, price: 260,
    note: 'Re-outputs whatever the input currently is, once every set interval of time — a periodic sampler/repeater (different from the free-running Hertz Clock).',
    ports: ports(['in', 'IN', 'in'], ['out', 'OUT', 'out']),
    params: [{ key: 'interval', label: 'Interval (s)', type: 'number', default: 1, min: 0.05, max: 180 }],
    init: () => ({ nextFire: 0, pulseUntil: 0, pulseValue: 0 }),
    step(state, ins, params, t, dt) {
      if (t >= state.nextFire) {
        state.pulseValue = ins.in || 0;
        state.pulseUntil = t + Math.max(dt, 0.05);
        state.nextFire = t + Math.max(0.05, params.interval);
      }
      return { out: t < state.pulseUntil ? state.pulseValue : 0 };
    },
  },

  hertzClock: {
    name: 'Hertz Clock', category: 'processors', color: '#f0ad4e', w: 170, h: 110, price: 260,
    note: 'Activates sequentially (alternates 0.0 / 10.0) at the configured frequency in Hertz — a free-running clock, no input needed.',
    ports: ports(['out', 'OUT', 'out']),
    params: [{ key: 'hz', label: 'Frequency (Hz)', type: 'number', default: 1, min: 0.05, max: 20, step: 0.05 }],
    init: () => ({}),
    step(state, ins, params, t) {
      const period = 1 / Math.max(0.001, params.hz);
      const phase = (t % period) / period;
      return { out: phase < 0.5 ? 10 : 0 };
    },
  },

  randomizer: {
    name: 'Randomizer', category: 'processors', color: '#f0ad4e', w: 150, h: 100, price: 260,
    note: 'Outputs a random whole number between 0 and the input value, every time the input changes to a new positive number.',
    ports: ports(['in', 'IN', 'in'], ['out', 'OUT', 'out']),
    init: () => ({ wasActive: false, value: 0 }),
    step(state, ins) {
      const v = ins.in || 0;
      const active = v > 0;
      if (active && !state.wasActive) {
        const maxInt = Math.max(0, Math.floor(v));
        state.value = Math.floor(Math.random() * (maxInt + 1));
      }
      state.wasActive = active;
      return { out: state.value };
    },
  },

  signalLock: {
    name: 'Signal Lock', category: 'processors', color: '#f0ad4e', w: 160, h: 110, price: 270,
    note: 'While the right (ENABLE) input is powered, the left (DATA) input is allowed to set the output. If DATA then drops to 0 while ENABLE stays active, the last value remains latched at the output.',
    ports: ports(['data', 'DATA', 'in'], ['enable', 'ENABLE', 'in'], ['out', 'OUT', 'out']),
    init: () => ({ stored: 0 }),
    step(state, ins) {
      const enabled = (ins.enable || 0) > 0;
      if (enabled && (ins.data || 0) > 0) state.stored = ins.data;
      return { out: enabled ? state.stored : 0 };
    },
  },

  tFlipFlop: {
    name: 'T-Flip Flop', category: 'processors', color: '#f0ad4e', w: 150, h: 100, price: 87,
    note: 'Toggles between an on (10.0) and off (0.0) output, similar to a Switch \u2014 but driven by logic: any input greater than 0.0 flips it.',
    ports: ports(['in', 'IN', 'in'], ['out', 'OUT', 'out']),
    init: () => ({ on: false, wasActive: false }),
    step(state, ins) {
      const active = (ins.in || 0) > 0;
      if (active && !state.wasActive) state.on = !state.on;
      state.wasActive = active;
      return { out: state.on ? 10 : 0 };
    },
  },

  numberSplitter: {
    name: 'Number Splitter', category: 'processors', color: '#f0ad4e', w: 190, h: 160, price: 290,
    note: 'An invention by Gustav: splits the input into single digits for each power of ten, with the 5th output catching any remainder beyond the first four digits.',
    ports: ports(['in', 'IN', 'in'], ['d1', 'ONES', 'out'], ['d2', 'TENS', 'out'], ['d3', 'HUNDREDS', 'out'], ['d4', 'THOUSANDS', 'out'], ['d5', 'EXCESS', 'out']),
    step(state, ins) {
      let v = Math.max(0, Math.floor(ins.in || 0));
      const d1 = v % 10; v = Math.floor(v / 10);
      const d2 = v % 10; v = Math.floor(v / 10);
      const d3 = v % 10; v = Math.floor(v / 10);
      const d4 = v % 10; v = Math.floor(v / 10);
      return { d1, d2, d3, d4, d5: v };
    },
  },

  numberCombiner: {
    name: 'Number Combiner', category: 'processors', color: '#f0ad4e', w: 190, h: 170, price: 290,
    note: 'Combines up to 5 inputs into one output, each multiplied by a power-of-ten factor by position: \u00d71, \u00d710, \u00d7100, \u00d71000, \u00d710000.',
    ports: ports(['in1', '\u00d71', 'in'], ['in2', '\u00d710', 'in'], ['in3', '\u00d7100', 'in'], ['in4', '\u00d71000', 'in'], ['in5', '\u00d710000', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) {
      const v = (ins.in1 || 0) * 1 + (ins.in2 || 0) * 10 + (ins.in3 || 0) * 100 + (ins.in4 || 0) * 1000 + (ins.in5 || 0) * 10000;
      return { out: v };
    },
  },

  // -------------------------------------------------------------- STRUCTURES
  privacyGlass: {
    name: 'Privacy Glass', category: 'structures', color: '#9b59b6', w: 140, h: 100, price: null,
    note: 'Becomes opaque (frosted) when the input is greater than 0. Also reflects the Red Laser up to 5 times when used together.',
    ports: ports(['in', 'IN', 'in']),
    step(state, ins) { return { _display: { opaque: (ins.in || 0) > 0 } }; },
  },

  lcd: {
    name: 'LCD', category: 'structures', color: '#9b59b6', w: 220, h: 110, price: 800,
    note: 'A resizable array of toggleable lights \u2014 beyond an input of 10.0 the lights cycle through rainbow colors. Approximated here as a 10-light bar graph (a true resizable 2D grid isn\u2019t practical in this 2D tool).',
    ports: ports(['in', 'IN', 'in']),
    step(state, ins) { return { _display: { value: ins.in || 0 } }; },
  },

  bulbPoweredLights: {
    name: 'Bulb Powered Lights', category: 'structures', color: '#9b59b6', w: 220, h: 110, price: 800,
    note: 'Functionally identical to the LCD \u2014 a resizable array of toggleable lights that cycle rainbow colors past an input of 10.0 \u2014 styled with round bulbs instead of square pixels. Approximated here as a 10-bulb bar graph.',
    ports: ports(['in', 'IN', 'in']),
    step(state, ins) { return { _display: { value: ins.in || 0, round: true } }; },
  },

  sevenSegment: {
    name: '7-Segment Display', category: 'structures', color: '#9b59b6', w: 160, h: 140, price: 700,
    note: 'Displays a digit from the NUMBER input. The COLOR input tints the display, and the PASSTHROUGH output simply echoes the number input onward (individually addressing every segment is not modeled here).',
    ports: ports(['number', 'NUMBER', 'in'], ['color', 'COLOR', 'in'], ['through', 'PASSTHROUGH', 'out']),
    step(state, ins) {
      const v = ((Math.floor(ins.number || 0) % 10) + 10) % 10;
      return { through: ins.number || 0, _display: { digit: v, hue: ins.color || 0 } };
    },
  },

  fourteenSegment: {
    name: '14-Segment Display', category: 'structures', color: '#9b59b6', w: 170, h: 140, price: 700,
    note: 'Displays a character from the NUMBER input (cycling A\u2013Z, 0\u20139). The COLOR input tints the display, and the PASSTHROUGH output echoes the number input onward (individually addressing every segment is not modeled here).',
    ports: ports(['number', 'NUMBER', 'in'], ['color', 'COLOR', 'in'], ['through', 'PASSTHROUGH', 'out']),
    step(state, ins) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const idx = ((Math.floor(ins.number || 0) % chars.length) + chars.length) % chars.length;
      return { through: ins.number || 0, _display: { char: chars[idx], hue: ins.color || 0 } };
    },
  },

  electronicBillboard: {
    name: 'Electronic Billboard', category: 'structures', color: '#9b59b6', w: 220, h: 130, price: 800,
    note: 'Displays an image chosen by a Roblox Image ID fed into its input (typically from a Number Interface). Actually rendering a live Roblox image isn\u2019t possible in this browser tool, so it\u2019s shown as a placeholder frame with the ID.',
    ports: ports(['in', 'IMAGE ID', 'in']),
    step(state, ins) { return { _display: { imageId: Math.floor(ins.in || 0) } }; },
  },

  musicNote: {
    name: 'Music Note', category: 'structures', color: '#9b59b6', w: 150, h: 110, price: 200,
    note: 'Plays a different note depending on the input signal; the music type can be changed by interacting with it. Shown here as a visual flash (no audio synthesis, to keep the page lightweight).',
    ports: ports(['in', 'IN', 'in']),
    control: { type: 'select', label: 'Music Type', options: [['piano', 'Piano'], ['synth', 'Synth'], ['bells', 'Bells'], ['drum', 'Drum']] },
    init: () => ({ value: 'piano', wasActive: false, flashUntil: 0 }),
    step(state, ins, params, t) {
      const active = (ins.in || 0) > 0;
      if (active && !state.wasActive) state.flashUntil = t + 0.3;
      state.wasActive = active;
      return { _display: { flashing: t < state.flashUntil } };
    },
  },

  speaker: {
    name: 'Speaker', category: 'structures', color: '#9b59b6', w: 200, h: 140, price: 850,
    note: 'Sends a chat message and chat bubble to your friends whenever powered (1-second cooldown). {num} is replaced with the power value; {display_name} is replaced with the name of the user ID provided. RichText is supported in-game.',
    ports: ports(['in', 'POWER', 'in']),
    params: [
      { key: 'message', label: 'Message', type: 'text', default: 'Power is {num}!' },
      { key: 'testUserId', label: 'Test {display_name} as', type: 'text', default: 'Builderman' },
    ],
    init: () => ({ lastFired: -999, flashUntil: 0, lastMessage: '' }),
    step(state, ins, params, t) {
      const v = ins.in || 0;
      if (v > 0 && (t - state.lastFired) >= 1.0) {
        state.lastFired = t;
        state.lastMessage = String(params.message)
          .replace(/\{num\}/g, Math.round(v * 100) / 100)
          .replace(/\{display_name\}/g, params.testUserId || '');
        state.flashUntil = t + 1.5;
      }
      return { _display: { flashing: t < state.flashUntil, message: state.lastMessage } };
    },
  },

  donator: {
    name: 'Donator', category: 'structures', color: '#9b59b6', w: 200, h: 160, price: 3000,
    note: 'An ATM-style structure: the owner sets a fixed donation amount, and any player can donate it to them. Outputs the donor\u2019s user ID the instant a donation happens. An Interactor wired into SET AMT can change the configured amount remotely.',
    ports: ports(['setAmount', 'SET AMT', 'in'], ['out', 'OUT', 'out']),
    params: [{ key: 'amount', label: 'Donation Amount ($)', type: 'number', default: 5, min: 1 }],
    control: { type: 'donator' },
    init: () => ({ amount: null, pulseUntil: 0, pulseValue: 0 }),
    step(state, ins, params, t) {
      if ((ins.setAmount || 0) > 0) state.amount = ins.setAmount;
      return { out: t < state.pulseUntil ? state.pulseValue : 0 };
    },
  },

  securityCameraDisplay: {
    name: 'Security Camera Display', category: 'structures', color: '#9b59b6', w: 220, h: 150, price: 10000,
    note: 'A display made for rendering security cameras, manually toggled on by the user. A live camera feed can\u2019t be rendered in this 2D web tool, so it\u2019s shown as a placeholder when powered on.',
    ports: ports(),
    control: { type: 'toggle', label: 'POWER' },
    init: () => ({ on: false }),
    step(state) { return { _display: { on: state.on } }; },
  },

  // -------------------------------------------------------------------- OTHER
  wirelessTransmitter: {
    name: 'Transmitter', category: 'other', color: '#777', w: 180, h: 100, price: 850,
    note: 'Wirelessly sends the inputted signal to any Receiver sharing the same keyphrase \u2014 no physical wire needed between them.',
    ports: ports(['in', 'IN', 'in']),
    params: [{ key: 'keyphrase', label: 'Keyphrase', type: 'text', default: 'channel1' }],
    step(state, ins, params, t, dt, globalState) {
      globalState.channels = globalState.channels || {};
      globalState.channels[params.keyphrase] = ins.in || 0;
      return {};
    },
  },

  wirelessReceiver: {
    name: 'Receiver', category: 'other', color: '#777', w: 180, h: 100, price: 850,
    note: 'Wirelessly obtains a signal from any Transmitter sharing the same keyphrase, and outputs it.',
    ports: ports(['out', 'OUT', 'out']),
    params: [{ key: 'keyphrase', label: 'Keyphrase', type: 'text', default: 'channel1' }],
    step(state, ins, params, t, dt, globalState) {
      const v = (globalState.channels || {})[params.keyphrase] || 0;
      return { out: v };
    },
  },

  memoryCell: {
    name: 'Memory Cell', category: 'other', color: '#777', w: 170, h: 120, price: 275,
    note: 'Holds whatever signal is provided on the left (DATA) input \u2014 once it captures a nonzero value it ignores further changes until RESET (right input) clears it back to 0. If DATA and RESET both fire on the same tick from the same source, whichever wire was connected first is processed first, matching the in-game execution order.',
    ports: ports(['data', 'DATA', 'in'], ['reset', 'RESET', 'in'], ['out', 'OUT', 'out']),
    init: () => ({ stored: 0, hasValue: false, wasData: false, wasReset: false }),
    step(state, ins, params, t, dt, globalState, portOrder) {
      const dataActive = (ins.data || 0) > 0;
      const resetActive = (ins.reset || 0) > 0;
      const dataEdge = dataActive && !state.wasData;
      const resetEdge = resetActive && !state.wasReset;
      const order = (portOrder && portOrder.length) ? portOrder : ['data', 'reset'];
      order.forEach((portId) => {
        if (portId === 'reset' && resetEdge) { state.stored = 0; state.hasValue = false; }
        else if (portId === 'data' && dataEdge && !state.hasValue) { state.stored = ins.data || 0; state.hasValue = true; }
      });
      state.wasData = dataActive;
      state.wasReset = resetActive;
      return { out: state.stored };
    },
  },

  tether: {
    name: 'Tether', category: 'other', color: '#777', w: 100, h: 80, price: 87,
    note: 'A way to organize your wires \u2014 acts as a passthrough, with a very slight (one-tick) delay, exactly like in-game.',
    ports: ports(['in', 'IN', 'in'], ['out', 'OUT', 'out']),
    init: () => ({ prev: 0 }),
    step(state, ins) {
      const out = state.prev;
      state.prev = ins.in || 0;
      return { out };
    },
  },

  interactor: {
    name: 'Interactor', category: 'other', color: '#777', w: 160, h: 110, price: 50,
    note: 'Interacts with objects/structures in its selected region. It activates a single time whenever its input signal changes value (not continuously), forwarding that new value \u2014 e.g. 0/2/8/10 to flip a conveyor\u2019s direction, 10/15/20 to respawn/change/despawn a vehicle, or a changing value to control an Elevator\u2019s extension.',
    ports: ports(['in', 'IN', 'in'], ['out', 'OUT', 'out']),
    init: () => ({ lastValue: null, flashUntil: 0 }),
    step(state, ins, params, t) {
      const v = ins.in || 0;
      let pulse = 0;
      const changed = state.lastValue === null || v !== state.lastValue;
      if (changed) { pulse = v; state.flashUntil = t + 0.3; }
      state.lastValue = v;
      return { out: pulse, _display: { sentValue: v, flashing: t < state.flashUntil } };
    },
  },

  collider: {
    name: 'Collider', category: 'other', color: '#777', w: 160, h: 100, price: 420,
    note: 'Enables and disables collisions with filled schematics, privacy glass, vehicle/trailer pads, and spawn pads in its region. Modeled here as: input greater than 0 disables collisions (best-effort \u2014 the exact on/off direction isn\u2019t documented in detail).',
    ports: ports(['in', 'IN', 'in']),
    step(state, ins) { return { _display: { collisionsEnabled: (ins.in || 0) === 0 } }; },
  },

  redLaser: {
    name: 'Red Laser', category: 'other', color: '#777', w: 170, h: 120, price: 900,
    note: 'Outputs 10.0 if the beam hits an object, 5.0 if it hits a player, 0 if it hits nothing. Reflects off Privacy Glass up to 5 times. Physical beam hit-detection is simulated with a manual selector.',
    ports: ports(['out', 'OUT', 'out']),
    control: { type: 'select', label: 'Beam is hitting', options: [['none', 'Nothing (0)'], ['object', 'An object (10)'], ['player', 'A player (5)']] },
    init: () => ({ value: 'none' }),
    step(state) {
      const map = { none: 0, object: 10, player: 5 };
      return { out: map[state.value] ?? 0 };
    },
  },

  laserReceiver: {
    name: 'Laser Receiver', category: 'other', color: '#777', w: 160, h: 100, price: 400,
    note: 'Activates an output of 10.0 the moment a laser hits it. Wire a Red Laser or Material Laser into it to test that interaction here.',
    ports: ports(['in', 'IN', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) { return { out: (ins.in || 0) > 0 ? 10 : 0 }; },
  },

  materialLaser: {
    name: 'Material Laser', category: 'other', color: '#777', w: 170, h: 120, price: 900,
    note: 'Assign a material by touching it to the schematic input in-game; outputs 10.0 whenever the beam hits that assigned material. Physical hit-detection is simulated with a manual toggle here.',
    ports: ports(['out', 'OUT', 'out']),
    params: [{ key: 'material', label: 'Assigned Material', type: 'text', default: 'Wood' }],
    control: { type: 'toggle', label: 'HITTING MATERIAL' },
    init: () => ({ on: false }),
    step(state) { return { out: state.on ? 10 : 0 }; },
  },

  ownershipManager: {
    name: 'Ownership Manager', category: 'other', color: '#777', w: 180, h: 110, price: 50,
    note: 'Lets you clear or transfer ownership of items you own. A power input of exactly 10.0 clears ownership; any other positive value is treated as a user ID and transfers ownership to that player.',
    ports: ports(['in', 'POWER', 'in']),
    init: () => ({ owner: null }),
    step(state, ins) {
      const v = ins.in || 0;
      if (v === 10) state.owner = null;
      else if (v > 0) state.owner = Math.round(v);
      return { _display: { owner: state.owner } };
    },
  },

};

// Friendly default ordering inside each category (for the palette)
const PALETTE_ORDER = {
  inputs: ['button', 'switch_', 'pressurePad', 'slider', 'lock', 'daylightSensor', 'proximitySensor', 'weatherSensor', 'commander'],
  gates: ['andGate', 'orGate', 'xandGate', 'xorGate', 'notGate', 'greaterThanGate', 'binaryInput', 'binaryOutput'],
  processors: ['calculator', 'sustainer', 'incrementor', 'relay', 'blocker', 'zeroTick', 'numberInterface', 'delay', 'frequency', 'hertzClock', 'randomizer', 'signalLock', 'tFlipFlop', 'numberSplitter', 'numberCombiner'],
  structures: ['privacyGlass', 'lcd', 'bulbPoweredLights', 'sevenSegment', 'fourteenSegment', 'electronicBillboard', 'musicNote', 'speaker', 'donator', 'securityCameraDisplay'],
  other: ['wirelessTransmitter', 'wirelessReceiver', 'memoryCell', 'tether', 'interactor', 'collider', 'redLaser', 'laserReceiver', 'materialLaser', 'ownershipManager'],
};

// Expose for debugging in the browser console (and for automated tests).
if (typeof window !== 'undefined') {
  window.COMPONENT_TYPES = COMPONENT_TYPES;
  window.CATEGORIES = CATEGORIES;
  window.PALETTE_ORDER = PALETTE_ORDER;
  window.SHOP_INFO = SHOP_INFO;
}
