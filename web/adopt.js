/*
  Animal listing widgets for the Squarespace Adopt page: clickable cards with a detail pop-up.
  Published to GitHub Pages next to the JSON data; Squarespace only loads it. The same script
  runs every widget whose div is on the page:

    <div id="slv-adopt"></div>         adoptable animals (animals.json), with Apply button
    <div id="slv-coming-soon"></div>   intake / assessment animals (coming-soon.json)
    <script src="https://ericsickels.github.io/Shelterluv/adopt.js" defer></script>

  Optional overrides as attributes on a div:
    data-apply-url="https://.../{id}"   data-data-url="https://.../animals.json"
*/
(function () {
  // ---- Configuration -------------------------------------------------------
  // Link for the "Apply to adopt" button. {id} is replaced with the Shelterluv animal ID.
  var APPLY_URL = "https://new.shelterluv.com/matchme/adopt/RES-A-{id}";
  // Shelterluv statuses that get a badge on the card and in the pop-up.
  var STATUS_BADGES = { "Hold - Applications Pending": "Applications pending" };
  // Each widget: the div it fills, its data file and its wording.
  var WIDGETS = [
    {
      id: "slv-adopt", data: "animals.json", apply: true,
      loading: "Loading our adoptable animals&hellip;",
      empty: "No animals are listed right now \u2014 please check back soon!"
    },
    {
      id: "slv-coming-soon", data: "coming-soon.json", apply: false, badge: "Coming soon",
      loading: "Loading&hellip;",
      empty: "No new arrivals right now \u2014 check back soon!",
      // Shown in the pop-up in place of the Apply button. {name} is the animal's name.
      notice: "{name} is settling in with us and will be available for adoption soon. Check back for updates!"
    }
  ];
  // --------------------------------------------------------------------------

  // The data files and adopt.css are published next to this script.
  var script = document.currentScript ||
    [].slice.call(document.querySelectorAll("script[src]")).filter(function (s) { return /\/adopt\.js(\?|$)/.test(s.src); })[0];
  var BASE = script ? script.src.replace(/[^\/?#]*([?#].*)?$/, "") : "https://ericsickels.github.io/Shelterluv/";

  // Short cache window so published changes reach visitors within ~10 minutes.
  var version = Math.floor(Date.now() / 600000);
  if (!document.querySelector("link[data-slv-css]")) {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = BASE + "adopt.css?v=" + version;
    link.setAttribute("data-slv-css", "");
    document.head.appendChild(link);
  }

  WIDGETS.forEach(function (w) {
    var root = document.getElementById(w.id);
    if (root && !root.getAttribute("data-slv-ready")) init(root, w);
  });

  function init(root, w) {
    root.setAttribute("data-slv-ready", "1");
    root.classList.add("slv");
    var applyUrl = root.getAttribute("data-apply-url") || APPLY_URL;
    var DATA_URL = root.getAttribute("data-data-url") || BASE + w.data;
    var titleId = w.id + "-title";

    root.innerHTML =
      '<div class="slv-filters" role="group" aria-label="Filter animals"></div>' +
      '<div class="slv-grid" aria-live="polite"><p class="slv-msg">' + w.loading + "</p></div>" +
      '<dialog class="slv-modal" aria-labelledby="' + titleId + '"></dialog>';
    var grid = root.querySelector(".slv-grid");
    var filters = root.querySelector(".slv-filters");
    var modal = root.querySelector(".slv-modal");
    var animals = [];
    var currentType = "All";
    var current = null, photoIndex = 0;

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

    function summary(a) {
      return [a.sex, age(a.ageMonths), a.breed].filter(Boolean).join(" \u00b7 ");
    }

    // Card text: sex and age on one line, breed on its own line, so nothing wraps mid-phrase.
    function cardText(a) {
      return "<h3>" + esc(a.name) + "</h3>" +
        '<p class="slv-meta">' + esc([a.sex, age(a.ageMonths)].filter(Boolean).join(" \u00b7 ")) + "</p>" +
        (a.breed ? '<p class="slv-breed" title="' + esc(a.breed) + '">' + esc(a.breed) + "</p>" : "");
    }

    function badge(a) {
      var label = w.badge || STATUS_BADGES[a.status];
      return label ? '<span class="slv-badge">' + esc(label) + "</span>" : "";
    }

    // Shown instead of a photo when an animal has none yet, or a photo fails to load.
    function placeholder(type, cls) {
      var kind = type === "Cat" ? "cat" : type === "Dog" ? "dog" : "paw";
      return '<div class="slv-ph slv-ph-' + kind + (cls ? " " + cls : "") + '" role="img" aria-label="Photo coming soon">' +
        "<span>Photo coming soon</span></div>";
    }

    function renderFilters() {
      var types = ["All"];
      animals.forEach(function (a) { if (a.type && types.indexOf(a.type) < 0) types.push(a.type); });
      if (types.length <= 2) { filters.innerHTML = ""; return; }
      filters.innerHTML = types.map(function (t) {
        var label = t === "All" ? "All" : t + "s";
        return '<button type="button" data-type="' + esc(t) + '" aria-pressed="' + (t === currentType) + '">' + esc(label) + "</button>";
      }).join("");
    }

    function renderGrid() {
      var list = animals.filter(function (a) { return currentType === "All" || a.type === currentType; });
      if (!list.length) {
        grid.innerHTML = '<p class="slv-msg">' + w.empty + "</p>";
        return;
      }
      grid.innerHTML = list.map(function (a) {
        return '<button type="button" class="slv-card" data-id="' + esc(a.id) + '" data-type="' + esc(a.type) + '">' + badge(a) +
          (a.photos[0] ? '<img loading="lazy" src="' + esc(a.photos[0]) + '" alt="Photo of ' + esc(a.name) + '">' : placeholder(a.type)) +
          '<div class="slv-card-body">' + cardText(a) + "</div></button>";
      }).join("");
    }

    function facts(a) {
      var fixed = a.altered === "Yes" ? "Yes" : a.altered === "No" ? "Not yet" : "";
      return [
        ["Age", age(a.ageMonths)],
        ["Sex", a.sex],
        ["Breed", a.breed],
        ["Color", [a.color, a.pattern].filter(Boolean).join(", ")],
        ["Size", a.size],
        ["Weight", a.weightLbs ? a.weightLbs + " lbs" : ""],
        [a.sex === "Female" ? "Spayed" : a.sex === "Male" ? "Neutered" : "Spayed / neutered", fixed]
      ].filter(function (f) { return f[1]; });
    }

    function track() {
      return modal.querySelector(".slv-track");
    }

    // Scroll the photo strip to photo i; the scroll listener updates the counter and thumbnails.
    function showPhoto(i, instant) {
      var t = track();
      if (!t || !current.photos.length) return;
      i = Math.max(0, Math.min(current.photos.length - 1, i));
      t.scrollTo({ left: i * t.clientWidth, behavior: instant ? "auto" : "smooth" });
      if (instant) markPhoto(i);
    }

    function markPhoto(i) {
      photoIndex = i;
      var n = current.photos.length;
      var count = modal.querySelector(".slv-count");
      if (count) count.textContent = (i + 1) + " / " + n;
      var prev = modal.querySelector(".slv-prev"), next = modal.querySelector(".slv-next");
      if (prev) prev.hidden = i === 0;
      if (next) next.hidden = i === n - 1;
      modal.querySelectorAll(".slv-thumbs button").forEach(function (b, k) {
        b.setAttribute("aria-current", String(k === i));
      });
    }

    function openAnimal(id) {
      var a = animals.filter(function (x) { return String(x.id) === String(id); })[0];
      if (!a) return;
      current = a;
      var many = a.photos.length > 1;
      var paragraphs = (a.description || "").split(/\n\s*\n/).filter(Boolean)
        .map(function (p) { return "<p>" + esc(p).replace(/\n/g, "<br>") + "</p>"; }).join("");
      var factRows = facts(a).map(function (f) {
        return "<div><dt>" + esc(f[0]) + "</dt><dd>" + esc(f[1]) + "</dd></div>";
      }).join("");
      var tags = (a.attributes || []).length
        ? '<div class="slv-tags">' + a.attributes.map(function (t) { return "<span>" + esc(t) + "</span>"; }).join("") + "</div>" : "";
      var cta = w.apply
        ? (a.adoptionFee ? '<div class="slv-fee">Adoption fee<strong>$' + esc(a.adoptionFee) + "</strong></div>" : "<div></div>") +
          '<a class="slv-apply" target="_blank" rel="noopener" href="' + esc(applyUrl.replace("{id}", encodeURIComponent(a.id))) + '">Apply to adopt ' + esc(a.name) + "</a>"
        : '<p class="slv-notice">' + esc((w.notice || "").replace("{name}", a.name)) + "</p>";

      modal.innerHTML =
        '<button type="button" class="slv-close" aria-label="Close">&times;</button>' +
        '<div class="slv-gallery">' +
          '<div class="slv-stage"><div class="slv-track">' + (a.photos.length ? "" : '<div class="slv-slide">' + placeholder(a.type, "slv-ph-large") + "</div>") +
            a.photos.map(function (src, i) {
              return '<div class="slv-slide"><div class="slv-slide-bg" style="background-image:url(&quot;' + esc(src) + '&quot;)"></div>' +
                '<img ' + (i > 1 ? 'loading="lazy" ' : "") + 'src="' + esc(src) + '" alt="Photo ' + (i + 1) + " of " + esc(a.name) + '"></div>';
            }).join("") + "</div>" +
            (many ? '<button type="button" class="slv-nav slv-prev" aria-label="Previous photo">&#8249;</button>' +
                    '<button type="button" class="slv-nav slv-next" aria-label="Next photo">&#8250;</button>' +
                    '<span class="slv-count"></span>' : "") +
          "</div>" +
          (many ? '<div class="slv-thumbs">' + a.photos.map(function (src, i) {
            return '<button type="button" data-index="' + i + '" aria-label="Photo ' + (i + 1) + '"><img loading="lazy" src="' + esc(src) + '" alt=""></button>';
          }).join("") + "</div>" : "") +
        "</div>" +
        '<div class="slv-details">' +
          '<div class="slv-scroll">' +
            badge(a) +
            '<h2 id="' + titleId + '">' + esc(a.name) + "</h2>" +
            '<p class="slv-sub">' + esc(summary(a)) + "</p>" +
            (factRows ? '<h3 class="slv-section-title">At a glance</h3><dl class="slv-facts">' + factRows + "</dl>" + tags : "") +
            (paragraphs ? '<h3 class="slv-section-title">About ' + esc(a.name) + '</h3><div class="slv-desc">' + paragraphs + "</div>" : "") +
          "</div>" +
          '<div class="slv-cta">' + cta + "</div>" +
        "</div>";

      if (!modal.open) { modal.showModal(); document.documentElement.classList.add("slv-lock"); }
      if (a.photos.length) {
        showPhoto(0, true);
        track().addEventListener("scroll", function () {
          var t = track(), i = Math.round(t.scrollLeft / t.clientWidth);
          if (i !== photoIndex) markPhoto(i);
        }, { passive: true });
      }
      modal.querySelector(".slv-scroll").scrollTop = 0;
      modal.querySelector(".slv-close").focus();
      if (location.hash !== "#animal-" + a.id) history.replaceState(null, "", "#animal-" + a.id);
    }

    function closeModal() {
      if (modal.open) modal.close();
    }

    filters.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-type]");
      if (!b) return;
      currentType = b.getAttribute("data-type");
      renderFilters();
      renderGrid();
    });

    grid.addEventListener("click", function (e) {
      var card = e.target.closest(".slv-card");
      if (card) openAnimal(card.getAttribute("data-id"));
    });

    modal.addEventListener("click", function (e) {
      if (e.target === modal || e.target.closest(".slv-close")) return closeModal();
      if (e.target.closest(".slv-prev")) return showPhoto(photoIndex - 1);
      if (e.target.closest(".slv-next")) return showPhoto(photoIndex + 1);
      var t = e.target.closest("button[data-index]");
      if (t) showPhoto(Number(t.getAttribute("data-index")));
    });

    modal.addEventListener("keydown", function (e) {
      if (!current || current.photos.length < 2) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      showPhoto(photoIndex + (e.key === "ArrowRight" ? 1 : -1));
    });

    // Keep the current photo in place if the window is resized or the phone is rotated.
    window.addEventListener("resize", function () {
      if (current && modal.open) showPhoto(photoIndex, true);
    });

    modal.addEventListener("close", function () {
      document.documentElement.classList.remove("slv-lock");
      current = null;
      if (location.hash.indexOf("#animal-") === 0) history.replaceState(null, "", location.pathname + location.search);
    });

    // Swap in the placeholder if a photo fails to load (e.g. it was removed in Shelterluv).
    root.addEventListener("error", function (e) {
      var img = e.target;
      if (!img || img.tagName !== "IMG") return;
      var card = img.parentNode && img.parentNode.classList.contains("slv-card") ? img.parentNode : null;
      var slide = img.closest(".slv-slide");
      var thumb = img.closest(".slv-thumbs button");
      if (card) img.outerHTML = placeholder(card.getAttribute("data-type"));
      else if (slide && current) slide.innerHTML = placeholder(current.type, "slv-ph-large");
      else if (thumb) thumb.style.visibility = "hidden";
    }, true);

    fetch(DATA_URL + (DATA_URL.indexOf("?") < 0 ? "?" : "&") + "v=" + version)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (data) {
        animals = (data.animals || []).map(function (a) { a.photos = a.photos || []; return a; });
        renderFilters();
        renderGrid();
        var m = location.hash.match(/^#animal-(.+)$/);
        if (m) openAnimal(decodeURIComponent(m[1]));
      })
      .catch(function () {
        grid.innerHTML = '<p class="slv-msg">We couldn\u2019t load our animals right now. Please refresh the page or try again later.</p>';
      });
  }
})();
