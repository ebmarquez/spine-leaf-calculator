# Spine-Leaf Fabric Calculator

Interactive web tool for designing spine-leaf data center fabrics. Calculate
oversubscription ratios, explore uplink configurations, and visualize your
topology — all in the browser.

## Features

- **Fabric Designer** — Model host → leaf → spine tiers with real-time metrics
- **Interactive Topology** — SVG visualization that redraws as you change inputs
- **Failure Simulation** — Click a spine to see degraded oversubscription
- **Uplink Sweep** — Compare ratios across uplink counts
- **Recommendation Engine** — Auto-solve for spine count and link speed
- **SVG Export** — Download topology diagrams for documentation
- **AI-Friendly** — URL parameters, structured data attributes, and `llms.txt` for machine consumption

## Usage

Open `index.html` in a browser, or visit the hosted version at:
**https://ebmarquez.github.io/spine-leaf-calculator**

No build step. No dependencies. Pure HTML/CSS/JS.

### URL Parameters

Drive the calculator via URL for sharing or automation:

```
?nodes=64&nics=2&nic-speed=25&uplink-speed=100&tab=design
```

See [llms.txt](llms.txt) for the full parameter reference.

## AI Integration

Results are available programmatically:

- **JSON**: `document.getElementById('results-json').textContent`
- **Data attributes**: `data-result-ratio`, `data-result-assessment`, etc.
- **llms.txt**: Machine-readable documentation at `/llms.txt`

## License

MIT
