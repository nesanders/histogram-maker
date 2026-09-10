(() => {
  const dataInput = document.getElementById('data-input');
  const binCountInput = document.getElementById('bin-count');
  const binCountValue = document.getElementById('bin-count-value');
  const xMinInput = document.getElementById('x-min');
  const xMaxInput = document.getElementById('x-max');
  const resetBoundsBtn = document.getElementById('reset-bounds');
  const removeOutliersInput = document.getElementById('remove-outliers');
  const titleInput = document.getElementById('chart-title');
  const xLabelInput = document.getElementById('x-label');
  const yLabelInput = document.getElementById('y-label');
  const exportBtn = document.getElementById('export-png');
  const svg = document.getElementById('chart');
  const legend = document.getElementById('legend');
  const outOfRangeEl = document.getElementById('out-of-range');
  const statsList = document.getElementById('stats-list');

  const FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
  const SAMPLE = [
    72, 75, 78, 81, 68, 74, 79, 83, 70, 76, 77, 80, 73, 85, 69, 71, 90, 66,
    74, 78, 82, 76, 73, 79, 84, 25, 77, 71, 95, 69
  ];
  dataInput.value = SAMPLE.join(', ');

  // Only re-derive x-axis bounds from the data while the user hasn't overridden them.
  const boundsTouched = { min: false, max: false };

  // Colors resolved from CSS variables so the exported SVG/PNG is self-contained.
  let colors = {};
  function resolveColors() {
    const cs = getComputedStyle(document.documentElement);
    const get = name => cs.getPropertyValue(name).trim();
    colors = {
      panel: get('--panel'),
      text: get('--text'),
      muted: get('--muted'),
      border: get('--border'),
      accent: get('--accent'),
      outlier: get('--outlier')
    };
  }

  function parseData(text) {
    return text
      .split(/[\s,]+/)
      .map(s => parseFloat(s))
      .filter(n => Number.isFinite(n));
  }

  function quantile(sorted, q) {
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }
    return sorted[base];
  }

  function outlierBounds(sorted) {
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    return { lower: q1 - 1.5 * iqr, upper: q3 + 1.5 * iqr };
  }

  function niceStep(range, targetTicks) {
    const raw = range / targetTicks;
    const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const norm = raw / mag;
    let step;
    if (norm < 1.5) step = 1;
    else if (norm < 3) step = 2;
    else if (norm < 7) step = 5;
    else step = 10;
    return step * mag;
  }

  function formatNum(n) {
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(2).replace(/\.?0+$/, '');
  }

  function svgEl(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) el.setAttribute(k, attrs[k]);
    return el;
  }

  function render() {
    resolveColors();
    const raw = parseData(dataInput.value);
    const sorted = [...raw].sort((a, b) => a - b);

    let bounds = { lower: Infinity, upper: -Infinity };
    if (sorted.length >= 4) bounds = outlierBounds(sorted);
    const isOutlier = v => v < bounds.lower || v > bounds.upper;

    const removeOutliers = removeOutliersInput.checked;
    const working = removeOutliers ? raw.filter(v => !isOutlier(v)) : raw;

    if (!boundsTouched.min || !boundsTouched.max) {
      if (working.length) {
        const dataMin = Math.min(...working);
        const dataMax = Math.max(...working);
        const pad = (dataMax - dataMin) * 0.05 || 1;
        if (!boundsTouched.min) xMinInput.value = formatNum(dataMin - pad);
        if (!boundsTouched.max) xMaxInput.value = formatNum(dataMax + pad);
      }
    }

    let xMin = parseFloat(xMinInput.value);
    let xMax = parseFloat(xMaxInput.value);
    if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMin >= xMax) {
      xMin = 0;
      xMax = 1;
    }

    const nBins = parseInt(binCountInput.value, 10);
    binCountValue.textContent = nBins;
    const binWidth = (xMax - xMin) / nBins;

    const inCounts = new Array(nBins).fill(0);
    const outCounts = new Array(nBins).fill(0);
    let outOfRange = 0;

    for (const v of working) {
      if (v < xMin || v > xMax) { outOfRange++; continue; }
      let idx = Math.floor((v - xMin) / binWidth);
      if (idx >= nBins) idx = nBins - 1;
      if (idx < 0) idx = 0;
      if (!removeOutliers && isOutlier(v)) outCounts[idx]++;
      else inCounts[idx]++;
    }

    outOfRangeEl.hidden = outOfRange === 0;
    if (outOfRange > 0) {
      outOfRangeEl.textContent = `${outOfRange} value${outOfRange === 1 ? '' : 's'} outside the displayed x-axis range.`;
    }

    const hasOutliers = !removeOutliers && outCounts.some(c => c > 0);
    legend.hidden = !hasOutliers;

    drawChart(inCounts, outCounts, xMin, xMax, nBins, titleInput.value, xLabelInput.value, yLabelInput.value);
    renderStats(raw, working, removeOutliers, bounds, isOutlier);
  }

  function drawChart(inCounts, outCounts, xMin, xMax, nBins, titleText, xLabelText, yLabelText) {
    svg.innerHTML = '';
    const hasTitle = titleText.trim().length > 0;
    const hasXLabel = xLabelText.trim().length > 0;
    const hasYLabel = yLabelText.trim().length > 0;

    const W = 640, H = 420;
    svg.setAttribute('width', W);
    svg.setAttribute('height', H);
    const margin = {
      top: 16 + (hasTitle ? 26 : 0),
      right: 16,
      bottom: 36 + (hasXLabel ? 20 : 0),
      left: 40 + (hasYLabel ? 16 : 0)
    };
    const chartW = W - margin.left - margin.right;
    const chartH = H - margin.top - margin.bottom;

    const bg = svgEl('rect', { x: 0, y: 0, width: W, height: H, fill: colors.panel });
    svg.appendChild(bg);

    const totals = inCounts.map((c, i) => c + outCounts[i]);
    const maxCount = Math.max(1, ...totals);
    const yStep = niceStep(maxCount, 5);
    const yMax = Math.ceil(maxCount / yStep) * yStep;

    const xScale = v => margin.left + ((v - xMin) / (xMax - xMin)) * chartW;
    const yScale = c => margin.top + chartH - (c / yMax) * chartH;

    const axisG = svgEl('g', {});
    const textAttrs = { fill: colors.muted, 'font-size': 9, 'font-family': FONT };

    // gridlines + y ticks
    for (let y = 0; y <= yMax; y += yStep) {
      const yPos = yScale(y);
      axisG.appendChild(svgEl('line', {
        x1: margin.left, x2: W - margin.right, y1: yPos, y2: yPos,
        stroke: colors.border, 'stroke-dasharray': '2 2'
      }));
      const label = svgEl('text', { ...textAttrs, x: margin.left - 6, y: yPos + 3, 'text-anchor': 'end' });
      label.textContent = formatNum(y);
      axisG.appendChild(label);
    }

    // x axis line
    axisG.appendChild(svgEl('line', {
      x1: margin.left, x2: W - margin.right, y1: margin.top + chartH, y2: margin.top + chartH,
      stroke: colors.border
    }));

    // x tick labels: thin out if many bins
    const labelEvery = Math.max(1, Math.ceil(nBins / 10));
    for (let i = 0; i <= nBins; i += labelEvery) {
      const v = xMin + (i * (xMax - xMin)) / nBins;
      const xPos = xScale(v);
      axisG.appendChild(svgEl('line', {
        x1: xPos, x2: xPos, y1: margin.top + chartH, y2: margin.top + chartH + 4,
        stroke: colors.border
      }));
      const label = svgEl('text', { ...textAttrs, x: xPos, y: margin.top + chartH + 16, 'text-anchor': 'middle' });
      label.textContent = formatNum(v);
      axisG.appendChild(label);
    }

    if (hasTitle) {
      const title = svgEl('text', {
        x: W / 2, y: 24, 'text-anchor': 'middle', fill: colors.text,
        'font-size': 15, 'font-weight': 600, 'font-family': FONT
      });
      title.textContent = titleText;
      axisG.appendChild(title);
    }

    if (hasXLabel) {
      const label = svgEl('text', {
        x: margin.left + chartW / 2, y: H - 8, 'text-anchor': 'middle',
        fill: colors.text, 'font-size': 11, 'font-family': FONT
      });
      label.textContent = xLabelText;
      axisG.appendChild(label);
    }

    if (hasYLabel) {
      const lx = 14, ly = margin.top + chartH / 2;
      const label = svgEl('text', {
        x: lx, y: ly, 'text-anchor': 'middle', fill: colors.text,
        'font-size': 11, 'font-family': FONT, transform: `rotate(-90 ${lx} ${ly})`
      });
      label.textContent = yLabelText;
      axisG.appendChild(label);
    }

    svg.appendChild(axisG);

    const barsG = svgEl('g', {});
    const gap = 1;
    for (let i = 0; i < nBins; i++) {
      const x0 = xScale(xMin + (i * (xMax - xMin)) / nBins);
      const x1 = xScale(xMin + ((i + 1) * (xMax - xMin)) / nBins);
      const barW = Math.max(0, x1 - x0 - gap);

      const inC = inCounts[i];
      const outC = outCounts[i];
      if (inC > 0) {
        const yTop = yScale(inC);
        barsG.appendChild(svgEl('rect', {
          x: x0, y: yTop, width: barW, height: margin.top + chartH - yTop, fill: colors.accent
        }));
      }
      if (outC > 0) {
        const yBase = margin.top + chartH - (inC / yMax) * chartH;
        const yTop = yScale(inC + outC);
        barsG.appendChild(svgEl('rect', {
          x: x0, y: yTop, width: barW, height: yBase - yTop, fill: colors.outlier
        }));
      }
    }
    svg.appendChild(barsG);
  }

  function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

  function renderStats(raw, working, removeOutliers, bounds, isOutlier) {
    statsList.innerHTML = '';
    const stat = (label, value) => {
      const wrap = document.createElement('div');
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent = value;
      wrap.appendChild(dt);
      wrap.appendChild(dd);
      statsList.appendChild(wrap);
    };

    if (!working.length) {
      stat('Count', '0');
      return;
    }

    const sorted = [...working].sort((a, b) => a - b);
    const m = mean(working);
    const variance = mean(working.map(v => (v - m) ** 2));
    const outlierCount = raw.length ? raw.filter(isOutlier).length : 0;

    stat('Count', String(working.length));
    stat('Mean', formatNum(m));
    stat('Median', formatNum(quantile(sorted, 0.5)));
    stat('Std dev', formatNum(Math.sqrt(variance)));
    stat('Min', formatNum(sorted[0]));
    stat('Max', formatNum(sorted[sorted.length - 1]));
    stat('Outliers', removeOutliers ? `${outlierCount} removed` : String(outlierCount));
  }

  function exportPNG() {
    const scale = 2;
    const w = parseFloat(svg.getAttribute('width'));
    const h = parseFloat(svg.getAttribute('height'));
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      canvas.toBlob(blob => {
        const link = document.createElement('a');
        link.download = 'histogram.png';
        link.href = URL.createObjectURL(blob);
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      });
    };
    img.src = url;
  }

  dataInput.addEventListener('input', render);
  binCountInput.addEventListener('input', render);
  removeOutliersInput.addEventListener('change', render);
  titleInput.addEventListener('input', render);
  xLabelInput.addEventListener('input', render);
  yLabelInput.addEventListener('input', render);
  xMinInput.addEventListener('input', () => { boundsTouched.min = true; render(); });
  xMaxInput.addEventListener('input', () => { boundsTouched.max = true; render(); });
  resetBoundsBtn.addEventListener('click', () => {
    boundsTouched.min = false;
    boundsTouched.max = false;
    render();
  });
  exportBtn.addEventListener('click', exportPNG);

  render();
})();
