/**
 * Main app controller — wires inputs to calculator, renderers, and URL state.
 */
import { fabricDesign, sweepUplinks, recommendFabric, assessRatio, ratioSeverity } from './calculator.js';
import { renderTopology } from './topology.js';
import { renderSweep } from './sweep.js';
import { renderRecommend } from './recommend.js';
import { exportSVG } from './export.js';

// ---------- DOM refs ----------
const ids = [
  'total-nodes', 'nodes-per-rack', 'nics-per-node', 'nic-speed',
  'leaf-host-ports', 'leaf-uplinks', 'uplink-speed',
  'spine-count', 'spine-ports', 'target-ratio',
];

const inputs = {};
const metricsEl = document.getElementById('results-metrics');
const metricRatioEl = document.getElementById('metric-ratio');
const metricRackLeafEl = document.getElementById('metric-rack-leaf');
const metricFabricBwEl = document.getElementById('metric-fabric-bw');
const metricFailureEl = document.getElementById('metric-failure');
const metricSpineUtilEl = document.getElementById('metric-spine-util');
const topoContainer = document.getElementById('topology-container');
const sweepContainer = document.getElementById('sweep-container');
const recommendContainer = document.getElementById('recommend-container');
const resultsJsonEl = document.getElementById('results-json');
const exportBtn = document.getElementById('btn-export-svg');
const themeToggle = document.getElementById('theme-toggle');
const tabButtons = document.querySelectorAll('.tab-btn[data-tab]');
const tabPanels = document.querySelectorAll('.tab-panel');

// Current topology state
let currentFd = null;
let currentSvg = null;
let currentFailedSpines = new Set();

// ---------- Init ----------
document.addEventListener('DOMContentLoaded', () => {
  // Grab input elements
  for (const id of ids) {
    inputs[id] = document.getElementById(id);
  }

  // Load URL params into inputs
  loadFromURL();

  // Attach listeners
  for (const el of Object.values(inputs)) {
    el.addEventListener('input', debounce(recalculate, 100));
    el.addEventListener('change', debounce(recalculate, 100));
  }

  // Tab switching
  for (const btn of tabButtons) {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  }

  // SVG export
  exportBtn.addEventListener('click', () => {
    if (!currentSvg) return;
    const nodes = getVal('total-nodes');
    const ratio = currentFd?.leafCalcs?.[0]?.ratioStr || 'unknown';
    exportSVG(currentSvg, `fabric-topology-${nodes}n-${ratio.replace(':', 'to')}.svg`);
  });

  // Dark mode
  initTheme();
  themeToggle.addEventListener('click', toggleTheme);

  // Initial calc
  recalculate();
});

// ---------- URL state ----------
function loadFromURL() {
  const params = new URLSearchParams(window.location.search);
  const mapping = {
    'nodes': 'total-nodes',
    'nodes-per-rack': 'nodes-per-rack',
    'nics': 'nics-per-node',
    'nic-speed': 'nic-speed',
    'leaf-ports': 'leaf-host-ports',
    'leaf-uplinks': 'leaf-uplinks',
    'uplink-speed': 'uplink-speed',
    'spine-count': 'spine-count',
    'spine-ports': 'spine-ports',
    'target-ratio': 'target-ratio',
  };

  for (const [param, inputId] of Object.entries(mapping)) {
    const val = params.get(param);
    if (val !== null) {
      const el = document.getElementById(inputId);
      if (el) el.value = val;
    }
  }

  // Tab from URL
  const tab = params.get('tab');
  if (tab && ['topology', 'sweep', 'recommend'].includes(tab)) {
    // Defer to after DOM is ready
    setTimeout(() => switchTab(tab), 0);
  }
}

function updateURL() {
  const params = new URLSearchParams();
  const mapping = {
    'total-nodes': 'nodes',
    'nodes-per-rack': 'nodes-per-rack',
    'nics-per-node': 'nics',
    'nic-speed': 'nic-speed',
    'leaf-host-ports': 'leaf-ports',
    'leaf-uplinks': 'leaf-uplinks',
    'uplink-speed': 'uplink-speed',
    'spine-count': 'spine-count',
    'spine-ports': 'spine-ports',
    'target-ratio': 'target-ratio',
  };

  for (const [inputId, param] of Object.entries(mapping)) {
    const el = inputs[inputId];
    if (el) params.set(param, el.value);
  }

  // Current active tab
  const activeTab = document.querySelector('.tab-btn.active')?.dataset.tab;
  if (activeTab && activeTab !== 'topology') {
    params.set('tab', activeTab);
  }

  const url = `${window.location.pathname}?${params.toString()}`;
  history.replaceState(null, '', url);
}

// ---------- Value helpers ----------
function getVal(id) {
  const el = inputs[id];
  if (!el) return 0;
  return el.tagName === 'SELECT' ? parseFloat(el.value) : parseFloat(el.value) || 0;
}

// ---------- Recalculate ----------
function recalculate() {
  const totalNodes = getVal('total-nodes');
  const nodesPerRack = getVal('nodes-per-rack');
  const nicsPerNode = getVal('nics-per-node');
  const nicSpeed = getVal('nic-speed');
  const leafHostPorts = getVal('leaf-host-ports');
  const leafUplinks = getVal('leaf-uplinks');
  const uplinkSpeed = getVal('uplink-speed');
  const spineCount = getVal('spine-count');
  const spinePorts = getVal('spine-ports');
  const targetRatio = getVal('target-ratio');

  // Validate minimums
  if (totalNodes < 1 || nicsPerNode < 1 || leafHostPorts < 1 || leafUplinks < 1 || spineCount < 1) {
    return;
  }

  // Update URL
  updateURL();

  // Fabric design
  const fd = fabricDesign({
    totalNodes, nicsPerNode, nicSpeed,
    leafHostPorts, leafUplinks, uplinkSpeed,
    spinePorts, spineSpeed: uplinkSpeed, spineCount,
    nodesPerRack,
  });

  currentFd = fd;

  if (fd.error) {
    updateMetricsError(fd.error);
    topoContainer.innerHTML = `<div class="error-message">${fd.error}</div>`;
    return;
  }

  // Update metrics
  updateMetrics(fd);

  // Update results-json for AI
  updateResultsJSON(fd);

  // Topology
  currentFailedSpines = new Set();
  const topoResult = renderTopology(topoContainer, fd, {
    onFailureChange: (failed) => {
      currentFailedSpines = failed;
      updateMetricsWithFailure(fd, failed);
    },
  });
  currentSvg = topoResult.svg;

  // Sweep
  const sweepResults = sweepUplinks({
    totalNodes, nicsPerNode, nicSpeed,
    leafHostPorts, uplinkSpeed,
    spinePorts, spineSpeed: uplinkSpeed, spineCount,
    maxUplinks: Math.min(Math.max(leafUplinks + 4, 8), 16),
  });
  renderSweep(sweepContainer, sweepResults);

  // Recommend
  const recOptions = recommendFabric({
    totalNodes, nodesPerRack, nicsPerNode, nicSpeed,
    targetRatio,
    spineCount: null, // auto
  });
  renderRecommend(recommendContainer, recOptions, {
    totalNodes, nodesPerRack, nicsPerNode, nicSpeed, targetRatio,
  });
}

// ---------- Metrics ----------
function updateMetrics(fd) {
  const lc = fd.leafCalcs[0];
  const ratio = lc.ratio;
  const assessment = assessRatio(ratio);
  const sev = ratioSeverity(ratio);

  // Oversubscription
  setMetric(metricRatioEl, ratio.toFixed(2), ':1', assessment, sev);

  // Rack / Leaf layout
  const racks = fd.totalRacks;
  const lpr = fd.leavesPerRack;
  const leafLabel = lpr > 1
    ? `${lpr} leaves per rack`
    : `${fd.leafCount} leaves (1 per rack)`;
  setMetric(metricRackLeafEl, racks, ' racks', leafLabel, 'info');

  // Fabric uplink BW
  const bwTbps = (fd.bisectionalBw / 1000).toFixed(1);
  const linkCount = fd.leafCount * fd.leafUplinks;
  setMetric(metricFabricBwEl, bwTbps, ' Tbps', `${linkCount} links`, 'success');

  // Spine failure
  const failRatio = fd.spineFailureRatio;
  const failSev = ratioSeverity(failRatio);
  setMetric(metricFailureEl, failRatio === Infinity ? '∞' : failRatio.toFixed(2), ':1',
    `${fd.spineFailureBwLossPct}% BW loss`, failSev);

  // Spine util
  const util = fd.spineUtilizationPct;
  const maxUsed = Math.max(...fd.spinePortsUsed);
  setMetric(metricSpineUtilEl, Math.round(util), '%',
    `${maxUsed}/${fd.spinePorts} ports`, util > 80 ? 'warning' : 'success');

  // Data attributes for AI
  metricsEl.dataset.resultRatio = ratio.toFixed(2);
  metricsEl.dataset.resultAssessment = assessment;
  metricsEl.dataset.resultFabricBw = fd.bisectionalBw;
  metricsEl.dataset.resultFailureRatio = failRatio === Infinity ? 'inf' : failRatio.toFixed(2);
  metricsEl.dataset.resultSpineUtil = util.toFixed(1);
  metricsEl.dataset.resultCrossRackPct = fd.crossRackPct;
  metricsEl.dataset.resultLeavesPerRack = fd.leavesPerRack;
  metricsEl.dataset.resultTotalRacks = fd.totalRacks;
}

function updateMetricsWithFailure(fd, failedSpines) {
  if (failedSpines.size === 0) {
    updateMetrics(fd);
    return;
  }

  // Recalculate with reduced spines
  const activeSp = fd.spineCount - failedSpines.size;
  if (activeSp <= 0) {
    setMetric(metricFailureEl, '∞', ':1', 'All spines failed!', 'danger');
    setMetric(metricRatioEl, '∞', ':1', 'No uplink capacity', 'danger');
    return;
  }

  // Uplinks remaining per leaf: count uplinks NOT going to failed spines
  let uplinksRemaining = 0;
  for (let u = 0; u < fd.leafUplinks; u++) {
    const targetSpine = u % fd.spineCount;
    if (!failedSpines.has(targetSpine)) uplinksRemaining++;
  }

  const downBw = fd.leafCalcs[0].downlinkBw;
  const upBw = uplinksRemaining * fd.uplinkSpeed;
  const degradedRatio = upBw > 0 ? downBw / upBw : Infinity;
  const bwLoss = ((fd.leafUplinks - uplinksRemaining) / fd.leafUplinks * 100).toFixed(0);

  const sev = ratioSeverity(degradedRatio);
  setMetric(metricRatioEl, degradedRatio === Infinity ? '∞' : degradedRatio.toFixed(2), ':1',
    `${assessRatio(degradedRatio)} (degraded)`, sev);
  setMetric(metricFailureEl, failedSpines.size, ` failed`, `${bwLoss}% BW loss`, 'danger');
}

function updateMetricsError(error) {
  setMetric(metricRatioEl, '—', ':1', 'Error', 'danger');
  setMetric(metricRackLeafEl, '—', ' racks', '—', 'info');
  setMetric(metricFabricBwEl, '—', ' Tbps', '—', 'info');
  setMetric(metricFailureEl, '—', ':1', '—', 'info');
  setMetric(metricSpineUtilEl, '—', '%', '—', 'info');
}

function setMetric(el, value, unit, tag, tagType) {
  const valueEl = el.querySelector('.metric-value');
  const tagEl = el.querySelector('.metric-tag');
  if (valueEl) valueEl.innerHTML = `${value}<span>${unit}</span>`;
  if (tagEl) {
    tagEl.textContent = tag;
    tagEl.className = `metric-tag tag-${tagType}`;
  }
}

// ---------- Results JSON ----------
function updateResultsJSON(fd) {
  const lc = fd.leafCalcs[0];
  const output = {
    inputs: {
      totalNodes: fd.totalNodes,
      nicsPerNode: fd.nicsPerNode,
      nicSpeed: fd.nicSpeed,
      leafHostPorts: fd.leafHostPorts,
      leafUplinks: fd.leafUplinks,
      uplinkSpeed: fd.uplinkSpeed,
      spineCount: fd.spineCount,
      spinePorts: fd.spinePorts,
    },
    results: {
      oversubscriptionRatio: parseFloat(lc.ratio.toFixed(2)),
      assessment: assessRatio(lc.ratio),
      leafCount: fd.leafCount,
      nodesPerLeaf: fd.nodesPerLeaf,
      downlinkBwPerLeaf: lc.downlinkBw,
      uplinkBwPerLeaf: lc.uplinkBw,
      fabricUplinkBw: fd.bisectionalBw,
      totalHostBw: fd.totalHostBw,
      totalRacks: fd.totalRacks,
      leavesPerRack: fd.leavesPerRack,
      crossRackTrafficPct: fd.crossRackPct,
      spineUtilizationPct: parseFloat(fd.spineUtilizationPct.toFixed(1)),
      spinePortsUsed: fd.spinePortsUsed,
      spineFailure: {
        bwLossPct: fd.spineFailureBwLossPct,
        degradedRatio: fd.spineFailureRatio === Infinity ? null : parseFloat(fd.spineFailureRatio.toFixed(2)),
        degradedAssessment: assessRatio(fd.spineFailureRatio),
      },
    },
  };
  resultsJsonEl.textContent = JSON.stringify(output, null, 2);
}

// ---------- Tabs ----------
function switchTab(tabName) {
  for (const btn of tabButtons) {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', isActive);
  }
  for (const panel of tabPanels) {
    panel.classList.toggle('active', panel.id === `panel-${tabName}`);
  }
  // Show export button only on topology tab
  exportBtn.style.display = tabName === 'topology' ? '' : 'none';

  updateURL();
}

// ---------- Dark mode ----------
function initTheme() {
  const stored = localStorage.getItem('theme');
  if (stored) {
    setTheme(stored);
  } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    setTheme('dark');
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  localStorage.setItem('theme', next);
}

function setTheme(theme) {
  if (theme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeToggle.textContent = '☀️';
    themeToggle.setAttribute('aria-label', 'Switch to light mode');
  } else {
    document.documentElement.removeAttribute('data-theme');
    themeToggle.textContent = '🌙';
    themeToggle.setAttribute('aria-label', 'Switch to dark mode');
  }
}

// ---------- Utils ----------
function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
