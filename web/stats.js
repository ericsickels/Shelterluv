/*
  Adoption counts widget for Squarespace: This Month, Last Month and This Year, split into
  dogs and cats. Numbers count up when the section scrolls into view.

    <div id="slv-stats"></div>
    <script src="https://animals.redemptionrescueinc.com/stats.js" defer></script>

  Optional override on the div: data-data-url="https://.../stats.json"
*/
(function () {
  var script = document.currentScript ||
    [].slice.call(document.querySelectorAll("script[src]")).filter(function (s) { return /\/stats\.js(\?|$)/.test(s.src); })[0];
  var BASE = script ? script.src.replace(/[^\/?#]*([?#].*)?$/, "") : "https://animals.redemptionrescueinc.com/";

  var root = document.getElementById("slv-stats");
  if (!root || root.getAttribute("data-slv-ready")) return;
  root.setAttribute("data-slv-ready", "1");
  root.classList.add("slv");
  var DATA_URL = root.getAttribute("data-data-url") || BASE + "stats.json";

  // Short cache window so published changes reach visitors within ~10 minutes.
  var version = Math.floor(Date.now() / 600000);
  if (!document.querySelector("link[data-slv-css]")) {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = BASE + "adopt.css?v=" + version;
    link.setAttribute("data-slv-css", "");
    document.head.appendChild(link);
  }

  var DOG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M12 5c-3.6 0-6.2 2.6-6.2 6.4v2.8C5.8 18.3 8.6 21 12 21s6.2-2.7 6.2-6.8v-2.8C18.2 7.6 15.6 5 12 5zm-2.6 7.2a1.1 1.1 0 1 0 0 .01zM14.6 12.2a1.1 1.1 0 1 0 0 .01zM12 15.2c-.9 0-1.6.4-1.6.9s.7 1.3 1.6 1.3 1.6-.8 1.6-1.3-.7-.9-1.6-.9z"/>' +
    '<path d="M6.4 6.2C4.6 5.6 2.6 6.4 2.2 8.6c-.4 2.2.4 5 1.6 6.4.7.8 1.8.4 2-.6V9.2c0-1.2.2-2.2.6-3zM17.6 6.2c1.8-.6 3.8.2 4.2 2.4.4 2.2-.4 5-1.6 6.4-.7.8-1.8.4-2-.6V9.2c0-1.2-.2-2.2-.6-3z"/></svg>';
  var CAT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill-rule="evenodd" d="M4.2 2.8c.3-.4.9-.4 1.2-.1L9 6.2c1-.3 2-.4 3-.4s2 .1 3 .4l3.6-3.5c.3-.3.9-.3 1.2.1.2.2.2.4.2.6V12c0 5-3.6 9-8 9s-8-4-8-9V3.4c0-.2 0-.4.2-.6zM9 12.4a1.1 1.4 0 1 0 0 .01zM15 12.4a1.1 1.4 0 1 0 0 .01zM12 15.4l-1.2 1h2.4z"/></svg>';

  var TILES = [
    { key: "thisMonth", title: "This month", sub: function (s) { return "in " + s.label; } },
    { key: "lastMonth", title: "Last month", sub: function (s) { return "in " + s.label; } },
    { key: "thisYear", title: "This year", sub: function (s) { return "in " + s.label; }, featured: true }
  ];

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function num(n) {
    return '<span class="slv-count-up" data-target="' + (Number(n) || 0) + '">0</span>';
  }

  function render(stats) {
    root.innerHTML = '<div class="slv-stats">' + TILES.map(function (t) {
      var s = stats[t.key] || { count: 0, dogs: 0, cats: 0, other: 0, label: "" };
      var total = Number(s.count) || 0;
      return '<div class="slv-stat' + (t.featured ? " slv-stat-featured" : "") + '">' +
        '<div class="slv-stat-label">' + esc(t.title) + "</div>" +
        '<div class="slv-stat-num">' + num(total) + "</div>" +
        '<div class="slv-stat-sub">' + (total === 1 ? "adoption " : "adoptions ") + esc(t.sub(s)) + "</div>" +
        '<div class="slv-stat-split">' +
          '<span title="Dogs">' + DOG + num(s.dogs) + (s.dogs === 1 ? " dog" : " dogs") + "</span>" +
          '<span title="Cats">' + CAT + num(s.cats) + (s.cats === 1 ? " cat" : " cats") + "</span>" +
          (s.other ? "<span>" + num(s.other) + " other</span>" : "") +
        "</div>" +
      "</div>";
    }).join("") + "</div>";
    animateWhenVisible(root.querySelector(".slv-stats"));
  }

  function countUp(el, delay) {
    var target = Number(el.getAttribute("data-target")) || 0;
    var duration = 1400 + Math.min(target, 400) * 2;
    var start = null;
    function frame(now) {
      if (start === null) start = now + delay;
      var p = Math.max(0, Math.min(1, (now - start) / duration));
      var eased = 1 - Math.pow(1 - p, 4);
      el.textContent = Math.round(target * eased).toLocaleString("en-US");
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function finish(section) {
    section.classList.add("slv-in");
    section.querySelectorAll(".slv-count-up").forEach(function (el) {
      el.textContent = Number(el.getAttribute("data-target")).toLocaleString("en-US");
    });
  }

  function play(section) {
    section.classList.add("slv-in");
    section.querySelectorAll(".slv-stat").forEach(function (tile, i) {
      tile.querySelectorAll(".slv-count-up").forEach(function (el) { countUp(el, 150 + i * 120); });
    });
  }

  function animateWhenVisible(section) {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || !("IntersectionObserver" in window)) return finish(section);
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      play(section);
    }, { threshold: 0.35 });
    io.observe(section);
  }

  fetch(DATA_URL + (DATA_URL.indexOf("?") < 0 ? "?" : "&") + "v=" + version)
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(render)
    .catch(function () { root.innerHTML = ""; });
})();
