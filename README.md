# Oaklands Logic Editor

A 2D logic editor for Oaklands. Drop down every Logic component sold at Alan's AutoLogistics, wire them up like you would in-game, and actually watch the circuit run — live signals, real wire priority, the works.

Made by **Glazix**.

## What it does

Everything you'd build with Logic in Oaklands, but on a flat canvas instead of in the world. Buttons, switches, all the gates, the Memory Cell, Incrementer, Calculator, Speaker, Donator, Interactor, lasers, conveyors — the full lineup, 56 components. Each one runs the actual in-game math: AND only fires when both inputs match and are above 0, the Calculator drops negative results instead of outputting them, the Memory Cell latches once and ignores further writes until you reset it, the Incrementer adds input÷10 per pulse. If two of those "event" wires land on a node in the same tick (say, DATA and RESET on a Memory Cell both firing off one button), whichever wire you connected first gets processed first — same as the real execution order.

Wiring works the way you'd expect on a Mac trackpad: click a port, click the other port, done. Dragging works too if you prefer it. You can drop anchor points on a wire to route it around other components, pick the exact wire color, and if a port has more than one wire going into it, a little badge shows up so you can reorder which one actually wins.

Multi-select with a drag box or shift-click, move a whole group at once, duplicate it (wiring between the duplicated parts comes along for the ride), delete with a right-click or the Delete key.

Every port tells you what it actually does when you hover it — not just "A" or "IN", but what that specific input changes for that specific component. Every component shows its real Alan's AutoLogistics price, and there's a running cost summary for your whole build.

Export gives you clean, readable JSON — open it in a text editor and it actually makes sense, not a wall of minified garbage. Paste it back in, or load a downloaded file, and you're back where you left off.

## Accuracy

This was built off the actual Oaklands wiki and verified in-game pricing — not guessed. Every component's info tooltip (the ⓘ icon) tells you straight up whether its behavior is a confirmed match or, for a small number of things that can't really be simulated in a browser (camera feeds, physical laser collision, actual chat messages), the closest reasonable approximation. If something's off, tell me — see contact below.

## Running it

Open `index.html`. That's the whole installation process. No build step, no dependencies, no server. It also runs fine hosted as a static site (GitHub Pages, Netlify, wherever) since it's just HTML/CSS/JS.

## Files

- `index.html` — the page itself
- `style.css` — all the styling
- `components.js` — every component: its ports, price, controls, and simulation logic
- `engine.js` — the simulation engine (wiring, wire priority, the tick loop)
- `app.js` — everything UI: palette, canvas, wiring, inspector, export/import
- `tests/` — automated test scripts, not needed to actually run the site

Want to add a component yourself? It's one entry in `components.js` — ports, a price, a `step()` function for the logic, optionally a `control` for an interactive widget. It'll show up in the palette automatically.

## Questions, bugs, requests

Find me on Discord: **_glazix**. Happy to fix what's wrong or add what's missing.
