/* =========================================================================
   OAKLANDS LOGIC EDITOR — APP / UI LAYER
   ========================================================================= */

const graph = new Graph();
let running = true;
let tickRate = 20; // Hz
let zoom = 1;
let selected = null; // { kind: 'node'|'wire', id }
let wireDraft = null; // { fromNode, fromPort, dir, x1, y1 }
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
        <div class="info-icon">i</div>`;
      item.addEventListener('click', (e) => {
        if (e.target.classList.contains('info-icon')) return;
        addNodeFromPalette(typeKey);
      });
      item.querySelector('.info-icon').addEventListener('mouseenter', (e) => showTooltip(e, def.name, def.note));
      item.querySelector('.info-icon').addEventListener('mouseleave', hideTooltip);
      wrap.appendChild(item);
    });
  });

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
  el.style.height = def.h + 'px';
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
  header.querySelector('.del-btn').addEventListener('click', (e) => { e.stopPropagation(); deleteNode(node.id); });

  const body = document.createElement('div');
  body.className = 'node-body';
  el.appendChild(body);

  // dragging
  header.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('nbtn')) return;
    selectThing('node', node.id);
    const startX = e.clientX, startY = e.clientY;
    const ox = node.x, oy = node.y;
    function onMove(ev) {
      const dx = (ev.clientX - startX) / zoom, dy = (ev.clientY - startY) / zoom;
      node.x = Math.max(0, ox + dx); node.y = Math.max(0, oy + dy);
      el.style.left = node.x + 'px'; el.style.top = node.y + 'px';
      updateWiresForNode(node.id);
    }
    function onUp() { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.stopPropagation();
  });

  el.addEventListener('click', (e) => { e.stopPropagation(); selectThing('node', node.id); });

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
    portEl.title = p.label;
    el.appendChild(portEl);
    portEls[p.id] = portEl;

    const label = document.createElement('div');
    label.className = 'port-label';
    label.textContent = p.label;
    label.style.top = (posMap[p.id] - 6) + 'px';
    if (p.dir === 'in') { label.style.left = '10px'; }
    else { label.style.right = '10px'; label.style.textAlign = 'right'; }
    el.appendChild(label);

    portEl.addEventListener('mousedown', (e) => { e.stopPropagation(); startWireDraw(node.id, p.id, p.dir); });

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
      case 'joystick2d': {
        const pad = document.createElement('div'); pad.className = 'ctrl-joystick';
        const stick = document.createElement('div'); stick.className = 'stick';
        pad.appendChild(stick);
        let dragging = false;
        const radius = 26;
        function setFromEvent(ev) {
          const rect = pad.getBoundingClientRect();
          const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;
          let dx = ev.clientX - cx, dy = ev.clientY - cy;
          const dist = Math.min(radius, Math.hypot(dx, dy));
          const ang = Math.atan2(dy, dx);
          dx = Math.cos(ang) * dist; dy = Math.sin(ang) * dist;
          stick.style.left = `calc(50% + ${dx}px)`; stick.style.top = `calc(50% + ${dy}px)`;
          node.state.x = Math.round((dx / radius) * c.max * 100) / 100;
          node.state.y = Math.round((-dy / radius) * c.max * 100) / 100;
        }
        pad.addEventListener('mousedown', (e) => { dragging = true; setFromEvent(e); });
        window.addEventListener('mousemove', (e) => { if (dragging) setFromEvent(e); });
        window.addEventListener('mouseup', () => {
          if (!dragging) return; dragging = false;
          stick.style.left = '50%'; stick.style.top = '50%'; node.state.x = 0; node.state.y = 0;
        });
        body.appendChild(pad);
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
        const input = document.createElement('input');
        input.type = 'number'; input.className = 'ctrl-number';
        input.min = c.min; input.max = c.max; input.step = c.step || 1;
        input.value = node.state.value;
        input.addEventListener('change', () => { node.state.value = parseFloat(input.value) || 0; });
        body.appendChild(input);
        break;
      }
      case 'bits': {
        const wrap = document.createElement('div'); wrap.className = 'ctrl-bits';
        for (let i = c.count - 1; i >= 0; i--) {
          const b = document.createElement('button'); b.className = 'bit-btn'; b.textContent = i;
          const refresh = () => b.classList.toggle('on', !!node.state.bits[i]);
          b.addEventListener('click', () => { node.state.bits[i] = node.state.bits[i] ? 0 : 1; refresh(); updaters.forEach((u) => u()); });
          refresh();
          wrap.appendChild(b);
        }
        body.appendChild(wrap);
        const readout = document.createElement('div'); readout.className = 'value-readout'; readout.textContent = '0';
        body.appendChild(readout);
        updaters.push(() => { readout.textContent = String(node.outputs.out ?? 0); });
        break;
      }
      case 'lockpad': {
        const wrap = document.createElement('div'); wrap.className = 'lockpad';
        const input = document.createElement('input'); input.type = 'text'; input.placeholder = 'code';
        const btn = document.createElement('button'); btn.className = 'ctrl-btn'; btn.textContent = 'UNLOCK';
        const refresh = () => { btn.textContent = node.state.unlocked ? 'LOCK' : 'UNLOCK'; btn.classList.toggle('active', node.state.unlocked); };
        btn.addEventListener('click', () => {
          if (node.state.unlocked) { node.state.unlocked = false; }
          else if (input.value === node.params.code) { node.state.unlocked = true; }
          else { input.style.borderColor = '#e6584f'; setTimeout(() => { input.style.borderColor = ''; }, 500); }
          refresh();
        });
        refresh();
        wrap.appendChild(input); wrap.appendChild(btn); body.appendChild(wrap);
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

  // Generic / per-type displays driven by node.display each tick
  const displayEl = document.createElement('div');
  displayEl.style.display = 'flex'; displayEl.style.flexDirection = 'column'; displayEl.style.alignItems = 'center'; displayEl.style.gap = '4px';
  body.appendChild(displayEl);

  switch (node.type) {
    case 'binaryOutput': {
      const wrap = document.createElement('div'); wrap.className = 'ctrl-bits';
      const lamps = [];
      for (let i = 7; i >= 0; i--) {
        const l = document.createElement('div'); l.className = 'lamp'; l.style.width = '20px'; l.style.height = '20px';
        l.title = 'bit ' + i; wrap.appendChild(l); lamps.unshift(l);
      }
      displayEl.appendChild(wrap);
      updaters.push(() => { const bits = (node.display && node.display.bits) || []; lamps.forEach((l, i) => l.classList.toggle('on', !!bits[i])); });
      break;
    }
    case 'lcd': {
      const screen = document.createElement('div'); screen.className = 'display-screen'; screen.textContent = '0';
      displayEl.appendChild(screen);
      updaters.push(() => { screen.textContent = (node.display && node.display.text) ?? '0'; });
      break;
    }
    case 'sevenSegment': {
      const d = document.createElement('div'); d.className = 'seg-digit'; d.textContent = '0';
      displayEl.appendChild(d);
      updaters.push(() => { d.textContent = String((node.display && node.display.digit) ?? 0); });
      break;
    }
    case 'fourteenSegment': {
      const d = document.createElement('div'); d.className = 'seg-digit'; d.textContent = 'A';
      displayEl.appendChild(d);
      updaters.push(() => { d.textContent = (node.display && node.display.char) ?? 'A'; });
      break;
    }
    case 'electronicBillboard': {
      const d = document.createElement('div'); d.className = 'billboard off'; d.textContent = node.params.text;
      displayEl.appendChild(d);
      updaters.push(() => { d.classList.toggle('off', !(node.display && node.display.on)); d.textContent = node.params.text; });
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
    case 'privacyGlass': {
      const pane = document.createElement('div'); pane.className = 'glass-pane';
      displayEl.appendChild(pane);
      updaters.push(() => { pane.classList.toggle('opaque', !!(node.display && node.display.opaque)); });
      break;
    }
    case 'interactor': case 'laserReceiver': case 'materialLaser': case 'filterConveyor': case 'alignmentConveyor': {
      const lamp = document.createElement('div'); lamp.className = 'lamp';
      displayEl.appendChild(lamp);
      updaters.push(() => {
        const dispOn = node.display && node.display.on;
        const outOn = node.outputs && node.outputs.out > 0;
        lamp.classList.toggle('on', !!dispOn || !!outOn);
      });
      break;
    }
    case 'fourWayConveyor': {
      const wrap = document.createElement('div'); wrap.style.display = 'grid'; wrap.style.gridTemplateColumns = 'repeat(3,1fr)'; wrap.style.gap = '3px';
      const mk = () => { const l = document.createElement('div'); l.className = 'lamp'; l.style.width = '16px'; l.style.height = '16px'; return l; };
      const blank = () => document.createElement('div');
      const n = mk(), e = mk(), s = mk(), w = mk();
      wrap.appendChild(blank()); wrap.appendChild(n); wrap.appendChild(blank());
      wrap.appendChild(w); wrap.appendChild(blank()); wrap.appendChild(e);
      wrap.appendChild(blank()); wrap.appendChild(s); wrap.appendChild(blank());
      displayEl.appendChild(wrap);
      updaters.push(() => {
        n.classList.toggle('on', !!(node.display && node.display.n));
        e.classList.toggle('on', !!(node.display && node.display.e));
        s.classList.toggle('on', !!(node.display && node.display.s));
        w.classList.toggle('on', !!(node.display && node.display.w));
      });
      break;
    }
    default: {
      // generic readout of primary output, if any, for gates/processors with no custom display
      const hasOut = def.ports.some((p) => p.dir === 'out');
      const hasCustomControl = !!c;
      if (hasOut && (!hasCustomControl || def.category === 'gates' || def.category === 'processors')) {
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

function renderAllWires() {
  wireLayer.innerHTML = '';
  Object.values(graph.wires).forEach(renderWire);
}

function renderWire(w) {
  const p1 = portCenter(w.from.node, w.from.port);
  const p2 = portCenter(w.to.node, w.to.port);
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('class', 'wire' + (selected && selected.kind === 'wire' && selected.id === w.id ? ' selected' : ''));
  path.setAttribute('d', wirePathD(p1.x, p1.y, p2.x, p2.y));
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', w.color);
  const srcNode = graph.nodes[w.from.node];
  const active = srcNode && (srcNode.outputs[w.from.port] || 0) > 0;
  path.setAttribute('stroke-width', active ? 4 : 2.5);
  path.setAttribute('opacity', active ? 1 : 0.55);
  path.dataset.wireId = w.id;
  path.addEventListener('click', (e) => { e.stopPropagation(); selectThing('wire', w.id); });
  wireLayer.appendChild(path);
}

function updateWiresForNode(nodeId) {
  Object.values(graph.wires).forEach((w) => {
    if (w.from.node === nodeId || w.to.node === nodeId) {
      const el = wireLayer.querySelector(`path[data-wire-id="${w.id}"]`);
      if (el) {
        const p1 = portCenter(w.from.node, w.from.port);
        const p2 = portCenter(w.to.node, w.to.port);
        el.setAttribute('d', wirePathD(p1.x, p1.y, p2.x, p2.y));
      }
    }
  });
}

function startWireDraw(nodeId, portId, dir) {
  const start = portCenter(nodeId, portId);
  wireDraft = { fromNode: nodeId, fromPort: portId, fromDir: dir, x1: start.x, y1: start.y };
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('class', 'tempwire'); path.setAttribute('fill', 'none');
  path.setAttribute('stroke', nextWireColor); path.setAttribute('stroke-width', '3'); path.setAttribute('stroke-dasharray', '6 4');
  wireLayer.appendChild(path);
  wireDraft.el = path;

  function onMove(e) {
    const rect = workspace.getBoundingClientRect();
    const x2 = (e.clientX - rect.left) / zoom, y2 = (e.clientY - rect.top) / zoom;
    path.setAttribute('d', wirePathD(wireDraft.x1, wireDraft.y1, x2, y2));
  }
  function onUp(e) {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    path.remove();
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (target && target.classList.contains('port')) {
      finishWireDraw(target.dataset.nodeId, target.dataset.portId, target.dataset.dir);
    }
    wireDraft = null;
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function finishWireDraw(toNode, toPort, toDir) {
  const d = wireDraft;
  if (!d) return;
  if (toNode === d.fromNode && toPort === d.fromPort) return;
  let fromNode = d.fromNode, fromPort = d.fromPort, fromDir = d.fromDir;
  let tNode = toNode, tPort = toPort, tDir = toDir;
  if (fromDir === tDir) return; // must connect an output to an input
  if (fromDir === 'in') { // swap so "from" is always the output
    [fromNode, tNode] = [tNode, fromNode];
    [fromPort, tPort] = [tPort, fromPort];
  }
  graph.addWire(fromNode, fromPort, tNode, tPort, nextWireColor);
  colorIdx = (colorIdx + 1) % WIRE_COLORS.length;
  nextWireColor = WIRE_COLORS[colorIdx];
  document.getElementById('wireColorSwatch').style.background = nextWireColor;
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
}

// -------------------------------------------------------------------------
// SIMULATION LOOP
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
  document.getElementById('wireColorSwatch').style.background = nextWireColor;
  document.getElementById('wireColorSwatch').addEventListener('click', () => {
    colorIdx = (colorIdx + 1) % WIRE_COLORS.length;
    nextWireColor = WIRE_COLORS[colorIdx];
    document.getElementById('wireColorSwatch').style.background = nextWireColor;
  });
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

  workspace.addEventListener('click', () => deselect());
  document.addEventListener('keydown', (e) => {
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement.tagName)) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected) {
      e.preventDefault();
      if (selected.kind === 'node') deleteNode(selected.id);
      else { graph.removeWire(selected.id); deselect(); renderAllWires(); refreshPortBadges(); }
    }
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
      color: w.color,
      from: { node: w.from.node, port: w.from.port },
      to: { node: w.to.node, port: w.to.port },
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
}

// -------------------------------------------------------------------------
// BOOT
// -------------------------------------------------------------------------
buildPalette();
initToolbar();
setZoom(1);
renderInspector();
requestAnimationFrame(loop);

// Expose for debugging in the browser console (and for automated tests).
if (typeof window !== 'undefined') {
  window.graph = graph;
  window.nodeEls = nodeEls;
}
