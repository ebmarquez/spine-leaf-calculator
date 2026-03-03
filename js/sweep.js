/**
 * Uplink sweep table renderer.
 */
import { assessRatio, ratioSeverity } from './calculator.js';

function tagClass(ratio) {
  const sev = ratioSeverity(ratio);
  return `metric-tag tag-${sev}`;
}

/**
 * Render sweep results into a container as an HTML table.
 */
export function renderSweep(container, sweepResults) {
  container.innerHTML = '';
  if (!sweepResults || sweepResults.length === 0) {
    container.innerHTML = '<p class="error-message">No valid configurations found.</p>';
    return;
  }

  const fd0 = sweepResults[0];
  const header = document.createElement('p');
  header.style.cssText = 'font-size:13px;color:var(--color-text-muted);margin-bottom:16px;';
  header.textContent = `${fd0.totalNodes} nodes, ${fd0.nicsPerNode}×${fd0.nicSpeed}G NICs, ` +
    `${fd0.spineCount} spines (${fd0.spinePorts}×${fd0.spineSpeed}G)`;
  container.appendChild(header);

  // Find best ratio (closest to 2:1)
  let bestIdx = 0;
  let bestDelta = Infinity;
  sweepResults.forEach((fd, i) => {
    const delta = Math.abs(fd.leafCalcs[0].ratio - 2.0);
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIdx = i;
    }
  });

  const wrapper = document.createElement('div');
  wrapper.className = 'data-table-wrapper';

  const table = document.createElement('table');
  table.className = 'data-table';
  table.setAttribute('aria-label', 'Uplink sweep comparison');

  // Header
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr>
    <th>Leaf Uplinks</th>
    <th>Down BW</th>
    <th>Up BW</th>
    <th>Ratio</th>
    <th>Spine Util</th>
    <th>Fabric Uplink</th>
    <th>Fail Ratio</th>
    <th>Assessment</th>
  </tr>`;
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  sweepResults.forEach((fd, i) => {
    const lc = fd.leafCalcs[0];
    const tr = document.createElement('tr');
    if (i === bestIdx) tr.className = 'highlight';

    const assessment = assessRatio(lc.ratio);
    const sev = ratioSeverity(lc.ratio);

    tr.innerHTML = `
      <td>${fd.leafUplinks}</td>
      <td>${lc.downlinkBw.toLocaleString()}G</td>
      <td>${lc.uplinkBw.toLocaleString()}G</td>
      <td><strong>${lc.ratioStr}</strong></td>
      <td>${fd.spineUtilizationPct.toFixed(0)}%</td>
      <td>${fd.bisectionalBw.toLocaleString()}G</td>
      <td>${fd.spineFailureRatioStr}</td>
      <td><span class="${tagClass(lc.ratio)}">${assessment}</span></td>
    `;
    tbody.appendChild(tr);
  });

  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);
}
