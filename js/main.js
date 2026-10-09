/* Page behaviour: theme, clock, navigation, reveal-on-scroll, copy, MiniTor diagram. */
(function () {
  'use strict';

  var doc = document.documentElement;
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  /* ─── Theme ─────────────────────────────────────────── */

  var darkQuery = window.matchMedia('(prefers-color-scheme: dark)');

  function currentTheme() {
    var t = doc.getAttribute('data-theme');
    if (t) return t;
    return darkQuery.matches ? 'dark' : 'light';
  }

  function announceTheme() {
    document.dispatchEvent(new CustomEvent('themechange', { detail: currentTheme() }));
  }

  var themeBtn = document.querySelector('.theme-toggle');
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      doc.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) {}
      announceTheme();
    });
  }
  darkQuery.addEventListener('change', announceTheme);

  /* ─── 3D fallback ───────────────────────────────────── */
  // If the WebGL module never loads (offline CDN, old browser), show a quiet fallback.
  var stage = document.querySelector('.stage');
  if (stage) {
    setTimeout(function () {
      if (!stage.classList.contains('is-ready')) stage.classList.add('no-webgl');
    }, 6000);
  }

  /* ─── Addis Ababa clock ─────────────────────────────── */

  var clock = document.getElementById('clock');
  if (clock) {
    var fmt;
    try {
      fmt = new Intl.DateTimeFormat('en-GB', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Africa/Addis_Ababa'
      });
    } catch (e) { fmt = null; }

    var tickClock = function () {
      if (!fmt) return;
      clock.textContent = fmt.format(new Date());
    };
    tickClock();
    setInterval(tickClock, 15000);
  }

  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

  /* ─── Header state + active section ─────────────────── */

  var nav = document.querySelector('.nav');
  var onScroll = function () {
    nav.classList.toggle('is-scrolled', window.scrollY > 8);
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  var navLinks = Array.prototype.slice.call(document.querySelectorAll('.nav__links a'));
  if ('IntersectionObserver' in window && navLinks.length) {
    var sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (a) {
          a.classList.toggle('is-active', a.getAttribute('href') === '#' + entry.target.id);
        });
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('main section[id]').forEach(function (s) { sectionObserver.observe(s); });
  }

  /* ─── Mobile menu ───────────────────────────────────── */

  var menuBtn = document.querySelector('.menu-toggle');
  var menu = document.getElementById('mobile-menu');
  if (menuBtn && menu) {
    var setMenu = function (open) {
      menuBtn.setAttribute('aria-expanded', String(open));
      menuBtn.textContent = open ? 'Close' : 'Menu';
      menu.hidden = !open;
    };
    menuBtn.addEventListener('click', function () {
      setMenu(menuBtn.getAttribute('aria-expanded') !== 'true');
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); }
    });
  }

  /* ─── Reveal on scroll ──────────────────────────────── */

  var revealTargets = document.querySelectorAll('[data-reveal], #tiers');
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    var revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add('is-in');
        revealObserver.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.05 });
    revealTargets.forEach(function (el) { revealObserver.observe(el); });
  } else {
    revealTargets.forEach(function (el) { el.classList.add('is-in'); });
  }

  /* ─── Copy email ────────────────────────────────────── */

  document.querySelectorAll('[data-copy]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var text = btn.getAttribute('data-copy');
      var done = function () {
        btn.textContent = 'Copied';
        btn.classList.add('is-done');
        setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('is-done'); }, 1800);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, function () {});
      }
    });
  });

  /* ─── MiniTor route diagram ─────────────────────────── */
  // A packet wrapped in three layers moves Client → Entry → Middle → Exit → Destination.
  // Each relay peels one layer. Positions are read from the DOM, so the same code
  // drives the horizontal (desktop) and vertical (mobile) layouts.

  var route = document.getElementById('route');
  var packet = document.getElementById('packet');
  var stateEl = document.getElementById('route-state');
  if (route && packet) {
    var stops = Array.prototype.slice.call(route.querySelectorAll('.stop'));
    var layers = [
      packet.querySelector('.layer--3'),
      packet.querySelector('.layer--2'),
      packet.querySelector('.layer--1')
    ];
    var STATES = ['client: wrap ×3', 'entry: peel layer 1', 'middle: peel layer 2', 'exit: peel layer 3', 'delivered'];
    var HOLD = 900;    // ms paused at each stop
    var TRAVEL = 1100; // ms between stops
    var points = [];
    var visible = false;
    var startTime = 0;
    var rafId = 0;

    var LANE = 22; // distance from a node's edge to the packet lane (matches the CSS lane)
    var measure = function () {
      var box = route.getBoundingClientRect();
      var rects = stops.map(function (s) { return s.querySelector('.node').getBoundingClientRect(); });
      // stacked layout on narrow screens: lane runs to the right of the nodes
      var vertical = rects.length > 1 && rects[1].top - rects[0].top > rects[0].height / 2;
      points = rects.map(function (n) {
        return vertical
          ? { x: n.left - box.left + n.width + LANE, y: n.top - box.top + n.height / 2 }
          : { x: n.left - box.left + n.width / 2, y: n.bottom - box.top + LANE };
      });
    };

    var place = function (x, y) {
      packet.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    };

    var setStop = function (i) {
      stops.forEach(function (s, k) { s.classList.toggle('is-active', k === i); });
      // layers peeled so far: relays 1..3 each remove one
      layers.forEach(function (l, k) { l.classList.toggle('is-peeled', k < Math.min(i, 3)); });
      if (stateEl) stateEl.textContent = STATES[i];
    };

    var ease = function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };

    var segment = HOLD + TRAVEL;
    var cycle = segment * (stops.length - 1) + HOLD * 2;
    var lastStop = -1;

    var frame = function (now) {
      if (!visible) { rafId = 0; return; }
      var t = (now - startTime) % cycle;
      var idx = Math.floor(t / segment);
      var local = t - idx * segment;

      if (idx >= stops.length - 1) {
        // resting at destination
        idx = stops.length - 1;
        local = 0;
      }

      var stopNow = local < HOLD ? idx : -1;
      if (stopNow !== -1 && stopNow !== lastStop) {
        setStop(stopNow);
        lastStop = stopNow;
      }
      if (stopNow === -1) {
        stops.forEach(function (s) { s.classList.remove('is-active'); });
        lastStop = -1;
      }

      var a = points[idx];
      var b = points[Math.min(idx + 1, points.length - 1)];
      var p = local < HOLD ? 0 : ease((local - HOLD) / TRAVEL);
      place(a.x + (b.x - a.x) * p, a.y + (b.y - a.y) * p);

      rafId = requestAnimationFrame(frame);
    };

    var showStatic = function () {
      measure();
      place(points[0].x, points[0].y);
      setStop(0);
      if (stateEl) stateEl.textContent = 'client: wrap ×3';
      route.classList.add('is-live');
    };

    measure();
    window.addEventListener('resize', function () { measure(); if (reducedMotion.matches) showStatic(); });

    if (reducedMotion.matches || !('IntersectionObserver' in window)) {
      showStatic();
    } else {
      new IntersectionObserver(function (entries) {
        visible = entries[0].isIntersecting;
        if (visible) {
          if (rafId) cancelAnimationFrame(rafId);
          measure();
          place(points[0].x, points[0].y);
          route.classList.add('is-live');
          // restart the cycle each time the diagram comes into view
          startTime = performance.now();
          lastStop = -1;
          rafId = requestAnimationFrame(frame);
        }
      }, { threshold: 0.3 }).observe(route);
    }

    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
  }

  /* ─── Portrait: resolve from coarse pixels, then "detect" ── */

  var portrait = document.getElementById('portrait');
  if (portrait) {
    var img = portrait.querySelector('img');
    var pixels = portrait.querySelector('.portrait__pixels');
    var overlayBtn = portrait.querySelector('.portrait__toggle');
    var resolveTimer = 0;

    overlayBtn.addEventListener('click', function () {
      var on = overlayBtn.getAttribute('aria-pressed') !== 'true';
      overlayBtn.setAttribute('aria-pressed', String(on));
      overlayBtn.textContent = on ? 'overlay on' : 'overlay off';
      portrait.classList.toggle('overlay-off', !on);
    });

    var detect = function () { portrait.classList.add('is-detected'); };

    var resolve = function () {
      clearTimeout(resolveTimer);
      portrait.classList.remove('is-detected');
      var ctx = pixels.getContext('2d');
      var small = document.createElement('canvas');
      var sctx = small.getContext('2d');
      var steps = [6, 10, 16, 28, 48, 90];
      var k = 0;
      ctx.imageSmoothingEnabled = false;
      portrait.classList.add('is-resolving');

      var draw = function () {
        if (k >= steps.length) {
          portrait.classList.remove('is-resolving');
          resolveTimer = setTimeout(detect, 200);
          return;
        }
        var n = steps[k++];
        small.width = small.height = n;
        sctx.drawImage(img, 0, 0, n, n);
        ctx.clearRect(0, 0, pixels.width, pixels.height);
        ctx.drawImage(small, 0, 0, n, n, 0, 0, pixels.width, pixels.height);
        resolveTimer = setTimeout(draw, 110);
      };
      draw();
    };

    var whenLoaded = function (fn) {
      if (img.complete && img.naturalWidth) fn();
      else {
        img.addEventListener('load', fn, { once: true });
        img.addEventListener('error', detect, { once: true });
      }
    };

    if (reducedMotion.matches || !('IntersectionObserver' in window)) {
      detect();
    } else {
      var portraitObserver = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting) return;
        portraitObserver.disconnect();
        whenLoaded(resolve);
      }, { threshold: 0.4 });
      portraitObserver.observe(portrait);

      // click the photo to run it again
      portrait.querySelector('.portrait__frame').addEventListener('click', function () {
        whenLoaded(resolve);
      });
    }
  }

  /* ─── Inference service diagram ─────────────────────── */
  // One request walks down the layers (api → service → model) and back up,
  // the core layer flags each step as logged, then the JSON response prints.
  // Each pass runs on the next backend; time in the model layer scales with
  // that backend's benchmarked mean latency.

  var svc = document.getElementById('svc');
  if (svc) {
    var svcState = document.getElementById('svc-state');
    var step = function (name) { return svc.querySelector('[data-step="' + name + '"]'); };
    var lines = svc.querySelectorAll('.ln');
    var coreLayer = step('core');
    var chips = svc.querySelectorAll('.svc__backends i');
    var resBackend = document.getElementById('res-backend');
    var resPrecision = document.getElementById('res-precision');
    var resMs = document.getElementById('res-ms');
    var BACKENDS = [
      { b: 'tensorrt', p: 'fp16', d: 'cuda', ms: '13.84' },
      { b: 'onnxruntime', p: 'fp32', d: 'cuda', ms: '18.99' },
      { b: 'openvino', p: 'int8', d: 'cpu', ms: '32.17' },
      { b: 'pytorch', p: 'fp32', d: 'cpu', ms: '92.61' }
    ];
    var pass = 0;
    var timers = [];
    var running = false;

    var later = function (fn, ms) { timers.push(setTimeout(fn, ms)); };
    var clearLit = function () {
      svc.querySelectorAll('.is-lit').forEach(function (el) { el.classList.remove('is-lit'); });
    };
    var setBackend = function (be) {
      chips.forEach(function (c) { c.classList.toggle('is-on', c.getAttribute('data-b') === be.b); });
      resBackend.textContent = '"' + be.b + '"';
      resPrecision.textContent = '"' + be.p + '"';
      resMs.textContent = be.ms;
    };

    var run = function () {
      timers = [];
      var be = BACKENDS[pass++ % BACKENDS.length];
      var steps = [
        ['req', 650, 'POST /api/v1/detect'],
        ['api', 480, 'validate request'],
        ['service', 480, 'orchestrate'],
        ['model', 260 + parseFloat(be.ms) * 10, 'YOLOv8 · ' + be.b + ' ' + be.p + ' (' + be.d + ')'],
        ['service', 360, 'build response'],
        ['api', 360, 'serialize']
      ];
      clearLit();
      lines.forEach(function (l) { l.classList.remove('is-on'); });
      svc.classList.add('is-running');
      setBackend(be);

      var t = 0;
      steps.forEach(function (s) {
        later(function () {
          clearLit();
          step(s[0]).classList.add('is-lit');
          coreLayer.classList.add('is-log');
          later(function () { coreLayer.classList.remove('is-log'); }, 220);
          svcState.textContent = s[2];
        }, t);
        t += s[1];
      });
      later(function () { clearLit(); svcState.textContent = '200 OK · ' + be.ms + ' ms'; }, t);
      lines.forEach(function (l, i) { later(function () { l.classList.add('is-on'); }, t + i * 70); });
      later(run, t + lines.length * 70 + 3000);
    };

    setBackend(BACKENDS[0]);
    if (reducedMotion.matches || !('IntersectionObserver' in window)) {
      svcState.textContent = '200 OK · ' + BACKENDS[0].ms + ' ms';
    } else {
      new IntersectionObserver(function (entries) {
        var vis = entries[0].isIntersecting;
        if (vis && !running) {
          running = true;
          run();
        } else if (!vis && running) {
          running = false;
          timers.forEach(clearTimeout);
          clearLit();
          coreLayer.classList.remove('is-log');
          svc.classList.remove('is-running');
          svcState.textContent = 'idle';
        }
      }, { threshold: 0.3 }).observe(svc);
    }
  }

  /* ─── Thinking in Loops: Sudoku refined by one block ── */
  // Illustrative run: the same block is applied each loop; cells it changes
  // flash, rule conflicts are marked, and it halts once p(halt) > 0.999.

  var sudoku = document.getElementById('sudoku');
  if (sudoku) {
    var SOL = [1, 2, 3, 4, 3, 4, 1, 2, 2, 1, 4, 3, 4, 3, 2, 1];
    var GIVEN = [0, 3, 5, 10, 12, 15];
    var LOOPS = [
      { set: { 1: 2, 2: 3, 4: 3, 6: 1, 7: 2, 8: 2, 9: 3 }, p: 0.041 },
      { set: { 9: 1, 11: 3, 13: 3, 14: 1 }, p: 0.62 },
      { set: { 14: 2 }, p: 0.9993 }
    ];
    var THRESHOLD = 0.999;
    var loopN = document.getElementById('loop-n');
    var haltP = document.getElementById('halt-p');
    var haltFill = document.getElementById('halt-fill');
    var haltState = document.getElementById('halt-state');
    var demo = document.getElementById('loops-demo');
    var cells = [];
    var grid = [];
    var loopTimers = [];
    var loopRunning = false;

    for (var c = 0; c < 16; c++) {
      var cell = document.createElement('span');
      cell.className = 'sudoku__cell';
      sudoku.appendChild(cell);
      cells.push(cell);
    }

    var conflicts = function () {
      var bad = {};
      for (var i = 0; i < 16; i++) {
        if (!grid[i]) continue;
        for (var j = i + 1; j < 16; j++) {
          if (grid[j] !== grid[i]) continue;
          var sameRow = (i >> 2) === (j >> 2);
          var sameCol = (i & 3) === (j & 3);
          var sameBox = ((i >> 3) === (j >> 3)) && (((i & 3) >> 1) === ((j & 3) >> 1));
          if (sameRow || sameCol || sameBox) { bad[i] = true; bad[j] = true; }
        }
      }
      return bad;
    };

    var paint = function (changed) {
      var bad = conflicts();
      cells.forEach(function (el, i) {
        el.textContent = grid[i] || '';
        el.classList.toggle('is-given', GIVEN.indexOf(i) !== -1);
        el.classList.toggle('is-changed', !!changed[i]);
        el.classList.toggle('is-conflict', !!bad[i]);
      });
    };

    var setHalt = function (n, p, state) {
      loopN.textContent = n;
      haltP.textContent = p.toFixed(p > 0.99 ? 4 : 3);
      haltFill.style.transform = 'scaleX(' + p + ')';
      haltState.textContent = state;
      demo.classList.toggle('is-halted', state.indexOf('halt') === 0);
    };

    var reset = function () {
      grid = SOL.map(function (v, i) { return GIVEN.indexOf(i) !== -1 ? v : 0; });
      paint({});
      setHalt(0, 0, 'thinking');
    };

    var runLoops = function () {
      loopTimers = [];
      reset();
      var t = 900;
      LOOPS.forEach(function (loop, k) {
        loopTimers.push(setTimeout(function () {
          for (var idx in loop.set) grid[idx] = loop.set[idx];
          paint(loop.set);
          var halted = loop.p > THRESHOLD;
          setHalt(k + 1, loop.p, halted ? 'halt at loop ' + (k + 1) : 'p ≤ 0.999 · loop again');
        }, t));
        t += 1400;
      });
      loopTimers.push(setTimeout(runLoops, t + 2200));
    };

    var showFinal = function () {
      grid = SOL.slice();
      paint({});
      setHalt(LOOPS.length, LOOPS[LOOPS.length - 1].p, 'halt at loop ' + LOOPS.length);
    };

    if (reducedMotion.matches || !('IntersectionObserver' in window)) {
      showFinal();
    } else {
      reset();
      new IntersectionObserver(function (entries) {
        var vis = entries[0].isIntersecting;
        if (vis && !loopRunning) {
          loopRunning = true;
          runLoops();
        } else if (!vis && loopRunning) {
          loopRunning = false;
          loopTimers.forEach(clearTimeout);
        }
      }, { threshold: 0.3 }).observe(demo);
    }
  }
})();
