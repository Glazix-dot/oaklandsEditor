/* =========================================================================
   OAKLANDS LOGIC EDITOR — APP / UI LAYER
   ========================================================================= */

const graph = new Graph();
let running = true;
let tickRate = 20; // Hz
let zoom = 1;
let selected = null; // { kind: 'node'|'wire', id } -- single-item "detail" selection for the inspector
let multiSelected = new Set(); // nodeIds currently box/shift selected for group move/duplicate/delete
let marquee = null; // { x1, y1, el }
let wireDraft = null; // { fromNode, fromPort, dir, x1, y1 } -- legacy drag-to-wire
let pendingWire = null; // { fromNode, fromPort, fromDir } -- click-once-then-click-again wiring (Mac-friendly)
let nextWireColor = '#e0a030';
const WIRE_COLORS = ['#e0a030', '#e6584f', '#5bc0de', '#5fd56b', '#b15be0', '#ffffff', '#ff8fd1', '#7fd3ff'];
let colorIdx = 0;

const workspace = document.getElementById('workspace');
const wireLayer = document.getElementById('wireLayer');
const inspector = document.getElementById('inspector');
const tooltip = document.getElementById('tooltip');
const statusbar = document.getElementById('statusbar');

const nodeEls = {}; // nodeId -> { el, ports: {portId: el}, update: fn }

// -------------------------------------------------------------------------
// PALETTE
// -------------------------------------------------------------------------
function buildPalette() {
  const palette = document.getElementById('palette');
  palette.innerHTML = '';
  const search = document.createElement('input');
  search.className = 'search';
  search.placeholder = 'Search components…';
  palette.appendChild(search);

  const sections = {};
  CATEGORIES.forEach((cat) => {
    const header = document.createElement('div');
    header.className = 'cat-header';
    header.textContent = cat.label;
    palette.appendChild(header);
    const wrap = document.createElement('div');
    wrap.className = 'cat-items';
    palette.appendChild(wrap);
    sections[cat.id] = { header, wrap };
    (PALETTE_ORDER[cat.id] || []).forEach((typeKey) => {
      const def = COMPONENT_TYPES[typeKey];
      const item = document.createElement('div');
      item.className = 'palette-item';
      item.dataset.type = typeKey;
      item.innerHTML = `
        <div class="swatch" style="background:${def.color}"></div>
        <div class="pname">${def.name}</div>
        <div class="pprice">${formatPrice(def.price)}</div>
        <div class="info-icon">i</div>`;
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('info-icon')) return;
        addNodeFromPalette(typeKey);
      });
      item.querySelector('.info-icon').addEventListener('mouseenter', (e) => showTooltip(e, def.name, def.note + (def.price != null ? ` Buy it at ${SHOP_INFO.name} for $${def.price.toLocaleString()}.` : ` Its real in-game price isn't confirmed yet, so it's left off the cost total.`)));
      item.querySelector('.info-icon').addEventListener('mouseleave', hideTooltip);
      wrap.appendChild(item);
    });
  });

  const costBox = document.createElement('div');
  costBox.id = 'costSummary';
  palette.appendChild(costBox);

  search.addEventListener('input', () => {
    const q = search.value.trim().toLowerCase();
    CATEGORIES.forEach((cat) => {
      let any = false;
      sections[cat.id].wrap.querySelectorAll('.palette-item').forEach((item) => {
        const name = COMPONENT_TYPES[item.dataset.type].name.toLowerCase();
        const show = !q || name.includes(q);
        item.style.display = show ? '' : 'none';
        if (show) any = true;
      });
      sections[cat.id].header.style.display = any ? '' : 'none';
      sections[cat.id].wrap.style.display = any ? '' : 'none';
    });
  });
}

function addNodeFromPalette(typeKey) {
  const wrap = document.getElementById('workspace-wrap');
  const x = (wrap.scrollLeft + 220 + Math.random() * 60) / zoom;
  const y = (wrap.scrollTop + 120 + Math.random() * 60) / zoom;
  const node = graph.addNode(typeKey, Math.round(x / 10) * 10, Math.round(y / 10) * 10);
  renderNode(node);
  selectThing('node', node.id);
  refreshCostSummary();
}

function formatPrice(price) {
  return price == null ? 'price n/a' : '$' + price.toLocaleString();
}

// Live running total of everything currently placed on the canvas, plus
// where to actually go buy it in-game.
function refreshCostSummary() {
  const box = document.getElementById('costSummary');
  if (!box) return;
  const counts = {};
  Object.values(graph.nodes).forEach((n) => { counts[n.type] = (counts[n.type] || 0) + 1; });
  let total = 0, unknownCount = 0, itemCount = 0;
  const lines = Object.entries(counts).map(([type, count]) => {
    const def = COMPONENT_TYPES[type];
    itemCount += count;
    if (def.price == null) { unknownCount += count; return { name: def.name, count, sub: null }; }
    const sub = def.price * count;
    total += sub;
    return { name: def.name, count, sub };
  }).sort((a, b) => (b.sub || 0) - (a.sub || 0));

  box.innerHTML = `
    <div class="cost-title">🛒 Build Cost</div>
    <div class="cost-rows">${lines.length ? lines.map((l) => `
      <div class="cost-row"><span>${l.name} ${l.count > 1 ? `×${l.count}` : ''}</span><span>${l.sub == null ? 'n/a' : '$' + l.sub.toLocaleString()}</span></div>
    `).join('') : '<div class="cost-empty">Nothing placed yet.</div>'}</div>
    <div class="cost-total"><span>Total (${itemCount} item${itemCount === 1 ? '' : 's'})</span><span>$${total.toLocaleString()}</span></div>
    ${unknownCount ? `<div class="cost-note">${unknownCount} item${unknownCount === 1 ? '' : 's'} excluded — price not yet confirmed.</div>` : ''}
    <div class="cost-shop">📍 Bought at <b>${SHOP_INFO.name}</b><br>${SHOP_INFO.location}</div>
  `;
}

// -------------------------------------------------------------------------
// TOOLTIP
// -------------------------------------------------------------------------
function showTooltip(e, title, text) {
  tooltip.innerHTML = `<b>${title}</b><br>${text}`;
  tooltip.style.display = 'block';
  const rect = e.target.getBoundingClientRect();
  tooltip.style.left = (rect.right + 8) + 'px';
  tooltip.style.top = rect.top + 'px';
}
function hideTooltip() { tooltip.style.display = 'none'; }

// Per-port hover descriptions for ports whose label alone ("A", "B", "DATA"...)
// isn't self-explanatory. Falls back to a sensible generic line otherwise.
const PORT_DESCRIPTIONS = {
  // Gates
  'andGate.x': 'X — compared against Y. Equation: X = Y (and both > 0).',
  'andGate.y': 'Y — compared against X. Equation: X = Y (and both > 0).',
  'andGate.out': 'Equals X (which equals Y) whenever the gate fires, otherwise 0.',
  'orGate.x': 'X — equation: max(X, Y).',
  'orGate.y': 'Y — equation: max(X, Y).',
  'orGate.out': 'Equals whichever of X or Y is higher, as long as one is greater than 0.',
  'xandGate.x': 'X — compared against Y. Equation: X = Y.',
  'xandGate.y': 'Y — compared against X. Equation: X = Y.',
  'xandGate.out': 'Equals X when X = Y (or 10 if both are 0), otherwise 0.',
  'xorGate.x': 'X — equation: X ⊕ Y (exactly one active fires this gate).',
  'xorGate.y': 'Y — equation: X ⊕ Y (exactly one active fires this gate).',
  'xorGate.out': '10 when exactly one of X / Y is active, otherwise 0.',
  'notGate.x': 'X — equation: NOT X.',
  'notGate.out': '10 when X is 0, otherwise 0.',
  'greaterThanGate.y': 'Y — equation: Y > X. Output equals Y when true.',
  'greaterThanGate.x': 'X — equation: Y > X. The value Y is compared against.',
  'greaterThanGate.out': 'Equals Y whenever Y > X, otherwise 0.',
  // Binary I/O
  'binaryInput.b16': 'Bit with weight 16 — when active adds 16 to the output.',
  'binaryInput.b8':  'Bit with weight 8 — when active adds 8 to the output.',
  'binaryInput.b4':  'Bit with weight 4 — when active adds 4 to the output.',
  'binaryInput.b2':  'Bit with weight 2 — when active adds 2 to the output.',
  'binaryInput.b1':  'Bit with weight 1 — when active adds 1 to the output.',
  'binaryOutput.b1':  'Goes to 10.0 when the 1s bit of the input is set.',
  'binaryOutput.b2':  'Goes to 10.0 when the 2s bit of the input is set.',
  'binaryOutput.b4':  'Goes to 10.0 when the 4s bit of the input is set.',
  'binaryOutput.b8':  'Goes to 10.0 when the 8s bit of the input is set.',
  'binaryOutput.b16': 'Goes to 10.0 when the 16s bit of the input is set.',
  // Calculator
  'calculator.in1': 'A — the first operand (left side of the operation).',
  'calculator.in2': 'B — the second operand (right side of the operation).',
  // Processors
  'relay.signal': 'The signal that gets passed through to OUT — only while ACTIVATE is on.',
  'relay.activate': 'While this is greater than 0, the SIGNAL input is passed through to OUT.',
  'blocker.signal': 'The signal that gets passed through to OUT — unless BLOCK is on.',
  'blocker.block': 'While this is greater than 0, the SIGNAL input is blocked (output is 0).',
  'signalLock.data': 'The value to latch — captured while ENABLE is active.',
  'signalLock.enable': 'While active, allows DATA to be captured and held at OUT.',
  'tFlipFlop.in': 'Any pulse greater than 0 flips the output between 10 and 0, like a switch.',
  'numberSplitter.in': 'The number to split into individual digits (ones, tens, hundreds...)',
  'numberSplitter.d1': 'The ones digit of the input.',
  'numberSplitter.d2': 'The tens digit of the input.',
  'numberSplitter.d3': 'The hundreds digit of the input.',
  'numberSplitter.d4': 'The thousands digit of the input.',
  'numberSplitter.d5': 'Any remainder beyond the thousands digit.',
  'numberCombiner.in1': 'Multiplied by 1 before adding to the output.',
  'numberCombiner.in2': 'Multiplied by 10 before adding to the output.',
  'numberCombiner.in3': 'Multiplied by 100 before adding to the output.',
  'numberCombiner.in4': 'Multiplied by 1,000 before adding to the output.',
  'numberCombiner.in5': 'Multiplied by 10,000 before adding to the output.',
  'memoryCell.data': 'The value to store — captured on a rising edge, if nothing is stored yet.',
  'memoryCell.reset': 'Clears the stored value back to 0, allowing a new value to be written.',
  'memoryCell.out': 'The currently stored value (stays at 0 until a DATA signal is captured).',
  'incrementor.add': 'Each pulse adds (signal / 10) to the running count — a normal 10 signal adds exactly 1.',
  'incrementor.reset': 'Clears the running count back to 0.',
  'sustainer.in': 'Whatever signal arrives here gets held at OUT for the configured duration after it drops.',
  'delay.in': 'The signal that will reappear at OUT after the configured delay.',
  'frequency.in': 'The current value of this input is re-sampled and re-sent once per interval.',
  'zeroTick.in': 'On every rising edge, this value is echoed to OUT for exactly 0.1 seconds.',
  'randomizer.in': 'A new random number from 0 to this value is picked each time the input newly becomes active.',
  'hertzClock.out': 'Alternates between 0 and 10 at the configured frequency — no input needed.',
  'numberInterface.out': 'A constant value you type in — no input needed.',
  // Wireless
  'wirelessTransmitter.in': 'Whatever arrives here is broadcast on the keyphrase to any Receiver sharing it.',
  'wirelessReceiver.out': 'Mirrors whatever is being broadcast on the matching keyphrase.',
  // Sensors
  'proximitySensor.out': '10 for property owner, 5 for trusted, 1 for untrusted, 0 if nobody within 15 studs.',
  'weatherSensor.out': '1 sunny, 2 cloudy, 3 rain, 4 thunderstorm, 5 aurora borealis, 6 falling star event.',
  'daylightSensor.out': 'In-game time of day as a number from 0 (midnight) to just under 24.',
  // Structures
  'sevenSegment.number': 'The digit to display (0-9; the value mod 10 is used).',
  'sevenSegment.color': 'Tints the display; each value maps to a different hue.',
  'sevenSegment.through': 'Passthrough — echoes the NUMBER input onward so you can chain displays.',
  'fourteenSegment.number': 'The character to display (A-Z then 0-9 by value mod 36).',
  'fourteenSegment.color': 'Tints the display; each value maps to a different hue.',
  'fourteenSegment.through': 'Passthrough — echoes the NUMBER input onward so you can chain displays.',
  'speaker.in': 'While greater than 0 (max once per second), sends the message. {num} is replaced with this value.',
  'donator.setAmount': 'Feed from an Interactor or any source to change the donation amount remotely.',
  'donator.out': 'Pulses with the donor user ID the instant someone donates.',
  'electronicBillboard.in': 'Provide a Roblox Image ID as a number (e.g. from a Number Interface).',
  // Other
  'interactor.in': 'A changing value triggers the Interactor once — the new value is forwarded to every selected object.',
  'interactor.out': 'Pulses with the new value only on the tick the input changes.',
  'ownershipManager.in': 'Exactly 10.0 clears ownership; any other positive value transfers ownership to that user ID.',
  'redLaser.out': '10 if hitting an object, 5 if hitting a player, 0 if hitting nothing.',
  'laserReceiver.in': 'Wire a Red Laser or Material Laser output here.',
  'laserReceiver.out': '10 when a laser is hitting this receiver, 0 otherwise.',
  'materialLaser.out': '10 when the beam hits the assigned material, 0 otherwise.',
  'collider.in': 'While greater than 0, disables collisions in the selected region.',
  'tether.in': 'Signal to pass through (with a very slight one-tick delay, matching the real Tether).',
  'tether.out': 'The input signal, one tick later.',
};
function portDescription(type, p) {
  return PORT_DESCRIPTIONS[`${type}.${p.id}`] || `Carries the ${p.label} value for this component.`;
}

// -------------------------------------------------------------------------
// MULTI-SELECT (box-select, shift-click, group move/duplicate/delete)
// -------------------------------------------------------------------------
function toggleMultiSelect(nodeId) {
  if (multiSelected.has(nodeId)) multiSelected.delete(nodeId);
  else multiSelected.add(nodeId);
  if (multiSelected.size > 0) selected = null;
  refreshMultiSelectVisual();
  renderInspector();
}
function clearMultiSelect() {
  multiSelected.clear();
  refreshMultiSelectVisual();
}
function refreshMultiSelectVisual() {
  Object.values(nodeEls).forEach((n) => n.el.classList.remove('multi-selected'));
  multiSelected.forEach((id) => { if (nodeEls[id]) nodeEls[id].el.classList.add('multi-selected'); });
}
function deleteSelectionOrNode(fallbackId) {
  if (multiSelected.size > 1 && multiSelected.has(fallbackId)) {
    Array.from(multiSelected).forEach((id) => deleteNode(id));
    clearMultiSelect();
    deselect();
  } else {
    deleteNode(fallbackId);
  }
}
function duplicateSelection() {
  const ids = multiSelected.size ? Array.from(multiSelected) : (selected && selected.kind === 'node' ? [selected.id] : []);
  if (!ids.length) return;
  const idSet = new Set(ids);
  const idMap = {};
  const newIds = [];
  ids.forEach((id) => {
    const n = graph.nodes[id];
    if (!n) return;
    const clone = graph.addNode(n.type, n.x + 36, n.y + 36, { params: JSON.parse(JSON.stringify(n.params)) });
    Object.assign(clone.state, JSON.parse(JSON.stringify(extractControlState(n))));
    idMap[id] = clone.id;
    newIds.push(clone.id);
    renderNode(clone);
  });
  // re-create internal wires (both ends inside the duplicated set) so duplicated groups keep their wiring
  Object.values(graph.wires).forEach((w) => {
    if (idSet.has(w.from.node) && idSet.has(w.to.node)) {
      graph.addWire(idMap[w.from.node], w.from.port, idMap[w.to.node], w.to.port, w.color);
    }
  });
  renderAllWires();
  refreshPortBadges();
  clearMultiSelect();
  newIds.forEach((id) => multiSelected.add(id));
  refreshMultiSelectVisual();
  renderInspector();
  refreshCostSummary();
}
function startMarquee(startEvent) {
  const wrapRect = workspace.getBoundingClientRect();
  const x1 = (startEvent.clientX - wrapRect.left) / zoom, y1 = (startEvent.clientY - wrapRect.top) / zoom;
  const el = document.createElement('div');
  el.style.position = 'absolute'; el.style.border = '1px dashed #4fb8e8'; el.style.background = 'rgba(79,184,232,0.12)';
  el.style.left = x1 + 'px'; el.style.top = y1 + 'px'; el.style.width = '0px'; el.style.height = '0px'; el.style.zIndex = '50'; el.style.pointerEvents = 'none';
  workspace.appendChild(el);
  marquee = { x1, y1, el };
  function onMove(ev) {
    const x2 = (ev.clientX - wrapRect.left) / zoom, y2 = (ev.clientY - wrapRect.top) / zoom;
    const left = Math.min(marquee.x1, x2), top = Math.min(marquee.y1, y2);
    const w = Math.abs(x2 - marquee.x1), h = Math.abs(y2 - marquee.y1);
    el.style.left = left + 'px'; el.style.top = top + 'px'; el.style.width = w + 'px'; el.style.height = h + 'px';
    marquee.cur = { left, top, w, h };
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (marquee.cur && (marquee.cur.w > 4 || marquee.cur.h > 4)) {
      const box = marquee.cur;
      clearMultiSelect();
      Object.values(graph.nodes).forEach((n) => {
        const def = COMPONENT_TYPES[n.type];
        const nh = nodeEls[n.id]?.el.offsetHeight || def.h;
        const intersects = n.x < box.left + box.w && n.x + def.w > box.left && n.y < box.top + box.h && n.y + nh > box.top;
        if (intersects) multiSelected.add(n.id);
      });
      refreshMultiSelectVisual();
      renderInspector();
    }
    el.remove();
    marquee = null;
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// -------------------------------------------------------------------------
// NODE RENDERING
// -------------------------------------------------------------------------
function portPositions(def) {
  const headerH = 28;
  const ins = def.ports.filter((p) => p.dir === 'in');
  const outs = def.ports.filter((p) => p.dir === 'out');
  const usable = def.h - headerH;
  const map = {};
  ins.forEach((p, i) => { map[p.id] = headerH + usable * (i + 1) / (ins.length + 1); });
  outs.forEach((p, i) => { map[p.id] = headerH + usable * (i + 1) / (outs.length + 1); });
  return map;
}

function renderNode(node) {
  const def = COMPONENT_TYPES[node.type];
  const el = document.createElement('div');
  el.className = 'node';
  el.style.left = node.x + 'px';
  el.style.top = node.y + 'px';
  el.style.width = def.w + 'px';
  el.style.minHeight = def.h + 'px';
  el.dataset.nodeId = node.id;

  const header = document.createElement('div');
  header.className = 'node-header';
  header.style.background = shadeColor(def.color, -55);
  header.innerHTML = `
    <span class="dot" style="background:${def.color}"></span>
    <span class="htitle">${def.name}</span>
    <button class="nbtn info-btn" title="Info">ⓘ</button>
    <button class="nbtn del-btn" title="Delete">✕</button>`;
  el.appendChild(header);
  header.querySelector('.info-btn').addEventListener('mouseenter', (e) => showTooltip(e, def.name, def.note));
  header.querySelector('.info-btn').addEventListener('mouseleave', hideTooltip);
  header.querySelector('.del-btn').addEventListener('click', (e) => { e.stopPropagation(); deleteSelectionOrNode(node.id); });

  const body = document.createElement('div');
  body.className = 'node-body';
  el.appendChild(body);

  // dragging — if this node is part of a multi-selection, the whole group moves together
  header.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('nbtn')) return;
    if (e.button !== 0) return; // left-click only; right-click is handled by contextmenu (delete)
    if (e.shiftKey) { toggleMultiSelect(node.id); e.stopPropagation(); return; }
    if (!multiSelected.has(node.id)) { clearMultiSelect(); }
    selectThing('node', node.id);
    const groupIds = multiSelected.size > 1 ? Array.from(multiSelected) : [node.id];
    const startX = e.clientX, startY = e.clientY;
    const origins = groupIds.map((id) => ({ id, x: graph.nodes[id].x, y: graph.nodes[id].y }));
    function onMove(ev) {
      const dx = (ev.clientX - startX) / zoom, dy = (ev.clientY - startY) / zoom;
      origins.forEach((o) => {
        const n = graph.nodes[o.id];
        n.x = Math.max(0, o.x + dx); n.y = Math.max(0, o.y + dy);
        const e2 = nodeEls[o.id]?.el;
        if (e2) { e2.style.left = n.x + 'px'; e2.style.top = n.y + 'px'; }
        updateWiresForNode(o.id);
      });
    }
    function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.stopPropagation();
  });

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (e.shiftKey) { toggleMultiSelect(node.id); return; }
    if (multiSelected.size <= 1) { clearMultiSelect(); selectThing('node', node.id); }
  });
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault(); e.stopPropagation();
    deleteSelectionOrNode(node.id);
  });

  // ports
  const posMap = portPositions(def);
  const portEls = {};
  def.ports.forEach((p) => {
    const portEl = document.createElement('div');
    portEl.className = `port ${p.dir}`;
    portEl.style.top = (posMap[p.id] - PORT_W / 2) + 'px';
    portEl.dataset.nodeId = node.id;
    portEl.dataset.portId = p.id;
    portEl.dataset.dir = p.dir;
    el.appendChild(portEl);
    portEls[p.id] = portEl;

    const label = document.createElement('div');
    label.className = 'port-label';
    label.textContent = p.label;
    label.style.top = (posMap[p.id] - 6) + 'px';
    if (p.dir === 'in') { label.style.left = '10px'; }
    else { label.style.right = '10px'; label.style.textAlign = 'right'; }
    el.appendChild(label);

    // Hover: explain exactly what this port corresponds to (replaces the plain native browser title)
    const portKind = p.dir === 'in' ? 'Input' : 'Output';
    portEl.addEventListener('mouseenter', (e) => showTooltip(e, `${def.name} \u2014 ${p.label}`, `${portKind} port. ${portDescription(node.type, p)}`));
    portEl.addEventListener('mouseleave', hideTooltip);

    portEl.addEventListener('mousedown', (e) => { e.stopPropagation(); beginPortInteraction(e, node.id, p.id, p.dir); });

    if (p.dir === 'in') {
      const badge = document.createElement('div');
      badge.className = 'port-badge';
      badge.style.display = 'none';
      badge.style.top = (posMap[p.id] - 14) + 'px';
      badge.style.left = '6px';
      badge.title = 'Multiple wires — click to set priority';
      badge.addEventListener('click', (e) => { e.stopPropagation(); openPriorityPopup(node.id, p.id, badge); });
      el.appendChild(badge);
      portEls[p.id + '_badge'] = badge;
    }
  });

  // controls / displays inside body
  const dyn = buildControl(node, def, body);

  workspace.appendChild(el);
  nodeEls[node.id] = { el, portEls, body, dyn };
  updateNodeVisual(node);
}

function updateNodeVisual(node) {
  nodeEls[node.id]?.dyn.update();
}

// shade a hex color by percent (negative = darker)
function shadeColor(hex, percent) {
  const f = parseInt(hex.slice(1), 16);
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  const R = f >> 16, G = (f >> 8) & 0x00FF, B = f & 0x0000FF;
  const r = Math.round((t - R) * p) + R, g = Math.round((t - G) * p) + G, b = Math.round((t - B) * p) + B;
  return `rgb(${r},${g},${b})`;
}

// -------------------------------------------------------------------------
// CONTROLS (interactive widgets baked into a node's body)
// Each returns an object with an optional `update(node)` called every tick.
// -------------------------------------------------------------------------
function buildControl(node, def, body) {
  const c = def.control;
  const updaters = [];

  if (c) {
    switch (c.type) {
      case 'momentary': {
        const btn = document.createElement('button');
        btn.className = 'ctrl-btn'; btn.textContent = c.label || 'PRESS';
        const press = () => { node.state.pressed = true; btn.classList.add('active'); };
        const release = () => { node.state.pressed = false; btn.classList.remove('active'); };
        btn.addEventListener('mousedown', press);
        btn.addEventListener('mouseup', release);
        btn.addEventListener('mouseleave', release);
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); press(); });
        btn.addEventListener('touchend', (e) => { e.preventDefault(); release(); });
        body.appendChild(btn);
        break;
      }
      case 'toggle': {
        const btn = document.createElement('button');
        btn.className = 'ctrl-toggle'; btn.textContent = c.label || 'TOGGLE';
        const refresh = () => { btn.classList.toggle('on', !!node.state.on); btn.textContent = (c.label || 'TOGGLE') + (node.state.on ? ' \u2713' : ''); };
        btn.addEventListener('click', () => { node.state.on = !node.state.on; refresh(); });
        refresh();
        body.appendChild(btn);
        break;
      }
      case 'slider': {
        const wrap = document.createElement('div'); wrap.className = 'ctrl-slider';
        const valLabel = document.createElement('div'); valLabel.className = 'val';
        const input = document.createElement('input');
        input.type = 'range'; input.min = c.min; input.max = c.max; input.step = c.step || 1;
        input.value = node.state.value;
        valLabel.textContent = (c.label ? c.label + ': ' : '') + node.state.value;
        input.addEventListener('input', () => { node.state.value = parseFloat(input.value); valLabel.textContent = (c.label ? c.label + ': ' : '') + node.state.value; });
        wrap.appendChild(valLabel); wrap.appendChild(input); body.appendChild(wrap);
        break;
      }
      case 'select': {
        const sel = document.createElement('select'); sel.className = 'ctrl-select';
        c.options.forEach(([val, label]) => {
          const opt = document.createElement('option'); opt.value = val; opt.textContent = label; sel.appendChild(opt);
        });
        sel.value = node.state.value;
        sel.addEventListener('change', () => { node.state.value = sel.value; });
        if (c.label) { const lab = document.createElement('div'); lab.className = 'val'; lab.textContent = c.label; body.appendChild(lab); }
        body.appendChild(sel);
        break;
      }
      case 'number': {
        const wrap = document.createElement('div'); wrap.className = 'ctrl-numiface';
        const label = document.createElement('div'); label.className = 'numiface-label'; label.textContent = 'OUTPUT VALUE';
        const row = document.createElement('div'); row.className = 'numiface-row';
        const minus = document.createElement('button'); minus.className = 'numiface-step'; minus.textContent = '\u2212';
        const input = document.createElement('input');
        input.type = 'number'; input.className = 'numiface-input';
        input.min = c.min; input.max = c.max; input.step = c.step || 1;
        input.value = node.state.value;
        const plus = document.createElement('button'); plus.className = 'numiface-step'; plus.textContent = '+';
        const commit = (v) => { node.state.value = Math.max(c.min, Math.min(c.max, v)); input.value = node.state.value; };
        input.addEventListener('change', () => commit(parseFloat(input.value) || 0));
        minus.addEventListener('click', () => commit((node.state.value || 0) - (c.step || 1)));
        plus.addEventListener('click', () => commit((node.state.value || 0) + (c.step || 1)));
        row.appendChild(minus); row.appendChild(input); row.appendChild(plus);
        wrap.appendChild(label); wrap.appendChild(row); body.appendChild(wrap);
        break;
      }
      case 'donator': {
        const wrap = document.createElement('div'); wrap.className = 'donator-box';
        const amountLine = document.createElement('div'); amountLine.className = 'donator-amount';
        const sim = document.createElement('div'); sim.style.display = 'flex'; sim.style.gap = '4px'; sim.style.width = '100%';
        const idInput = document.createElement('input'); idInput.type = 'number'; idInput.className = 'ctrl-number'; idInput.placeholder = 'Donor user ID'; idInput.style.width = '60%';
        const btn = document.createElement('button'); btn.className = 'ctrl-btn'; btn.style.flex = '1'; btn.textContent = 'DONATE';
        btn.addEventListener('click', () => {
          const id = parseFloat(idInput.value) || Math.floor(Math.random() * 900000000) + 100000000;
          node.state.pulseUntil = graph.time + 0.5; node.state.pulseValue = id;
        });
        sim.appendChild(idInput); sim.appendChild(btn);
        wrap.appendChild(amountLine); wrap.appendChild(sim); body.appendChild(wrap);
        updaters.push(() => { amountLine.textContent = '$' + (node.state.amount ?? node.params.amount) + ' to donate'; });
        break;
      }
      case 'interactorReadout': {
        const wrap = document.createElement('div'); wrap.className = 'interactor-box';
        const readout = document.createElement('div'); readout.className = 'value-readout'; readout.textContent = '\u2014';
        const lab = document.createElement('div'); lab.className = 'val'; lab.textContent = 'last value sent';
        wrap.appendChild(readout); wrap.appendChild(lab); body.appendChild(wrap);
        updaters.push(() => {
          readout.textContent = node.display && node.display.sentValue !== undefined ? String(node.display.sentValue) : '\u2014';
          readout.style.color = node.display && node.display.flashing ? '#ffe34f' : '';
        });
        break;
      }
      case 'commanderTrigger': {
        const wrap = document.createElement('div'); wrap.className = 'commander-trigger';
        const btn = document.createElement('button'); btn.className = 'ctrl-btn'; btn.textContent = 'SAY PHRASE (owner)';
        btn.addEventListener('click', () => { node.state.pulseUntil = graph.time + 0.5; node.state.pulseValue = 10; });
        const btn2 = document.createElement('button'); btn2.className = 'ctrl-btn'; btn2.textContent = 'SAY PHRASE (other)';
        btn2.addEventListener('click', () => { node.state.pulseUntil = graph.time + 0.5; node.state.pulseValue = 1; });
        wrap.appendChild(btn); wrap.appendChild(btn2); body.appendChild(wrap);
        break;
      }
      default: break;
    }
  }

  // Generic inline editors for any configurable params (Delay seconds, Sustainer
  // duration, Frequency Clock Hz, Wireless channel, Speaker message, etc.) — these
  // used to be editable ONLY via the side inspector, which wasn't obvious.
  (def.params || []).forEach((p) => {
    const row = document.createElement('div'); row.className = 'param-field';
    const label = document.createElement('label'); label.textContent = p.label;
    const input = document.createElement('input');
    input.type = p.type === 'number' ? 'number' : 'text';
    if (p.min !== undefined) input.min = p.min;
    if (p.max !== undefined) input.max = p.max;
    input.value = node.params[p.key];
    input.addEventListener('change', () => {
      node.params[p.key] = p.type === 'number' ? (parseFloat(input.value) || 0) : input.value;
      updaters.forEach((u) => u());
    });
    row.appendChild(label); row.appendChild(input);
    body.appendChild(row);
  });

  // Generic / per-type displays driven by node.display each tick
  const displayEl = document.createElement('div');
  displayEl.style.display = 'flex'; displayEl.style.flexDirection = 'column'; displayEl.style.alignItems = 'center'; displayEl.style.gap = '4px';
  body.appendChild(displayEl);

  switch (node.type) {
    case 'speaker': {
      const msgBox = document.createElement('div'); msgBox.className = 'speaker-msg idle'; msgBox.textContent = 'awaiting signal\u2026';
      displayEl.appendChild(msgBox);
      updaters.push(() => {
        const flashing = node.display && node.display.flashing;
        const msg = node.display && node.display.message;
        msgBox.textContent = msg || 'awaiting signal\u2026';
        msgBox.classList.toggle('flashing', !!flashing);
        msgBox.classList.toggle('idle', !msg);
      });
      break;
    }
    case 'donator': {
      // the donator amount line is already rendered in the control section above
      const readout = document.createElement('div'); readout.className = 'value-readout'; readout.style.fontSize = '13px';
      displayEl.appendChild(readout);
      updaters.push(() => {
        const v = node.outputs && node.outputs.out;
        readout.textContent = (v && v > 0) ? `User #${v} donated!` : '';
      });
      break;
    }
    case 'binaryOutput': {
      const wrap = document.createElement('div'); wrap.className = 'ctrl-bits';
      const weights = [1, 2, 4, 8, 16];
      const lamps = weights.map((w) => {
        const l = document.createElement('div'); l.className = 'lamp'; l.style.width = '20px'; l.style.height = '20px';
        l.title = 'bit ' + w; wrap.appendChild(l); return l;
      });
      displayEl.appendChild(wrap);
      updaters.push(() => {
        const keys = ['b1', 'b2', 'b4', 'b8', 'b16'];
        keys.forEach((k, i) => lamps[i].classList.toggle('on', (node.outputs && node.outputs[k] || 0) > 0));
      });
      break;
    }
    case 'lcd': case 'bulbPoweredLights': {
      const wrap = document.createElement('div'); wrap.className = 'light-array' + (node.type === 'bulbPoweredLights' ? ' round' : '');
      const cells = [];
      for (let i = 0; i < 10; i++) { const c2 = document.createElement('div'); c2.className = 'light-cell'; wrap.appendChild(c2); cells.push(c2); }
      displayEl.appendChild(wrap);
      updaters.push(() => {
        const v = (node.display && node.display.value) || 0;
        const lit = Math.max(0, Math.min(10, Math.round(v)));
        cells.forEach((cell, i) => {
          const on = i < lit;
          cell.classList.toggle('on', on);
          cell.style.background = on ? (v > 10 ? `hsl(${(i * 36 + v * 10) % 360},80%,55%)` : '#5fd56b') : '';
        });
      });
      break;
    }
    case 'sevenSegment': {
      const d = document.createElement('div'); d.className = 'seg-digit'; d.textContent = '0';
      displayEl.appendChild(d);
      updaters.push(() => {
        d.textContent = String((node.display && node.display.digit) ?? 0);
        const hue = node.display && node.display.hue;
        d.style.color = hue ? `hsl(${hue % 360},85%,55%)` : '';
        d.style.textShadow = hue ? `0 0 8px hsl(${hue % 360},85%,55%)` : '';
      });
      break;
    }
    case 'fourteenSegment': {
      const d = document.createElement('div'); d.className = 'seg-digit'; d.textContent = 'A';
      displayEl.appendChild(d);
      updaters.push(() => {
        d.textContent = (node.display && node.display.char) ?? 'A';
        const hue = node.display && node.display.hue;
        d.style.color = hue ? `hsl(${hue % 360},85%,55%)` : '';
        d.style.textShadow = hue ? `0 0 8px hsl(${hue % 360},85%,55%)` : '';
      });
      break;
    }
    case 'electronicBillboard': {
      const d = document.createElement('div'); d.className = 'billboard';
      displayEl.appendChild(d);
      updaters.push(() => {
        const id = node.display && node.display.imageId;
        d.innerHTML = id ? `\u{1F5BC}\uFE0F<br>Image #${id}` : '\u{1F5BC}\uFE0F<br><span style="opacity:.5">no image id</span>';
      });
      break;
    }
    case 'musicNote': {
      const d = document.createElement('div'); d.style.fontSize = '28px'; d.textContent = '\u266A';
      displayEl.appendChild(d);
      updaters.push(() => {
        const flashing = node.display && node.display.flashing;
        d.style.color = flashing ? '#ffe34f' : '#666';
        d.style.textShadow = flashing ? '0 0 10px #ffe34f' : 'none';
      });
      break;
    }
    case 'securityCameraDisplay': {
      const d = document.createElement('div'); d.className = 'display-screen'; d.style.fontSize = '11px';
      displayEl.appendChild(d);
      updaters.push(() => { d.textContent = (node.display && node.display.on) ? '\uD83D\uDCF9 LIVE FEED (not simulated)' : '\u26AB powered off'; });
      break;
    }
    case 'privacyGlass': {
      const pane = document.createElement('div'); pane.className = 'glass-pane';
      displayEl.appendChild(pane);
      updaters.push(() => { pane.classList.toggle('opaque', !!(node.display && node.display.opaque)); });
      break;
    }
    case 'interactor': {
      const wrap = document.createElement('div'); wrap.className = 'interactor-box';
      const readout = document.createElement('div'); readout.className = 'value-readout'; readout.textContent = '\u2014';
      const lab = document.createElement('div'); lab.className = 'val'; lab.textContent = 'last value sent';
      wrap.appendChild(readout); wrap.appendChild(lab); displayEl.appendChild(wrap);
      updaters.push(() => {
        readout.textContent = node.display && node.display.sentValue !== undefined ? String(node.display.sentValue) : '\u2014';
        readout.style.color = node.display && node.display.flashing ? '#ffe34f' : '';
      });
      break;
    }
    case 'ownershipManager': {
      const d = document.createElement('div'); d.className = 'display-screen'; d.style.fontSize = '12px';
      displayEl.appendChild(d);
      updaters.push(() => {
        const owner = node.display && node.display.owner;
        d.textContent = owner ? `Owned by #${owner}` : 'Unowned';
      });
      break;
    }
    case 'collider': {
      const lamp = document.createElement('div'); lamp.className = 'lamp';
      const lab = document.createElement('div'); lab.className = 'val';
      displayEl.appendChild(lamp); displayEl.appendChild(lab);
      updaters.push(() => {
        const on = node.display && node.display.collisionsEnabled;
        lamp.classList.toggle('on', !!on);
        lab.textContent = on ? 'Collisions ON' : 'Collisions OFF';
      });
      break;
    }
    case 'numberSplitter': {
      const wrap = document.createElement('div'); wrap.style.display = 'flex'; wrap.style.gap = '4px';
      const labels = ['1000s', '100s', '10s', '1s', 'excess'];
      const keys = ['d4', 'd3', 'd2', 'd1', 'd5'];
      const cells = labels.map((lab) => { const d = document.createElement('div'); d.className = 'value-readout'; d.style.fontSize = '14px'; d.textContent = '0'; return d; });
      cells.forEach((c2) => wrap.appendChild(c2));
      displayEl.appendChild(wrap);
      updaters.push(() => { keys.forEach((k, i) => { cells[i].textContent = String((node.outputs && node.outputs[k]) ?? 0); }); });
      break;
    }
    case 'laserReceiver': case 'materialLaser': {
      const lamp = document.createElement('div'); lamp.className = 'lamp';
      displayEl.appendChild(lamp);
      updaters.push(() => {
        const dispOn = node.display && node.display.on;
        const outOn = node.outputs && node.outputs.out > 0;
        lamp.classList.toggle('on', !!dispOn || !!outOn);
      });
      break;
    }
    case 'andGate': case 'orGate': case 'xandGate': case 'xorGate': case 'notGate': case 'greaterThanGate': {
      // Equation display: shows the gate's formula plus the live values flowing through it.
      const eqRow = document.createElement('div'); eqRow.className = 'gate-equation';
      const liveRow = document.createElement('div'); liveRow.className = 'gate-live';
      const readout = document.createElement('div'); readout.className = 'value-readout';
      eqRow.textContent = def.equation;
      displayEl.appendChild(eqRow);
      displayEl.appendChild(liveRow);
      displayEl.appendChild(readout);
      const hasY = def.ports.some((p) => p.id === 'y');
      updaters.push(() => {
        const x = (node.lastInputs && node.lastInputs.x) ?? 0;
        const y = hasY ? ((node.lastInputs && node.lastInputs.y) ?? 0) : null;
        liveRow.textContent = hasY ? `(X=${x}, Y=${y})` : `(X=${x})`;
        readout.textContent = String(Math.round(((node.outputs && node.outputs.out) || 0) * 100) / 100);
      });
      break;
    }
    default: {
      // generic readout of the first output, for any component that doesn't have its own custom display above
      const hasOut = def.ports.some((p) => p.dir === 'out');
      if (hasOut) {
        const mainOut = def.ports.find((p) => p.dir === 'out');
        const readout = document.createElement('div'); readout.className = 'value-readout'; readout.textContent = '0';
        displayEl.appendChild(readout);
        updaters.push(() => { readout.textContent = String(Math.round(((node.outputs && node.outputs[mainOut.id]) || 0) * 100) / 100); });
      }
    }
  }

  return { update: () => updaters.forEach((u) => u()) };
}

// -------------------------------------------------------------------------
// WIRES
// -------------------------------------------------------------------------
function portCenter(nodeId, portId) {
  const node = graph.nodes[nodeId];
  const def = COMPONENT_TYPES[node.type];
  const posMap = portPositions(def);
  const dir = def.ports.find((p) => p.id === portId).dir;
  const x = node.x + (dir === 'in' ? 0 : def.w);
  const y = node.y + posMap[portId];
  return { x, y };
}

function wirePathD(x1, y1, x2, y2) {
  const dx = Math.max(40, Math.abs(x2 - x1) * 0.5);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

// Builds the full path through any user-placed anchors. With no anchors this
// is just the familiar curvy bezier; with anchors it's straight segments
// through each point, like routing a cable around other components.
function wireFullPathD(p1, anchors, p2) {
  if (!anchors || !anchors.length) return wirePathD(p1.x, p1.y, p2.x, p2.y);
  const pts = [p1, ...anchors, p2];
  return pts.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x} ${pt.y}`).join(' ');
}

function renderAllWires() {
  wireLayer.innerHTML = '';
  Object.values(graph.wires).forEach(renderWire);
  if (selected && selected.kind === 'wire') renderAnchorHandles(selected.id);
}

function renderWire(w) {
  const p1 = portCenter(w.from.node, w.from.port);
  const p2 = portCenter(w.to.node, w.to.port);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('class', 'wire' + (selected && selected.kind === 'wire' && selected.id === w.id ? ' selected' : ''));
  path.setAttribute('d', wireFullPathD(p1, w.anchors, p2));
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', w.color);
  const srcNode = graph.nodes[w.from.node];
  const active = srcNode && (srcNode.outputs[w.from.port] || 0) > 0;
  path.setAttribute('stroke-width', active ? 4 : 2.5);
  path.setAttribute('opacity', active ? 1 : 0.55);
  path.dataset.wireId = w.id;
  path.addEventListener('click', (e) => { e.stopPropagation(); selectThing('wire', w.id); });
  path.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); graph.removeWire(w.id); if (selected && selected.id === w.id) deselect(); renderAllWires(); refreshPortBadges(); });
  path.addEventListener('dblclick', (e) => {
    e.preventDefault(); e.stopPropagation();
    const rect = workspace.getBoundingClientRect();
    const x = (e.clientX - rect.left) / zoom, y = (e.clientY - rect.top) / zoom;
    addAnchorNearest(w, x, y);
    selectThing('wire', w.id);
  });
  wireLayer.appendChild(path);
}

// Insert a new anchor at the correct position along the route (closest segment).
function addAnchorNearest(w, x, y) {
  const p1 = portCenter(w.from.node, w.from.port);
  const p2 = portCenter(w.to.node, w.to.port);
  const pts = [p1, ...(w.anchors || []), p2];
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const d = distToSegment(x, y, pts[i], pts[i + 1]);
    if (d < bestDist) { bestDist = d; bestIdx = i; }
  }
  w.anchors = w.anchors || [];
  w.anchors.splice(bestIdx, 0, { x: Math.round(x), y: Math.round(y) });
  renderAllWires();
}
function distToSegment(px, py, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - a.x) * dx + (py - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * dx, cy = a.y + t * dy;
  return Math.hypot(px - cx, py - cy);
}

// Small draggable handles shown on the selected wire's anchors, so the route can be reshaped.
function renderAnchorHandles(wireId) {
  const w = graph.wires[wireId];
  if (!w || !w.anchors || !w.anchors.length) return;
  w.anchors.forEach((a, i) => {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', a.x); c.setAttribute('cy', a.y); c.setAttribute('r', 6);
    c.setAttribute('fill', '#1b1d23'); c.setAttribute('stroke', '#4fb8e8'); c.setAttribute('stroke-width', '2');
    c.style.cursor = 'grab'; c.style.pointerEvents = 'auto';
    c.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      function onMove(ev) {
        const rect = workspace.getBoundingClientRect();
        a.x = Math.round((ev.clientX - rect.left) / zoom); a.y = Math.round((ev.clientY - rect.top) / zoom);
        renderAllWires();
      }
      function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
    c.addEventListener('contextmenu', (e) => { e.preventDefault(); e.stopPropagation(); w.anchors.splice(i, 1); renderAllWires(); });
    c.addEventListener('dblclick', (e) => { e.preventDefault(); e.stopPropagation(); w.anchors.splice(i, 1); renderAllWires(); });
    c.title = 'Drag to reroute · right-click or double-click to remove';
    wireLayer.appendChild(c);
  });
}

function updateWiresForNode(nodeId) {
  // Anchors are absolute, so the simplest correct approach when a node moves
  // is just to redraw everything — cheap enough at editor scale.
  renderAllWires();
}

// ---- Wire creation: supports BOTH classic drag-to-connect AND a single
// click-then-click flow (much more reliable on Mac trackpads). ----
function beginPortInteraction(e, nodeId, portId, dir) {
  const downX = e.clientX, downY = e.clientY;
  let dragging = false;
  let tempPath = null;
  const start = portCenter(nodeId, portId);

  function ensureTempPath() {
    if (tempPath) return;
    tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    tempPath.setAttribute('class', 'tempwire'); tempPath.setAttribute('fill', 'none');
    tempPath.setAttribute('stroke', nextWireColor); tempPath.setAttribute('stroke-width', '3'); tempPath.setAttribute('stroke-dasharray', '6 4');
    wireLayer.appendChild(tempPath);
  }
  function moveTempTo(clientX, clientY) {
    const rect = workspace.getBoundingClientRect();
    const x2 = (clientX - rect.left) / zoom, y2 = (clientY - rect.top) / zoom;
    tempPath.setAttribute('d', wirePathD(start.x, start.y, x2, y2));
  }

  function onMove(ev) {
    if (!dragging && Math.hypot(ev.clientX - downX, ev.clientY - downY) > 5) {
      dragging = true;
      cancelPendingWire(); // a real drag always supersedes click-mode
      ensureTempPath();
    }
    if (dragging) moveTempTo(ev.clientX, ev.clientY);
  }
  function onUp(ev) {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    if (dragging) {
      if (tempPath) tempPath.remove();
      const target = document.elementFromPoint(ev.clientX, ev.clientY);
      if (target && target.classList.contains('port')) {
        completeWire(nodeId, portId, dir, target.dataset.nodeId, target.dataset.portId, target.dataset.dir);
      }
    } else {
      // a true click (no drag) — toggle click-then-click wiring mode
      handlePortClick(nodeId, portId, dir);
    }
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function handlePortClick(nodeId, portId, dir) {
  if (!pendingWire) {
    pendingWire = { fromNode: nodeId, fromPort: portId, fromDir: dir };
    nodeEls[nodeId]?.portEls[portId]?.classList.add('active');
    document.addEventListener('mousemove', trackPendingLine);
    document.addEventListener('keydown', cancelPendingOnEscape);
    return;
  }
  if (pendingWire.fromNode === nodeId && pendingWire.fromPort === portId) { cancelPendingWire(); return; }
  if (pendingWire.fromDir === dir) {
    // clicked another port of the same direction — restart the pending wire from there instead of erroring
    cancelPendingWire();
    handlePortClick(nodeId, portId, dir);
    return;
  }
  completeWire(pendingWire.fromNode, pendingWire.fromPort, pendingWire.fromDir, nodeId, portId, dir);
  cancelPendingWire();
}

let pendingLineEl = null;
function trackPendingLine(e) {
  if (!pendingWire) return;
  const start = portCenter(pendingWire.fromNode, pendingWire.fromPort);
  if (!pendingLineEl) {
    pendingLineEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pendingLineEl.setAttribute('class', 'tempwire'); pendingLineEl.setAttribute('fill', 'none');
    pendingLineEl.setAttribute('stroke', nextWireColor); pendingLineEl.setAttribute('stroke-width', '3'); pendingLineEl.setAttribute('stroke-dasharray', '6 4');
    wireLayer.appendChild(pendingLineEl);
  }
  const rect = workspace.getBoundingClientRect();
  const x2 = (e.clientX - rect.left) / zoom, y2 = (e.clientY - rect.top) / zoom;
  pendingLineEl.setAttribute('d', wirePathD(start.x, start.y, x2, y2));
}
function cancelPendingOnEscape(e) { if (e.key === 'Escape') cancelPendingWire(); }
function cancelPendingWire() {
  if (pendingWire) nodeEls[pendingWire.fromNode]?.portEls[pendingWire.fromPort]?.classList.remove('active');
  pendingWire = null;
  if (pendingLineEl) { pendingLineEl.remove(); pendingLineEl = null; }
  document.removeEventListener('mousemove', trackPendingLine);
  document.removeEventListener('keydown', cancelPendingOnEscape);
}

function completeWire(nodeA, portA, dirA, nodeB, portB, dirB) {
  if (nodeA === nodeB && portA === portB) return;
  if (dirA === dirB) return; // must connect an output to an input
  let fromNode = nodeA, fromPort = portA, tNode = nodeB, tPort = portB;
  if (dirA === 'in') { [fromNode, tNode] = [tNode, fromNode]; [fromPort, tPort] = [tPort, fromPort]; }
  graph.addWire(fromNode, fromPort, tNode, tPort, nextWireColor);
  renderAllWires();
  refreshPortBadges();
}

function refreshPortBadges() {
  Object.values(graph.nodes).forEach((node) => {
    const def = COMPONENT_TYPES[node.type];
    def.ports.filter((p) => p.dir === 'in').forEach((p) => {
      const count = (node.inputPriority[p.id] || []).length;
      const badge = nodeEls[node.id] && nodeEls[node.id].portEls[p.id + '_badge'];
      if (badge) {
        badge.style.display = count > 1 ? 'flex' : 'none';
        badge.textContent = count > 1 ? count : '';
      }
    });
  });
}

// -------------------------------------------------------------------------
// WIRE PRIORITY POPUP
// -------------------------------------------------------------------------
function openPriorityPopup(nodeId, portId, anchorEl) {
  closePriorityPopup();
  const popup = document.createElement('div');
  popup.id = 'priorityPopup';
  const rect = anchorEl.getBoundingClientRect();
  popup.style.left = (rect.right + 8 + window.scrollX) + 'px';
  popup.style.top = (rect.top + window.scrollY) + 'px';
  popup.innerHTML = '<span class="close">\u2715</span><h4>Wire Priority (top wins)</h4>';
  popup.querySelector('.close').addEventListener('click', closePriorityPopup);

  function refreshList() {
    popup.querySelectorAll('.priwire').forEach((e) => e.remove());
    const order = graph.nodes[nodeId].inputPriority[portId] || [];
    order.forEach((wid, i) => {
      const w = graph.wires[wid];
      if (!w) return;
      const row = document.createElement('div');
      row.className = 'priwire' + (i === 0 ? ' top' : '');
      const srcDef = COMPONENT_TYPES[graph.nodes[w.from.node].type];
      row.innerHTML = `<span class="rank">${i + 1}</span><span class="swatch" style="background:${w.color}"></span>
        <span style="flex:1">${srcDef.name}</span>
        <button data-act="up" ${i === 0 ? 'disabled' : ''} style="background:none;border:none;color:#9aa0ad;cursor:pointer">\u25B2</button>
        <button data-act="down" ${i === order.length - 1 ? 'disabled' : ''} style="background:none;border:none;color:#9aa0ad;cursor:pointer">\u25BC</button>`;
      row.querySelector('[data-act=up]').addEventListener('click', () => { moveWirePriority(nodeId, portId, i, -1); refreshList(); renderAllWires(); });
      row.querySelector('[data-act=down]').addEventListener('click', () => { moveWirePriority(nodeId, portId, i, 1); refreshList(); renderAllWires(); });
      popup.appendChild(row);
    });
  }
  refreshList();
  document.body.appendChild(popup);
}
function closePriorityPopup() { const p = document.getElementById('priorityPopup'); if (p) p.remove(); }
function moveWirePriority(nodeId, portId, idx, dir) {
  const arr = graph.nodes[nodeId].inputPriority[portId];
  const j = idx + dir;
  if (j < 0 || j >= arr.length) return;
  const tmp = arr[idx]; arr[idx] = arr[j]; arr[j] = tmp;
}

// -------------------------------------------------------------------------
// SELECTION / INSPECTOR
// -------------------------------------------------------------------------
function selectThing(kind, id) {
  selected = { kind, id };
  Object.values(nodeEls).forEach((n) => n.el.classList.remove('selected'));
  if (kind === 'node' && nodeEls[id]) nodeEls[id].el.classList.add('selected');
  renderAllWires();
  renderInspector();
}
function deselect() { selected = null; renderAllWires(); renderInspector(); }

function renderInspector() {
  inspector.innerHTML = '';
  if (!selected) {
    inspector.innerHTML = '<div class="empty">Click a component to inspect &amp; configure it.<br><br>Drag from a port to another port to wire them together. Click a node\'s \u24D8 for exact in-game behavior.</div>';
    return;
  }

  if (selected.kind === 'wire') {
    const w = graph.wires[selected.id];
    if (!w) { deselect(); return; }
    const h3 = document.createElement('h3'); h3.textContent = 'Wire'; inspector.appendChild(h3);
    const row = document.createElement('div'); row.className = 'insp-row';
    row.innerHTML = '<label>Color</label>';
    const colorInput = document.createElement('input'); colorInput.type = 'color'; colorInput.value = rgbToHex(w.color);
    colorInput.addEventListener('input', () => { w.color = colorInput.value; renderAllWires(); });
    row.appendChild(colorInput);
    inspector.appendChild(row);
    const del = document.createElement('button'); del.className = 'insp-delete'; del.textContent = 'Delete Wire';
    del.addEventListener('click', () => { graph.removeWire(w.id); deselect(); renderAllWires(); refreshPortBadges(); });
    inspector.appendChild(del);
    return;
  }

  const node = graph.nodes[selected.id];
  if (!node) { deselect(); return; }
  const def = COMPONENT_TYPES[node.type];
  const h3 = document.createElement('h3'); h3.textContent = def.name; inspector.appendChild(h3);

  (def.params || []).forEach((p) => {
    const row = document.createElement('div'); row.className = 'insp-row';
    const label = document.createElement('label'); label.textContent = p.label; row.appendChild(label);
    const input = document.createElement('input');
    input.type = p.type === 'number' ? 'number' : 'text';
    if (p.min !== undefined) input.min = p.min;
    if (p.max !== undefined) input.max = p.max;
    input.value = node.params[p.key];
    input.addEventListener('change', () => {
      node.params[p.key] = p.type === 'number' ? (parseFloat(input.value) || 0) : input.value;
      if (nodeEls[node.id]) nodeEls[node.id].dyn.update();
    });
    row.appendChild(input);
    inspector.appendChild(row);
  });

  const portsBox = document.createElement('div'); portsBox.className = 'insp-ports';
  def.ports.forEach((p) => {
    const row = document.createElement('div'); row.className = 'prow';
    const val = p.dir === 'in' ? ((node.lastInputs && node.lastInputs[p.id]) ?? 0) : ((node.outputs && node.outputs[p.id]) ?? 0);
    row.innerHTML = `<span>${p.dir === 'in' ? '\u2192' : '\u2190'} ${p.label}</span><span class="pv">${Math.round(val * 100) / 100}</span>`;
    portsBox.appendChild(row);
  });
  inspector.appendChild(portsBox);

  const priceRow = document.createElement('div'); priceRow.className = 'insp-price';
  priceRow.innerHTML = def.price != null
    ? `\uD83D\uDCB2 <b>$${def.price.toLocaleString()}</b> at ${SHOP_INFO.name}`
    : `\uD83D\uDCB2 Price not confirmed yet \u2014 sold at ${SHOP_INFO.name}`;
  inspector.appendChild(priceRow);

  const note = document.createElement('div'); note.className = 'insp-note'; note.textContent = def.note;
  inspector.appendChild(note);

  const del = document.createElement('button'); del.className = 'insp-delete'; del.textContent = 'Delete Component';
  del.addEventListener('click', () => deleteNode(node.id));
  inspector.appendChild(del);
}

function rgbToHex(c) {
  if (c.startsWith('#')) return c;
  const nums = c.match(/\d+/g).map(Number);
  return '#' + nums.slice(0, 3).map((n) => n.toString(16).padStart(2, '0')).join('');
}

function deleteNode(id) {
  graph.removeNode(id);
  if (nodeEls[id]) nodeEls[id].el.remove();
  delete nodeEls[id];
  if (selected && selected.kind === 'node' && selected.id === id) deselect();
  renderAllWires();
  refreshPortBadges();
  refreshCostSummary();
}

// -------------------------------------------------------------------------
// PRICES / COST SUMMARY
// -------------------------------------------------------------------------
// Every price below comes straight from def.price in components.js (verified
// against Alan's AutoLogistics). Privacy Glass doesn't have a confirmed
// price yet and shows as "n/a".
function openCostModal() {
  const counts = {};
  Object.values(graph.nodes).forEach((n) => { counts[n.type] = (counts[n.type] || 0) + 1; });
  const body = document.getElementById('costBody');
  body.innerHTML = '';
  let total = 0, anyUnknown = false;
  Object.keys(counts).sort((a, b) => COMPONENT_TYPES[a].name.localeCompare(COMPONENT_TYPES[b].name)).forEach((type) => {
    const def = COMPONENT_TYPES[type];
    const qty = counts[type];
    const price = def.price;
    if (price == null) anyUnknown = true;
    const subtotal = price == null ? null : price * qty;
    if (subtotal !== null) total += subtotal;
    const row = document.createElement('div'); row.className = 'cost-row';
    row.innerHTML = `
      <span class="cost-name">${def.name}</span>
      <span class="cost-qty">\u00d7${qty}</span>
      <span class="cost-unit">${price == null ? 'n/a' : '$' + price.toLocaleString()}</span>
      <span class="cost-subtotal">${subtotal === null ? 'n/a' : '$' + subtotal.toLocaleString()}</span>`;
    body.appendChild(row);
  });
  document.getElementById('costTotal').textContent = '$' + total.toLocaleString();
  document.getElementById('costNote').style.display = anyUnknown ? 'block' : 'none';
  document.getElementById('costModal').style.display = 'flex';
}
// -------------------------------------------------------------------------
let lastTickTime = performance.now();
function loop() {
  const now = performance.now();
  const interval = 1000 / tickRate;
  if (running && now - lastTickTime >= interval) {
    graph.tick(interval / 1000);
    lastTickTime = now;
    Object.values(graph.nodes).forEach((node) => { if (nodeEls[node.id]) nodeEls[node.id].dyn.update(); });
    renderAllWires();
    const statTime = document.getElementById('statTime');
    if (statTime) statTime.textContent = 'Sim time: ' + graph.time.toFixed(1) + 's';
  }
  requestAnimationFrame(loop);
}

// -------------------------------------------------------------------------
// TOOLBAR / SAVE / LOAD (human-readable JSON export+import) / KEYBOARD
// -------------------------------------------------------------------------
function initToolbar() {
  document.getElementById('runBtn').addEventListener('click', (e) => {
    running = !running;
    e.target.textContent = running ? '\u23F8 Pause' : '\u25B6 Run';
    e.target.classList.toggle('primary', running);
  });
  document.getElementById('clearBtn').addEventListener('click', () => {
    if (!confirm('Clear the entire canvas? This cannot be undone.')) return;
    Object.keys(graph.nodes).forEach((id) => deleteNode(id));
  });
  document.getElementById('rateSelect').addEventListener('change', (e) => { tickRate = parseInt(e.target.value, 10); });
  document.getElementById('zoomIn').addEventListener('click', () => setZoom(zoom + 0.1));
  document.getElementById('zoomOut').addEventListener('click', () => setZoom(zoom - 0.1));
  document.getElementById('zoomReset').addEventListener('click', () => setZoom(1));
  const colorPicker = document.getElementById('wireColorPicker');
  colorPicker.value = nextWireColor;
  colorPicker.addEventListener('input', () => { nextWireColor = colorPicker.value; });
  document.getElementById('duplicateBtn').addEventListener('click', duplicateSelection);
  document.getElementById('deleteSelBtn').addEventListener('click', () => {
    if (multiSelected.size) { Array.from(multiSelected).forEach((id) => deleteNode(id)); clearMultiSelect(); }
    else if (selected && selected.kind === 'node') deleteNode(selected.id);
    else if (selected && selected.kind === 'wire') { graph.removeWire(selected.id); deselect(); renderAllWires(); refreshPortBadges(); }
  });
  document.getElementById('costBtn').addEventListener('click', openCostModal);
  document.getElementById('saveBtn').addEventListener('click', saveToFile);
  document.getElementById('exportBtn').addEventListener('click', openExportModal);
  document.getElementById('loadInput').addEventListener('change', loadFromFile);
  document.getElementById('importPasteBtn').addEventListener('click', openImportModal);
  document.getElementById('helpBtn').addEventListener('click', () => { document.getElementById('helpModal').style.display = 'flex'; });
  document.querySelectorAll('.modal-backdrop .close-modal').forEach((b) => b.addEventListener('click', (e) => { e.target.closest('.modal-backdrop').style.display = 'none'; }));

  document.getElementById('exportCopyBtn').addEventListener('click', async () => {
    const ta = document.getElementById('exportTextarea');
    ta.select();
    try { await navigator.clipboard.writeText(ta.value); flashButton('exportCopyBtn', 'Copied!'); }
    catch { document.execCommand('copy'); flashButton('exportCopyBtn', 'Copied!'); }
  });
  document.getElementById('exportDownloadBtn').addEventListener('click', saveToFile);
  document.getElementById('importGoBtn').addEventListener('click', () => {
    const txt = document.getElementById('importTextarea').value.trim();
    if (!txt) { alert('Paste exported JSON into the box first.'); return; }
    try {
      const data = JSON.parse(txt);
      importFromObject(data);
      document.getElementById('importModal').style.display = 'none';
    } catch (err) {
      alert('That text is not valid JSON from this editor.\n\n' + err.message);
    }
  });

  workspace.addEventListener('click', (e) => { if (e.target === workspace) { deselect(); clearMultiSelect(); } cancelPendingWire(); });
  workspace.addEventListener('mousedown', (e) => {
    if (e.target !== workspace) return; // only start a marquee when clicking empty canvas, not a node/port/wire
    if (e.button !== 0) return;
    startMarquee(e);
  });
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && (selected || multiSelected.size)) {
      e.preventDefault();
      if (multiSelected.size) { Array.from(multiSelected).forEach((id) => deleteNode(id)); clearMultiSelect(); }
      else if (selected.kind === 'node') deleteNode(selected.id);
      else { graph.removeWire(selected.id); deselect(); renderAllWires(); refreshPortBadges(); }
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicateSelection(); }
    if (e.key === 'Escape') { cancelPendingWire(); deselect(); clearMultiSelect(); }
  });
}

function flashButton(id, text) {
  const b = document.getElementById(id);
  const old = b.textContent;
  b.textContent = text;
  setTimeout(() => { b.textContent = old; }, 1200);
}

function setZoom(z) {
  zoom = Math.max(0.4, Math.min(2, z));
  workspace.style.transform = `scale(${zoom})`;
  document.getElementById('zoomLabel').textContent = Math.round(zoom * 100) + '%';
}

// ---- Export: produces clean, indented, human-readable JSON -------------
// (key order is fixed via toJSON()/manual field ordering so files are easy
//  to read, diff, and even hand-edit before re-importing)
function buildExportObject() {
  const data = graph.toJSON();
  return {
    _format: 'oaklands-logic-editor',
    _version: 1,
    _exportedAt: new Date().toISOString(),
    componentCount: data.nodes.length,
    wireCount: data.wires.length,
    nodes: data.nodes.map((n) => ({
      id: n.id,
      type: n.type,
      name: COMPONENT_TYPES[n.type] ? COMPONENT_TYPES[n.type].name : n.type,
      x: n.x,
      y: n.y,
      params: n.params,
      state: n.controlState,
      inputWirePriority: n.inputPriority,
    })),
    wires: data.wires.map((w) => ({
      id: w.id,
      seq: w.seq,
      color: w.color,
      from: { node: w.from.node, port: w.from.port },
      to: { node: w.to.node, port: w.to.port },
      anchors: w.anchors || [],
    })),
  };
}

function saveToFile() {
  const pretty = JSON.stringify(buildExportObject(), null, 2);
  const blob = new Blob([pretty], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'oaklands-logic-circuit.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

function openExportModal() {
  const pretty = JSON.stringify(buildExportObject(), null, 2);
  document.getElementById('exportTextarea').value = pretty;
  document.getElementById('exportModal').style.display = 'flex';
}

function openImportModal() {
  document.getElementById('importTextarea').value = '';
  document.getElementById('importModal').style.display = 'flex';
}

function importFromObject(data) {
  rebuildFromGraph(Graph.fromJSON(data));
}

function loadFromFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      importFromObject(data);
    } catch (err) {
      alert('Could not load file — it is not valid JSON, or not an Oaklands Logic Editor export.\n\n' + err.message);
    }
  };
  reader.readAsText(file);
  e.target.value = '';
}

function rebuildFromGraph(newGraph) {
  Object.keys(graph.nodes).forEach((id) => { delete graph.nodes[id]; });
  Object.keys(graph.wires).forEach((id) => { delete graph.wires[id]; });
  Object.assign(graph, { nodes: newGraph.nodes, wires: newGraph.wires, global: {}, _nextId: newGraph._nextId, time: 0 });
  workspace.querySelectorAll('.node').forEach((n) => n.remove());
  Object.keys(nodeEls).forEach((k) => delete nodeEls[k]);
  Object.values(graph.nodes).forEach((n) => renderNode(n));
  renderAllWires();
  refreshPortBadges();
  deselect();
  refreshCostSummary();
}

// -------------------------------------------------------------------------
// BOOT
// -------------------------------------------------------------------------
buildPalette();
initToolbar();
setZoom(1);
renderInspector();
refreshCostSummary();
requestAnimationFrame(loop);

// Expose for debugging in the browser console (and for automated tests).
if (typeof window !== 'undefined') {
  window.graph = graph;
  window.nodeEls = nodeEls;
  window.multiSelected = multiSelected;
  window.addNodeFromPalette = addNodeFromPalette;
  window.handlePortClick = handlePortClick;
  window.addAnchorNearest = addAnchorNearest;
  window.clearMultiSelect = clearMultiSelect;
  window.toggleMultiSelect = toggleMultiSelect;
  window.duplicateSelection = duplicateSelection;
  window.selectThing = selectThing;
  window.deselect = deselect;
  window.deleteNode = deleteNode;
  window.renderNode = renderNode;
  window.refreshPortBadges = refreshPortBadges;
  window.openCostModal = openCostModal;
  window.buildExportObject = buildExportObject;
  window.importFromObject = importFromObject;
}
