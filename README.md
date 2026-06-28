# Oaklands Logic Editor

A free, browser-based **2D logic circuit editor and simulator** for the
Roblox game **Oaklands**. Place every component from the in-game *Logic*
category (Alan's AutoLogistics), wire them together exactly like in the
game — including support for **multiple wires per input port with
configurable priority** — and watch the circuit simulate live.

No installation, no build step, no backend. It's three plain JS files and
some HTML/CSS — open `index.html` in a browser, or host it for free on
GitHub Pages (instructions below).

## Features

- **Every Logic-category component** from the Oaklands Wiki: all 10 Inputs,
  8 Logic Gates, 9 Processors, 6 Structures/Outputs, 10 "Other" components,
  and the 3 logic-interactive Conveyors (47 components total).
- **Accurate simulation** for every gate and most processors, based directly
  on the Oaklands Wiki (Fandom + Miraheze) — e.g. the AND Gate only outputs
  when both inputs are equal *and* greater than 0; the Calculator outputs
  nothing on a negative result or divide-by-zero, exactly like in-game.
- **Wire priority**: just like the real game, you can run multiple wires
  into one input port. This editor shows a small badge on any port with 2+
  wires — click it to open the **Wire Priority** list and drag/reorder which
  wire's signal wins.
- **Live, interactive controls** on every input/processor node — click
  buttons, flip switches, drag sliders, use the joystick pad — exactly like
  interacting with the real devices in-game.
- **Human-readable export/import** — export your circuit as clean, indented
  JSON (copy to clipboard or download a `.json` file) and re-import it
  later, on another computer, or after editing it by hand.
- Adjustable simulation speed, zoom, an inspector panel with live
  input/output values for every component, and an in-app Help guide.

## Accuracy notes

Every component has an **ⓘ info icon** (in the palette and on each node)
explaining exactly how it behaves and whether that's a direct match to the
wiki or a clearly-labeled best-effort approximation. The core Logic Gates,
the Calculator, the Relay, the Sustainer, the XAND/XNOR behavior, and wire
priority are all modeled directly from documented in-game behavior. A
handful of obscure "Other" category items (lasers, conveyors, ownership
manager, commander chat-matching, lock code entry) don't have a fully
documented formula on the wiki, so they're simulated with a reasonable
manual-trigger approximation — check the info note on each if you're not
sure.

## Running it locally

Just open `index.html` in any modern browser. That's it — everything runs
client-side.

## Hosting it for free on GitHub Pages

1. Create a new repository on GitHub (e.g. `oaklands-logic-editor`).
2. Upload these files to the **root** of the repository:
   - `index.html`
   - `style.css`
   - `components.js`
   - `engine.js`
   - `app.js`
   (the `tests/` folder is optional — it's only used for development, not
   needed for the live site, but doesn't hurt to include it.)
3. In your repository, go to **Settings → Pages**.
4. Under **Build and deployment → Source**, choose **Deploy from a branch**.
5. Under **Branch**, choose `main` (or `master`) and folder `/ (root)`,
   then click **Save**.
6. Wait a minute or two, then refresh the Pages settings tab — GitHub will
   show you the live URL, something like:
   `https://your-username.github.io/oaklands-logic-editor/`

That's the whole process — no build step, no GitHub Actions needed, because
this is a static site.

### Alternative: drag-and-drop upload

If you don't want to use git, you can also create the repository on
GitHub.com, then use the **"uploading an existing file"** link on the empty
repo page to drag and drop all the files directly from your computer, and
then follow steps 3–6 above.

## Project structure

```
index.html      Page shell: toolbar, palette container, canvas, inspector, modals
style.css       All styling (dark theme, node/port/wire styling, modals)
components.js   The component registry — every component's ports, params,
                interactive control widget, and simulation step() function
engine.js       The Graph class: nodes, wires, wire-priority resolution,
                and the per-tick simulation loop
app.js          UI layer: palette, drag/drop, wire drawing, the wire-priority
                popup, the inspector panel, the toolbar, and export/import
tests/          Node-based test scripts (engine logic + full DOM smoke test)
                used during development — not required to run the site.
```

## Editing / extending

Because everything is in three small, readable JS files with no build
step, adding a new component is just adding one entry to the
`COMPONENT_TYPES` object in `components.js` — give it ports, a simulation
`step()` function, and (optionally) an interactive `control` widget — and
it automatically shows up in the palette, can be wired up, saved, and
loaded.

## License

Provided as-is for the Oaklands community. Oaklands is a trademark of its
respective developers; this is an unofficial, fan-made educational tool and
is not affiliated with or endorsed by the game's developers.
