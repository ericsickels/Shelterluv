/*
  Redemption Rescue Amazon wish list for Squarespace.
  Paste squarespace/wishlist-code-block.html into a Code Block on the page. It fills <div id="rr-wishlist">
  from wishlist.json (Cloudflare reads our Amazon registry at most three times a day) and loads wishlist.css.
*/
(function () {
  "use strict";

  // ---- Settings --------------------------------------------------------------
  var ROOT_ID = "rr-wishlist";
  var FILTERS = [   // price filters along the top
    { key: "all", label: "All items" },
    { key: "15", label: "Under $15", max: 15 },
    { key: "30", label: "Under $30", max: 30 },
    { key: "needed", label: "Most needed" }
  ];
  var SHIPPING_NOTE = "Gifts bought through our Amazon registry ship straight to the rescue.";
  // --------------------------------------------------------------------------

  var script = document.currentScript ||
    [].slice.call(document.querySelectorAll("script[src]")).filter(function (s) { return /\/wishlist\.js(\?|$)/.test(s.src); })[0];
  var BASE = script ? script.src.replace(/[^\/?#]*([?#].*)?$/, "") : "https://animals.redemptionrescueinc.com/";
  var version = Math.floor(Date.now() / 600000);

  var root = document.getElementById(ROOT_ID);
  if (!root || root.getAttribute("data-rrw-ready")) return;
  root.setAttribute("data-rrw-ready", "1");
  root.classList.add("rrw");
  if (!document.querySelector("link[data-rrw-css]")) {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = BASE + "wishlist.css?v=" + version;
    link.setAttribute("data-rrw-css", "");
    document.head.appendChild(link);
  }

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
  }
  function money(n) { return n == null ? "" : "$" + (n % 1 ? n.toFixed(2) : n.toLocaleString("en-US")); }
  function stars(r) {   // nearest whole star
    if (r == null) return "";
    var n = Math.round(r), out = "";
    for (var i = 1; i <= 5; i++) out += i <= n ? "\u2605" : "\u2606";
    return out;
  }
  function track(name, params) {   // Google Analytics (Squarespace GA4 gtag, or GTM dataLayer)
    try {
      if (typeof window.gtag === "function") window.gtag("event", name, params);
      else if (window.dataLayer && window.dataLayer.push) window.dataLayer.push(Object.assign({ event: name }, params));
    } catch (e) {}
  }

  var data = null, filter = "all";

  function card(it, i) {
    var sale = it.listPrice && it.price && it.listPrice > it.price ? Math.round((1 - it.price / it.listPrice) * 100) : 0;
    var req = it.requested || 0, got = Math.min(it.purchased || 0, req), pct = req ? Math.round(got / req * 100) : 0;
    return '<article class="rrw-card' + (it.fulfilled ? " rrw-done" : "") + '">' +
      '<div class="rrw-img">' + (it.image ? '<img loading="lazy" src="' + esc(it.image) + '" alt="">' : "") +
        (it.fulfilled ? '<span class="rrw-flag rrw-flag-done">Fulfilled &#127881;</span>'
          : (it.mustHave ? '<span class="rrw-flag rrw-flag-must">Most needed</span>' : sale >= 5 ? '<span class="rrw-flag rrw-flag-sale">' + sale + "% off</span>" : "")) +
      "</div>" +
      '<div class="rrw-body">' +
        (it.brand ? '<p class="rrw-brand">' + esc(it.brand) + "</p>" : "") +
        '<h3 class="rrw-title" title="' + esc(it.title) + '">' + esc(it.title) + "</h3>" +
        (it.note ? '<p class="rrw-note"><span>Why we need it</span>' + esc(it.note) + "</p>" : "") +
        '<div class="rrw-meta">' +
          '<span class="rrw-price">' + money(it.price) + (sale >= 5 ? " <s>" + money(it.listPrice) + "</s>" : "") + "</span>" +
          (it.rating != null ? '<span class="rrw-rating" title="' + it.rating + ' out of 5"><b aria-hidden="true">' + stars(it.rating) + "</b> " + (it.reviews ? it.reviews.toLocaleString("en-US") : "") + "</span>" : "") +
        "</div>" +
        (req ? '<div class="rrw-progress" role="img" aria-label="' + got + " of " + req + ' donated"><i style="width:' + pct + '%"></i></div>' +
          '<p class="rrw-count">' + (it.fulfilled ? "All " + req + " donated \u2014 thank you!" : "<b>" + (it.needed != null ? it.needed : req - got) + " still needed</b> \u00b7 " + got + " of " + req + " donated") + "</p>" : "") +
        '<div class="rrw-actions">' +
          (it.fulfilled ? '<span class="rrw-thanks">Thank you, donors!</span>'
            : '<a class="rrw-gift" href="' + esc(data.registryUrl) + '" target="_blank" rel="noopener" data-i="' + i + '" data-link="gift">Gift this</a>') +
          '<a class="rrw-view" href="' + esc(it.url) + '" target="_blank" rel="noopener" data-i="' + i + '" data-link="amazon">See details on Amazon</a>' +
        "</div>" +
      "</div></article>";
  }

  function render() {
    var items = data.items.slice();
    var f = FILTERS.filter(function (x) { return x.key === filter; })[0] || FILTERS[0];
    if (f.max) items = items.filter(function (it) { return it.price != null && it.price < f.max; });
    if (f.key === "needed") items = items.filter(function (it) { return !it.fulfilled; }).sort(function (a, b) { return (b.needed || 0) - (a.needed || 0); });
    root.querySelector(".rrw-grid").innerHTML = items.length ? items.map(function (it) { return card(it, data.items.indexOf(it)); }).join("")
      : '<p class="rrw-empty">Nothing in this price range right now. Try another filter!</p>';
    [].forEach.call(root.querySelectorAll(".rrw-filters button"), function (b) { b.setAttribute("aria-pressed", String(b.getAttribute("data-f") === filter)); });
  }

  function start(d) {
    data = d;
    var fund = d.fund;
    root.innerHTML =
      '<div class="rrw-summary"><p><b>' + (d.stillNeeded || 0).toLocaleString("en-US") + "</b> items still needed across <b>" + d.count + "</b> wish list items</p>" +
        '<a class="rrw-all" href="' + esc(d.registryUrl) + '" target="_blank" rel="noopener" data-link="registry">Open our Amazon registry</a></div>' +
      (fund ? '<div class="rrw-fund"><div class="rrw-fund-icon" aria-hidden="true">&#127873;</div><div class="rrw-fund-text"><h3>' + esc(fund.title || "Urgent Supplies Fund") + "</h3>" +
          (fund.comment ? "<p>" + esc(fund.comment) + "</p>" : "") + "</div>" +
          '<a class="rrw-gift" href="' + esc(d.registryUrl) + '" target="_blank" rel="noopener" data-link="fund">Give a gift card' + (fund.goal ? ' <span>' + money(fund.goal) + " goal</span>" : "") + "</a></div>" : "") +
      '<div class="rrw-filters" role="group" aria-label="Filter the wish list">' + FILTERS.map(function (x) {
        return '<button type="button" data-f="' + x.key + '" aria-pressed="false">' + esc(x.label) + "</button>";
      }).join("") + "</div>" +
      '<div class="rrw-grid"></div>' +
      '<p class="rrw-foot">' + esc(SHIPPING_NOTE) + "</p>";
    render();
  }

  root.addEventListener("click", function (e) {
    var b = e.target.closest(".rrw-filters button");
    if (b) { filter = b.getAttribute("data-f"); render(); track("wishlist_filter", { filter: filter }); return; }
    var a = e.target.closest("a[data-link]");
    if (a && data) {
      var it = a.hasAttribute("data-i") ? data.items[+a.getAttribute("data-i")] : null;
      track("wishlist_click", { link: a.getAttribute("data-link"), item_name: it ? it.title.slice(0, 100) : a.getAttribute("data-link"), asin: it ? it.asin : "", price: it ? it.price || 0 : 0 });
    }
  });

  root.innerHTML = '<p class="rrw-msg">Loading our wish list&hellip;</p>';
  fetch(BASE + "wishlist.json?v=" + version)
    .then(function (r) { if (!r.ok) throw 0; return r.json(); })
    .then(function (d) { if (!d || !d.items) throw 0; start(d); })
    .catch(function () {
      root.innerHTML = '<p class="rrw-msg">We couldn\u2019t load our wish list just now. You can still <a href="https://www.amazon.com/registries/holiday/2BAZJDTMPXLF7/guest-view" target="_blank" rel="noopener">see it on Amazon</a>.</p>';
    });
})();
