/* =========================================================================
   OAKLANDS LOGIC EDITOR — COMPONENT REGISTRY
   =========================================================================
   Every component type from the in-game "Logic" category is defined here:
   its ports (inputs/outputs), configurable parameters, the on-node control
   widget (button/slider/dropdown/etc), and its simulation step() function.

   Behaviors are modeled directly off the Oaklands Wiki (Fandom + Miraheze)
   where documented. Where the wiki doesn't give an exact formula (a few of
   the more obscure "Other" category items), a clearly-labeled best-effort
   approximation is used — each component has a `note` shown in its info
   tooltip explaining exactly what is real vs. approximated.
   ========================================================================= */

const PORT_W = 14; // visual port square size

// Helper: clamp
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// ---------------------------------------------------------------------
// CATEGORIES (match the wiki's grouping, used for palette sections)
// ---------------------------------------------------------------------
const CATEGORIES = [
  { id: 'inputs', label: 'Inputs' },
  { id: 'gates', label: 'Logic Gates' },
  { id: 'processors', label: 'Processors' },
  { id: 'structures', label: 'Structures (Outputs)' },
  { id: 'other', label: 'Other' },
  { id: 'conveyors', label: 'Conveyors' },
];

/* A port definition: { id, label, dir: 'in'|'out' }
   Vertical position is auto-assigned (evenly spaced) based on how many
   in/out ports a node has, so we don't need to hardcode y-offsets. */

function ports(...defs) {
  return defs.map((d) => ({ id: d[0], label: d[1], dir: d[2] }));
}

// =========================================================================
// COMPONENT TYPES
// =========================================================================
const COMPONENT_TYPES = {

  // ----------------------------------------------------------------- INPUTS
  button: {
    name: 'Button', category: 'inputs', color: '#d9534f', w: 110, h: 70,
    note: 'Emits a momentary signal of 10 while held — matches the real Button, which pulses 10 on interact.',
    ports: ports(['out', 'OUT', 'out']),
    control: { type: 'momentary', label: 'PRESS' },
    init: () => ({ pressed: false }),
    step(state, ins, params) {
      return { out: state.pressed ? 10 : 0 };
    },
  },

  switch_: {
    name: 'Switch', category: 'inputs', color: '#d9534f', w: 110, h: 70,
    note: 'Toggles between 0 and 10, exactly like the in-game Switch.',
    ports: ports(['out', 'OUT', 'out']),
    control: { type: 'toggle', label: 'ON/OFF' },
    init: () => ({ on: false }),
    step(state) { return { out: state.on ? 10 : 0 }; },
  },

  pressurePad: {
    name: 'Pressure Pad', category: 'inputs', color: '#d9534f', w: 120, h: 70,
    note: 'Outputs 10 while "weight" is being applied (held down), 0 when released — same as standing on the pad in-game.',
    ports: ports(['out', 'OUT', 'out']),
    control: { type: 'momentary', label: 'STEP ON' },
    init: () => ({ pressed: false }),
    step(state) { return { out: state.pressed ? 10 : 0 }; },
  },

  slider: {
    name: 'Slider', category: 'inputs', color: '#d9534f', w: 150, h: 80,
    note: 'Continuous 0–10 output, identical range to the in-game Slider.',
    ports: ports(['out', 'OUT', 'out']),
    control: { type: 'slider', min: 0, max: 10, step: 0.1 },
    init: () => ({ value: 0 }),
    step(state) { return { out: state.value }; },
  },

  joystick: {
    name: 'Joystick', category: 'inputs', color: '#d9534f', w: 150, h: 110,
    note: 'Two independent axes, each −10 to 10, matching the in-game dual-axis Joystick.',
    ports: ports(['outX', 'X', 'out'], ['outY', 'Y', 'out']),
    control: { type: 'joystick2d', min: -10, max: 10 },
    init: () => ({ x: 0, y: 0 }),
    step(state) { return { outX: state.x, outY: state.y }; },
  },

  lock: {
    name: 'Lock', category: 'inputs', color: '#d9534f', w: 140, h: 90,
    note: 'Outputs 10 only while unlocked with the correct code. Code-entry minigame is simplified to a text match.',
    ports: ports(['out', 'OUT', 'out']),
    params: [{ key: 'code', label: 'Code', type: 'text', default: '1234' }],
    control: { type: 'lockpad' },
    init: () => ({ unlocked: false, entry: '' }),
    step(state) { return { out: state.unlocked ? 10 : 0 }; },
  },

  daylightSensor: {
    name: 'Daylight Sensor', category: 'inputs', color: '#d9534f', w: 150, h: 90,
    note: 'Outputs a value based on time-of-day (0 at midnight, 10 at noon), like the real Daylight Sensor.',
    ports: ports(['out', 'OUT', 'out']),
    control: { type: 'slider', min: 0, max: 24, step: 0.25, label: 'Time of day (h)' },
    init: () => ({ value: 12 }),
    step(state) {
      const h = state.value;
      const v = Math.max(0, Math.sin(((h - 6) / 24) * Math.PI * 2 * -1 + Math.PI / 2)) * 10;
      // simple smooth day curve peaking at noon, 0 at night
      const curve = Math.max(0, Math.cos(((h - 12) / 24) * Math.PI * 2)) * 10;
      return { out: Math.round(curve * 100) / 100 };
    },
  },

  proximitySensor: {
    name: 'Proximity Sensor', category: 'inputs', color: '#d9534f', w: 150, h: 80,
    note: 'Outputs 10 when a player is detected nearby. Detection is simulated with a manual toggle.',
    ports: ports(['out', 'OUT', 'out']),
    control: { type: 'toggle', label: 'PLAYER NEAR' },
    init: () => ({ on: false }),
    step(state) { return { out: state.on ? 10 : 0 }; },
  },

  weatherSensor: {
    name: 'Weather Sensor', category: 'inputs', color: '#d9534f', w: 160, h: 90,
    note: 'Emits different signal scales per weather type, like the in-game sensor (values are an approximation of relative intensity).',
    ports: ports(['out', 'OUT', 'out']),
    control: {
      type: 'select', label: 'Weather',
      options: [['clear', 'Clear (0)'], ['cloudy', 'Cloudy (2)'], ['rain', 'Rain (5)'], ['storm', 'Storm (8)'], ['snow', 'Snow (10)']],
    },
    init: () => ({ value: 'clear' }),
    step(state) {
      const map = { clear: 0, cloudy: 2, rain: 5, storm: 8, snow: 10 };
      return { out: map[state.value] ?? 0 };
    },
  },

  commander: {
    name: 'Commander', category: 'inputs', color: '#d9534f', w: 170, h: 110,
    note: 'Emits 10 (owner) or 1 (other player) for ~0.5s when the assigned phrase is "chatted". Simplified to a manual trigger button + phrase field.',
    ports: ports(['out', 'OUT', 'out']),
    params: [{ key: 'phrase', label: 'Phrase', type: 'text', default: 'open' }],
    control: { type: 'commanderTrigger' },
    init: () => ({ pulseUntil: 0, pulseValue: 0 }),
    step(state, ins, params, t) {
      const active = t < state.pulseUntil;
      return { out: active ? state.pulseValue : 0 };
    },
  },

  // ------------------------------------------------------------ LOGIC GATES
  andGate: {
    name: 'AND Gate', category: 'gates', color: '#5bc0de', w: 120, h: 90,
    note: 'Outputs the input value only if both inputs are equal AND greater than 0 — exact in-game behavior.',
    ports: ports(['in1', 'A', 'in'], ['in2', 'B', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) {
      const { in1 = 0, in2 = 0 } = ins;
      return { out: (in1 === in2 && in1 > 0) ? in1 : 0 };
    },
  },

  orGate: {
    name: 'OR Gate', category: 'gates', color: '#5bc0de', w: 120, h: 90,
    note: 'Outputs the highest of the two inputs if at least one is greater than 0 — exact in-game behavior.',
    ports: ports(['in1', 'A', 'in'], ['in2', 'B', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) {
      const { in1 = 0, in2 = 0 } = ins;
      return { out: (in1 > 0 || in2 > 0) ? Math.max(in1, in2) : 0 };
    },
  },

  xandGate: {
    name: 'XAND Gate', category: 'gates', color: '#5bc0de', w: 120, h: 90,
    note: 'XNOR behavior: equal inputs of 0 → 10; equal nonzero inputs → that value; unequal → 0. Matches wiki pseudocode exactly.',
    ports: ports(['in1', 'A', 'in'], ['in2', 'B', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) {
      const { in1 = 0, in2 = 0 } = ins;
      if (in1 === in2) return { out: in1 === 0 ? 10 : in1 };
      return { out: 0 };
    },
  },

  xorGate: {
    name: 'XOR Gate', category: 'gates', color: '#5bc0de', w: 120, h: 90,
    note: 'Outputs 10 when exactly one input has a signal (>0), otherwise 0 — matches the in-game binary XOR description.',
    ports: ports(['in1', 'A', 'in'], ['in2', 'B', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) {
      const a = (ins.in1 || 0) > 0, b = (ins.in2 || 0) > 0;
      return { out: (a !== b) ? 10 : 0 };
    },
  },

  notGate: {
    name: 'NOT Gate', category: 'gates', color: '#5bc0de', w: 110, h: 80,
    note: 'Outputs 10 when input is 0, and 0 when input is greater than 0 — exact in-game behavior.',
    ports: ports(['in', 'IN', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) { return { out: (ins.in || 0) > 0 ? 0 : 10 }; },
  },

  greaterThanGate: {
    name: 'Greater Than Gate', category: 'gates', color: '#5bc0de', w: 130, h: 90,
    note: 'Outputs 10 if input A > input B, else 0. (Comparator — exact direction per-wiki name; magnitude not specified so a fixed 10 pulse is used.)',
    ports: ports(['in1', 'A', 'in'], ['in2', 'B', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) {
      const { in1 = 0, in2 = 0 } = ins;
      return { out: in1 > in2 ? 10 : 0 };
    },
  },

  binaryInput: {
    name: 'Binary Input', category: 'gates', color: '#5bc0de', w: 200, h: 110,
    note: '8 toggle bits combine into a single decimal output (0–255), like the in-game Binary Input panel.',
    ports: ports(['out', 'OUT', 'out']),
    control: { type: 'bits', count: 8 },
    init: () => ({ bits: [0, 0, 0, 0, 0, 0, 0, 0] }),
    step(state) {
      let v = 0;
      for (let i = 0; i < state.bits.length; i++) v += state.bits[i] ? Math.pow(2, i) : 0;
      return { out: v };
    },
  },

  binaryOutput: {
    name: 'Binary Output', category: 'gates', color: '#5bc0de', w: 200, h: 110,
    note: 'Decimal input is converted to its 8-bit binary representation and shown as lamps, like the in-game Binary Output.',
    ports: ports(['in', 'IN', 'in']),
    control: { type: 'bitsDisplay', count: 8 },
    step(state, ins) {
      const v = Math.max(0, Math.floor(ins.in || 0));
      const bits = [];
      for (let i = 0; i < 8; i++) bits.push((v >> i) & 1);
      return { _display: { bits } };
    },
  },

  // -------------------------------------------------------------- PROCESSORS
  calculator: {
    name: 'Calculator', category: 'processors', color: '#f0ad4e', w: 150, h: 110,
    note: 'Performs +, −, ×, ÷, % on the two inputs. Per the wiki: negative results output nothing, and divide-by-zero outputs nothing.',
    ports: ports(['in1', 'A', 'in'], ['in2', 'B', 'in'], ['out', 'OUT', 'out']),
    control: { type: 'select', label: 'Op', options: [['add', '+'], ['sub', '−'], ['mul', '×'], ['div', '÷'], ['mod', '%']] },
    init: () => ({ value: 'add' }),
    step(state, ins) {
      const a = ins.in1 || 0, b = ins.in2 || 0;
      let r;
      switch (state.value) {
        case 'add': r = a + b; break;
        case 'sub': r = a - b; break;
        case 'mul': r = a * b; break;
        case 'div': r = b === 0 ? NaN : a / b; break;
        case 'mod': r = b === 0 ? NaN : a % b; break;
        default: r = 0;
      }
      if (Number.isNaN(r) || r < 0) r = 0;
      return { out: Math.round(r * 1000) / 1000 };
    },
  },

  sustainer: {
    name: 'Sustainer', category: 'processors', color: '#f0ad4e', w: 150, h: 100,
    note: 'Holds ("sustains") the last received signal for a configurable duration after the input drops, like the in-game Sustainer.',
    ports: ports(['in', 'IN', 'in'], ['out', 'OUT', 'out']),
    params: [{ key: 'duration', label: 'Sustain (s)', type: 'number', default: 2, min: 0, max: 180 }],
    init: () => ({ value: 0, releaseAt: 0 }),
    step(state, ins, params, t, dt) {
      const input = ins.in || 0;
      if (input > 0) { state.value = input; state.releaseAt = t + params.duration; }
      const out = (t < state.releaseAt) ? state.value : 0;
      return { out };
    },
  },

  relay: {
    name: 'Relay', category: 'processors', color: '#f0ad4e', w: 150, h: 100,
    note: 'Passes the left (signal) input through only while the right (activate) input is greater than 0 — exact in-game behavior.',
    ports: ports(['signal', 'SIGNAL', 'in'], ['activate', 'ACTIVATE', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) {
      const sig = ins.signal || 0, act = ins.activate || 0;
      return { out: act > 0 ? sig : 0 };
    },
  },

  blocker: {
    name: 'Blocker', category: 'processors', color: '#f0ad4e', w: 150, h: 100,
    note: 'Approximation: passes the signal through unless the block input is active, in which case output is forced to 0.',
    ports: ports(['signal', 'SIGNAL', 'in'], ['block', 'BLOCK', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) {
      const sig = ins.signal || 0, blk = ins.block || 0;
      return { out: blk > 0 ? 0 : sig };
    },
  },

  zeroTick: {
    name: 'Zero Tick', category: 'processors', color: '#f0ad4e', w: 150, h: 90,
    note: 'Outputs a single-tick pulse equal to the input value on a rising edge (0→active), then drops back to 0 even if the input stays high — used to break feedback loops.',
    ports: ports(['in', 'IN', 'in'], ['out', 'OUT', 'out']),
    init: () => ({ wasActive: false }),
    step(state, ins) {
      const v = ins.in || 0;
      const active = v > 0;
      const pulse = active && !state.wasActive;
      state.wasActive = active;
      return { out: pulse ? v : 0 };
    },
  },

  numberInterface: {
    name: 'Number Interface', category: 'processors', color: '#f0ad4e', w: 160, h: 90,
    note: 'Outputs a constant, manually-assigned numeric signal — no inputs, exactly like the in-game Number Interface.',
    ports: ports(['out', 'OUT', 'out']),
    control: { type: 'number', min: -999999999999, max: 999999999999, step: 1 },
    init: () => ({ value: 10 }),
    step(state) { return { out: state.value }; },
  },

  delay: {
    name: 'Delay', category: 'processors', color: '#f0ad4e', w: 150, h: 100,
    note: 'Delays the input signal by a configurable number of seconds (up to 3 minutes in-game) before it reaches the output.',
    ports: ports(['in', 'IN', 'in'], ['out', 'OUT', 'out']),
    params: [{ key: 'seconds', label: 'Delay (s)', type: 'number', default: 1, min: 0, max: 180 }],
    init: () => ({ queue: [], lastOut: 0 }),
    step(state, ins, params, t) {
      // Record the current input value, timestamped to be released `seconds` from now.
      state.queue.push({ t: t + params.seconds, v: ins.in || 0 });
      // Release (become the output) every entry whose time has come, keeping the latest.
      while (state.queue.length && state.queue[0].t <= t) {
        state.lastOut = state.queue.shift().v;
      }
      return { out: state.lastOut };
    },
  },

  frequencyClock: {
    name: 'Frequency Clock', category: 'processors', color: '#f0ad4e', w: 160, h: 100,
    note: 'Alternates output between 0 and 10 at a configurable frequency — a free-running clock pulse generator.',
    ports: ports(['out', 'OUT', 'out']),
    params: [{ key: 'hz', label: 'Frequency (Hz)', type: 'number', default: 1, min: 0.05, max: 20, step: 0.05 }],
    init: () => ({ }),
    step(state, ins, params, t) {
      const period = 1 / Math.max(0.001, params.hz);
      const phase = (t % period) / period;
      return { out: phase < 0.5 ? 10 : 0 };
    },
  },

  randomizer: {
    name: 'Randomizer', category: 'processors', color: '#f0ad4e', w: 150, h: 100,
    note: 'Outputs a new random value (0–10) each time it is triggered by a signal on its input (rising edge).',
    ports: ports(['trig', 'TRIG', 'in'], ['out', 'OUT', 'out']),
    init: () => ({ wasActive: false, value: 0 }),
    step(state, ins) {
      const active = (ins.trig || 0) > 0;
      if (active && !state.wasActive) state.value = Math.round(Math.random() * 1000) / 100;
      state.wasActive = active;
      return { out: state.value };
    },
  },

  // -------------------------------------------------------------- STRUCTURES
  privacyGlass: {
    name: 'Privacy Glass', category: 'structures', color: '#9b59b6', w: 140, h: 100,
    note: 'Becomes opaque (frosted) when the input is greater than 0 — matches in-game toggleable privacy glass.',
    ports: ports(['in', 'IN', 'in']),
    step(state, ins) { return { _display: { opaque: (ins.in || 0) > 0 } }; },
  },

  lcd: {
    name: 'LCD', category: 'structures', color: '#9b59b6', w: 170, h: 100,
    note: 'Displays the numeric value of its input signal, like the in-game LCD panel.',
    ports: ports(['in', 'IN', 'in']),
    step(state, ins) { return { _display: { text: String(Math.round((ins.in || 0) * 1000) / 1000) } }; },
  },

  sevenSegment: {
    name: '7-Segment Display', category: 'structures', color: '#9b59b6', w: 130, h: 110,
    note: 'Shows a single digit (0–9) based on the input value, mod 10.',
    ports: ports(['in', 'IN', 'in']),
    step(state, ins) {
      const v = ((Math.floor(ins.in || 0) % 10) + 10) % 10;
      return { _display: { digit: v } };
    },
  },

  fourteenSegment: {
    name: '14-Segment Display', category: 'structures', color: '#9b59b6', w: 140, h: 110,
    note: 'Shows an alphanumeric character selected by input value (approximation: cycles through A–Z, 0–9 by value mod 36).',
    ports: ports(['in', 'IN', 'in']),
    step(state, ins) {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      const idx = ((Math.floor(ins.in || 0) % chars.length) + chars.length) % chars.length;
      return { _display: { char: chars[idx] } };
    },
  },

  electronicBillboard: {
    name: 'Electronic Billboard', category: 'structures', color: '#9b59b6', w: 220, h: 110,
    note: 'Displays custom text; lights up when input is greater than 0, like the in-game billboard.',
    ports: ports(['in', 'IN', 'in']),
    params: [{ key: 'text', label: 'Text', type: 'text', default: 'OAKLANDS' }],
    step(state, ins, params) { return { _display: { on: (ins.in || 0) > 0, text: params.text } }; },
  },

  musicNote: {
    name: 'Music Note', category: 'structures', color: '#9b59b6', w: 130, h: 90,
    note: 'Plays a short tone when triggered (rising edge). Visual-only flash here (no audio synthesis to keep file size minimal).',
    ports: ports(['in', 'IN', 'in']),
    init: () => ({ wasActive: false, flashUntil: 0 }),
    step(state, ins, params, t) {
      const active = (ins.in || 0) > 0;
      if (active && !state.wasActive) state.flashUntil = t + 0.3;
      state.wasActive = active;
      return { _display: { flashing: t < state.flashUntil } };
    },
  },

  // -------------------------------------------------------------------- OTHER
  wirelessTransmitter: {
    name: 'Wireless Transmitter', category: 'other', color: '#777', w: 160, h: 90,
    note: 'Broadcasts its input signal on a channel number, to be picked up by a matching Wireless Receiver anywhere on the canvas — no physical wire needed.',
    ports: ports(['in', 'IN', 'in']),
    params: [{ key: 'channel', label: 'Channel', type: 'number', default: 1, min: 1, max: 999 }],
    step(state, ins, params, t, dt, globalState) {
      globalState.channels = globalState.channels || {};
      globalState.channels[params.channel] = ins.in || 0;
      return {};
    },
  },

  wirelessReceiver: {
    name: 'Wireless Receiver', category: 'other', color: '#777', w: 160, h: 90,
    note: 'Outputs whatever value is currently being broadcast on the matching channel by a Wireless Transmitter.',
    ports: ports(['out', 'OUT', 'out']),
    params: [{ key: 'channel', label: 'Channel', type: 'number', default: 1, min: 1, max: 999 }],
    step(state, ins, params, t, dt, globalState) {
      const v = (globalState.channels || {})[params.channel] || 0;
      return { out: v };
    },
  },

  memoryCell: {
    name: 'Memory Cell', category: 'other', color: '#777', w: 170, h: 110,
    note: 'Stores the DATA input value when WRITE goes high (rising edge), and continuously outputs the last stored value — a 1-register memory.',
    ports: ports(['data', 'DATA', 'in'], ['write', 'WRITE', 'in'], ['out', 'OUT', 'out']),
    init: () => ({ stored: 0, wasWriting: false }),
    step(state, ins) {
      const writing = (ins.write || 0) > 0;
      if (writing && !state.wasWriting) state.stored = ins.data || 0;
      state.wasWriting = writing;
      return { out: state.stored };
    },
  },

  tether: {
    name: 'Tether', category: 'other', color: '#777', w: 100, h: 70,
    note: 'Pure passthrough used to organize wire runs — output always equals input, exact in-game behavior.',
    ports: ports(['in', 'IN', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) { return { out: ins.in || 0 }; },
  },

  interactor: {
    name: 'Interactor', category: 'other', color: '#777', w: 140, h: 90,
    note: 'Lights up (enables interaction) while its input is greater than 0 — represents enabling/disabling player interaction on an object.',
    ports: ports(['in', 'IN', 'in']),
    step(state, ins) { return { _display: { on: (ins.in || 0) > 0 } }; },
  },

  collider: {
    name: 'Collider', category: 'other', color: '#777', w: 140, h: 90,
    note: 'Emits a pulse of 10 when a "collision" is triggered — simulated here with a manual trigger button (in-game it fires on physical contact).',
    ports: ports(['out', 'OUT', 'out']),
    control: { type: 'momentary', label: 'COLLIDE' },
    init: () => ({ pressed: false }),
    step(state) { return { out: state.pressed ? 10 : 0 }; },
  },

  redLaser: {
    name: 'Red Laser', category: 'other', color: '#777', w: 140, h: 90,
    note: 'Continuously emits a beam. Toggle "block" to simulate something interrupting the beam, which a paired Laser Receiver will detect.',
    ports: ports(['out', 'OUT', 'out']),
    control: { type: 'toggle', label: 'BLOCK BEAM', inverted: true },
    init: () => ({ on: false }), // on = blocked
    step(state, ins, params, t, dt, globalState) {
      globalState.laserBlocked = state.on;
      return { out: state.on ? 0 : 10 };
    },
  },

  laserReceiver: {
    name: 'Laser Receiver', category: 'other', color: '#777', w: 150, h: 90,
    note: 'Outputs 10 normally; drops to 0 when the beam is blocked. Connect a wire from a Red Laser to see this react.',
    ports: ports(['in', 'IN', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) { return { out: (ins.in || 0) > 0 ? 10 : 0 }; },
  },

  materialLaser: {
    name: 'Material Laser', category: 'other', color: '#777', w: 150, h: 90,
    note: 'Fires a cutting beam when input is active; outputs a confirmation pulse equal to the input (logic-side passthrough; physical cutting not simulated).',
    ports: ports(['in', 'IN', 'in'], ['out', 'OUT', 'out']),
    step(state, ins) { return { out: ins.in || 0 }; },
  },

  ownershipManager: {
    name: 'Ownership Manager', category: 'other', color: '#777', w: 160, h: 90,
    note: 'Outputs 10 if the property owner is currently online, else 0. Simulated with a manual toggle.',
    ports: ports(['out', 'OUT', 'out']),
    control: { type: 'toggle', label: 'OWNER ONLINE' },
    init: () => ({ on: true }),
    step(state) { return { out: state.on ? 10 : 0 }; },
  },

  // --------------------------------------------------------------- CONVEYORS
  fourWayConveyor: {
    name: '4-Way Conveyor', category: 'conveyors', color: '#8d6e63', w: 170, h: 120,
    note: 'Each of the 4 directional inputs lights its lamp when active, simulating which direction the conveyor is currently routed to. Physical material movement is not simulated.',
    ports: ports(['n', 'N', 'in'], ['e', 'E', 'in'], ['s', 'S', 'in'], ['w', 'W', 'in']),
    step(state, ins) {
      return { _display: { n: (ins.n || 0) > 0, e: (ins.e || 0) > 0, s: (ins.s || 0) > 0, w: (ins.w || 0) > 0 } };
    },
  },

  filterConveyor: {
    name: 'Filter Conveyor', category: 'conveyors', color: '#8d6e63', w: 170, h: 100,
    note: 'Lamp lights when ENABLE is active, representing the filter passing material of the selected type. Material sorting itself is not simulated.',
    ports: ports(['enable', 'ENABLE', 'in']),
    control: { type: 'select', label: 'Material', options: [['wood', 'Wood'], ['stone', 'Stone'], ['ore', 'Ore'], ['any', 'Any']] },
    init: () => ({ value: 'any' }),
    step(state, ins) { return { _display: { on: (ins.enable || 0) > 0 } }; },
  },

  alignmentConveyor: {
    name: 'Alignment Conveyor', category: 'conveyors', color: '#8d6e63', w: 170, h: 100,
    note: 'Lamp lights when ENABLE is active, representing the conveyor aligning items. Physical alignment is not simulated.',
    ports: ports(['enable', 'ENABLE', 'in']),
    step(state, ins) { return { _display: { on: (ins.enable || 0) > 0 } }; },
  },

};

// Friendly default ordering inside each category (for the palette)
const PALETTE_ORDER = {
  inputs: ['button', 'switch_', 'pressurePad', 'slider', 'joystick', 'lock', 'daylightSensor', 'proximitySensor', 'weatherSensor', 'commander'],
  gates: ['andGate', 'orGate', 'xandGate', 'xorGate', 'notGate', 'greaterThanGate', 'binaryInput', 'binaryOutput'],
  processors: ['calculator', 'sustainer', 'relay', 'blocker', 'zeroTick', 'numberInterface', 'delay', 'frequencyClock', 'randomizer'],
  structures: ['privacyGlass', 'lcd', 'sevenSegment', 'fourteenSegment', 'electronicBillboard', 'musicNote'],
  other: ['wirelessTransmitter', 'wirelessReceiver', 'memoryCell', 'tether', 'interactor', 'collider', 'redLaser', 'laserReceiver', 'materialLaser', 'ownershipManager'],
  conveyors: ['fourWayConveyor', 'filterConveyor', 'alignmentConveyor'],
};

// Expose for debugging in the browser console (and for automated tests).
if (typeof window !== 'undefined') {
  window.COMPONENT_TYPES = COMPONENT_TYPES;
  window.CATEGORIES = CATEGORIES;
  window.PALETTE_ORDER = PALETTE_ORDER;
}
