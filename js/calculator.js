/**
 * Spine-Leaf Fabric Oversubscription Calculator
 * Ported from Python: oversubscription-calculator.py
 *
 * All functions are pure — no DOM, no side effects.
 */

export const AVAILABLE_LINK_SPEEDS = [10, 25, 40, 50, 100, 200, 400, 800];

export const SPINE_PORT_OPTIONS = [32, 36, 48, 64];

/**
 * Assess an oversubscription ratio and return a human-readable label.
 */
export function assessRatio(ratio, rdma = false) {
  if (rdma) {
    if (ratio <= 1.0) return 'Non-blocking (ideal RDMA)';
    if (ratio <= 1.5) return 'Acceptable RDMA';
    return '!! Too high for RDMA';
  }
  if (ratio <= 1.5) return 'Over-provisioned (RDMA-grade)';
  if (ratio <= 2.0) return 'Recommended (no RDMA)';
  if (ratio <= 3.0) return 'Acceptable (general compute)';
  if (ratio <= 4.0) return 'Tight (watch for congestion)';
  return '!! High risk of congestion';
}

/**
 * Return the severity class for a given ratio.
 */
export function ratioSeverity(ratio) {
  if (ratio <= 1.5) return 'info';
  if (ratio <= 2.0) return 'success';
  if (ratio <= 3.0) return 'warning';
  return 'danger';
}

/**
 * Format link speeds as a comma-separated string.
 */
export function formatLinkSpeeds(speeds) {
  return (speeds || AVAILABLE_LINK_SPEEDS).map(s => `${s}G`).join(', ');
}

/**
 * Per-leaf oversubscription calculation.
 */
export function leafOversubscription({
  nodesOnLeaf,
  nicsPerNode,
  nicSpeed,
  leafHostPorts,
  leafUplinks,
  uplinkSpeed,
}) {
  const portsUsed = nodesOnLeaf * nicsPerNode;
  if (portsUsed > leafHostPorts) {
    return { error: `Need ${portsUsed} host ports, leaf only has ${leafHostPorts}.` };
  }

  const downBw = portsUsed * nicSpeed;
  const upBw = leafUplinks * uplinkSpeed;
  const ratio = upBw ? downBw / upBw : Infinity;

  return {
    nodes: nodesOnLeaf,
    hostPortsUsed: portsUsed,
    hostPortsTotal: leafHostPorts,
    hostPortsFree: leafHostPorts - portsUsed,
    downlinkBw: downBw,
    uplinkBw: upBw,
    leafUplinks,
    ratio,
    ratioStr: `${ratio.toFixed(2)}:1`,
  };
}

/**
 * Full spine-leaf fabric model.
 */
export function fabricDesign({
  totalNodes,
  nicsPerNode,
  nicSpeed,
  leafHostPorts,
  leafUplinks,
  uplinkSpeed,
  spinePorts,
  spineSpeed,
  spineCount,
}) {
  const maxNodesPerLeaf = Math.floor(leafHostPorts / nicsPerNode);
  const leafCount = Math.ceil(totalNodes / maxNodesPerLeaf);

  // Distribute nodes evenly across leaves
  const base = Math.floor(totalNodes / leafCount);
  const remainder = totalNodes % leafCount;
  const nodesPerLeaf = Array.from({ length: leafCount }, (_, i) =>
    i < remainder ? base + 1 : base
  );

  // Leaf tier calculations
  const leafCalcs = nodesPerLeaf.map(n =>
    leafOversubscription({
      nodesOnLeaf: n,
      nicsPerNode,
      nicSpeed,
      leafHostPorts,
      leafUplinks,
      uplinkSpeed,
    })
  );

  const firstError = leafCalcs.find(lc => lc.error);
  if (firstError) return { error: firstError.error };

  // Spine tier: distribute uplinks across spines using modular arithmetic
  const totalLeafUplinks = leafCount * leafUplinks;

  const spinePortsUsedExact = [];
  for (let s = 0; s < spineCount; s++) {
    let ports = 0;
    for (let l = 0; l < leafCount; l++) {
      for (let u = 0; u < leafUplinks; u++) {
        if (u % spineCount === s) ports++;
      }
    }
    spinePortsUsedExact.push(ports);
  }

  const spinePortsUsedMax = spinePortsUsedExact.length
    ? Math.max(...spinePortsUsedExact)
    : 0;
  const spineUtilizationPct = spinePorts
    ? (spinePortsUsedMax / spinePorts) * 100
    : 0;

  // Fabric bandwidth
  const bisectionalBw = totalLeafUplinks * uplinkSpeed;
  const totalHostBw = leafCalcs.reduce((sum, lc) => sum + lc.downlinkBw, 0);

  // Cross-rack traffic probability
  const avgNodes = totalNodes / leafCount;
  const crossRackPct =
    totalNodes > 1
      ? Math.round((1 - (avgNodes - 1) / (totalNodes - 1)) * 1000) / 10
      : 0;

  // Single spine failure analysis
  const uplinksLostPerLeaf = Math.ceil(leafUplinks / spineCount);
  const uplinksRemaining = leafUplinks - uplinksLostPerLeaf;
  let failedRatio, failedUpBw;
  if (uplinksRemaining > 0) {
    failedUpBw = uplinksRemaining * uplinkSpeed;
    failedRatio = leafCalcs[0].downlinkBw / failedUpBw;
  } else {
    failedUpBw = 0;
    failedRatio = Infinity;
  }
  const bwLossPct = leafUplinks
    ? Math.round((uplinksLostPerLeaf / leafUplinks) * 1000) / 10
    : 0;

  // Rack-to-leaf mapping
  const portsPerRack = nodesPerLeaf.length > 0 ? nodesPerLeaf[0] * nicsPerNode : 0;
  const leavesPerRack = leafHostPorts > 0 ? Math.ceil(portsPerRack / leafHostPorts) : 1;
  const totalRacks = leafCount; // in standard spine-leaf, 1 leaf = 1 rack (ToR)

  return {
    totalNodes,
    nicsPerNode,
    nicSpeed,
    // Leaf tier
    leafCount,
    maxNodesPerLeaf,
    nodesPerLeaf,
    leafHostPorts,
    leafUplinks,
    uplinkSpeed,
    leafCalcs,
    // Spine tier
    spineCount,
    spinePorts,
    spineSpeed,
    spinePortsUsed: spinePortsUsedExact,
    spineUtilizationPct,
    // Fabric
    totalHostBw,
    bisectionalBw,
    crossRackPct,
    // Rack/leaf mapping
    leavesPerRack,
    totalRacks,
    // Failure
    spineFailureBwLossPct: bwLossPct,
    spineFailureRatio: failedRatio,
    spineFailureRatioStr: failedRatio === Infinity ? 'inf:1' : `${failedRatio.toFixed(2)}:1`,
  };
}

/**
 * Sweep leaf uplink count from 1..maxUplinks.
 */
export function sweepUplinks({
  totalNodes,
  nicsPerNode,
  nicSpeed,
  leafHostPorts,
  uplinkSpeed,
  spinePorts,
  spineSpeed,
  spineCount,
  maxUplinks = 8,
}) {
  const results = [];
  for (let u = 1; u <= maxUplinks; u++) {
    const fd = fabricDesign({
      totalNodes,
      nicsPerNode,
      nicSpeed,
      leafHostPorts,
      leafUplinks: u,
      uplinkSpeed,
      spinePorts,
      spineSpeed,
      spineCount,
    });
    if (!fd.error) results.push(fd);
  }
  return results;
}

/**
 * Recommend spine count and uplink speed to hit a target ratio.
 */
export function recommendFabric({
  totalNodes,
  nodesPerRack,
  nicsPerNode,
  nicSpeed,
  targetRatio = 2.0,
  spineCount = null,
  uplinkSpeeds = null,
  spinePortOptions = null,
}) {
  if (!uplinkSpeeds) uplinkSpeeds = AVAILABLE_LINK_SPEEDS;
  if (!spinePortOptions) spinePortOptions = SPINE_PORT_OPTIONS;

  const leafHostPorts = nodesPerRack * nicsPerNode;
  const leafCount = Math.ceil(totalNodes / nodesPerRack);
  const downlinkBw = nodesPerRack * nicsPerNode * nicSpeed;

  const spineRange = spineCount ? [spineCount] : [2, 3, 4, 5, 6];
  const options = [];

  for (const spines of spineRange) {
    for (const ulSpeed of uplinkSpeeds) {
      const maxUl = Math.min(spines * 3, 12);
      for (let ulCount = spines; ulCount <= maxUl; ulCount++) {
        const uplinkBw = ulCount * ulSpeed;
        if (uplinkBw === 0) continue;
        const ratio = downlinkBw / uplinkBw;

        // Check spine can hold leaf-facing ports
        const portsPerSpine = Math.ceil(ulCount / spines) * leafCount;
        let viableSpinePorts = null;
        for (const sp of spinePortOptions) {
          if (portsPerSpine <= sp) {
            viableSpinePorts = sp;
            break;
          }
        }
        if (viableSpinePorts === null) continue;

        // Build full fabric for validation
        const fd = fabricDesign({
          totalNodes,
          nicsPerNode,
          nicSpeed,
          leafHostPorts,
          leafUplinks: ulCount,
          uplinkSpeed: ulSpeed,
          spinePorts: viableSpinePorts,
          spineSpeed: ulSpeed,
          spineCount: spines,
        });
        if (fd.error) continue;

        options.push({
          spines,
          leafUplinks: ulCount,
          uplinkSpeed: ulSpeed,
          ratio,
          ratioStr: `${ratio.toFixed(2)}:1`,
          spinePorts: viableSpinePorts,
          spineUtilPct: fd.spineUtilizationPct,
          leafCount,
          nodesPerRack,
          downlinkBw,
          uplinkBw,
          bisectionalBw: fd.bisectionalBw,
          failureRatio: fd.spineFailureRatio,
          failureRatioStr: fd.spineFailureRatioStr,
          crossRackPct: fd.crossRackPct,
          targetDelta: Math.abs(ratio - targetRatio),
        });
      }
    }
  }

  // Sort by closeness to target, then fewer spines, then lower speed
  options.sort((a, b) =>
    a.targetDelta - b.targetDelta ||
    a.spines - b.spines ||
    a.uplinkSpeed - b.uplinkSpeed
  );

  // Deduplicate: keep best per (spines, uplinkSpeed) combo
  const seen = new Set();
  const unique = [];
  for (const o of options) {
    const key = `${o.spines}-${o.uplinkSpeed}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(o);
    }
  }

  return unique;
}
