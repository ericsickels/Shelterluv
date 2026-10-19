/*
  Homepage "Meet [name]" spotlight for Squarespace: a headline count of the dogs and cats looking
  for homes, then one animal at a time with a photo, short bio and link to their full details.
  It rotates automatically, pauses on hover/focus or with its pause button, and never moves on
  its own for visitors who have "reduce motion" turned on.

    <div id="slv-spotlight"></div>
    <script src="https://animals.redemptionrescueinc.com/spotlight.js" defer></script>

  Optional overrides on the div:
    data-animal-url="/adopt#animal-{id}"   data-all-url="/adopt"   data-data-url="https://.../animals.json"
*/
(function () {
  // ---- Configuration -------------------------------------------------------
  // Where "Meet [name]" goes. {id} is the Shelterluv animal ID; this opens their pop-up on the Adopt page.
  var ANIMAL_URL = "/adopt#animal-{id}";
  // Where "See all animals" goes.
  var ALL_URL = "/adopt";
  // How long each animal is shown, in milliseconds.
  var SLIDE_MS = 7000;
  // How strongly longer stays push an animal toward the front: weight = (1 + days / 30) ^ STAY_WEIGHT.
  // 0 = pure random. 1.5 puts a long-stayer first often, but newer arrivals still lead regularly.
  var STAY_WEIGHT = 1.5;
  // Kept out of the rotation (still counted in the headline).
  var SKIP_STATUSES = ["Hold - Applications Pending", "Hold - Pending Adoption"];
  // --------------------------------------------------------------------------

  // animals.json and adopt.css are published next to this script.
  var script = document.currentScript ||
    [].slice.call(document.querySelectorAll("script[src]")).filter(function (s) { return /\/spotlight\.js(\?|$)/.test(s.src); })[0];
  var BASE = script ? script.src.replace(/[^\/?#]*([?#].*)?$/, "") : "https://animals.redemptionrescueinc.com/";

  var root = document.getElementById("slv-spotlight");
  if (!root || root.getAttribute("data-slv-ready")) return;
  root.setAttribute("data-slv-ready", "1");
  root.classList.add("slv");
  ANIMAL_URL = root.getAttribute("data-animal-url") || ANIMAL_URL;
  ALL_URL = root.getAttribute("data-all-url") || ALL_URL;
  var DATA_URL = root.getAttribute("data-data-url") || BASE + "animals.json";

  // Short cache window so published changes reach visitors within ~10 minutes.
  var version = Math.floor(Date.now() / 600000);
  if (!document.querySelector("link[data-slv-css]")) {
    var link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = BASE + "adopt.css?v=" + version;
    link.setAttribute("data-slv-css", "");
    document.head.appendChild(link);
  }

  var reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  // Both icons stay in the button; CSS shows one. (Swapping the button's contents under the
  // pointer can stop browsers from reporting mouseleave, which would leave the slideshow held.)
  var PLAY = '<svg class="slv-sp-icon-play" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
  var PAUSE = '<svg class="slv-sp-icon-pause" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z"/></svg>';

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function age(months) {
    if (months == null || months === "") return "";
    var y = Math.floor(months / 12), m = months % 12;
    if (y === 0) return m + (m === 1 ? " month" : " months");
    return y + (y === 1 ? " year" : " years");
  }

  function summary(a) {
    return [a.sex, age(a.ageMonths), a.breed].filter(Boolean).join(" \u00b7 ");
  }

  // The first sentence or two of the bio, kept short enough for the panel.
  function excerpt(a) {
    var text = (a.description || "").replace(/\s+/g, " ").trim();
    if (!text) return a.name + " is waiting to meet you!";
    var out = "", parts = text.match(/[^.!?]+[.!?]+["\u201d']?/g) || [text];
    for (var i = 0; i < parts.length && (out + parts[i]).length <= 230; i++) out += parts[i];
    return out ? out.trim() : text.slice(0, 220).replace(/\s+\S*$/, "") + "\u2026";
  }

  function animalUrl(id) {
    return ANIMAL_URL.replace("{id}", encodeURIComponent(id));
  }

  function daysInCare(a) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a.intakeDate || "");
    if (!m) return 0;
    return Math.max(0, (Date.now() - Date.UTC(+m[1], +m[2] - 1, +m[3])) / 86400000);
  }

  // Weighted random order (Efraimidis-Spirakis): every visit gets a fresh order, and animals that
  // have waited longer tend to come earlier without always being first.
  function weightedShuffle(list) {
    return list.map(function (a) {
      var w = Math.pow(1 + daysInCare(a) / 30, STAY_WEIGHT);
      return { a: a, key: Math.pow(Math.random(), 1 / w) };
    }).sort(function (x, y) { return y.key - x.key; }).map(function (x) { return x.a; });
  }

  // "5 dogs and 6 cats are looking for homes right now"
  function headline(all) {
    var dogs = 0, cats = 0;
    all.forEach(function (a) { if (a.type === "Dog") dogs++; else if (a.type === "Cat") cats++; });
    var other = all.length - dogs - cats;
    var parts = [];
    function part(n, one, many) {
      if (n) parts.push('<b class="slv-count-up" data-target="' + n + '">0</b> ' + (n === 1 ? one : many));
    }
    part(dogs, "dog", "dogs");
    part(cats, "cat", "cats");
    part(other, "other animal", "other animals");
    var joined = parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1] : parts[0];
    return joined + (all.length === 1 ? " is looking for a home right now" : " are looking for homes right now");
  }

  function countUp(el) {
    var target = Number(el.getAttribute("data-target")) || 0;
    if (reduceMotion) { el.textContent = target; return; }
    var start = null;
    requestAnimationFrame(function step(t) {
      if (start === null) start = t;
      var p = Math.min(1, (t - start) / 1400);
      el.textContent = Math.round(target * (1 - Math.pow(1 - p, 4)));
      if (p < 1) requestAnimationFrame(step);
    });
  }

  function whenVisible(el, fn) {
    if (!("IntersectionObserver" in window)) return fn();
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      io.disconnect();
      fn();
    }, { threshold: 0.4 });
    io.observe(el);
  }

  function emptyState(title, text) {
    return '<div class="slv-empty"><div class="slv-empty-icon" aria-hidden="true"></div>' +
      '<p class="slv-empty-title">' + esc(title) + '</p><p class="slv-empty-text">' + esc(text) + "</p>" +
      '<a class="slv-empty-link slv-sp-all" href="' + esc(ALL_URL) + '">See all animals</a></div>';
  }

  function render(all) {
    var rotation = weightedShuffle(all.filter(function (a) {
      return a.photos && a.photos.length && SKIP_STATUSES.indexOf(a.status) < 0;
    }));

    var html = all.length ? '<p class="slv-sp-count">' + headline(all) + "</p>" : "";
    if (!rotation.length) {
      root.innerHTML = html + (all.length
        ? emptyState("Meet our animals", "See everyone who\u2019s looking for a home on our Adopt page.")
        : emptyState("New friends are on the way", "Please check back soon to meet our animals."));
      root.querySelectorAll(".slv-count-up").forEach(countUp);
      return;
    }

    root.innerHTML = html +
      '<div class="slv-sp" role="region" aria-roledescription="carousel" aria-label="Animals looking for homes">' +
        '<div class="slv-sp-photo">' +
          '<button type="button" class="slv-sp-nav slv-sp-prev" aria-label="Previous animal">&#8249;</button>' +
          '<button type="button" class="slv-sp-nav slv-sp-next" aria-label="Next animal">&#8250;</button>' +
          '<button type="button" class="slv-sp-toggle">' + PAUSE + PLAY + "</button>" +
        "</div>" +
        '<div class="slv-sp-body" aria-live="off">' +
          '<div class="slv-sp-eyebrow">Meet</div>' +
          '<h3 class="slv-sp-name"></h3>' +
          '<p class="slv-sp-meta"></p>' +
          '<p class="slv-sp-text"></p>' +
          '<div class="slv-sp-btns"><a class="slv-sp-cta"></a><a class="slv-sp-all" href="' + esc(ALL_URL) + '">See all animals</a></div>' +
        "</div>" +
        '<div class="slv-sp-progress"></div>' +
      "</div>" +
      '<div class="slv-sp-rail" role="group" aria-label="Choose an animal">' + rotation.map(function (a, i) {
        return '<button type="button" data-i="' + i + '" aria-label="Meet ' + esc(a.name) + '">' +
          '<img loading="lazy" src="' + esc(a.photos[0]) + '" alt=""></button>';
      }).join("") + "</div>";

    root.querySelectorAll(".slv-count-up").forEach(function (el) {
      whenVisible(root.querySelector(".slv-sp-count"), function () { countUp(el); });
    });

    var panel = root.querySelector(".slv-sp");
    var photo = panel.querySelector(".slv-sp-photo");
    var body = panel.querySelector(".slv-sp-body");
    var bar = panel.querySelector(".slv-sp-progress");
    var toggle = panel.querySelector(".slv-sp-toggle");
    var rail = root.querySelector(".slv-sp-rail");
    var index = -1, timer = null, remaining = SLIDE_MS, startedAt = 0;
    // Paused by the button (sticks until Play), or temporarily by hover / keyboard focus / hidden tab.
    var userPaused = reduceMotion, hover = false, focus = false;

    function holding() { return userPaused || hover || focus || document.hidden; }

    function updateToggle() {
      toggle.setAttribute("aria-label", userPaused ? "Play slideshow" : "Pause slideshow");
      toggle.setAttribute("aria-pressed", String(userPaused));
      panel.classList.toggle("slv-sp-paused", userPaused);
    }

    function show(i, userAction) {
      index = (i + rotation.length) % rotation.length;
      var a = rotation[index];

      var old = photo.querySelector("img.slv-sp-on");
      photo.insertAdjacentHTML("afterbegin", '<img src="' + esc(a.photos[0]) + '" alt="Photo of ' + esc(a.name) + '">');
      var fresh = photo.firstElementChild;
      fresh.addEventListener("error", function () { fresh.classList.add("slv-sp-broken"); });
      requestAnimationFrame(function () { requestAnimationFrame(function () { fresh.classList.add("slv-sp-on"); }); });
      if (old) {
        old.classList.remove("slv-sp-on");
        setTimeout(function () { if (old.parentNode) old.parentNode.removeChild(old); }, 1000);
      }

      function fill() {
        body.querySelector(".slv-sp-name").textContent = a.name;
        body.querySelector(".slv-sp-meta").textContent = summary(a);
        body.querySelector(".slv-sp-text").textContent = excerpt(a);
        var cta = body.querySelector(".slv-sp-cta");
        cta.textContent = "Meet " + a.name;
        cta.href = animalUrl(a.id);
        panel.classList.remove("slv-sp-swap");
      }
      if (old && !reduceMotion) { panel.classList.add("slv-sp-swap"); setTimeout(fill, 300); } else fill();
      // Announce changes to screen readers only when the visitor moved the slideshow themselves.
      body.setAttribute("aria-live", userAction ? "polite" : "off");

      rail.querySelectorAll("button").forEach(function (b, n) { b.setAttribute("aria-current", String(n === index)); });
      var next = rotation[(index + 1) % rotation.length];
      if (next) new Image().src = next.photos[0];
      restart(SLIDE_MS);
    }

    function restart(ms) {
      clearTimeout(timer);
      timer = null;
      remaining = ms;
      startedAt = performance.now();
      bar.style.transition = "none";
      bar.style.width = (100 * (1 - ms / SLIDE_MS)) + "%";
      if (holding() || rotation.length < 2) return;
      void bar.offsetWidth;
      bar.style.transition = "width " + ms + "ms linear";
      bar.style.width = "100%";
      timer = setTimeout(function () { show(index + 1, false); }, ms);
    }

    // Freeze the progress bar where it is; a no-op when the slideshow isn't running.
    function hold() {
      if (timer === null) return;
      clearTimeout(timer);
      timer = null;
      remaining = Math.max(0, remaining - (performance.now() - startedAt));
      bar.style.transition = "none";
      bar.style.width = (100 * (1 - remaining / SLIDE_MS)) + "%";
    }

    function release() {
      if (!holding()) restart(remaining);
    }

    toggle.addEventListener("click", function () {
      userPaused = !userPaused;
      updateToggle();
      if (userPaused) hold(); else restart(remaining || SLIDE_MS);
    });
    panel.addEventListener("mouseenter", function () { hover = true; hold(); });
    panel.addEventListener("mouseleave", function () { hover = false; release(); });
    root.addEventListener("focusin", function () { focus = true; hold(); });
    root.addEventListener("focusout", function (e) {
      if (root.contains(e.relatedTarget)) return;
      focus = false;
      release();
    });
    document.addEventListener("visibilitychange", function () { if (document.hidden) hold(); else release(); });

    panel.querySelector(".slv-sp-prev").addEventListener("click", function () { show(index - 1, true); });
    panel.querySelector(".slv-sp-next").addEventListener("click", function () { show(index + 1, true); });
    rail.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-i]");
      if (b) show(Number(b.getAttribute("data-i")), true);
    });
    // Swipe on the photo (phones).
    var touchX = null;
    photo.addEventListener("touchstart", function (e) { touchX = e.touches[0].clientX; }, { passive: true });
    photo.addEventListener("touchend", function (e) {
      if (touchX === null) return;
      var dx = e.changedTouches[0].clientX - touchX;
      touchX = null;
      if (Math.abs(dx) > 40) show(index + (dx < 0 ? 1 : -1), true);
    });

    if (rotation.length < 2) {
      panel.classList.add("slv-sp-single");
      rail.style.display = "none";
    }
    updateToggle();
    show(0, false);
  }

  fetch(DATA_URL + (DATA_URL.indexOf("?") < 0 ? "?" : "&") + "v=" + version)
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) { render(data.animals || []); })
    .catch(function () {
      root.innerHTML = emptyState("Meet our animals", "See everyone who\u2019s looking for a home on our Adopt page.");
    });
})();
