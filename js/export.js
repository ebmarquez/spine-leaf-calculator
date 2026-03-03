/**
 * SVG export utility — downloads the topology SVG as a standalone file.
 */

/**
 * Export an SVG element as a downloadable .svg file.
 */
export function exportSVG(svgElement, filename) {
  if (!svgElement) return;

  // Clone the SVG
  const clone = svgElement.cloneNode(true);

  // Inline computed styles for standalone rendering
  inlineStyles(clone, svgElement);

  // Ensure xmlns
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');

  // Add a white/dark background rect
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  bg.setAttribute('width', '100%');
  bg.setAttribute('height', '100%');
  bg.setAttribute('fill', isDark ? '#0f172a' : '#ffffff');
  clone.insertBefore(bg, clone.firstChild);

  // Serialize
  const serializer = new XMLSerializer();
  const svgString = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    serializer.serializeToString(clone);

  // Create blob and trigger download
  const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'fabric-topology.svg';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Inline key computed styles from source to clone so SVG renders standalone.
 */
function inlineStyles(clone, source) {
  const elements = clone.querySelectorAll('*');
  const sourceElements = source.querySelectorAll('*');

  const propsToInline = [
    'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'opacity',
    'font-family', 'font-size', 'font-weight', 'text-anchor',
    'letter-spacing', 'text-transform',
  ];

  elements.forEach((el, i) => {
    if (!sourceElements[i]) return;
    const computed = window.getComputedStyle(sourceElements[i]);
    const style = [];
    for (const prop of propsToInline) {
      const val = computed.getPropertyValue(prop);
      if (val && val !== 'none' && val !== 'normal' && val !== '0px') {
        style.push(`${prop}:${val}`);
      }
    }
    if (style.length) {
      el.setAttribute('style', (el.getAttribute('style') || '') + ';' + style.join(';'));
    }
  });
}
