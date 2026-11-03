/* portal.js: the dreamy doorway between the Avanian website (avanianapp.ir) and Avanian World (shared by both builds).
   Markup: <a class="aportal" href="(page to step into)" data-view="(page shown live inside)" data-name="(name shown while stepping through)">
             <span class="ap-label">…</span></a>
   data-local-href / data-local-view are used instead when the page is opened from a local server (testing).
   data-still is a picture of the other site: phones show it, slowly drifting, instead of the live view, and step through with a light
   circle instead of zooming the page (a second live site and a full-page zoom layer use more memory than an iPhone allows).
   Any element with data-portal-go="(selector, default .aportal)" steps through that portal when clicked; window.AvPortal.go(el) does the same.
   It runs in <head> so a visitor who arrives through a portal sees the light before the page paints.
   ?portal=1 means this page is the live view inside the other site's portal: it hides its own chrome and drifts slowly down and up.
   ?via=portal means the visitor just stepped through: the page zooms back out of its own portal.
   The rings, sheen and halo are CSS animations (compositor only); JS only changes their speed, draws the motes and runs the two transitions. */
(function () {
  'use strict';
  var root = document.documentElement, qs = location.search;
  var INSIDE = /[?&]portal=1(&|$)/.test(qs);
  var ARRIVE = !INSIDE && /[?&]via=portal(&|$)/.test(qs);
  var RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var LOCAL = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  var LITE = matchMedia('(pointer: coarse)').matches || innerWidth < 820 || (navigator.deviceMemory && navigator.deviceMemory <= 4) ||
    /iP(hone|ad|od)/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
  var V = 1000;                                   // the page inside is laid out at 1000 × 1000 px, then scaled down to the window
  var COLORS = ['#8D78E0', '#DF7FA5', '#F2C53D', '#4FA37E', '#5B93CF', '#FFFFFF', '#BFB1F5'];
  var DIVE = 'cubic-bezier(.75,0,.9,.4)', OUT = 'cubic-bezier(.16,1,.3,1)';
  var going = false, hold = ARRIVE, waiting = [];   // while arriving, live views wait: loading one would stutter the zoom
  if (INSIDE) root.classList.add('in-portal');
  if (ARRIVE) root.classList.add('portal-arrive');

  function mk(tag, cls, parent) { var e = document.createElement(tag); if (cls) e.className = cls; if (parent) parent.appendChild(e); return e }
  function attr(el, k) { return (LOCAL && el.getAttribute('data-local-' + k)) || el.getAttribute(k === 'href' ? 'href' : 'data-' + k) }
  function withParam(u, p) { var h = u.indexOf('#'), hash = h < 0 ? '' : u.slice(h); u = h < 0 ? u : u.slice(0, h); return u + (u.indexOf('?') < 0 ? '?' : '&') + p + hash }
  function sceneOf(el) { return el.closest('[data-portal-scene]') || el.closest('main,#world') || el }
  function ease(k, dt) { return 1 - Math.exp(-dt * k) }

  /* ---------- one portal ---------- */
  function mount(el) {
    if (el._st) return;
    var href = attr(el, 'href'), view = attr(el, 'view');
    if (href) el.setAttribute('href', href);
    var label = el.querySelector('.ap-label');
    var fl = mk('span', 'ap-float');
    mk('span', 'ap-halo ap-halo2', fl); mk('span', 'ap-halo', fl);
    var win = mk('span', 'ap-window', fl);
    mk('span', 'ap-sky', win);
    var vw = mk('span', 'ap-view', win), fr = null, still = el.getAttribute('data-still');
    if (LITE) el.classList.add('ap-lite');
    if (LITE && still && !INSIDE) { var im = mk('img', 'ap-still', vw); im.alt = ''; im.decoding = 'async'; im.src = still }
    if (INSIDE || !view || LITE) el.classList.add('ap-noview');
    else {
      fr = mk('iframe', '', vw);
      fr.title = el.getAttribute('data-name') || ''; fr.tabIndex = -1;
      fr.setAttribute('aria-hidden', 'true'); fr.setAttribute('scrolling', 'no');
      fr.setAttribute('sandbox', 'allow-scripts allow-same-origin');
      fr.addEventListener('load', function () { if (fr.src) setTimeout(function () { fr.classList.add('on') }, 400) });
    }
    var vx = mk('span', 'ap-vortex', win); mk('i', '', vx); mk('i', '', vx);
    mk('span', 'ap-sheen', win); mk('span', 'ap-glass', win); mk('span', 'ap-rim', win); mk('span', 'ap-ripple', win);
    var rings = [mk('span', 'ap-ring ap-r2', fl), mk('span', 'ap-ring ap-r3', fl), mk('span', 'ap-ring ap-r1', fl)];
    var cv = mk('canvas', 'ap-motes', fl), ctx = cv.getContext('2d');
    el.insertBefore(fl, label || null);

    var st = el._st = { rate: 1, want: 1, boost: 0, px: 0, py: 0, tx: 0, ty: 0, vis: false, raf: 0, last: 0, R: 0, C: 0, dpr: 1, motes: [], anims: null, fl: fl, frame: fr };
    function anims() {   // the CSS animations whose speed follows the portal's mood (hover, stepping through)
      if (!st.anims && el.getAnimations) st.anims = el.getAnimations({ subtree: true }).filter(function (a) { var t = a.effect && a.effect.target; return t && (t.classList.contains('ap-ring') || t.classList.contains('ap-sheen')) });
      return st.anims || [];
    }
    function size() {
      var d = win.clientWidth; if (!d) return;
      el.style.setProperty('--s', (d / V).toFixed(4));
      st.dpr = Math.min(2, devicePixelRatio || 1);
      st.C = cv.clientWidth / 2; st.R = d / 2;
      cv.width = Math.round(cv.clientWidth * st.dpr); cv.height = Math.round(cv.clientHeight * st.dpr);
    }
    function spawn(m, fresh) {
      m.ang = Math.random() * 6.283; m.r = st.R * (fresh ? 1 + Math.random() * .62 : 1.4 + Math.random() * .24);
      m.v = st.R * (.05 + Math.random() * .08); m.w = .2 + Math.random() * .28;
      m.s = .8 + Math.random() * 2.1; m.c = COLORS[Math.floor(Math.random() * COLORS.length)]; m.ph = Math.random() * 6.283; m.life = fresh ? 1 : 0;
      m.x = m.y = null; return m;
    }
    var n = innerWidth < 600 ? 30 : 52;
    function tick(t) {
      var dt = st.last ? Math.min((t - st.last) / 1000, .05) : 0; st.last = t;
      // speed: rings, sheen and motes all follow one rate, eased so it never jumps
      var r0 = st.rate; st.rate += (st.want + st.boost - st.rate) * ease(st.boost ? 2.2 : 2.6, dt);
      if (Math.abs(st.rate - r0) > .004) anims().forEach(function (a) { a.playbackRate = st.rate });
      // the view leans a little toward the pointer
      var p0 = st.px, q0 = st.py; st.px += (st.tx - st.px) * ease(5, dt); st.py += (st.ty - st.py) * ease(5, dt);
      if (Math.abs(st.px - p0) + Math.abs(st.py - q0) > .02) {
        vw.style.transform = 'translate3d(' + st.px.toFixed(2) + 'px,' + st.py.toFixed(2) + 'px,0)';
        rings.forEach(function (g, i) { g.style.translate = (-st.px * (.15 + i * .1)).toFixed(2) + 'px ' + (-st.py * (.15 + i * .1)).toFixed(2) + 'px' });
      }
      if (st.R) {
        if (!st.motes.length) for (var i = 0; i < n; i++) st.motes.push(spawn({}, true));
        var C = st.C, R = st.R, sp = Math.min(st.rate, 9);
        ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0); ctx.clearRect(0, 0, C * 2, C * 2); ctx.lineCap = 'round';
        for (var j = 0; j < st.motes.length; j++) {
          var m = st.motes[j];
          m.life += dt; m.r -= m.v * dt * sp; m.ang += m.w * dt * sp * (R * 1.3 / m.r);
          if (m.r < R * .9) { spawn(m); continue }
          var a = Math.min(1, m.life / .9) * Math.min(1, (m.r - R * .9) / (R * .2)), s = m.s * (.75 + .25 * Math.sin(t / 300 + m.ph));
          var x = C + Math.cos(m.ang) * m.r, y = C + Math.sin(m.ang) * m.r * .96;
          if (m.x !== null) {          // a short trail along the spiral, longer when the portal spins faster
            ctx.globalAlpha = a * .5; ctx.strokeStyle = m.c; ctx.lineWidth = s * 1.1;
            ctx.beginPath(); ctx.moveTo(m.x + (m.x - x) * (1 + sp * .6), m.y + (m.y - y) * (1 + sp * .6)); ctx.lineTo(x, y); ctx.stroke();
          }
          ctx.globalAlpha = a * .22; ctx.fillStyle = m.c; ctx.beginPath(); ctx.arc(x, y, s * 3.4, 0, 6.283); ctx.fill();
          ctx.globalAlpha = a; ctx.beginPath(); ctx.arc(x, y, s, 0, 6.283); ctx.fill();
          m.x = x; m.y = y;
        }
        ctx.globalAlpha = 1;
      }
      st.raf = (st.vis || st.boost) ? requestAnimationFrame(tick) : 0;
    }
    st.wake = function () { if (!st.raf && !RM) { st.last = 0; st.raf = requestAnimationFrame(tick) } };
    function show(on) {
      st.vis = on; el.classList.toggle('ap-idle', !on);
      if (!going && !RM && !LITE) sceneOf(el).style.willChange = on ? 'transform' : '';   // ready for the dive, so starting it costs nothing
      if (on) st.wake();
      if (RM && on) { size(); tick(performance.now()) }   // reduced motion: one still frame
    }
    size();
    if ('ResizeObserver' in window) new ResizeObserver(size).observe(win); else addEventListener('resize', size);
    // the live view loads only when the portal comes near the screen; the motes only run while it is on screen
    st.load = function () { if (!fr || fr.src) return; if (hold) { if (waiting.indexOf(st) < 0) waiting.push(st) } else fr.src = view };
    if ('IntersectionObserver' in window) {
      if (fr) new IntersectionObserver(function (es, o) { if (es[0].isIntersecting) { st.load(); o.disconnect() } }, { rootMargin: '700px 0px' }).observe(el);
      new IntersectionObserver(function (es) { show(es[0].isIntersecting) }, { rootMargin: '120px 0px' }).observe(el);
    } else { st.load(); show(true) }

    el.addEventListener('pointermove', function (e) {
      if (going) return;
      var r = win.getBoundingClientRect();
      st.tx = -((e.clientX - r.left) / r.width - .5) * 26; st.ty = -((e.clientY - r.top) / r.height - .5) * 26; st.want = 2.2; st.wake();
    });
    el.addEventListener('pointerleave', function () { if (!going) { st.tx = st.ty = 0; st.want = 1 } });
    el.addEventListener('click', function (e) {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button) return;   // let new-tab clicks through
      e.preventDefault(); go(el);
    });
  }

  /* ---------- geometry ---------- */
  function centre(el) {
    var w = el && el.querySelector('.ap-window'), r = w && w.getBoundingClientRect();
    if (!r || !r.width || r.bottom < 0 || r.top > innerHeight) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, r: r.width / 2 };
  }
  function circle(r, c) { return 'circle(' + r.toFixed(1) + 'px at ' + c.x.toFixed(1) + 'px ' + c.y.toFixed(1) + 'px)' }
  function far(c) { return Math.hypot(Math.max(c.x, innerWidth - c.x), Math.max(c.y, innerHeight - c.y)) }
  function aim(scene, c) {          // zoom the scene around the portal's centre; returns the scale at which the window covers the screen
    var r = scene.getBoundingClientRect();
    scene.style.transformOrigin = (c.x - r.left).toFixed(1) + 'px ' + (c.y - r.top).toFixed(1) + 'px';
    scene.style.willChange = 'transform';
    return Math.min(9, far(c) / c.r * 1.08);
  }
  function overlay(c, name) {
    var ov = mk('div', 'ap-warp'); ov.setAttribute('aria-hidden', 'true');
    if (c) { ov.style.setProperty('--cx', c.x + 'px'); ov.style.setProperty('--cy', c.y + 'px') }
    if (name) mk('em', '', ov).textContent = name;
    document.body.appendChild(ov);
    return ov;
  }
  /* motes that rush outward past the camera while it dives in (or out of) the portal */
  function streaks(c, dur, inward) {
    var cv = mk('canvas', 'ap-streaks'), ctx = cv.getContext('2d'), dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = innerWidth * dpr; cv.height = innerHeight * dpr; document.body.appendChild(cv);
    var F = far(c), ps = [], t0 = performance.now();
    for (var i = 0; i < (innerWidth < 600 ? 70 : 130); i++) ps.push({ a: Math.random() * 6.283, d: c.r * (.2 + Math.random() * .9), v: 60 + Math.random() * 220, s: .6 + Math.random() * 1.8, c: COLORS[i % COLORS.length], k: Math.random() });
    (function step(t) {
      var p = Math.min(1, (t - t0) / dur);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight); ctx.lineCap = 'round';
      var acc = inward ? 1 - p : p, fade = inward ? Math.min(1, (1 - p) * 3) : Math.min(1, p * 4);
      for (var i = 0; i < ps.length; i++) {
        var q = ps[i], d = q.d + (F * 1.3) * Math.pow(acc, 2.2) * (.4 + q.k), len = 6 + d * .18 * acc;
        var x = c.x + Math.cos(q.a) * d, y = c.y + Math.sin(q.a) * d;
        ctx.globalAlpha = fade * (.35 + q.k * .65); ctx.strokeStyle = q.c; ctx.lineWidth = q.s * (1 + acc * 1.5);
        ctx.beginPath(); ctx.moveTo(x - Math.cos(q.a) * len, y - Math.sin(q.a) * len); ctx.lineTo(x, y); ctx.stroke();
      }
      if (p < 1) requestAnimationFrame(step); else cv.remove();
    })(t0);
    return cv;
  }

  // the live view dissolves into the vortex before anything scales (and comes back after), so the zoom never redraws the other site
  function vortex(el, on) {
    el.classList.toggle('ap-vortexing', on);
    var fr = el._st && el._st.frame; if (!fr) return;
    clearTimeout(fr._vt);
    if (on) fr._vt = setTimeout(function () { fr.style.visibility = 'hidden' }, 320); else fr.style.visibility = '';
  }

  /* ---------- stepping through: anticipation, a dive into the portal, then soft light ---------- */
  function go(el) {
    if (going || !el) return; going = true;
    var st = el._st, dest = withParam(el.href, 'via=portal'), c = centre(el);
    el.classList.add('ap-going');
    if (RM || !el.animate || !c) {
      var o = overlay(c, el.getAttribute('data-name'));
      if (o.animate) o.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 350, fill: 'forwards' });
      setTimeout(function () { location.href = dest }, 380); return;
    }
    if (st) { st.tx = st.ty = 0; st.want = 1; st.boost = 7; st.wake() }
    if (LITE) { goLite(el, c, dest); return }
    // 1. the live view melts into a vortex of light, then the portal draws a breath
    vortex(el, true);
    st.fl.animate([{ scale: 1 }, { scale: .94, offset: .45 }, { scale: 1.06 }], { duration: 420, delay: 330, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' });
    // 2. the camera dives in: the whole scene grows around the portal until its window fills the screen
    var scene = sceneOf(el), S = aim(scene, c);
    setTimeout(function () {
      // longer than the wait before leaving, so it never comes to rest (resting at a big scale would make the browser redraw it all)
      scene.classList.add('ap-diving');
      scene.animate([{ transform: 'scale(1)' }, { transform: 'scale(' + (S * 1.25).toFixed(3) + ')' }], { duration: 1750, easing: DIVE, fill: 'forwards' });
      streaks(c, 1350, false);
    }, 560);
    setTimeout(function () { scene.style.visibility = 'hidden' }, 1800);   // the light covers it all by now: stop drawing the page underneath
    // 3. it all blooms into light; the next page starts from the same light
    var ov = overlay(c, el.getAttribute('data-name'));
    ov.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 650, delay: 1150, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
    var em = ov.querySelector('em');
    if (em) em.animate([{ opacity: 0, transform: 'scale(.9)', filter: 'blur(6px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: 600, delay: 1450, easing: OUT, fill: 'forwards' });
    setTimeout(function () { location.href = dest }, 2100);
  }

  // phones: no page zoom; a circle of light grows out of the portal and fills the screen
  function goLite(el, c, dest) {
    vortex(el, true);
    el._st.fl.animate([{ scale: 1 }, { scale: .94, offset: .45 }, { scale: 1.06 }], { duration: 420, delay: 250, easing: 'cubic-bezier(.45,0,.2,1)', fill: 'forwards' });
    var ov = overlay(c, el.getAttribute('data-name'));
    ov.style.clipPath = circle(c.r, c);
    ov.animate([{ clipPath: circle(c.r * .9, c), opacity: 0 }, { clipPath: circle(c.r, c), opacity: 1, offset: .25 }, { clipPath: circle(far(c) + 4, c), opacity: 1 }],
      { duration: 1250, delay: 380, easing: 'cubic-bezier(.65,0,.3,1)', fill: 'forwards' });
    setTimeout(function () { streaks(c, 1100, false) }, 650);
    var em = ov.querySelector('em');
    if (em) em.animate([{ opacity: 0, transform: 'scale(.9)' }, { opacity: 1, transform: 'none' }], { duration: 500, delay: 1250, easing: OUT, fill: 'forwards' });
    setTimeout(function () { location.href = dest }, 1850);
  }

  /* ---------- arriving: the page comes out of its own portal ---------- */
  function arrive() {
    try { var u = new URL(location.href); u.searchParams.delete('via'); history.replaceState(history.state, '', u.pathname + u.search + u.hash) } catch (e) {}
    var ov = overlay(null, ''); ov.style.opacity = 1;
    root.classList.remove('portal-arrive');
    if (RM || !ov.animate) { setTimeout(function () { ov.remove(); hold = false; waiting.splice(0).forEach(function (st) { st.load() }) }, 250); return }
    function release() { hold = false; waiting.splice(0).forEach(function (st) { st.load() }) }
    // wait until the page has fully loaded and scrolled to its portal, then zoom back out of it
    function start() { requestAnimationFrame(function () { requestAnimationFrame(reveal) }) }
    function reveal() {
      var p = document.querySelector('.aportal');
      if (p) p.scrollIntoView({ block: 'center', behavior: 'instant' });   // the page may still have been settling when it jumped to its portal
      var c = centre(p);
      if (p && c && p._st && LITE) {
        p._st.rate = 8; p._st.want = 1; p._st.wake();
        p.classList.add('ap-vortexing'); setTimeout(function () { p.classList.remove('ap-vortexing') }, 1300);
        ov.style.setProperty('--cx', c.x + 'px'); ov.style.setProperty('--cy', c.y + 'px');
        streaks(c, 1000, true);
        ov.animate([{ clipPath: circle(far(c) + 4, c), opacity: 1 }, { clipPath: circle(c.r, c), opacity: 1, offset: .8 }, { clipPath: circle(c.r * .9, c), opacity: 0 }],
          { duration: 1300, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' }).onfinish = function () { ov.remove(); release() };
        return;
      }
      if (p && c && p._st) {
        var st = p._st, scene = sceneOf(p), S = Math.min(2.2, aim(scene, c));   // a gentle start: the light hides the first part anyway
        st.rate = 8; st.boost = 0; st.want = 1; st.wake();
        p.classList.add('ap-vortexing');
        setTimeout(function () { p.classList.remove('ap-vortexing') }, 1500);   // the vortex settles back into the sky as the page comes to rest
        var z = scene.animate([{ transform: 'scale(' + S.toFixed(3) + ')' }, { transform: 'scale(1)' }], { duration: 1600, easing: OUT });
        z.onfinish = function () { scene.style.willChange = st.vis ? 'transform' : ''; scene.style.transformOrigin = ''; setTimeout(release, 200) };
        streaks(c, 1100, true);
        ov.style.setProperty('--cx', c.x + 'px'); ov.style.setProperty('--cy', c.y + 'px');
      }
      else setTimeout(release, 900);
      ov.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 1000, easing: 'cubic-bezier(.3,0,.2,1)', fill: 'forwards' }).onfinish = function () { ov.remove() };
    }
    // start once the page has loaded, but never keep the visitor waiting on a slow outside file (e.g. a web font that is blocked)
    var t0 = performance.now(), begun = false;
    function ready() { if (begun) return; begun = true; setTimeout(start, Math.max(0, 450 - (performance.now() - t0))) }
    if (document.readyState === 'complete') ready(); else { addEventListener('load', ready, { once: true }); setTimeout(ready, 1200) }
  }

  /* ---------- the live view inside the other site's portal drifts slowly down the page and back up ---------- */
  function drift() {
    if (RM) return;
    var y = 0, v = 0, dir = 1, wait = 2.5, last = 0;
    function step(t) {
      var dt = last ? Math.min((t - last) / 1000, .05) : 0; last = t;
      var max = Math.max(0, document.documentElement.scrollHeight - innerHeight);
      if (wait > 0) { wait -= dt; v = 0 }
      else {
        var want = dir > 0 ? 28 : 80;
        v += (want - v) * ease(.8, dt);                       // ease into the drift instead of starting at full speed
        y += dir * v * dt;
        if (y >= max) { y = max; dir = -1; wait = 3 } else if (y <= 0) { y = 0; dir = 1; wait = 3 }
        window.scrollTo({ top: y, behavior: 'instant' });
      }
      requestAnimationFrame(step);
    }
    setTimeout(function () { requestAnimationFrame(step) }, 1200);
  }

  function init() {
    Array.prototype.forEach.call(document.querySelectorAll('.aportal'), mount);
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('[data-portal-go]');
      if (!b) return;
      var p = document.querySelector(b.getAttribute('data-portal-go') || '.aportal');
      if (!p) return;
      e.preventDefault();
      var c = centre(p);
      if (c) go(p);
      else { p.scrollIntoView({ behavior: RM ? 'auto' : 'smooth', block: 'center' }); setTimeout(function () { go(p) }, 900) }
    });
    if (INSIDE) drift();
    if (ARRIVE) arrive();
  }
  // coming back with the browser's back button restores the page as it was left: undo the dive
  addEventListener('pageshow', function (e) {
    if (!e.persisted) return;
    going = false;
    Array.prototype.forEach.call(document.querySelectorAll('.ap-warp,.ap-streaks'), function (o) { o.remove() });
    Array.prototype.forEach.call(document.querySelectorAll('.aportal'), function (p) {
      p.classList.remove('ap-going'); vortex(p, false);
      var sc = sceneOf(p); if (sc.getAnimations) sc.getAnimations().forEach(function (a) { a.cancel() }); sc.style.willChange = ''; sc.style.visibility = ''; sc.classList.remove('ap-diving');
      if (p._st) { p._st.boost = 0; p._st.want = 1; p._st.fl.getAnimations().forEach(function (a) { a.cancel() }) }
    });
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
  window.AvPortal = { go: function (el) { go(typeof el === 'string' ? document.querySelector(el) : el || document.querySelector('.aportal')) } };
})();
