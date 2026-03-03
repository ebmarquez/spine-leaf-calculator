# Copilot Instructions for spine-leaf-calculator

## Project Overview

Static single-page web app for spine-leaf fabric oversubscription calculations.
Hosted on GitHub Pages. Zero dependencies — pure vanilla HTML/CSS/JS.

## Architecture

- `js/calculator.js` — Core math engine (ported from Python)
- `js/topology.js` — Interactive SVG topology renderer
- `js/sweep.js` — Uplink sweep table
- `js/recommend.js` — Recommendation engine
- `js/export.js` — SVG export utility
- `js/app.js` — Main controller binding inputs to outputs
- `css/styles.css` — All styles using CSS custom properties

## AI-Friendly Features

- URL query parameters drive all inputs (e.g., `?nodes=64&nics=2`)
- `<script id="results-json" type="application/json">` contains full calc output
- Metric elements have `data-result-*` attributes for machine reading
- `llms.txt` at root describes the tool for AI crawlers
- JSON-LD WebApplication schema in `<head>`

## Conventions

- ES6 modules (type="module" in script tags)
- CSS custom properties for theming (--color-primary, --color-bg, etc.)
- No external dependencies or build tools
- Functions are pure where possible (input → output, no side effects)
- URL state stays in sync with inputs via history.replaceState
