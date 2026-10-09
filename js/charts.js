/*
  Charts are built from the data table inside each .chart, so the numbers live in
  one place and the table doubles as the accessible "view as table" fallback.

  data-chart="bars"   horizontal bars. data-value = value column, data-max = scale max,
                      data-label-cols = leading columns joined into the row label,
                      data-highlight = row index drawn in the accent, data-unit = suffix.
                      <tr data-note="…"> adds a muted note after the value.
  data-chart="sweep"  accuracy vs average loops (log2 x), with a fixed-loop reference row.
*/
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var SVG = 'http://www.w3.org/2000/svg';
  var tip = document.getElementById('tip');

  /* ─── Shared helpers ────────────────────────────────── */

  function readTable(table) {
    var heads = Array.prototype.map.call(table.tHead.rows[0].cells, function (c) { return c.textContent.trim(); });
    var rows = Array.prototype.map.call(table.tBodies[0].rows, function (tr) {
      return {
        cells: Array.prototype.map.call(tr.cells, function (c) { return c.textContent.trim(); }),
        note: tr.getAttribute('data-note'),
        ref: tr.hasAttribute('data-ref')
      };
    });
    return { heads: heads, rows: rows };
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function svg(tag, attrs, parent) {
    var n = document.createElementNS(SVG, tag);
    for (var k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // Wrap the table in a <details> so it stays one click away, and add the chart head.
  function scaffold(chart) {
    var table = chart.querySelector('.chart__table');
    var head = el('div', 'chart__head');
    head.appendChild(el('p', 'chart__title', chart.getAttribute('data-title')));
    if (chart.getAttribute('data-sub')) head.appendChild(el('p', 'chart__sub mono', chart.getAttribute('data-sub')));
    chart.insertBefore(head, chart.firstChild);

    var plot = el('div', 'chart__plot');
    plot.setAttribute('aria-hidden', 'true');
    chart.insertBefore(plot, table);

    var details = el('details', 'chart__data');
    details.appendChild(el('summary', 'mono', 'View as table'));
    chart.insertBefore(details, table);
    details.appendChild(table);
    return plot;
  }

  function tipHtml(heads, cells) {
    return heads.map(function (h, i) {
      return '<span><i>' + h + '</i><b>' + cells[i] + '</b></span>';
    }).join('');
  }

  function showTip(html, x, y) {
    tip.innerHTML = html;
    tip.hidden = false;
    var r = tip.getBoundingClientRect();
    var left = Math.min(x + 14, window.innerWidth - r.width - 8);
    var top = y + 16 + r.height > window.innerHeight ? y - r.height - 12 : y + 16;
    tip.style.transform = 'translate(' + Math.max(8, left) + 'px,' + Math.max(8, top) + 'px)';
  }
  function hideTip() { tip.hidden = true; }

  // Hover and keyboard focus show the same tooltip.
  function bindTip(target, html) {
    target.addEventListener('pointermove', function (e) { showTip(html, e.clientX, e.clientY); });
    target.addEventListener('pointerleave', hideTip);
    target.addEventListener('focus', function () {
      var r = target.getBoundingClientRect();
      showTip(html, r.left + r.width / 2, r.top + r.height / 2);
    });
    target.addEventListener('blur', hideTip);
  }
  window.addEventListener('scroll', hideTip, { passive: true });

  function onVisible(node, fn) {
    if (reduced || !('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      fn();
    }, { threshold: 0.35 });
    io.observe(node);
  }

  /* ─── Horizontal bars ───────────────────────────────── */

  function barChart(chart) {
    var data = readTable(chart.querySelector('.chart__table'));
    var plot = scaffold(chart);
    var vi = +chart.getAttribute('data-value');
    var max = +chart.getAttribute('data-max');
    var labelCols = +(chart.getAttribute('data-label-cols') || 1);
    var hl = chart.hasAttribute('data-highlight') ? +chart.getAttribute('data-highlight') : -1;
    var unit = chart.getAttribute('data-unit') || '';

    plot.classList.add('hbars');
    data.rows.forEach(function (row, i) {
      var v = parseFloat(row.cells[vi]);
      var r = el('div', 'hbar' + (i === hl ? ' is-hl' : ''));
      r.tabIndex = 0;
      r.style.setProperty('--i', i);
      r.appendChild(el('span', 'hbar__label mono', row.cells.slice(0, labelCols).join(' · ')));

      var track = el('span', 'hbar__track');
      var fill = el('span', 'hbar__fill');
      var w = Math.max(0, Math.min(1, v / max));
      fill.style.width = (w * 100) + '%';
      track.appendChild(fill);

      var val = el('span', 'hbar__val mono');
      val.appendChild(el('b', null, row.cells[vi] + unit));
      if (row.note) val.appendChild(el('i', null, row.note));
      // long bars carry their value inside the bar end; short ones just past it
      if (w > 0.72 && !row.note) {
        val.classList.add('is-inside');
        val.style.left = (w * 100) + '%';
      } else {
        val.style.left = 'calc(' + (w * 100) + '% + 8px)';
      }
      track.appendChild(val);
      r.appendChild(track);

      bindTip(r, tipHtml(data.heads, row.cells));
      plot.appendChild(r);
    });

    onVisible(plot, function () { plot.classList.add('is-in'); });
  }

  /* ─── Threshold sweep (accuracy vs loops) ───────────── */

  function sweepChart(chart) {
    var data = readTable(chart.querySelector('.chart__table'));
    var plot = scaffold(chart);
    plot.classList.add('sweep');
    var pts = data.rows.filter(function (r) { return !r.ref; });
    var ref = data.rows.filter(function (r) { return r.ref; })[0];
    var drawn = false;

    function render() {
      var W = Math.max(260, plot.clientWidth);
      var H = 250;
      var m = { l: 40, r: 18, t: 18, b: 40 };
      var x = function (loops) { return m.l + (Math.log2(loops) / 3) * (W - m.l - m.r); };   // 1..8 loops
      var y = function (acc) { return m.t + (1 - (acc - 90) / 10) * (H - m.t - m.b); };      // 90..100 %

      plot.textContent = '';
      var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, width: W, height: H }, plot);

      // grid + axes (solid hairlines)
      [90, 95, 100].forEach(function (v) {
        svg('line', { x1: m.l, x2: W - m.r, y1: y(v), y2: y(v), class: 'sw-grid' }, s);
        svg('text', { x: m.l - 8, y: y(v) + 3.5, class: 'sw-tick', 'text-anchor': 'end' }, s).textContent = v + '%';
      });
      [1, 2, 4, 8].forEach(function (v) {
        svg('line', { x1: x(v), x2: x(v), y1: H - m.b, y2: H - m.b + 4, class: 'sw-axis' }, s);
        svg('text', { x: x(v), y: H - m.b + 17, class: 'sw-tick', 'text-anchor': 'middle' }, s).textContent = v;
      });
      svg('line', { x1: m.l, x2: W - m.r, y1: H - m.b, y2: H - m.b, class: 'sw-axis' }, s);
      svg('text', { x: W - m.r, y: H - 6, class: 'sw-tick', 'text-anchor': 'end' }, s).textContent = 'avg loops (log scale) →';

      // reference: fixed 8 loops, and the matching accuracy level
      var last = pts[pts.length - 1];
      var rx = x(+ref.cells[1]), ry = y(+ref.cells[2]);
      svg('line', { x1: x(+last.cells[1]), x2: rx, y1: ry, y2: ry, class: 'sw-ref' }, s);
      var gap = svg('text', { x: (x(+last.cells[1]) + rx) / 2, y: ry - 8, class: 'sw-note', 'text-anchor': 'middle' }, s);
      gap.textContent = 'same accuracy, ≈⅓ of the loops';

      // the sweep line + points
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + x(+p.cells[1]).toFixed(1) + ' ' + y(+p.cells[2]).toFixed(1); }).join(' ');
      var path = svg('path', { d: d, class: 'sw-line', pathLength: 1 }, s);

      function point(row, cls, label, anchor, dx, dy) {
        var cx = x(+row.cells[1]), cy = y(+row.cells[2]);
        var g = svg('g', { class: 'sw-pt ' + cls, tabindex: 0 }, s);
        svg('circle', { cx: cx, cy: cy, r: 13, class: 'sw-hit' }, g);
        svg('circle', { cx: cx, cy: cy, r: 4.5, class: 'sw-dot' }, g);
        if (label) svg('text', { x: cx + dx, y: cy + dy, class: 'sw-label', 'text-anchor': anchor }, g).textContent = label;
        bindTip(g, tipHtml(data.heads, row.cells));
      }
      pts.forEach(function (p, i) {
        var label = i === 0 ? 'p > 0.5 · 90.67%' : (i === pts.length - 1 ? 'p > 0.999' : '');
        var anchor = i === 0 ? 'start' : 'middle';
        point(p, 'is-sweep', label, anchor, i === 0 ? 10 : 0, i === 0 ? 4 : 20);
      });
      point(ref, 'is-ref', 'fixed 8 loops', 'end', -10, 20);

      if (drawn || reduced) s.classList.add('is-in');
      plot._svg = s;
      plot._path = path;
    }

    render();
    if ('ResizeObserver' in window) {
      var lastW = plot.clientWidth;
      new ResizeObserver(function () {
        if (Math.abs(plot.clientWidth - lastW) < 2) return;
        lastW = plot.clientWidth;
        render();
      }).observe(plot);
    }
    onVisible(plot, function () { drawn = true; if (plot._svg) plot._svg.classList.add('is-in'); });
  }

  document.querySelectorAll('.chart[data-chart="bars"]').forEach(barChart);
  document.querySelectorAll('.chart[data-chart="sweep"]').forEach(sweepChart);
})();
