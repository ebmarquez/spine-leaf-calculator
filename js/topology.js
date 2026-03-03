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
  const nodeW = { spine: 100, leaf: 110, host: 130 };
  const nodeH = { spine: 40, leaf: 34, host: 36 };

  // Calculate SVG dimensions
  const maxCount = Math.max(spineCount, leafCount);
  const unitW = Math.max(nodeW.spine, nodeW.leaf) + 40;
  const contentW = maxCount * unitW;
  const svgW = margin.left + contentW + margin.right;

  // Host area: one block per rack
  const hostAreaH = nodeH.host + 50;
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

  // Build rack-to-leaf mapping and node ranges
  const racks = [];
  let nodeOffset = 0;
  for (let r = 0; r < totalRacks; r++) {
    const leafIndices = [];
    for (let l = 0; l < leavesPerRack; l++) {
      leafIndices.push(r * leavesPerRack + l);
    }
    const rackNodes = nodesPerLeaf[r * leavesPerRack]; // all leaves in rack see same node count
    const startNode = nodeOffset + 1;
    const endNode = nodeOffset + rackNodes;
    nodeOffset += rackNodes;
    racks.push({ idx: r, leafIndices, nodeCount: rackNodes, startNode, endNode });
  }

  // Draw rack boundary rectangles
  for (const rack of racks) {
    const firstPos = leafPositions[rack.leafIndices[0]];
    const lastPos = leafPositions[rack.leafIndices[rack.leafIndices.length - 1]];
    const rackX = firstPos.x - 12;
    const rackW = (lastPos.x + nodeW.leaf) - firstPos.x + 24;
    const rackRect = svgEl('rect', {
      x: rackX, y: leafY - 12,
      width: rackW, height: svgH - leafY + 8,
      rx: 8, class: 'topo-rack-boundary',
    });
    svg.appendChild(rackRect);

    // Rack label above boundary
    svg.appendChild(svgText(
      rackX + rackW / 2, leafY - 18,
      `Rack ${rack.idx + 1}`,
      'topo-rack-label'
    ));
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
  }

  // Draw one host block per rack with connections to each leaf
  for (const rack of racks) {
    // Center the host block under its rack's leaves
    const firstPos = leafPositions[rack.leafIndices[0]];
    const lastPos = leafPositions[rack.leafIndices[rack.leafIndices.length - 1]];
    const rackCenterX = (firstPos.cx + lastPos.cx) / 2;
    const hostBlockX = rackCenterX - nodeW.host / 2;
    const hostBlockY = hostY;

    // Host block rectangle
    const hostRect = svgEl('rect', {
      x: hostBlockX, y: hostBlockY,
      width: nodeW.host, height: nodeH.host,
      rx: 6, class: 'topo-host',
    });
    svg.appendChild(hostRect);

    // Node range label inside block
    const rangeLabel = rack.startNode === rack.endNode
      ? `Node ${rack.startNode}`
      : `Nodes ${rack.startNode}–${rack.endNode}`;
    svg.appendChild(svgText(
      rackCenterX, hostBlockY + nodeH.host / 2 + 1,
      rangeLabel,
      'topo-host-label'
    ));

    // NIC info label below block
    const npl = nicsPerLeaf || nicsPerNode;
    const nicInfo = leavesPerRack > 1
      ? `${rack.nodeCount} nodes · ${nicsPerNode} NICs (${npl}×${nicSpeed}G per leaf)`
      : `${rack.nodeCount} nodes · ${nicsPerNode}×${nicSpeed}G`;
    svg.appendChild(svgText(
      rackCenterX, hostBlockY + nodeH.host + 14,
      nicInfo,
      'topo-label-muted'
    ));

    // Connection lines from host block to each leaf in the rack
    for (let i = 0; i < rack.leafIndices.length; i++) {
      const leafIdx = rack.leafIndices[i];
      const leafPos = leafPositions[leafIdx];
      const leafBottomY = leafY + nodeH.leaf;

      // Spread connection points across top of host block
      const spread = Math.min(nodeW.host * 0.6, rack.leafIndices.length * 20);
      const step = rack.leafIndices.length > 1 ? spread / (rack.leafIndices.length - 1) : 0;
      const hostConnX = rackCenterX - spread / 2 + i * step;

      // Spread from bottom of leaf
      const leafSpread = Math.min(nodeW.leaf * 0.4, 30);
      const leafStep = rack.leafIndices.length > 1 ? leafSpread / (rack.leafIndices.length - 1) : 0;
      const leafConnX = leafPos.cx - leafSpread / 2 + (rack.leafIndices.length - 1 - i) * leafStep;

      svg.appendChild(svgEl('line', {
        x1: leafConnX,
        y1: leafBottomY,
        x2: hostConnX,
        y2: hostBlockY,
        class: 'topo-link-host',
      }));

      // NIC count annotation on link
      if (npl < nicsPerNode) {
        const midX = (leafConnX + hostConnX) / 2;
        const midY = (leafBottomY + hostBlockY) / 2;
        svg.appendChild(svgText(
          midX + 8, midY + 3,
          `${npl}×${nicSpeed}G`,
          'topo-link-annotation'
        ));
      }
    }
  }

  container.appendChild(svg);
  return { svg, failedSpines };
}
