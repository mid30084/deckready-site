/* DeckReady site — scroll story (2026-10-27).
   Vanilla port of the approved mockup site_mockup_story.dc.html (renderVals()):
   - one requestAnimationFrame clock drives the active scene; every scene is built ONCE
     when its chapter becomes active (that replays its entrance animations) and then only
     the nodes whose value changed are touched (txt / sty / css / cls cache the last value);
   - lists that come and go (rows, flying records, ♪ notes, badges) are keyed, so a new
     item is a new node and its CSS animation starts fresh;
   - the active chapter = the chapter whose centre is nearest to the viewport centre,
     re-measured on every scroll (rAF-throttled); chapter look follows renderVals();
   - prefers-reduced-motion: no animations, every scene shows a static final state. */
(function () {
  "use strict";

  var REDUCE = !!(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches);
  var MONO = "'JetBrains Mono', monospace";
  var now = function () { return performance.now(); };

  // ---------- tiny DOM helpers ----------
  function frag(html) { var t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function refs(root) { var o = {}; root.querySelectorAll("[data-r]").forEach(function (e) { o[e.getAttribute("data-r")] = e; }); return o; }
  function put(el, k, v, f) { var c = el.__c || (el.__c = {}); if (c[k] === v) return; c[k] = v; f(v); }
  function txt(el, v) { put(el, "t", v, function (v) { el.textContent = v; }); }
  function sty(el, p, v) { put(el, "s:" + p, v, function (v) { el.style.setProperty(p, v); }); }
  function css(el, v) { put(el, "css", v, function (v) { el.setAttribute("style", v); }); }
  function cls(el, v) { put(el, "cls", v, function (v) { if (v) el.setAttribute("class", v); else el.removeAttribute("class"); }); }
  function shown(el, on) { put(el, "show", on, function (v) { el.style.display = v ? "" : "none"; }); }
  // <sc-if>: a display:contents slot that holds the element while `on`
  function cond(slot, on, make) {
    if (on) { if (!slot.firstElementChild) slot.appendChild(make()); return slot.firstElementChild; }
    if (slot.firstElementChild) slot.textContent = "";
    return null;
  }
  // <sc-for> with keys: items [{key, …}] → one node per key, in order
  function keyed(box, items, make, upd) {
    var m = box.__m || (box.__m = new Map()), keep = new Set();
    items.forEach(function (it, i) {
      var el = m.get(it.key);
      if (!el) { el = make(it); m.set(it.key, el); }
      keep.add(it.key);
      if (box.children[i] !== el) box.insertBefore(el, box.children[i] || null);
      if (upd) upd(el, it);
    });
    m.forEach(function (el, k) { if (!keep.has(k)) { el.remove(); m.delete(k); } });
  }
  function esc(s) { return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;"); }

  // ---------- shared (app_logic: fly_path, flags) ----------
  function flyPath(s, e, W, H) {
    var m = 12;
    var cl = function (x, y) { return [Math.max(m, Math.min(W - m, x)), Math.max(m, Math.min(H - m, y))]; };
    var a = cl(s[0], s[1]), d = cl(e[0], e[1]);
    var sag = Math.max(40, 0.3 * Math.hypot(d[0] - a[0], d[1] - a[1]));
    var c1 = cl(a[0] + (d[0] - a[0]) / 3, a[1] + (d[1] - a[1]) / 3 + sag);
    var c2 = cl(a[0] + 2 * (d[0] - a[0]) / 3, a[1] + 2 * (d[1] - a[1]) / 3 + sag);
    var f = function (n) { return n.toFixed(1); };
    return "path('M " + f(a[0]) + " " + f(a[1]) + " C " + f(c1[0]) + " " + f(c1[1]) + ", " + f(c2[0]) + " " + f(c2[1]) + ", " + f(d[0]) + " " + f(d[1]) + "')";
  }
  var CIRCLE = "M1.75 8a6.25 6.25 0 1 0 12.5 0a6.25 6.25 0 1 0 -12.5 0";
  var FLAG = {
    diff: { d: "M10.5 2.75l2.75 2.75-7.5 7.5H3v-2.75zM9 4.25l2.75 2.75", color: "#2068B8", label: "Tags differ" },
    cover: { d: "M3.75 2.75h8.5a1.75 1.75 0 0 1 1.75 1.75v7a1.75 1.75 0 0 1 -1.75 1.75h-8.5a1.75 1.75 0 0 1 -1.75 -1.75v-7a1.75 1.75 0 0 1 1.75 -1.75zM4.5 6.25a1.25 1.25 0 1 0 2.5 0a1.25 1.25 0 1 0 -2.5 0M2.5 11.5l3.5-3.25 2.5 2.25 2-1.75 3 2.75", color: "#B7791F", label: "No cover" },
    dur: { d: CIRCLE + "M8 4.5V8l2.5 1.75", color: "#B7791F", label: "Length differs" },
    dup: { d: "M7.25 5.75h5a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1 -1.5 1.5h-5a1.5 1.5 0 0 1 -1.5 -1.5v-5a1.5 1.5 0 0 1 1.5 -1.5zM10.25 5.75V3.75a1.5 1.5 0 0 0-1.5-1.5h-5a1.5 1.5 0 0 0-1.5 1.5v5a1.5 1.5 0 0 0 1.5 1.5h2", color: "#2068B8", label: "Duplicate" }
  };
  function flagSvg(k, size) {
    var f = FLAG[k];
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 16 16" fill="none" stroke="' + f.color + '" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" role="img" aria-label="' + f.label + '"><path d="' + f.d + '"></path></svg>';
  }
  function wave(n, seed, amp) {
    var out = [];
    for (var i = 0; i < n; i++) out.push(Math.max(3, Math.round(Math.abs(Math.sin(i * 0.41 + seed) * 0.6 + Math.sin(i * 1.6 + seed * 2) * 0.3 + Math.sin(i * 0.11) * 0.25) * amp)));
    return out;
  }
  function bars(hs, color) {
    return hs.map(function (h) { return '<span style="flex: 1; height: ' + h + 'px; border-radius: 1px; background: ' + color + '"></span>'; }).join("");
  }
  var CHECK = '<path d="M5 12.5l4.5 4.5L19 7.5"></path>';
  // original abstract cover art (CSS only — no real releases)
  var COVERS = [
    "radial-gradient(circle at 50% 62%, #FFB547 0 21%, rgba(0,0,0,0) 22%), repeating-linear-gradient(0deg, #2A1B3D 0 3px, #3B2457 3px 6px)",
    "radial-gradient(#2EE59D 1.3px, rgba(0,0,0,0) 1.8px) 0 0 / 7px 7px, radial-gradient(circle at 70% 30%, #1E6E52, #0B1F18)",
    "repeating-radial-gradient(circle at 28% 72%, #E8EDF2 0 2px, #C53030 2px 9px)",
    "repeating-linear-gradient(45deg, #15191D 0 6px, #FFB547 6px 12px)",
    "radial-gradient(circle at 35% 35%, #FFFFFF 0 4%, #7BF2C2 12%, #0A7A55 42%, #04140D 72%)",
    "radial-gradient(circle at 50% 50%, #C2410C 0 24%, rgba(0,0,0,0) 25%), linear-gradient(90deg, #F2E8D5 50%, #15191D 50%)",
    "repeating-radial-gradient(ellipse at 50% 120%, #4C78FF 0 4px, #1B2A6B 4px 10px)",
    "radial-gradient(circle, #0B0D10 0 16%, rgba(0,0,0,0) 17%), conic-gradient(from 45deg, #B26BFF, #2EE59D, #FFB547, #B26BFF)",
    "radial-gradient(circle at 50% 56%, #FF6B6B 0 17%, rgba(0,0,0,0) 18%), linear-gradient(#0B1F3A 0 56%, #F2B544 56% 58%, #13284A 58%)",
    "radial-gradient(circle at 70% 30%, #15191D 0 14%, rgba(0,0,0,0) 15%), repeating-linear-gradient(0deg, #EDE6D8 0 8px, #E2D8C6 8px 9px)"
  ];
  function recEl(it) {
    return frag('<span class="rec-move" aria-hidden="true" style="offset-path: ' + it.path + '"><span class="rec-look"><svg class="rec-turn" width="16" height="16" viewBox="-7 -7 14 14"><circle r="5.7" fill="#E3E7EA" stroke="#C3CAD1" stroke-width="0.6"></circle><circle r="4.8" fill="none" stroke="#C3CAD1" stroke-width="0.6" stroke-dasharray="24.3 5.86"></circle><circle r="3.6" fill="none" stroke="#C3CAD1" stroke-width="0.6" stroke-dasharray="18.2 4.4" transform="rotate(150)"></circle><circle r="2.28" fill="' + it.label + '"></circle><circle r="0.6" fill="#FFFFFF"></circle></svg></span></span>');
  }
  function noteEl(n) {
    return frag('<span class="' + n.cls + '" aria-hidden="true" style="position: absolute; left: ' + n.x + 'px; top: ' + n.y + 'px; width: 9px; height: 10px; transform-origin: 50% 100%; pointer-events: none; z-index: 7"><svg width="9" height="10" viewBox="-4 -10.5 9 11" fill="' + n.color + '"><ellipse cx="-1.6" cy="-2.3" rx="2.7" ry="2" transform="rotate(-25 -1.6 -2.3)"></ellipse><rect x="0.35" y="-10" width="1.05" height="7.7"></rect><path d="M1.4 -10 C2.2 -8 4.9 -7.6 3.7 -4.2 C4.1 -6.4 2.8 -7.2 1.4 -7.4 Z"></path></svg></span>');
  }
  function badgeEl(b) {
    return frag('<span class="badge-life" style="position: absolute; left: ' + b.x + 'px; top: ' + b.y + 'px; height: 14px; padding: 0 4px; border-radius: 7px; background: #0A7A55; color: #FFFFFF; font-family: ' + MONO + '; font-size: 10px; font-weight: 600; display: flex; align-items: center; z-index: 7">+' + b.n + '</span>');
  }
  var EXT_BADGE = "flex: none; font-family: " + MONO + "; font-size: 9.5px; padding: 1px 5px; border-radius: 4px; background: #F6F7F8; color: #5B6570; border: 1px solid #DCE0E4";

  // the version shown on the site (GitHub latest release); null until known
  var VERSION = null;

  // =====================================================================
  // scene A: analyze → tabs → write (stage 640×460, window body from y=32)
  // =====================================================================
  var sceneA = (function () {
    var FOLDER = [29, 32 + 24];
    var PILL_Y = 32 + 48 + 2 + 8 + 2 + 18;          // 110
    var TABS = [
      { k: "ready", label: "Ready to Write", w: 168, tone: "#0A7A55", rec: "#0A7A55" },
      { k: "candidates", label: "Review Manually", w: 178, tone: "#B7791F", rec: "#7A4E00" },
      { k: "no_attention", label: "No Action Needed", w: 192, tone: "#5B6570", rec: "#5B6570" },
      { k: "processed", label: "Processed", w: 70, tone: "#2068B8", rec: "#2068B8", mini: true }
    ];
    var x = 12;
    TABS.forEach(function (tb) { tb.pillX = x + tb.w - 12 - 14; x += tb.w + 2; });
    var FILES = [
      { tab: "ready", ext: "MP3", file: "Aurelian - Lumen (Extended Mix).mp3", artist: "Aurelian", score: 100, flags: ["diff"] },
      { tab: "ready", ext: "FLAC", file: "Kaia Moor - Saltwater.flac", artist: "Kaia Moor", score: 96, flags: [] },
      { tab: "candidates" },
      { tab: "ready", ext: "WAV", file: "Nuvem - Kora Sun.wav", artist: "Nuvem", score: 100, flags: ["dup"] },
      { tab: "no_attention" },
      { tab: "ready", ext: "AIFF", file: "Duskline - Aurora Fade.aiff", artist: "Duskline", score: 98, flags: ["diff", "cover"] }
    ];
    FILES.forEach(function (f, i) { f.launch = 500 + 420 * i; f.land = f.launch + 750; });
    var scanEnd = FILES[FILES.length - 1].land;
    var READY = FILES.filter(function (f) { return f.tab === "ready"; });
    var TICK0 = 4200, PRESS = 5300, COLL = 5650, GL = COLL + 300, GD = GL + 750;
    var GRID = "display: grid; grid-template-columns: 30px 270px 120px 90px 60px; align-items: center";

    function build() {
      var el = frag(
        '<div class="scene-in" style="position: absolute; left: 0; right: 0; top: 32px; bottom: 0">' +
        '<div style="height: 48px; box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 0 12px">' +
        '<div style="width: 330px; height: 32px; box-sizing: border-box; display: flex; align-items: center; gap: 7px; padding: 0 10px; background: #F6F7F8; border: 1px solid #DCE0E4; border-radius: 7px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5B6570" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"></path></svg><span style="font-family: ' + MONO + '; font-size: 11.5px">~/Music/New Promos</span></div>' +
        '<span style="display: inline-flex; align-items: center; gap: 6px; height: 32px; padding: 0 13px; border-radius: 7px; background: #0A7A55; color: #FFFFFF; font-weight: 600"><svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15l12.5-7.5z"></path></svg>Analyze</span>' +
        '</div>' +
        '<div style="height: 2px; background: #ECEEF1"><div data-r="pct" style="height: 2px; width: 0%; background: #0A7A55; transition: width .3s linear"></div></div>' +
        '<div data-r="tabs" style="height: 44px; box-sizing: border-box; display: flex; align-items: flex-end; gap: 2px; padding: 8px 12px 0; border-bottom: 1px solid #DCE0E4"></div>' +
        '<div style="height: 28px; box-sizing: border-box; ' + GRID + '; border-bottom: 1px solid #DCE0E4; font-size: 10px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: #5B6570"><span></span><span style="padding: 0 8px">File name</span><span style="padding: 0 8px">Artist</span><span style="padding: 0 8px">Match</span><span style="padding: 0 8px">Flags</span></div>' +
        '<div data-r="rows"></div>' +
        '<div style="position: absolute; left: 0; right: 0; bottom: 0; height: 50px; box-sizing: border-box; display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 0 12px; border-top: 1px solid #DCE0E4; background: #FFFFFF">' +
        '<span data-r="w" style="display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 16px; border-radius: 7px; background: #DCE0E4; color: #5B6570; font-weight: 700; transition: background .2s ease"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + CHECK + '</svg><span data-r="wt">Write tags · 0</span></span>' +
        '</div></div>');
      var r = refs(el);
      var pills = TABS.map(function (tb, i) {
        var act = i === 0;
        var t = frag('<span style="position: relative; width: ' + tb.w + 'px; height: 36px; box-sizing: border-box; display: flex; align-items: center; gap: 7px; padding: 4px 12px 0; ' +
          (act ? "background: #FFFFFF; border: 1px solid #DCE0E4; border-bottom-color: #FFFFFF; border-radius: 8px 8px 0 0; margin-bottom: -1px; height: 37px;" : "border: 1px solid transparent;") + '">' +
          '<span style="width: 7px; height: 7px; border-radius: 50%; background: ' + tb.tone + '; flex: none"></span>' +
          '<span style="font-weight: 600; color: ' + (act ? "#15191D" : "#5B6570") + '; white-space: nowrap">' + (tb.mini ? "" : esc(tb.label)) + '</span>' +
          '<span data-r="pill" style="margin-left: auto; width: 28px; height: 17px; border-radius: 9px; background: ' + (act ? "#E3F4EC" : "#F6F7F8") + '; color: ' + (act ? "#0A7A55" : "#5B6570") + '; font-family: ' + MONO + '; font-size: 10.5px; display: flex; align-items: center; justify-content: center; flex: none">0</span></span>');
        r.tabs.appendChild(t);
        return refs(t).pill;
      });
      function rowEl(it) {
        var f = it.f;
        var row = frag('<div style="height: 34px; box-sizing: border-box; overflow: hidden; ' + GRID + '; border-bottom: 1px solid #ECEEF1; background: ' + it.bg + '">' +
          '<span style="padding-left: 12px"><span data-r="box" style="width: 13px; height: 13px; box-sizing: border-box; border-radius: 4px; border: 1.5px solid #7E8790; background: #FFFFFF; display: flex; align-items: center; justify-content: center; transition: all .15s ease"><svg data-r="ck" width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="display: none">' + CHECK + '</svg></span></span>' +
          '<span style="padding: 0 8px; display: flex; align-items: center; gap: 6px; min-width: 0"><span style="' + EXT_BADGE + '">' + f.ext + '</span><span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis">' + esc(f.file) + '</span></span>' +
          '<span style="padding: 0 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">' + esc(f.artist) + '</span>' +
          '<span style="padding: 0 8px; display: flex; align-items: center; gap: 5px"><span style="font-family: ' + MONO + '; font-size: 11px; width: 32px">' + f.score + '%</span><span style="width: 30px; height: 4px; border-radius: 2px; background: #DCE0E4; overflow: hidden"><span style="display: block; height: 4px; width: ' + f.score + '%; background: #0A7A55"></span></span></span>' +
          '<span style="padding: 0 8px; display: flex; gap: 3px">' + f.flags.map(function (k) { return flagSvg(k, 15); }).join("") + '</span></div>');
        row.__r = refs(row);
        return row;
      }
      function update(st) {
        var t = st % 9500, out = { recs: [], notes: [], badge: null };
        var counts = { ready: 0, candidates: 0, no_attention: 0, processed: 0 };
        FILES.forEach(function (f) { if (t >= f.launch) counts[f.tab]++; });
        if (t >= COLL) { counts.ready -= READY.length; counts.processed += READY.length; }
        var land = {};
        FILES.forEach(function (f, i) { if (t >= f.land) land[f.tab] = { at: f.land, n: i }; });
        if (t >= GD) land.processed = { at: GD, n: 9 };
        TABS.forEach(function (tb, i) {
          var L = land[tb.k], live = L && t - L.at < 260;
          txt(pills[i], String(counts[tb.k]));
          cls(pills[i], live ? (L.n % 2 ? "bA" : "bB") : "");
          if (L && t - L.at < 420) out.notes.push({ key: "a" + tb.k + L.n, x: tb.pillX - 4.5, y: PILL_Y - 13, color: tb.tone, cls: L.n % 2 ? "nA" : "nB" });
        });
        FILES.forEach(function (f, i) {
          if (t >= f.launch && t < f.land) {
            var tb = TABS.find(function (q) { return q.k === f.tab; });
            out.recs.push({ key: "f" + i, path: flyPath(FOLDER, [tb.pillX, PILL_Y], 640, 460), label: tb.rec });
          }
        });
        if (t >= GL && t < GD) out.recs.push({ key: "g", path: flyPath([300, 32 + 48 + 2 + 44 + 28 + 68], [TABS[3].pillX, PILL_Y], 640, 460), label: "#2068B8" });
        var checked = 0, rows = [];
        READY.forEach(function (f, k) {
          if (t < f.land || t >= COLL + 300) return;
          var c = t >= TICK0 + 220 * k;
          if (c) checked++;
          rows.push({ key: k, f: f, c: c, bg: rows.length % 2 ? "#FAFBFC" : "#FFFFFF",
            cls: t >= COLL ? "collapse" : (t - f.land < 260 ? "rowin" : "") });
        });
        keyed(r.rows, rows, rowEl, function (row, it) {
          var q = row.__r;
          cls(row, it.cls);
          sty(q.box, "border-color", it.c ? "#0A7A55" : "#7E8790");
          sty(q.box, "background", it.c ? "#0A7A55" : "#FFFFFF");
          shown(q.ck, it.c);
        });
        txt(r.wt, "Write tags · " + checked);
        sty(r.w, "background", checked ? "#0A7A55" : "#DCE0E4");
        sty(r.w, "color", checked ? "#FFFFFF" : "#5B6570");
        cls(r.w, t >= PRESS && t < PRESS + 350 ? "pop" : "");
        sty(r.pct, "width", (t < 500 ? 0 : Math.min(100, Math.round((t - 500) / (scanEnd - 500) * 100))) + "%");
        if (t >= GD && t < GD + 1300) out.badge = { key: "b", x: TABS[3].pillX + 4, y: 92, n: READY.length };
        return out;
      }
      return { el: el, update: update };
    }
    return { title: "DeckReady", frozen: 5200, build: build };
  })();

  // =====================================================================
  // scene B: versions by length
  // =====================================================================
  var sceneB = (function () {
    var V = [["Original Mix", "7:12", 432], ["Extended Mix", "6:48", 408], ["Radio Edit", "3:12", 192]];
    var WIN = '<svg class="pop" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#0A7A55"></circle><path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>';
    function build() {
      var el = frag(
        '<div class="scene-in" style="position: absolute; left: 0; right: 0; top: 32px; bottom: 0; padding: 26px 28px; display: flex; flex-direction: column; gap: 14px">' +
        '<div style="display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-radius: 12px; background: #15191D; color: #FFFFFF">' +
        '<span style="font-family: ' + MONO + '; font-size: 10px; padding: 2px 6px; border-radius: 4px; background: #2A3036">MP3</span>' +
        '<span style="font-weight: 600">Velvet Coast - Night Drive.mp3</span>' +
        '<span style="margin-left: auto; font-family: ' + MONO + '; font-size: 15px; font-weight: 600; color: #2EE59D">6:48</span></div>' +
        '<div style="display: flex; align-items: center; gap: 10px; color: #5B6570; font-size: 12px"><span style="flex: 1; height: 1px; background: #DCE0E4"></span>versions on Beatport<span style="flex: 1; height: 1px; background: #DCE0E4"></span></div>' +
        '<span data-r="vers" style="display: contents"></span>' +
        '<span data-r="done" style="display: contents"></span></div>');
      var r = refs(el);
      var rows = V.map(function (v, i) {
        var row = frag('<div><span style="width: 110px; font-weight: 600">' + v[0] + '</span>' +
          '<span style="flex: 1; height: 10px; border-radius: 5px; background: #ECEEF1; position: relative; overflow: hidden"><span class="bar-fill" data-r="bar" style="position: absolute; left: 0; top: 0; bottom: 0; width: ' + Math.round(v[2] / 432 * 100) + '%; border-radius: 5px; background: #C3CAD1; animation-delay: ' + (0.15 * i).toFixed(2) + 's"></span></span>' +
          '<span style="width: 44px; text-align: right; font-family: ' + MONO + '; font-weight: 600">' + v[1] + '</span>' +
          '<span style="width: 22px; display: flex; justify-content: center"><span data-r="win" style="display: contents"></span></span></div>');
        r.vers.appendChild(row);
        var q = refs(row); q.el = row;
        return q;
      });
      function update(st) {
        var t = st % 6000;
        var hi = t < 1400 ? -1 : Math.min(2, Math.floor((t - 1400) / 450));
        var win = t >= 2900;
        rows.forEach(function (q, i) {
          css(q.el, "display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 10px; transition: all .3s ease; " +
            (win && i === 1 ? "background: #E3F4EC; border: 1px solid #B9DDCB; transform: scale(1.02);" : (i === hi ? "background: #F1F5FB; border: 1px solid #CFE0F5;" : "background: #FFFFFF; border: 1px solid #DCE0E4;")) +
            (win && i !== 1 ? " opacity: .45;" : ""));
          sty(q.bar, "background", win && i === 1 ? "#2EE59D" : (i === hi ? "#2068B8" : "#C3CAD1"));
          cond(q.win, win && i === 1, function () { return frag(WIN); });
        });
        cond(r.done, t >= 3200, function () {
          return frag('<div class="pop" style="align-self: flex-start; display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px; border-radius: 999px; background: #E3F4EC; color: #0A7A55; font-weight: 700">Same length → Extended Mix · Match 100%</div>');
        });
        return null;
      }
      return { el: el, update: update };
    }
    return { title: "DeckReady — Choose Version", frozen: 3300, build: build };
  })();

  // =====================================================================
  // scene C: review manually (real right panel + version picker)
  // =====================================================================
  var sceneC = (function () {
    var SCROLL = 2600, BACK = 7600, PICK_BTN = 4400, DLG_IN = 4700, DLG_OUT = 7300, PICKED = 6400;
    var ACCEPT = 8400, COLL = 8650, GL = COLL + 300, GD = GL + 750;
    var ROWS = [
      { ext: "MP3", name: "Velvet Coast - Night Drive (Radio Edit).mp3", score: 88, sel: true, flags: ["dur", "diff"] },
      { ext: "FLAC", name: "Tamsin Roe - Low Tide.flac", score: 91, flags: ["dur"] },
      { ext: "MP3", name: "Halcyon Fields - Drift.mp3", score: 84, flags: ["diff"] },
      { ext: "AIFF", name: "Selva Norte - Ritual.aiff", score: 79, flags: [] }
    ];
    var VERS = [["Original Mix", "7:12", COVERS[6]], ["Extended Mix", "6:48", COVERS[6]], ["Radio Edit", "3:12", COVERS[8]]];
    var WAVE_A = wave(60, 1.2, 34);
    var WAVE_B = wave(60, 0.4, 34);         // Beatport: the preview sample is bright, the rest dim (wave_mid)
    var TAB_PILL = "margin-left: auto; width: 28px; height: 17px; border-radius: 9px; font-family: " + MONO + "; font-size: 10.5px; display: flex; align-items: center; justify-content: center";
    var BTN = "height: 30px; border-radius: 7px; border: 1px solid #DCE0E4; background: #FFFFFF; color: #15191D; display: flex; align-items: center; justify-content: center; font-size: 11.5px; font-weight: 600; transition: all .25s ease";
    var TIME = "font-family: " + MONO + "; font-size: 11px; color: #C53030; transition: color .4s ease";

    function build() {
      var el = frag(
        '<div class="scene-in" style="position: absolute; left: 0; right: 0; top: 32px; bottom: 0">' +
        '<div style="height: 44px; box-sizing: border-box; display: flex; align-items: flex-end; gap: 2px; padding: 8px 12px 0; border-bottom: 1px solid #DCE0E4">' +
        '<span style="position: relative; width: 166px; height: 36px; box-sizing: border-box; display: flex; align-items: center; gap: 7px; padding: 4px 12px 0; border: 1px solid transparent"><span style="width: 7px; height: 7px; border-radius: 50%; background: #0A7A55"></span><span style="font-weight: 600; color: #5B6570; white-space: nowrap">Ready to Write</span><span data-r="ready" style="' + TAB_PILL + '; background: #F6F7F8; color: #5B6570">24</span></span>' +
        '<span style="width: 176px; height: 37px; box-sizing: border-box; display: flex; align-items: center; gap: 7px; padding: 4px 12px 0; background: #FFFFFF; border: 1px solid #DCE0E4; border-bottom-color: #FFFFFF; border-radius: 8px 8px 0 0; margin-bottom: -1px"><span style="width: 7px; height: 7px; border-radius: 50%; background: #B7791F"></span><span style="font-weight: 600; white-space: nowrap">Review Manually</span><span data-r="review" style="' + TAB_PILL + '; background: #E3F4EC; color: #0A7A55">4</span></span>' +
        '</div>' +
        '<div style="display: grid; grid-template-columns: 318px 322px; height: 384px">' +
        '<div style="border-right: 1px solid #DCE0E4; overflow: hidden">' +
        '<div style="height: 26px; box-sizing: border-box; display: grid; grid-template-columns: 1fr 52px 44px; align-items: center; padding: 0 12px; border-bottom: 1px solid #DCE0E4; font-size: 10px; font-weight: 600; letter-spacing: .05em; text-transform: uppercase; color: #5B6570"><span>File name</span><span>Match</span><span>Flags</span></div>' +
        '<div data-r="rows"></div></div>' +
        '<div style="position: relative; background: #F6F7F8; overflow: hidden">' +
        '<div data-r="scroll" style="position: absolute; left: 0; right: 0; top: 0; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; transform: translateY(0px); transition: transform 1.2s cubic-bezier(.45,.05,.25,1)">' +
        '<span style="font-size: 10.5px; color: #5B6570">~/Music/New Promos/</span>' +
        '<b style="font-size: 12.5px">Velvet Coast - Night Drive (Radio Edit).mp3</b>' +
        '<span style="font-size: 10.5px; color: #5B6570; margin-top: 4px">Your file  ·  click the waveform: play / stop</span>' +
        '<div style="display: flex; gap: 10px; align-items: flex-start">' +
        '<span style="width: 60px; height: 60px; flex: none; border-radius: 6px; background: #E4E7EA; display: flex; align-items: center; justify-content: center; color: #9AA3AC"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="3"></rect><circle cx="9" cy="9" r="1.5"></circle><path d="M21 15l-5-5L5 21"></path></svg></span>' +
        '<span style="display: flex; flex-direction: column; gap: 1px; font-size: 11.5px"><span>Artist: Velvet Coast</span><span>Title: Night Drive</span><span>Genre: Techno</span><span>BPM: 121</span></span></div>' +
        '<div style="position: relative; height: 40px; border-radius: 4px; background: #FFFFFF; display: flex; align-items: center; gap: 1px; padding: 0 3px; overflow: hidden; margin-top: 4px">' + bars(WAVE_A, "#B9DDCB") +
        '<div style="position: absolute; left: 3px; top: 0; bottom: 0; overflow: hidden; animation: playhead 6s linear infinite; display: flex; align-items: center"><div style="width: 288px; display: flex; align-items: center; gap: 1px; height: 40px">' + bars(WAVE_A, "#0A7A55") + '</div></div></div>' +
        '<span data-r="t1" style="' + TIME + '">0:00 / 3:12</span>' +
        '<span style="font-size: 10.5px; color: #5B6570; margin-top: 4px">Beatport  ·  click the waveform: play / stop</span>' +
        '<div style="display: flex; gap: 10px; align-items: flex-start">' +
        '<span data-r="cover" style="position: relative; width: 60px; height: 60px; flex: none; border-radius: 6px; overflow: hidden; background: ' + COVERS[6] + '; box-shadow: 0 4px 10px rgba(21,25,29,.18)"><span style="position: absolute; left: 5px; bottom: 4px; font-size: 6.5px; font-weight: 800; letter-spacing: .12em; color: #FFFFFF; text-shadow: 0 1px 2px rgba(0,0,0,.5)">VELVET COAST</span></span>' +
        '<span style="display: flex; flex-direction: column; gap: 1px; font-size: 11.5px"><span>Artist: Velvet Coast</span><span data-r="title">Title: Night Drive (Extended Mix)</span><span>Genre: Melodic House &amp; Techno</span><span>BPM: 122</span></span></div>' +
        '<div style="height: 40px; border-radius: 4px; background: #FFFFFF; display: flex; align-items: center; gap: 1px; padding: 0 3px; margin-top: 4px">' +
        WAVE_B.map(function (h, i) { return '<span style="flex: 1; height: ' + h + 'px; border-radius: 1px; background: ' + (i >= 18 && i < 34 ? "#0A7A55" : "#B9DDCB") + '"></span>'; }).join("") + '</div>' +
        '<span data-r="t2" style="' + TIME + '">0:00 / 6:48</span>' +
        '<div style="display: flex; flex-direction: column; gap: 6px; margin-top: 8px; font-size: 11.5px">' +
        '<span data-r="info" style="white-space: pre-line"></span>' +
        '<span data-r="warn" style="display: contents"></span>' +
        '<span style="display: flex; gap: 6px"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#2068B8" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex: none" aria-hidden="true"><path d="' + FLAG.diff.d + '"></path></svg>Tags differ from Beatport</span>' +
        '</div></div>' +
        '<div style="position: absolute; left: 0; right: 0; bottom: 0; padding: 10px 14px 12px; display: flex; flex-direction: column; gap: 6px; background: #F6F7F8; border-top: 1px solid #DCE0E4">' +
        '<span data-r="accept" style="' + BTN + '">Move to «Ready to Write»</span>' +
        '<span data-r="pick" style="' + BTN + '">Choose Version Manually</span>' +
        '</div></div></div>' +
        '<span data-r="dlg" style="display: contents"></span>' +
        '<span data-r="recs" style="display: contents"></span>' +
        '<span data-r="plus" style="display: contents"></span>' +
        '</div>');
      var r = refs(el);
      function rowEl(it) {
        var row = frag('<div><span style="display: flex; align-items: center; gap: 6px; min-width: 0"><span style="' + EXT_BADGE + '">' + it.ext + '</span><span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis">' + esc(it.name) + '</span></span>' +
          '<span style="font-family: ' + MONO + '; font-size: 11px">' + it.score + '%</span><span data-r="fl" style="display: flex; gap: 2px"></span></div>');
        row.__r = refs(row);
        return row;
      }
      function dialogEl() {
        var d = frag('<div class="scene-in" style="position: absolute; inset: 0; background: rgba(21,25,29,.18); display: flex; align-items: center; justify-content: center">' +
          '<div class="pop" style="width: 470px; background: #FFFFFF; border: 1px solid #DCE0E4; border-radius: 12px; box-shadow: 0 30px 70px rgba(21,25,29,.25); overflow: hidden">' +
          '<div style="height: 30px; display: flex; align-items: center; gap: 6px; padding: 0 10px; background: #F6F7F8; border-bottom: 1px solid #DCE0E4"><span style="width: 9px; height: 9px; border-radius: 50%; background: #FF5F57"></span><span style="width: 9px; height: 9px; border-radius: 50%; background: #FEBC2E"></span><span style="width: 9px; height: 9px; border-radius: 50%; background: #28C840"></span><span style="margin: 0 auto; font-size: 11px; color: #5B6570">Choose Version Manually</span></div>' +
          '<div style="padding: 10px 14px 4px; font-size: 11px; color: #5B6570">Your file: <b style="color: #15191D">Night Drive (Radio Edit)</b> · <span style="font-family: ' + MONO + '">3:12</span></div>' +
          VERS.map(function (v, i) {
            return '<div data-r="v' + i + '"><span style="width: 34px; height: 34px; border-radius: 5px; background: ' + v[2] + '; flex: none"></span>' +
              '<span style="display: flex; flex-direction: column; min-width: 0"><b style="font-size: 12px">Night Drive (' + v[0] + ')</b><span style="font-size: 11px; color: #5B6570">Velvet Coast</span></span>' +
              '<span style="margin-left: auto; font-family: ' + MONO + '; font-size: 12px; color: ' + (i === 2 ? "#0A7A55" : "#5B6570") + '">' + v[1] + '</span></div>';
          }).join("") +
          '<div style="display: flex; justify-content: flex-end; padding: 10px 14px"><span data-r="sel" style="height: 28px; padding: 0 14px; border-radius: 7px; background: #DCE0E4; color: #5B6570; font-weight: 700; font-size: 11.5px; display: inline-flex; align-items: center; transition: all .25s ease">Use as match</span></div>' +
          '</div></div>');
        d.__r = refs(d);
        return d;
      }
      function update(st) {
        var t = st % 12000, out = { notes: [] };
        var picked = t >= DLG_OUT;
        sty(r.scroll, "transform", "translateY(" + (t >= SCROLL && t < BACK ? -150 : 0) + "px)");
        var dlg = cond(r.dlg, t >= DLG_IN && t < DLG_OUT, dialogEl);
        if (dlg) {
          var q = dlg.__r, hi = t < 5100 ? -1 : Math.min(2, Math.floor((t - 5100) / 420));
          VERS.forEach(function (v, i) {
            var win = t >= PICKED && i === 2;
            css(q["v" + i], "display: flex; align-items: center; gap: 10px; padding: 7px 14px; transition: background .2s ease; background: " + (win ? "#E3F4EC" : (i === hi ? "#F1F3F5" : "#FFFFFF")));
          });
          sty(q.sel, "background", t >= PICKED ? "#0A7A55" : "#DCE0E4");
          sty(q.sel, "color", t >= PICKED ? "#FFFFFF" : "#5B6570");
          cls(q.sel, t >= PICKED + 400 && t < PICKED + 750 ? "pop" : "");
        }
        var pickOn = t >= PICK_BTN && t < DLG_OUT;
        cls(r.pick, t >= PICK_BTN && t < PICK_BTN + 350 ? "pop" : "");
        sty(r.pick, "background", pickOn ? "#0A7A55" : "#FFFFFF");
        sty(r.pick, "color", pickOn ? "#FFFFFF" : "#15191D");
        cls(r.accept, t >= ACCEPT && t < ACCEPT + 350 ? "pop" : "");
        sty(r.accept, "background", t >= ACCEPT ? "#0A7A55" : "#FFFFFF");
        sty(r.accept, "color", t >= ACCEPT ? "#FFFFFF" : "#15191D");
        sty(r.cover, "background", picked ? COVERS[8] : COVERS[6]);
        txt(r.title, "Title: " + (picked ? "Night Drive (Radio Edit)" : "Night Drive (Extended Mix)"));
        var swap = picked && t < DLG_OUT + 400 ? "pop" : "";
        cls(r.title, swap);
        cls(r.t2, swap);
        txt(r.t2, "0:00 / " + (picked ? "3:12" : "6:48"));
        var ink = picked ? "#0A7A55" : "#C53030";
        sty(r.t1, "color", ink);
        sty(r.t2, "color", ink);
        txt(r.info, picked ? "Selected manually" : "Title and artist match Beatport at 88%\nCheck manually: length or version may differ");
        cond(r.warn, !picked, function () {
          return frag('<span style="display: flex; gap: 6px; color: #7A4E00"><svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="#B7791F" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="flex: none" aria-hidden="true"><path d="' + FLAG.dur.d + '"></path></svg><span style="white-space: pre-line">Length differs significantly — likely a different version of the track\nLocal: 3:12, Beatport: 6:48</span></span>');
        });
        var rows = ROWS.filter(function (x) { return !(x.sel && t >= GL); }).map(function (x, i) {
          return { key: x.name, ext: x.ext, name: x.name, score: x.score,
            flags: x.flags.filter(function (k) { return !(x.sel && picked && k === "dur"); }),
            cls: x.sel && t >= COLL ? "collapse" : "",
            style: "height: 34px; box-sizing: border-box; overflow: hidden; display: grid; grid-template-columns: 1fr 52px 44px; align-items: center; padding: 0 12px; border-bottom: 1px solid #ECEEF1; background: " + (x.sel ? "#E6F5EE" : (i % 2 ? "#FAFBFC" : "#FFFFFF")) };
        });
        keyed(r.rows, rows, rowEl, function (row, it) {
          css(row, it.style);
          cls(row, it.cls);
          var fl = row.__r.fl;
          put(fl, "fl", it.flags.join(), function () { fl.innerHTML = it.flags.map(function (k) { return flagSvg(k, 14); }).join(""); });
        });
        keyed(r.recs, t >= GL && t < GD ? [{ key: "c", path: flyPath([150, 44 + 26 + 17], [152, 28], 640, 428), label: "#0A7A55" }] : [], recEl);
        txt(r.ready, String(t >= COLL ? 25 : 24));
        txt(r.review, String(t >= COLL ? 3 : 4));
        cls(r.ready, t >= GD && t < GD + 260 ? "bA" : "");
        keyed(r.plus, t >= GD && t < GD + 1300 ? [{ key: "p", x: 156, y: 10, n: 1 }] : [], badgeEl);
        if (t >= GD && t < GD + 420) out.notes.push({ key: "c", x: 152 - 4.5, y: 32 + 28 - 13, color: "#0A7A55", cls: "nA" });
        return out;
      }
      return { el: el, update: update };
    }
    return { title: "DeckReady — Review Manually", frozen: 7400, build: build };
  })();

  // =====================================================================
  // scene D: tag picker (3 states for Beatport data, 2 for other tags) — clickable
  // =====================================================================
  var sceneD = (function () {
    var DEFS = [["Artist", "Velvet Coast", "V. Coast"], ["Title", "Night Drive", "night drive FINAL"], ["BPM", "122", "121"], ["Key", "Am", "—"], ["Genre", "Melodic House & Techno", "Techno"], ["Comment", "", "www.free-promo-dl.net"], ["Encoder", "", "LAME 3.100"]];
    var NAMES = ["(from Beatport)", "(kept as is)", "(will be removed)"];
    var COLS = ["#0A7A55", "#5B6570", "#C53030"];
    var fs = [0, 0, 0, 0, 0, 2, 2], touched = false;      // the mockup's component state (kept across chapters)
    var HEAD = "font-size: 10.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #5B6570";
    function build() {
      var el = frag(
        '<div class="scene-in" style="position: absolute; left: 0; right: 0; top: 32px; bottom: 0; background: #EEF0F2; display: flex; align-items: center; justify-content: center">' +
        '<div class="pop" style="width: 560px; background: #FFFFFF; border: 1px solid #DCE0E4; border-radius: 12px; box-shadow: 0 24px 60px rgba(21,25,29,.18); overflow: hidden">' +
        '<div style="padding: 11px 16px; font-weight: 700; border-bottom: 1px solid #ECEEF1">Which Tags to Write</div>' +
        '<div style="padding: 6px 16px 2px; ' + HEAD + '">Beatport data</div>' +
        '<div data-r="rows"></div>' +
        '<div style="display: flex; justify-content: flex-end; gap: 8px; padding: 10px 16px; border-top: 1px solid #ECEEF1"><span style="height: 30px; padding: 0 14px; border-radius: 7px; border: 1px solid #DCE0E4; display: inline-flex; align-items: center">Cancel</span><span style="height: 30px; padding: 0 16px; border-radius: 7px; background: #0A7A55; color: #FFFFFF; font-weight: 700; display: inline-flex; align-items: center">Write</span></div>' +
        '</div></div>');
      var r = refs(el), cur = [];
      var rows = DEFS.map(function (d, i) {
        if (i === 5) r.rows.appendChild(frag('<div style="padding: 8px 16px 2px; ' + HEAD + '; border-top: 1px solid #ECEEF1">Other tags in the files</div>'));
        var b = frag('<button type="button" style="width: 100%; display: flex; align-items: center; gap: 10px; padding: 7px 16px; border: none; background: transparent; font: inherit; font-size: 12.5px; color: #15191D; cursor: pointer; text-align: left">' +
          '<span data-r="box" style="width: 15px; height: 15px; box-sizing: border-box; border-radius: 4px; border: 1.5px solid #0A7A55; background: #0A7A55; display: inline-flex; align-items: center; justify-content: center; transition: all .25s ease; flex: none"><svg data-r="take" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + CHECK + '</svg><span data-r="keep" style="width: 7px; height: 2px; background: #FFFFFF; border-radius: 1px"></span></span>' +
          '<span style="width: 70px; font-weight: 500">' + d[0] + '</span>' +
          '<span data-r="st" style="width: 130px; font-size: 11.5px"></span>' +
          '<span data-r="res" style="margin-left: auto; font-family: ' + MONO + '; font-size: 11.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; transition: color .3s ease"></span></button>');
        b.addEventListener("click", function () {
          var s = cur[i], other = i >= 5;
          fs = fs.slice();
          fs[i] = other ? (s === 2 ? 1 : 2) : (s + 1) % 3;
          touched = true;
          frame();
        });
        r.rows.appendChild(b);
        var q = refs(b); q.el = b;
        return q;
      });
      function update(st) {
        var auto = Math.floor(st / 900);
        DEFS.forEach(function (d, i) {
          var other = i >= 5, s = fs[i];
          if (!touched) {
            var k = auto % 7;
            if (k === i) s = other ? (Math.floor(auto / 7) % 2 ? 1 : 2) : (Math.floor(auto / 7) % 3);
          }
          if (other && s === 0) s = 1;
          cur[i] = s;
          var q = rows[i];
          sty(q.box, "border-color", s === 0 ? "#0A7A55" : (s === 1 ? "#5B6570" : "#7E8790"));
          sty(q.box, "background", s === 0 ? "#0A7A55" : (s === 1 ? "#5B6570" : "#FFFFFF"));
          shown(q.take, s === 0);
          shown(q.keep, s === 1);
          txt(q.st, NAMES[s]);
          sty(q.st, "color", COLS[s]);
          txt(q.res, s === 0 ? d[1] : d[2]);
          sty(q.res, "color", COLS[s] === "#5B6570" ? "#15191D" : COLS[s]);
          sty(q.res, "text-decoration", s === 2 ? "line-through" : "none");
          put(q.el, "aria", d[0] + ": " + NAMES[s], function (v) { q.el.setAttribute("aria-label", v); });
        });
        return null;
      }
      return { el: el, update: update };
    }
    return { title: "DeckReady — Which Tags to Write", frozen: 0, build: build };
  })();

  // =====================================================================
  // scene E: the real «Duplicates» window
  // =====================================================================
  var sceneE = (function () {
    var PLAY = 900, TOG1 = 3300, TOG2 = 4100, GO = 5100, P0 = 5400, STEP = 450;
    var MB = function (n) { return n.toFixed(1) + " MB"; };
    var GROUPS = [
      { title: "Oren Vale, Sila — Atlas", reason: "Same Beatport track", rows: [
        { keep: true, name: "Oren Vale & Sila - Atlas.aiff", fq: "AIFF 24/48", len: "7:02", size: 72.4, seed: 0.3 },
        { name: "atlas_promo.mp3", fq: "MP3 320", len: "7:02", size: 16.1, seed: 0.3 },
        { name: "Atlas (1).mp3", fq: "MP3 192", len: "7:01", size: 9.7, seed: 0.35 }
      ] },
      { title: "Kaia Moor — Saltwater", reason: "Exact copy", rows: [
        { keep: true, name: "Kaia Moor - Saltwater.flac", fq: "FLAC 16/44.1", len: "6:31", size: 44.0, seed: 1.1 },
        { name: "Kaia Moor - Saltwater.flac", fq: "FLAC 16/44.1", len: "6:31", size: 44.0, seed: 1.1 }
      ] }
    ];
    var ORDER = [[0, 1], [0, 2], [1, 1]];      // the trashed copies in order, and when each one goes
    var goneAt = {};
    ORDER.forEach(function (o, k) { goneAt[o[0] + ":" + o[1]] = P0 + STEP * k; });
    var COLS = "display: grid; grid-template-columns: 118px 74px minmax(0, 1fr) 82px 40px 54px";
    var BOX = '<span style="width: 12px; height: 12px; border-radius: 3px; background: #0A7A55; display: inline-flex; align-items: center; justify-content: center"><svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + CHECK + '</svg></span>';
    var M10 = "font-family: " + MONO + "; font-size: 10px";
    function build() {
      var el = frag(
        '<div class="scene-in" style="position: absolute; left: 0; right: 0; top: 32px; bottom: 0; padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; font-size: 11px">' +
        '<div style="display: flex; align-items: center; gap: 5px; color: #3A434C; white-space: nowrap; overflow: hidden">' +
        '<span style="flex: none; width: 15px; height: 15px; border-radius: 50%; border: 1px solid #DCE0E4; display: inline-flex; align-items: center; justify-content: center; font-size: 9.5px; font-weight: 700; color: #5B6570">?</span>' +
        '<span data-r="hdr"></span><span>·</span><span data-r="freed"></span><span>·</span><span style="overflow: hidden; text-overflow: ellipsis; color: #5B6570">Green = keep, red = to Trash; the best copy is picked in advance.</span></div>' +
        '<div style="display: flex; align-items: center; gap: 14px; white-space: nowrap">' +
        ["Same Beatport track / same tags", "Exact file copies", "Similar title and length (check yourself)"].map(function (s) { return '<span style="display: inline-flex; align-items: center; gap: 5px">' + BOX + s + '</span>'; }).join("") + '</div>' +
        '<div style="display: flex; align-items: center; gap: 10px; white-space: nowrap">' +
        '<span style="display: inline-flex; align-items: center; gap: 5px">' + BOX + 'Respect excluded folders</span>' +
        '<span style="color: #5B6570">Excluded folders: 1</span>' +
        '<span style="height: 22px; padding: 0 10px; border-radius: 6px; border: 1px solid #DCE0E4; background: #F6F7F8; display: inline-flex; align-items: center">Excluded Folders…</span></div>' +
        '<div style="position: relative; flex: 1; min-height: 0; border: 1px solid #DCE0E4; border-radius: 6px; overflow: hidden; background: #FFFFFF">' +
        '<div style="' + COLS + '; height: 24px; align-items: center; padding: 0 8px; border-bottom: 1px solid #DCE0E4; font-size: 10px; font-weight: 600; color: #5B6570"><span>Track</span><span>Action</span><span>File name</span><span>Format/quality</span><span>Length</span><span>Size</span></div>' +
        '<div data-r="groups"></div>' +
        '<span data-r="empty" style="display: contents"></span></div>' +
        '<div data-r="path" style="height: 14px; color: #3A434C; ' + M10 + '; white-space: nowrap; overflow: hidden; text-overflow: ellipsis"></div>' +
        '<div style="display: flex; align-items: center; gap: 8px">' +
        '<span data-r="play" style="color: #3A434C; font-size: 10.5px; white-space: nowrap"></span>' +
        '<span data-r="prog" style="display: contents"></span>' +
        '<span style="margin-left: auto; height: 30px; padding: 0 14px; border-radius: 7px; border: 1px solid #DCE0E4; background: #FFFFFF; display: inline-flex; align-items: center; font-weight: 600">Close</span>' +
        '<span data-r="go" style="height: 30px; padding: 0 14px; border-radius: 7px; background: #0A7A55; color: #FFFFFF; display: inline-flex; align-items: center; font-weight: 700; transition: background .3s ease"></span>' +
        '</div></div>');
      var r = refs(el);
      function groupEl(g) {
        var e = frag('<div style="overflow: hidden"><div style="display: flex; align-items: center; height: 26px; padding: 0 8px; font-weight: 700; border-bottom: 1px solid #ECEEF1"><span data-r="title"></span><span style="margin-left: auto; font-weight: 700; color: #3A434C">' + esc(g.reason) + '</span></div><div data-r="rows"></div></div>');
        e.__r = refs(e);
        return e;
      }
      function rowEl(it) {
        var hs = wave(34, it.seed, 18);
        var e = frag('<div><span data-r="wv" style="position: relative; height: 22px; display: flex; align-items: center; gap: 1px; overflow: hidden; margin-right: 8px">' + bars(hs, "var(--wd)") + '<span data-r="pl" style="display: contents"></span></span>' +
          '<span data-r="act" style="font-weight: 600"></span>' +
          '<span style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis">' + esc(it.name) + '</span>' +
          '<span style="' + M10 + '">' + it.fq + '</span><span style="' + M10 + '">' + it.len + '</span><span style="' + M10 + '">' + it.size + '</span></div>');
        e.__r = refs(e);
        e.__hs = hs;
        return e;
      }
      function update(st) {
        var t = st % 10500;
        var toggledKeep = t >= TOG1 && t < TOG2;          // row (0,1) clicked: To Trash → Keep → To Trash
        var trashN = 0, freed = 0, files = 0, visibleGroups = 0, items = [];
        GROUPS.forEach(function (g, gi) {
          var rows = [];
          g.rows.forEach(function (rw, ri) {
            var key = gi + ":" + ri;
            var gone = goneAt[key] !== undefined && t >= goneAt[key] + 300;
            if (gone) return;
            var mark = rw.keep ? "keep" : "trash";
            if (gi === 0 && ri === 1 && toggledKeep) mark = "keep";
            var leaving = goneAt[key] !== undefined && t >= goneAt[key];
            if (mark === "trash" && t < GO) { trashN++; freed += rw.size; }
            files++;
            var playing = gi === 0 && ri === 1 && t >= PLAY && t < PLAY + 2200;
            rows.push({ key: key, name: rw.name, fq: rw.fq, len: rw.len, size: MB(rw.size), seed: rw.seed,
              action: mark === "keep" ? "✓ Keep" : "🗑 To Trash",
              actInk: mark === "keep" ? "#0A7A55" : "#C53030",
              actCls: gi === 0 && ri === 1 && (Math.abs(t - TOG1) < 300 || Math.abs(t - TOG2) < 300) ? "pop" : "",
              playing: playing,
              waveDim: mark === "keep" ? "#9ACDB4" : "#E9AEB5",
              cls: leaving ? "collapse30" : "",
              style: COLS + "; align-items: center; height: 30px; padding: 0 8px; border-bottom: 1px solid #F1F3F5; transition: background .3s ease; background: " + (mark === "keep" ? "#E3F4EC" : "#FDE7E9") + (playing ? "; box-shadow: inset 0 0 0 1.5px #0A7A55" : "") });
          });
          var single = rows.length <= 1;
          if (!single) visibleGroups++;
          if (!(single && t >= P0 + STEP * 3 + 600)) items.push({
            key: gi, rows: rows, reason: g.reason,
            title: g.title + " · " + rows.length + " " + (rows.length === 1 ? "copy" : "copies"),
            cls: single && t >= P0 + STEP * 3 + 300 ? "collapse-group" : "" });
        });
        keyed(r.groups, items, groupEl, function (ge, g) {
          var q = ge.__r;
          txt(q.title, g.title);
          cls(ge, g.cls);
          keyed(q.rows, g.rows, rowEl, function (re, it) {
            var w = re.__r;
            css(re, it.style);
            cls(re, it.cls);
            sty(w.wv, "--wd", it.waveDim);
            txt(w.act, it.action);
            sty(w.act, "color", it.actInk);
            cls(w.act, it.actCls);
            cond(w.pl, it.playing, function () {
              return frag('<span style="position: absolute; left: 0; top: 0; bottom: 0; overflow: hidden; animation: playhead 2.2s linear both; display: flex; align-items: center"><span style="width: 110px; display: flex; align-items: center; gap: 1px; height: 22px">' + bars(re.__hs, "#0A7A55") + '</span></span>');
            });
          });
        });
        cond(r.empty, t >= P0 + STEP * 3 + 700, function () {
          return frag('<div class="pop" style="position: absolute; left: 0; right: 0; top: 110px; text-align: center; color: #5B6570; font-size: 13px; font-weight: 600">No duplicates found</div>');
        });
        txt(r.hdr, "Tracks with copies found: " + (t < P0 ? 2 : visibleGroups) + ". Total files: " + (t < P0 ? 5 : files) + ".");
        txt(r.freed, "Extra copies marked for Trash: " + (t < GO ? trashN : 0) + ". Space to free: " + MB(t < GO ? freed : 0) + ".");
        var goN = t < GO ? trashN : 3;
        txt(r.go, "Move to Trash: " + goN + " " + (goN === 1 ? "file" : "files"));
        sty(r.go, "background", t < P0 + STEP * 3 + 300 ? "#0A7A55" : "#DCE0E4");
        sty(r.go, "color", t < P0 + STEP * 3 + 300 ? "#FFFFFF" : "#5B6570");
        cls(r.go, t >= GO && t < GO + 350 ? "pop" : "");
        txt(r.play, t >= PLAY && t < PLAY + 2200 ? "▶ atlas_promo.mp3 — 0:" + String(Math.floor((t - PLAY) / 1000) + 41).padStart(2, "0") + " / 7:02" : "");
        txt(r.path, t >= PLAY && t < TOG2 + 400 ? "~/Music/Downloads/atlas_promo.mp3" : "");
        var p = cond(r.prog, t >= P0 && t < P0 + STEP * 3 + 400, function () {
          var e = frag('<span style="display: contents"><span style="width: 150px; height: 6px; border-radius: 3px; background: #ECEEF1; overflow: hidden"><span data-r="bar" style="display: block; height: 6px; width: 0%; background: #0A7A55; transition: width .3s linear"></span></span><span data-r="pt" style="color: #3A434C; font-size: 10.5px"></span></span>');
          e.__r = refs(e);
          return e;
        });
        if (p) {
          var done = Math.min(3, Math.max(0, Math.floor((t - P0) / STEP) + 1));
          sty(p.__r.bar, "width", Math.round(done / 3 * 100) + "%");
          txt(p.__r.pt, done + " / 3");
        }
        return null;
      }
      return { el: el, update: update };
    }
    return { title: "DeckReady — Duplicates", frozen: 5000, build: build };
  })();

  // =====================================================================
  // scene F: what is written, per format (deckready_core writers)
  // =====================================================================
  var sceneF = (function () {
    var FM = [
      { ext: "MP3", kind: "ID3 tags", color: "#2EE59D" },
      { ext: "FLAC", kind: "Vorbis comments", color: "#2068B8" },
      { ext: "AIFF", kind: "ID3 tags", color: "#B7791F" },
      { ext: "WAV", kind: "ID3 chunk + RIFF INFO", color: "#C53030" }
    ];
    var FIELDS = [
      ["Title", "Lumen (Extended Mix)", "TIT2", "title", "TIT2 + INAM"],
      ["Artist", "Aurelian", "TPE1", "artist", "TPE1 + IART"],
      ["Album", "Lumen EP", "TALB", "album", "TALB + IPRD"],
      ["Genre", "Melodic House & Techno", "TCON", "genre", "TCON + IGNR"],
      ["BPM", "122", "TBPM", "bpm", "TBPM"],
      ["Key", "Am", "TKEY", "initialkey, key", "TKEY"],
      ["Label", "Afterglow Records", "TPUB", "label", "TPUB"],
      ["Date", "2026-03-14", "TDRC", "date", "TDRC + ICRD"],
      ["Catalog #", "AGR042", "TXXX:CATALOGNUMBER", "catalognumber", "TXXX:CATALOGNUMBER"],
      ["Artwork", "JPEG cover", "APIC", "PICTURE", "APIC"]
    ];
    function build() {
      var el = frag(
        '<div class="scene-in" style="position: absolute; left: 0; right: 0; top: 32px; bottom: 0; padding: 16px 18px; display: flex; flex-direction: column; gap: 12px">' +
        '<div style="display: flex; align-items: center; gap: 6px">' + FM.map(function (p, i) { return '<span data-r="p' + i + '">' + p.ext + '</span>'; }).join("") +
        '<span data-r="kind" style="margin-left: auto; font-size: 11.5px; color: #5B6570"></span></div>' +
        '<div style="display: grid; grid-template-columns: 150px 1fr; gap: 14px; flex: 1; min-height: 0">' +
        '<div style="display: flex; flex-direction: column; gap: 8px">' +
        '<div class="spin" style="width: 150px; height: 150px; border-radius: 50%; background: repeating-radial-gradient(circle, #15191D 0 2px, #262C32 2px 4px); position: relative; animation-duration: 4s; box-shadow: 0 16px 30px rgba(21,25,29,.25)"><span data-r="lbl" style="position: absolute; inset: 52px; border-radius: 50%; background: #2EE59D; transition: background .4s ease"></span><span style="position: absolute; inset: 72px; border-radius: 50%; background: #FFFFFF"></span></div>' +
        '<span data-r="ext" style="display: inline-flex; align-self: flex-start; font-family: ' + MONO + '; font-size: 11px; font-weight: 600; padding: 2px 7px; border-radius: 5px; background: #15191D; color: #FFFFFF"></span>' +
        '<span data-r="fn" style="font-size: 11.5px; color: #3A434C; line-height: 1.4"></span></div>' +
        '<div style="border: 1px solid #DCE0E4; border-radius: 10px; overflow: hidden">' +
        '<div style="display: grid; grid-template-columns: 82px 1fr 128px; padding: 6px 10px; background: #F6F7F8; border-bottom: 1px solid #DCE0E4; font-size: 9.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; color: #5B6570"><span>Field</span><span>Value</span><span>Written as</span></div>' +
        '<div data-r="rows"></div></div></div></div>');
      var r = refs(el);
      var rows = FIELDS.map(function (f) {
        var e = frag('<div><span style="color: #5B6570">' + f[0] + '</span><span data-r="v" style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 500"></span><span data-r="w" style="font-family: ' + MONO + '; font-size: 10.5px; color: #0A7A55; white-space: nowrap; overflow: hidden; text-overflow: ellipsis"></span></div>');
        r.rows.appendChild(e);
        var q = refs(e); q.el = e;
        return q;
      });
      function update(st) {
        var fi = Math.floor(st / 3600) % 4, t = st % 3600, f = FM[fi];
        txt(r.kind, f.kind);
        txt(r.ext, "." + f.ext);
        txt(r.fn, "Aurelian - Lumen (Extended Mix)." + f.ext.toLowerCase());
        sty(r.lbl, "background", f.color);
        cls(r.ext, t < 450 ? "pop" : "");
        FM.forEach(function (p, i) {
          css(r["p" + i], "font-family: " + MONO + "; font-size: 12px; font-weight: 600; padding: 5px 12px; border-radius: 999px; transition: all .3s ease; " + (i === fi ? "background: #15191D; color: #FFFFFF; border: 1px solid #15191D;" : "background: #FFFFFF; color: #5B6570; border: 1px solid #DCE0E4;"));
        });
        FIELDS.forEach(function (fd, i) {
          var q = rows[i], shownNow = t >= 250 + 140 * i;
          var w = fi === 1 ? fd[3] : (fi === 3 ? fd[4] : fd[2]);
          txt(q.v, shownNow ? fd[1] : "");
          txt(q.w, shownNow ? w : "");
          cls(q.el, shownNow && t < 250 + 140 * i + 300 ? "rowin" : "");
          css(q.el, "display: grid; grid-template-columns: 82px 1fr 128px; align-items: center; height: 29px; padding: 0 10px; font-size: 12px; border-bottom: 1px solid #F1F3F5; background: " + (shownNow && t < 250 + 140 * i + 500 ? "#E3F4EC" : "#FFFFFF") + "; transition: background .5s ease");
        });
        return null;
      }
      return { el: el, update: update };
    }
    return { title: "DeckReady — Formats", frozen: 3500, build: build };
  })();

  // =====================================================================
  // scene G: the DJ library before / after a refresh
  // =====================================================================
  var sceneG = (function () {
    var APPS = ["rekordbox", "Serato DJ", "Traktor"];
    var REFRESH = 1500, FILL0 = 2000;
    var ROWS = [
      ["AUD-20231104-WA0007", "Saltwater", "Kaia Moor", "124", "Gm", "Afro House", COVERS[4]],
      ["track_05_final", "Lumen (Extended Mix)", "Aurelian", "122", "Am", "Melodic House & Techno", COVERS[1]],
      ["ID - ID [rip]", "Kora Sun", "Nuvem", "120", "F#m", "Afro House", COVERS[2]],
      ["promo_mstr_v3", "Aurora Fade", "Duskline", "126", "Eb", "Progressive House", COVERS[5]],
      ["01 - unknown", "Night Drive", "Velvet Coast", "122", "Dm", "Melodic House & Techno", COVERS[8]]
    ];
    var ELL = "white-space: nowrap; overflow: hidden; text-overflow: ellipsis";
    function build() {
      var el = frag(
        '<div class="scene-in" style="position: absolute; left: 0; right: 0; top: 32px; bottom: 0; padding: 16px 18px; display: flex; flex-direction: column; gap: 12px">' +
        '<div style="display: flex; align-items: center; gap: 6px">' + APPS.map(function (n, i) { return '<span data-r="a' + i + '">' + n + '</span>'; }).join("") +
        '<span data-r="rf" style="margin-left: auto; display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px; border-radius: 7px; border: 1px solid #DCE0E4; background: #FFFFFF; color: #15191D; font-size: 11.5px; font-weight: 600; transition: all .25s ease"><svg data-r="sp" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 11-3-6.7M21 4v5h-5"></path></svg><span data-r="rt"></span></span></div>' +
        '<div style="font-size: 12px; color: #5B6570">Your library in <b data-r="app" style="color: #15191D"></b> — <span data-r="cap"></span></div>' +
        '<div style="border: 1px solid #DCE0E4; border-radius: 10px; overflow: hidden; background: #FFFFFF">' +
        '<div style="display: grid; grid-template-columns: 40px 1fr 110px 44px 40px 130px; gap: 8px; padding: 7px 10px; background: #15191D; color: #C3CAD1; font-size: 9.5px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase"><span>Art</span><span>Title</span><span>Artist</span><span>BPM</span><span>Key</span><span>Genre</span></div>' +
        '<div data-r="rows"></div></div></div>');
      var r = refs(el);
      var rows = ROWS.map(function () {
        var e = frag('<div><span data-r="art" style="width: 30px; height: 30px; border-radius: 4px; background: #ECEEF1; transition: background .4s ease"></span>' +
          '<span data-r="ti" style="' + ELL + '"></span><span data-r="ar" style="' + ELL + '"></span>' +
          '<span data-r="bpm" style="font-family: ' + MONO + '; font-size: 11px"></span>' +
          '<span data-r="key" style="font-family: ' + MONO + '; font-size: 11px; font-weight: 600; color: #0A7A55"></span>' +
          '<span data-r="ge" style="' + ELL + '; font-size: 11.5px; color: #3A434C"></span></div>');
        r.rows.appendChild(e);
        var q = refs(e); q.el = e;
        return q;
      });
      function update(st) {
        var ai = Math.floor(st / 6000) % 3, t = st % 6000;
        txt(r.app, APPS[ai]);
        APPS.forEach(function (n, i) {
          css(r["a" + i], "font-size: 12px; font-weight: 700; padding: 5px 12px; border-radius: 999px; transition: all .3s ease; " + (i === ai ? "background: #15191D; color: #FFFFFF; border: 1px solid #15191D;" : "background: #FFFFFF; color: #5B6570; border: 1px solid #DCE0E4;"));
        });
        var refreshed = t >= FILL0, busy = t >= REFRESH && t < FILL0 + 1800;
        txt(r.cap, refreshed ? "after DeckReady" : "before DeckReady");
        txt(r.rt, busy ? "Reading tags…" : (refreshed ? "Up to date" : "Refresh tags"));
        cls(r.rf, t >= REFRESH && t < REFRESH + 350 ? "pop" : "");
        cls(r.sp, busy ? "spin-fast" : "");
        sty(r.rf, "background", refreshed ? "#E3F4EC" : "#FFFFFF");
        sty(r.rf, "color", refreshed ? "#0A7A55" : "#15191D");
        ROWS.forEach(function (rw, i) {
          var q = rows[i], done = t >= FILL0 + 300 * i, flash = done && t < FILL0 + 300 * i + 600;
          txt(q.ti, done ? rw[1] : rw[0]);
          txt(q.ar, done ? rw[2] : "—");
          txt(q.bpm, done ? rw[3] : "");
          txt(q.key, done ? rw[4] : "");
          txt(q.ge, done ? rw[5] : "");
          sty(q.art, "background", done ? rw[6] : "#ECEEF1");
          sty(q.ti, "font-weight", done ? "600" : "400");
          sty(q.ti, "color", done ? "#15191D" : "#B7791F");
          sty(q.ar, "color", done ? "#15191D" : "#9AA3AC");
          css(q.el, "display: grid; grid-template-columns: 40px 1fr 110px 44px 40px 130px; gap: 8px; align-items: center; padding: 6px 10px; border-bottom: 1px solid #F1F3F5; font-size: 12px; transition: background .5s ease; background: " + (flash ? "#C6EED9" : "#FFFFFF"));
        });
        return null;
      }
      return { el: el, update: update };
    }
    return { title: "DeckReady — Your DJ software", frozen: 5900, build: build };
  })();

  // =====================================================================
  // scene H: platforms + update (versions from the GitHub latest release, not hard-coded)
  // =====================================================================
  var sceneH = (function () {
    var TILES = [["Mac", "Apple silicon · M1+", "M5 5h14v10H5zM3 19h18M9 9h6v2H9z"], ["Mac", "Intel processor", "M5 5h14v10H5zM3 19h18"], ["Windows", "Windows 10 and 11", "M4 5l7-1v7H4zM13 4l7-1v8h-7zM4 13h7v7l-7-1zM13 13h7v8l-7-1z"]];
    function nextVersion(v) { var p = v.split("."); p[2] = String(+p[2] + 1); return p.join("."); }
    function build() {
      var el = frag(
        '<div class="scene-in" style="position: absolute; left: 0; right: 0; top: 32px; bottom: 0; padding: 26px; display: flex; flex-direction: column; gap: 18px">' +
        '<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px">' +
        TILES.map(function (d, i) {
          return '<div class="pop" data-r="t' + i + '"><span style="width: 46px; height: 46px; border-radius: 12px; background: #E3F4EC; color: #0A7A55; display: flex; align-items: center; justify-content: center"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d[2] + '"></path></svg></span>' +
            '<b style="font-size: 15px">' + d[0] + '</b><span style="font-size: 11.5px; color: #5B6570">' + d[1] + '</span>' +
            '<span data-r="v' + i + '" style="font-family: ' + MONO + '; font-size: 11px; font-weight: 600; transition: color .3s ease"></span></div>';
        }).join("") + '</div>' +
        '<div style="border-radius: 12px; border: 1px solid #DCE0E4; background: #FFFFFF; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px">' +
        '<div style="display: flex; align-items: center; gap: 10px"><b data-r="msg"></b><span data-r="pt" style="margin-left: auto; font-family: ' + MONO + '; font-size: 12px; color: #5B6570"></span></div>' +
        '<div style="height: 8px; border-radius: 4px; background: #ECEEF1; overflow: hidden"><div data-r="bar" style="height: 8px; width: 0%; border-radius: 4px; background: #0A7A55; transition: width .2s linear"></div></div>' +
        '</div></div>');
      var r = refs(el);
      function update(st) {
        var t = st % 7000;
        var p = t < 1200 ? 0 : Math.min(100, Math.round((t - 1200) / 2600 * 100));
        var done = t >= 4000;
        var cur = VERSION, next = VERSION ? nextVersion(VERSION) : null;
        sty(r.bar, "width", p + "%");
        txt(r.pt, done ? "done" : p + "%");
        txt(r.msg, done ? (next ? "Updated to " + next + " — restarting…" : "Updated — restarting…")
          : (t < 1200 ? (next ? "New version " + next + " available" : "New version available") : "Downloading update…"));
        TILES.forEach(function (d, i) {
          css(r["t" + i], "display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; padding: 18px 10px; border-radius: 14px; border: 1px solid " + (done ? "#B9DDCB" : "#DCE0E4") + "; background: " + (done ? "#F3FAF6" : "#FFFFFF") + "; transition: all .4s ease; animation-delay: " + (0.1 * i).toFixed(2) + "s");
          txt(r["v" + i], cur ? "v" + (done ? next : cur) : "");
          sty(r["v" + i], "color", done ? "#0A7A55" : "#5B6570");
        });
        return null;
      }
      return { el: el, update: update };
    }
    return { title: "DeckReady — Updates", frozen: 4500, build: build };
  })();

  var SCENES = [sceneA, sceneB, sceneC, sceneD, sceneE, sceneF, sceneG, sceneH];

  // =====================================================================
  // stage, clock, chapters
  // =====================================================================
  var stage, winTitle, recLayer, noteLayer, badgeLayer, chapEls = [], navs = [];
  var chap = 0, since = 0, cur = null, stageVisible = true, lock = null;

  function frame() {
    if (!cur) return;
    var st = REDUCE ? SCENES[chap].frozen : Math.max(0, now() - since);
    var out = cur.update(st) || {};
    keyed(recLayer, out.recs || [], recEl);
    keyed(noteLayer, out.notes || [], noteEl);
    keyed(badgeLayer, out.badge ? [out.badge] : [], badgeEl);
  }
  function loop() {
    if (stageVisible) frame();
    requestAnimationFrame(loop);
  }
  // a new chapter: its scene is built fresh (entrance animations replay) and its timeline restarts
  function enter(i) {
    chap = i;
    since = now();
    if (cur) cur.el.remove();
    cur = SCENES[i].build();
    stage.insertBefore(cur.el, recLayer);
    txt(winTitle, SCENES[i].title);
    navs.forEach(function (b, j) {
      b.classList.toggle("on", j === i);
      if (j === i) b.setAttribute("aria-current", "step"); else b.removeAttribute("aria-current");
    });
    frame();
  }

  function paintChapters(prog) {
    chapEls.forEach(function (c, i) {
      var d = prog[i] === undefined ? (i === chap ? 0 : 1) : prog[i];
      var k = Math.max(0, 1 - Math.min(1, Math.abs(d) / 0.42));       // 1 at the centre → 0 far away
      var e = k * k * (3 - 2 * k);                                       // smoothstep
      var lerp = function (x, y) { return Math.round(x + (y - x) * e); };
      var mix = function (c1, c2) { return "rgb(" + lerp(c1[0], c2[0]) + "," + lerp(c1[1], c2[1]) + "," + lerp(c1[2], c2[2]) + ")"; };
      var ty = Math.max(-60, Math.min(60, d * 120));                     // floats up / down with the scroll
      if (!REDUCE) sty(c.box, "transform", "translateY(" + ty.toFixed(1) + "px) scale(" + (0.96 + 0.04 * e).toFixed(3) + ")");
      sty(c.box, "opacity", (0.35 + 0.65 * e).toFixed(3));
      sty(c.h, "color", mix([196, 202, 208], [21, 25, 29]));
      sty(c.p, "color", mix([210, 215, 220], [91, 101, 112]));
      sty(c.n, "color", mix([185, 221, 203], [10, 122, 85]));
    });
  }
  function measure() {
    var vh = window.innerHeight || 800, mid = vh / 2, best = -1, bestD = Infinity;
    var prog = chapEls.map(function (c, i) {
      var r = c.wrap.getBoundingClientRect();
      var d = (r.top + r.height / 2 - mid) / vh;                         // −0.5 … +0.5 across the screen
      if (Math.abs(d) < bestD) { bestD = Math.abs(d); best = i; }
      return d;
    });
    // a chapter button scrolls smoothly past other chapters: keep its chapter until it arrives
    if (lock && (best === lock.i || now() > lock.until)) lock = null;
    if (!lock && best >= 0 && best !== chap) enter(best);
    paintChapters(prog);
  }
  function go(i) {
    enter(i);
    lock = { i: i, until: now() + 1500 };
    chapEls[i].wrap.scrollIntoView({ behavior: REDUCE ? "auto" : "smooth", block: "center" });
  }

  function initStory() {
    stage = document.getElementById("stage");
    if (!stage) return;
    winTitle = document.getElementById("win-title");
    recLayer = document.getElementById("st-recs");
    noteLayer = document.getElementById("st-notes");
    badgeLayer = document.getElementById("st-badge");
    chapEls = Array.prototype.map.call(document.querySelectorAll(".chap-wrap"), function (w) {
      var box = w.querySelector(".chap");
      box.style.transformOrigin = "left center";
      return { wrap: w, box: box, n: box.querySelector(".chap-n"), h: box.querySelector("h3"), p: box.querySelector("p") };
    });
    navs = Array.prototype.slice.call(document.querySelectorAll(".navdot"));
    navs.forEach(function (b) { b.addEventListener("click", function () { go(+b.getAttribute("data-go")); }); });
    enter(0);
    paintChapters([]);
    var raf = 0;
    var onScroll = function () {
      if (raf) return;
      raf = requestAnimationFrame(function () { raf = 0; measure(); });
    };
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll, { passive: true });
    setTimeout(measure, 60);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(measure);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (es) { stageVisible = es[es.length - 1].isIntersecting; if (stageVisible) frame(); }).observe(stage);
    }
    requestAnimationFrame(loop);
  }

  // hero: three layers follow the mouse (the transforms ease via CSS transitions)
  function initHero() {
    var hero = document.getElementById("top");
    var L = [document.getElementById("hp1"), document.getElementById("hp2"), document.getElementById("hp3")];
    if (!hero || !L[0] || REDUCE) return;
    var mx = 0, my = 0, pending = false;
    var K = [[14, 10], [-22, -14], [34, 22]];
    hero.addEventListener("mousemove", function (e) {
      var r = hero.getBoundingClientRect();
      mx = ((e.clientX - r.left) / r.width - 0.5) * 2;
      my = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (pending) return;
      pending = true;
      requestAnimationFrame(function () {
        pending = false;
        L.forEach(function (el, i) { el.style.transform = "translate(" + (mx * K[i][0]).toFixed(1) + "px, " + (my * K[i][1]).toFixed(1) + "px)"; });
      });
    });
  }

  // the latest version from GitHub (same source as the previous site); links stay /releases/latest/download/…
  function initVersion() {
    fetch("https://api.github.com/repos/mid30084/deckready-releases/releases/latest")
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data) return;
        var tag = String(data.tag_name || "").replace(/^v/i, "");
        if (!/^\d+\.\d+\.\d+$/.test(tag)) return;
        VERSION = tag;
        var v = document.getElementById("dl-version"), box = document.getElementById("dl-ver");
        if (v && box) { v.textContent = tag; box.hidden = false; }
        if (cur && chap === 7) frame();
      })
      .catch(function () {});
  }

  initHero();
  initStory();
  initVersion();
})();
