/**
 * Interactive SVG topology renderer for spine-leaf fabrics.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

function svgText(x, y, text, className, extraAttrs = {}) {
  const el = svgEl('text', { x, y, class: className, ...extraAttrs });
  el.textContent = text;
  return el;
}

/**
 * Render the spine-leaf topology into a container element.
 * Returns an object with the SVG element and a failedSpines Set.
 */
export function renderTopology(container, fd, { onFailureChange } = {}) {
  container.innerHTML = '';
  if (!fd || fd.error) {
    container.innerHTML = `<div class="error-message">${fd?.error || 'No data'}</div>`;
    return { svg: null, failedSpines: new Set() };
  }

  const failedSpines = new Set();
  const { spineCount, leafCount, nodesPerLeaf, leafUplinks, uplinkSpeed, nicsPerNode, nicsPerLeaf, nicSpeed, spinePorts, spinePortsUsed, leavesPerRack, totalRacks } = fd;

  // Layout constants
  const margin = { top: 20, left: 70, right: 30, bottom: 20 };
  const tierGap = 100;
  const nodeW = { spine: 100, leaf: 110, host: 22 };
  const nodeH = { spine: 40, leaf: 34, host: 14 };
  const hostRowH = 18;
  const maxHostCols = 6;

  // Calculate SVG dimensions
  const maxCount = Math.max(spineCount, leafCount);
  const unitW = Math.max(nodeW.spine, nodeW.leaf) + 40;
  const contentW = maxCount * unitW;
  const svgW = margin.left + contentW + margin.right;

  // Host area height
  const maxNodesOnLeaf = Math.max(...nodesPerLeaf);
  const hostRows = Math.ceil((maxNodesOnLeaf * nicsPerNode) / maxHostCols);
  const hostAreaH = hostRows * hostRowH + 40;
  const svgH = margin.top + nodeH.spine + tierGap + nodeH.leaf + tierGap * 0.8 + hostAreaH + margin.bottom;

  const svg = svgEl('svg', {
    viewBox: `0 0 ${svgW} ${svgH}`,
    'aria-label': `Spine-leaf topology: ${spineCount} spines, ${leafCount} leaves, ${fd.totalNodes} nodes`,
    role: 'img',
  });

  // Tier Y positions
  const spineY = margin.top;
  const leafY = spineY + nodeH.spine + tierGap;
  const hostY = leafY + nodeH.leaf + tierGap * 0.6;

  // Tier labels
  svg.appendChild(svgText(12, spineY + nodeH.spine / 2 + 4, 'SPINE', 'topo-tier-label'));
  svg.appendChild(svgText(12, leafY + nodeH.leaf / 2 + 4, 'LEAF', 'topo-tier-label'));
  svg.appendChild(svgText(12, hostY + 20, 'HOSTS', 'topo-tier-label'));

  // Calculate positions
  const spinePositions = [];
  const spineStartX = margin.left + (contentW - spineCount * unitW) / 2;
  for (let i = 0; i < spineCount; i++) {
    const cx = spineStartX + i * unitW + unitW / 2;
    spinePositions.push({ x: cx - nodeW.spine / 2, cx, y: spineY });
  }

  const leafPositions = [];
  const leafStartX = margin.left + (contentW - leafCount * unitW) / 2;
  for (let i = 0; i < leafCount; i++) {
    const cx = leafStartX + i * unitW + unitW / 2;
    leafPositions.push({ x: cx - nodeW.leaf / 2, cx, y: leafY });
  }

  // Draw links first (under nodes)
  const linkGroup = svgEl('g', { class: 'links' });
  const linkElements = [];

  for (let s = 0; s < spineCount; s++) {
    for (let l = 0; l < leafCount; l++) {
      // Count uplinks from this leaf to this spine
      let count = 0;
      for (let u = 0; u < leafUplinks; u++) {
        if (u % spineCount === s) count++;
      }
      if (count === 0) continue;

      const line = svgEl('line', {
        x1: spinePositions[s].cx,
        y1: spineY + nodeH.spine,
        x2: leafPositions[l].cx,
        y2: leafY,
        class: 'topo-link',
        'data-spine': s,
      });
      line.dataset.linkCount = count;
      linkGroup.appendChild(line);
      linkElements.push({ el: line, spineIdx: s });
    }
  }
  svg.appendChild(linkGroup);

  // BW annotation
  const midSpineX = (spinePositions[0].cx + spinePositions[spineCount - 1].cx) / 2;
  svg.appendChild(svgText(
    svgW - margin.right - 10, spineY + nodeH.spine + tierGap / 2,
    `${leafUplinks}×${uplinkSpeed}G per leaf`,
    'topo-bw-label',
    { 'text-anchor': 'end' }
  ));

  // Draw spine nodes
  const spineElements = [];
  for (let s = 0; s < spineCount; s++) {
    const pos = spinePositions[s];
    const g = svgEl('g', { 'data-spine-idx': s, style: 'cursor:pointer' });

    const rect = svgEl('rect', {
      x: pos.x, y: pos.y,
      width: nodeW.spine, height: nodeH.spine,
      rx: 10, class: 'topo-spine',
    });

    const label = svgText(pos.cx, pos.y + nodeH.spine / 2 + 4, `Spine-${s + 1}`, 'topo-label');

    // Tooltip title
    const portsUsed = spinePortsUsed[s] || 0;
    const title = svgEl('title');
    title.textContent = `Spine-${s + 1}: ${portsUsed}/${spinePorts} ports used (${Math.round(portsUsed / spinePorts * 100)}% util)`;
    g.appendChild(title);

    g.appendChild(rect);
    g.appendChild(label);
    svg.appendChild(g);
    spineElements.push({ g, rect, label, idx: s });

    // Click to fail
    g.addEventListener('click', () => {
      if (failedSpines.has(s)) {
        failedSpines.delete(s);
        rect.classList.remove('failed');
      } else {
        failedSpines.add(s);
        rect.classList.add('failed');
      }

      // Update link visuals
      for (const link of linkElements) {
        if (failedSpines.has(link.spineIdx)) {
          link.el.classList.add('failed');
        } else {
          link.el.classList.remove('failed');
        }
      }

      if (onFailureChange) onFailureChange(failedSpines);
    });
  }

  // Draw rack boundary rectangles when dual-homed
  if (leavesPerRack > 1) {
    for (let r = 0; r < totalRacks; r++) {
      const firstLeafIdx = r * leavesPerRack;
      const lastLeafIdx = firstLeafIdx + leavesPerRack - 1;
      const firstPos = leafPositions[firstLeafIdx];
      const lastPos = leafPositions[lastLeafIdx];
      const rackX = firstPos.x - 8;
      const rackW = (lastPos.x + nodeW.leaf) - firstPos.x + 16;
      const rackRect = svgEl('rect', {
        x: rackX, y: leafY - 10,
        width: rackW, height: svgH - leafY + 5,
        rx: 8, class: 'topo-rack-boundary',
      });
      svg.appendChild(rackRect);

      // Rack label
      svg.appendChild(svgText(
        rackX + rackW / 2, leafY - 16,
        `Rack ${r + 1}`,
        'topo-rack-label'
      ));
    }
  }

  // Draw leaf nodes
  for (let l = 0; l < leafCount; l++) {
    const pos = leafPositions[l];
    const nodes = nodesPerLeaf[l];
    const lc = fd.leafCalcs[l];

    const rect = svgEl('rect', {
      x: pos.x, y: pos.y,
      width: nodeW.leaf, height: nodeH.leaf,
      rx: 10, class: 'topo-leaf',
    });

    const rackIdx = Math.floor(l / leavesPerRack) + 1;
    const leafInRack = (l % leavesPerRack) + 1;
    const leafLabel = leavesPerRack > 1
      ? `L${l + 1} · R${rackIdx}(${leafInRack}/${leavesPerRack})`
      : `Leaf-${l + 1} · R${rackIdx}`;
    const label = svgText(pos.cx, pos.y + nodeH.leaf / 2 + 4, leafLabel, 'topo-label');

    const title = svgEl('title');
    title.textContent = `Leaf-${l + 1} (Rack ${rackIdx}${leavesPerRack > 1 ? `, leaf ${leafInRack} of ${leavesPerRack}` : ''}): ${nodes} nodes, ${lc.ratioStr} ratio, ${lc.downlinkBw}G down / ${lc.uplinkBw}G up`;

    const g = svgEl('g');
    g.appendChild(title);
    g.appendChild(rect);
    g.appendChild(label);
    svg.appendChild(g);

    // Draw host blocks under this leaf
    // For dual-homed: each leaf sees nicsPerLeaf ports per node, not nicsPerNode
    const portsOnThisLeaf = nodes * (nicsPerLeaf || nicsPerNode);
    const cols = Math.min(portsOnThisLeaf, maxHostCols);
    const rows = Math.ceil(portsOnThisLeaf / cols);
    const hostBlockW = cols * (nodeW.host + 4);
    const hostStartX = pos.cx - hostBlockW / 2;

    // Host-to-leaf links
    const linkStartY = pos.y + nodeH.leaf;
    for (let c = 0; c < Math.min(cols, 4); c++) {
      const hx = hostStartX + c * (nodeW.host + 4) + nodeW.host / 2;
      svg.appendChild(svgEl('line', {
        x1: pos.cx - 15 + c * 10,
        y1: linkStartY,
        x2: hx,
        y2: hostY,
        class: 'topo-link-host',
      }));
    }

    // Host rectangles
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        if (idx >= portsOnThisLeaf) break;
        svg.appendChild(svgEl('rect', {
          x: hostStartX + c * (nodeW.host + 4),
          y: hostY + r * hostRowH,
          width: nodeW.host, height: nodeH.host,
          rx: 3, class: 'topo-host',
        }));
      }
    }

    // Host count label — show rack number and NIC mapping
    const hostRackIdx = Math.floor(l / leavesPerRack) + 1;
    const nicLabel = leavesPerRack > 1
      ? `${nicsPerLeaf}×${nicSpeed}G per leaf`
      : `${nicsPerNode}×${nicSpeed}G`;
    svg.appendChild(svgText(
      pos.cx, hostY + rows * hostRowH + 16,
      `Rack ${hostRackIdx}: ${nodes} nodes · ${nicLabel}`,
      'topo-label-muted'
    ));
  }

  container.appendChild(svg);
  return { svg, failedSpines };
}
