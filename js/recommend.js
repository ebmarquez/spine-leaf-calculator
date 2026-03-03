/**
 * Recommendation engine table renderer.
 */
import { assessRatio, ratioSeverity } from './calculator.js';

function tagClass(ratio) {
  const sev = ratioSeverity(ratio);
  return `metric-tag tag-${sev}`;
}

/**
 * Render recommendation results into a container.
 */
export function renderRecommend(container, options, config) {
  container.innerHTML = '';
  if (!options || options.length === 0) {
    container.innerHTML = '<p class="error-message">No viable configurations found for the given constraints.</p>';
    return;
  }

  const { totalNodes, nodesPerRack, nicsPerNode, nicSpeed, targetRatio } = config;
  const leafCount = Math.ceil(totalNodes / nodesPerRack);
  const downlinkBw = nodesPerRack * nicsPerNode * nicSpeed;

  // Summary
  const summary = document.createElement('dl');
  summary.className = 'recommend-summary';
  summary.innerHTML = `
    <div><dt>Total Nodes</dt><dd>${totalNodes}</dd></div>
    <div><dt>Nodes / Rack</dt><dd>${nodesPerRack}</dd></div>
    <div><dt>NICs / Node</dt><dd>${nicsPerNode} × ${nicSpeed}G</dd></div>
    <div><dt>Leaf Switches</dt><dd>${leafCount}</dd></div>
    <div><dt>Downlink BW / Leaf</dt><dd>${downlinkBw.toLocaleString()} Gbps</dd></div>
    <div><dt>Target Ratio</dt><dd>${targetRatio.toFixed(1)}:1</dd></div>
  `;
  container.appendChild(summary);

  // Table
  const wrapper = document.createElement('div');
  wrapper.className = 'data-table-wrapper';

  const table = document.createElement('table');
  table.className = 'data-table';
  table.setAttribute('aria-label', 'Recommended configurations');

  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>
    <th>Spines</th>
    <th>Uplinks</th>
    <th>Link Speed</th>
    <th>Ratio</th>
    <th>Spine Ports</th>
    <th>Spine Util</th>
    <th>Fabric Uplink</th>
    <th>Fail Ratio</th>
    <th>Assessment</th>
  </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  let shown = 0;
  for (const o of options) {
    if (shown >= 20) break;
    if (o.ratio < 0.5 || o.ratio > 6.0) continue;

    const tr = document.createElement('tr');
    const isBest = o.targetDelta < 0.15;
    if (isBest) tr.className = 'highlight';

    const assessment = assessRatio(o.ratio);

    tr.innerHTML = `
      <td>${o.spines}</td>
      <td>${o.leafUplinks}</td>
      <td>${o.uplinkSpeed}G</td>
      <td><strong>${o.ratioStr}</strong>${isBest ? '<span class="best-marker" title="Closest to target"></span>' : ''}</td>
      <td>${o.spinePorts}×${o.uplinkSpeed}G</td>
      <td>${o.spineUtilPct.toFixed(0)}%</td>
      <td>${o.bisectionalBw.toLocaleString()}G</td>
      <td>${o.failureRatioStr}</td>
      <td><span class="${tagClass(o.ratio)}">${assessment}</span></td>
    `;
    tbody.appendChild(tr);
    shown++;
  }

  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);

  // Footer
  if (options.length > 0) {
    const footer = document.createElement('div');
    footer.className = 'recommend-footer';
    footer.innerHTML = `
      <strong>Cross-rack traffic:</strong> ~${options[0].crossRackPct}%&nbsp;&nbsp;|&nbsp;&nbsp;
      <span class="best-marker" style="display:inline-block;vertical-align:middle;margin-right:4px;"></span>
      marks configs closest to target ratio of ${targetRatio.toFixed(1)}:1&nbsp;&nbsp;|&nbsp;&nbsp;
      <strong>Fail Ratio</strong> = oversubscription after single spine failure
    `;
    container.appendChild(footer);
  }
}
