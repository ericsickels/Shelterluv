/*
  "Recently Adopted" widget for Squarespace. Shows animals adopted in the last 60 days
  (from adopted.json) as non-clickable cards with an "Adopted" ribbon.

    <div id="slv-adopted"></div>
    <script src="https://ericsickels.github.io/Shelterluv/adopted.js" defer></script>

  Optional override on the div: data-data-url="https://.../adopted.json"
*/
(function () {
  // ---- Configuration -------------------------------------------------------
  // Text on the ribbon across each card's photo.
  var RIBBON_TEXT = "Adopted!";
  // --------------------------------------------------------------------------

  // adopted.json and adopt.css are published next to this script.
  var script = document.currentScript ||
    [].slice.call(document.querySelectorAll("script[src]")).filter(function (s) { return /\/adopted\.js(\?|$)/.test(s.src); })[0];
  var BASE = script ? script.src.replace(/[^\/?#]*([?#].*)?$/, "") : "https://ericsickels.github.io/Shelterluv/";

  var root = document.getElementById("slv-adopted");
  if (!root || root.getAttribute("data-slv-ready")) return;
  root.setAttribute("data-slv-ready", "1");
  root.classList.add("slv");
  var DATA_URL = root.getAttribute("data-data-url") || BASE + "adopted.json";

  // Short cache window so published changes reach visitors within ~10 minutes.
  var version = Math.floor(Date.now() / 600000);
  if (!document.querySelector("link[data-slv-css]")) {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = BASE + "adopt.css?v=" + version;
    link.setAttribute("data-slv-css", "");
    document.head.appendChild(link);
  }

  root.innerHTML = '<div class="slv-grid slv-grid-adopted"><p class="slv-msg">Loading&hellip;</p></div>';
  var grid = root.querySelector(".slv-grid");

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function age(months) {
    if (months == null || months === "") return "";
    var y = Math.floor(months / 12), m = months % 12;
    if (y === 0) return m + (m === 1 ? " month" : " months");
    return y + (y === 1 ? " year" : " years") + (m ? ", " + m + " mo" : "");
  }

  // "2026-10-11" -> "Oct 11", read as a calendar date so it never shifts a day. The year is
  // left off because every card is from the last couple of months.
  function adoptedOn(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
    if (!m) return "";
    var d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return "Adopted " + d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  }

  function render(animals) {
    if (!animals.length) {
      grid.innerHTML = '<p class="slv-msg">Check back soon for our latest happy tails!</p>';
      return;
    }
    grid.innerHTML = animals.map(function (a) {
      return '<div class="slv-card slv-card-adopted">' +
        '<div class="slv-card-photo">' +
          (a.photo ? '<img loading="lazy" src="' + esc(a.photo) + '" alt="' + esc(a.name) + ', adopted">' : "") +
          '<span class="slv-ribbon">' + esc(RIBBON_TEXT) + "</span>" +
        "</div>" +
        '<div class="slv-card-body"><h3>' + esc(a.name) + "</h3>" +
          '<p class="slv-meta">' + esc([a.sex, age(a.ageMonths)].filter(Boolean).join(" \u00b7 ")) + "</p>" +
          (a.breed ? '<p class="slv-breed" title="' + esc(a.breed) + '">' + esc(a.breed) + "</p>" : "") +
        "</div>" +
        (a.adoptedDate ? '<div class="slv-adopted-on">' + esc(adoptedOn(a.adoptedDate)) + "</div>" : "") +
        "</div>";
    }).join("");
  }

  fetch(DATA_URL + (DATA_URL.indexOf("?") < 0 ? "?" : "&") + "v=" + version)
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) { render(data.animals || []); })
    .catch(function () {
      grid.innerHTML = '<p class="slv-msg">We couldn\u2019t load our recent adoptions right now. Please try again later.</p>';
    });
})();
