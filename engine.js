/* =========================================================================
   OAKLANDS LOGIC EDITOR — SIMULATION ENGINE
   =========================================================================
   Model: every node is evaluated once per tick using the *previous* tick's
   settled output values as its inputs (a synchronous/clocked evaluation,
   like a digital circuit clocked at the simulation tick rate). At a
   reasonable tick rate (default 30Hz) this feels instantaneous to the user
   while completely avoiding combinational-loop / re-entrancy bugs.

   WIRE PRIORITY: an input port may have multiple wires connected to it
   (this is allowed in the real game). Each port keeps an ordered priority
   list of the wire IDs feeding it — the FIRST wire in that list whose
   source is still connected supplies the value; the others are ignored.
   New wires are inserted at the top (highest priority) by default, and the
   order can be dragged/reordered by the user in the Wire Priority popup.
   ========================================================================= */

class Graph {
  constructor() {
    this.nodes = {};      // id -> node
    this.wires = {};      // id -> wire
    this.global = {};     // shared state (e.g. wireless channels)
    this.time = 0;
    this._nextId = 1;
  }

  newId(prefix) { return `${prefix}${this._nextId++}`; }

  addNode(typeKey, x, y, overrides = {}) {
    const def = COMPONENT_TYPES[typeKey];
    if (!def) throw new Error('Unknown component type ' + typeKey);
    const id = overrides.id || this.newId('n');
    const params = {};
    (def.params || []).forEach((p) => { params[p.key] = p.default; });
    Object.assign(params, overrides.params || {});
    let state = def.init ? def.init() : {};
    Object.assign(state, overrides.state || {});
    const node = {
      id, type: typeKey, x, y, params, state,
      outputs: {}, display: null,
      inputPriority: overrides.inputPriority || {}, // portId -> [wireId,...]
    };
    def.ports.filter((p) => p.dir === 'out').forEach((p) => { node.outputs[p.id] = 0; });
    this.nodes[id] = node;
    return node;
  }

  removeNode(id) {
    delete this.nodes[id];
    Object.values(this.wires)
      .filter((w) => w.from.node === id || w.to.node === id)
      .forEach((w) => this.removeWire(w.id));
  }

  addWire(fromNode, fromPort, toNode, toPort, color) {
    const dup = Object.values(this.wires).find((w) =>
      w.from.node === fromNode && w.from.port === fromPort && w.to.node === toNode && w.to.port === toPort);
    if (dup) return dup;
    const id = this.newId('w');
    this._wireSeq = (this._wireSeq || 0) + 1;
    const wire = {
      id, seq: this._wireSeq,
      from: { node: fromNode, port: fromPort }, to: { node: toNode, port: toPort },
      color: color || '#e0a030', anchors: [],
    };
    this.wires[id] = wire;
    const node = this.nodes[toNode];
    if (node) {
      node.inputPriority[toPort] = node.inputPriority[toPort] || [];
      node.inputPriority[toPort].unshift(id); // new wire = highest priority by default
    }
    return wire;
  }

  removeWire(id) {
    const w = this.wires[id];
    if (!w) return;
    delete this.wires[id];
    const node = this.nodes[w.to.node];
    if (node && node.inputPriority[w.to.port]) {
      node.inputPriority[w.to.port] = node.inputPriority[w.to.port].filter((wid) => wid !== id);
    }
  }

  wiresIntoPort(nodeId, portId) {
    const node = this.nodes[nodeId];
    if (!node) return [];
    const order = node.inputPriority[portId] || [];
    return order.map((wid) => this.wires[wid]).filter(Boolean);
  }

  resolveInput(nodeId, portId) {
    const wires = this.wiresIntoPort(nodeId, portId);
    if (!wires.length) return 0;
    const w = wires[0]; // highest priority wire wins
    const src = this.nodes[w.from.node];
    if (!src) return 0;
    return src.outputs[w.from.port] || 0;
  }

  tick(dt) {
    this.time += dt;
    const t = this.time;
    const resolved = {};
    for (const node of Object.values(this.nodes)) {
      const def = COMPONENT_TYPES[node.type];
      const ins = {};
      const orderable = [];
      def.ports.filter((p) => p.dir === 'in').forEach((p) => {
        const wires = this.wiresIntoPort(node.id, p.id);
        const w = wires[0]; // highest priority wire wins the VALUE
        if (w) {
          const src = this.nodes[w.from.node];
          ins[p.id] = src ? (src.outputs[w.from.port] || 0) : 0;
          orderable.push({ portId: p.id, seq: w.seq || 0 }); // earliest-connected wire = processed first
        } else {
          ins[p.id] = 0;
        }
      });
      orderable.sort((a, b) => a.seq - b.seq);
      resolved[node.id] = { ins, order: orderable.map((o) => o.portId) };
    }
    for (const node of Object.values(this.nodes)) {
      const def = COMPONENT_TYPES[node.type];
      let result = {};
      try {
        result = def.step(node.state, resolved[node.id].ins, node.params, t, dt, this.global, resolved[node.id].order) || {};
      } catch (e) {
        console.error('Error stepping node', node.id, node.type, e);
      }
      const newOutputs = {};
      def.ports.filter((p) => p.dir === 'out').forEach((p) => { newOutputs[p.id] = result[p.id] ?? 0; });
      node.outputs = newOutputs;
      node.display = result._display || null;
      node.lastInputs = resolved[node.id].ins;
    }
  }

  toJSON() {
    return {
      nodes: Object.values(this.nodes).map((n) => ({
        id: n.id, type: n.type, x: n.x, y: n.y, params: n.params,
        controlState: extractControlState(n),
        inputPriority: n.inputPriority,
      })),
      wires: Object.values(this.wires).map((w) => ({
        id: w.id, seq: w.seq, from: w.from, to: w.to, color: w.color, anchors: w.anchors || [],
      })),
    };
  }

  static fromJSON(data) {
    const g = new Graph();
    (data.nodes || []).forEach((n) => {
      const node = g.addNode(n.type, n.x, n.y, { id: n.id, params: n.params, inputPriority: n.inputPriority });
      Object.assign(node.state, n.controlState || {});
    });
    (data.wires || []).forEach((w, i) => {
      g.wires[w.id] = { id: w.id, seq: w.seq ?? (i + 1), from: w.from, to: w.to, color: w.color, anchors: w.anchors || [] };
    });
    let maxN = 0, maxSeq = 0;
    Object.keys(g.nodes).forEach((id) => { const m = /^n(\d+)$/.exec(id); if (m) maxN = Math.max(maxN, +m[1]); });
    Object.keys(g.wires).forEach((id) => { const m = /^w(\d+)$/.exec(id); if (m) maxN = Math.max(maxN, +m[1]); });
    Object.values(g.wires).forEach((w) => { maxSeq = Math.max(maxSeq, w.seq || 0); });
    g._nextId = maxN + 1;
    g._wireSeq = maxSeq;
    return g;
  }
}

function extractControlState(node) {
  const keep = {};
  const keys = ['pressed', 'on', 'value', 'x', 'y', 'bits', 'unlocked', 'entry', 'phrase'];
  keys.forEach((k) => { if (k in node.state) keep[k] = node.state[k]; });
  return keep;
}

if (typeof window !== 'undefined') {
  window.Graph = Graph;
}
