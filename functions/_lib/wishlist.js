// Redemption Rescue's Amazon registry (wish list), read from the JSON endpoint the registry page itself uses.
// The endpoint is undocumented and Amazon's robots.txt disallows automated access to the page, so this is
// polled sparingly (a few times a day), identifies itself, backs off between pages and on errors, and the
// site keeps serving the last good copy whenever a fetch fails.

const REGISTRY_ID = "2BAZJDTMPXLF7";
const PAGE_SIZE = 30;    // Amazon's maximum
const MAX_PAGES = 10;    // safety stop (the list is ~2 pages)
const USER_AGENT = "RedemptionRescueWishlist/1.0 (+https://www.redemptionrescueinc.com; nonprofit animal rescue, updates its own registry a few times a day)";

function pageUrl(token, phase) {
  const q = new URLSearchParams({
    viewType: "GUEST_VIEW", pageSize: String(PAGE_SIZE), usePUI: "true", phaseFilter: phase,
    sort: "PRIORITY", direction: "DESC", filter: "ALL", giftSurpriseEnabled: "false", isGuestOwnerOfRegistry: "false",
  });
  if (token) q.set("pageToken", token);
  return `https://www.amazon.com/registries/holiday/${REGISTRY_ID}/products?${q}`;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One page, retried with backoff on network errors, 429 and 5xx. Throws a descriptive error otherwise
// (including when Amazon answers with an HTML page, e.g. a CAPTCHA, instead of JSON).
async function getPage(token, phase, log) {
  let wait = 2000;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const t0 = Date.now();
    let resp, text;
    try {
      resp = await fetch(pageUrl(token, phase), { headers: { "User-Agent": USER_AGENT, Accept: "application/json", "Accept-Language": "en-US" } });
      text = await resp.text();
    } catch (e) {
      log.push({ attempt, error: String(e && e.message || e) });
      if (attempt < 3) { await sleep(wait); wait *= 2; continue; }
      throw new Error("network error: " + (e && e.message || e));
    }
    const type = resp.headers.get("content-type") || "";
    log.push({ attempt, status: resp.status, type, ms: Date.now() - t0, bytes: text.length });
    if ((resp.status === 429 || resp.status >= 500) && attempt < 3) { await sleep(wait); wait *= 2; continue; }
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    try { return JSON.parse(text); }
    catch (e) {
      const hint = /captcha|robot/i.test(text) ? " (looks like a CAPTCHA / robot check)" : "";
      throw new Error(`not JSON${hint}: ${text.slice(0, 160).replace(/\s+/g, " ")}`);
    }
  }
}

function decodeEntities(s) {
  return String(s || "")
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&")
    .trim();
}
const amount = (p) => (p && p.amount != null && p.amount !== "" ? Number(p.amount) : null);
const int = (n) => (n == null || n === "" ? null : parseInt(n, 10));

// Every page of one phase (UN_PURCHASED or PURCHASED).
async function fetchPhase(phase, log) {
  const raw = [];
  let token = null;
  for (let page = 0; page < MAX_PAGES; page++) {
    if (page || phase !== "UN_PURCHASED") await sleep(1500);   // be gentle between requests
    const data = await getPage(token, phase, log);
    const result = data.result || data;
    const list = result.displayableRegistryProducts;
    if (!Array.isArray(list)) throw new Error("unexpected response: no displayableRegistryProducts (keys: " + Object.keys(result).slice(0, 12).join(", ") + ")");
    raw.push(...list);
    token = result.nextPageToken || null;
    if (!token) break;
  }
  return raw;
}

// Still-needed items plus fully purchased ones -> { updated, fund, items }. Items are merged by ASIN
// (quantities summed) when the owner added the same product twice. If the purchased list can't be read, the
// still-needed list is used on its own.
export async function fetchWishlist() {
  const log = [];
  const raw = await fetchPhase("UN_PURCHASED", log);
  let purchasedOk = true;
  try {
    const have = new Set(raw.map((p) => p.itemId).filter(Boolean));
    for (const p of await fetchPhase("PURCHASED", log)) if (!p.itemId || !have.has(p.itemId)) raw.push(p);
  } catch (e) { purchasedOk = false; log.push({ phase: "PURCHASED", error: String(e && e.message || e) }); }

  let fund = null;
  const byAsin = new Map();
  for (const p of raw) {
    if (p.giftCardFundItem || !p.asin) {
      fund = fund || { title: decodeEntities(p.productTitle), goal: amount(p.displayableProductPrice), comment: decodeEntities(p.comment) || null, itemId: p.itemId || null };
      continue;
    }
    const item = {
      asin: p.asin,
      title: decodeEntities(p.productTitle),
      brand: decodeEntities(p.brandName) || null,
      image: p.imageUrl || null,
      url: `https://www.amazon.com/dp/${p.asin}`,
      price: amount(p.displayableProductPrice),
      listPrice: amount(p.displayableProductBasisPrice),
      percentSavings: p.percentSavings != null ? Number(p.percentSavings) : null,
      requested: int(p.qtyRequested), purchased: int(p.qtyPurchased), needed: int(p.qtyNeeded),
      rating: p.displayableCustomerRating && p.displayableCustomerRating.averageRating != null ? Math.round(Number(p.displayableCustomerRating.averageRating) * 10) / 10 : null,
      reviews: int(p.displayableCustomerRating && p.displayableCustomerRating.reviewCount != null ? p.displayableCustomerRating.reviewCount : p.reviewCount),
      inStock: p.inStock !== false,
      prime: !!p.primeEligible,
      mustHave: !!p.mustHave,
      note: decodeEntities(p.comment) || null,
      itemIds: p.itemId ? [p.itemId] : [],
    };
    const seen = byAsin.get(item.asin);
    if (seen) {
      for (const k of ["requested", "purchased", "needed"]) if (item[k] != null) seen[k] = (seen[k] || 0) + item[k];
      seen.itemIds.push(...item.itemIds);
      seen.mustHave = seen.mustHave || item.mustHave;
      seen.note = seen.note || item.note;
    } else byAsin.set(item.asin, item);
  }
  const items = [...byAsin.values()].map((it) => {
    it.fulfilled = it.needed === 0 || (it.requested != null && it.purchased != null && it.purchased >= it.requested);
    delete it.itemIds;
    return it;
  });
  // Still needed first (Amazon's priority order), fully purchased at the end.
  items.sort((a, b) => (a.fulfilled === b.fulfilled ? 0 : a.fulfilled ? 1 : -1));
  return {
    updated: new Date().toISOString().replace(/\.\d+Z$/, "+00:00"),
    registryUrl: `https://www.amazon.com/registries/gl/guest-view/${REGISTRY_ID}`,
    fund,
    count: items.length,
    stillNeeded: items.reduce((n, it) => n + (it.fulfilled ? 0 : it.needed || 0), 0),
    includesPurchased: purchasedOk,
    items,
  };
}
