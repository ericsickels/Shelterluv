// Builds the site's public JSON files on Cloudflare Pages: a port of scripts/export_animals.py and
// scripts/export_events.py. Each file is rebuilt at most every MAX_AGE seconds and kept in KV (binding
// DATA); visitors always get the stored copy straight away while a refresh runs in the background, and
// if Shelterluv or the website can't be reached the last good copy keeps being served.
//
// Only a whitelist of public fields is written. Nothing about people (fosters, adopters), microchips or
// internal attributes is ever written out, except the foster's FIRST name in fosters.json (field guide).

import { fetchWishlist } from "./wishlist.js";

const API_URL = "https://new.shelterluv.com/api/v1/";
const PAGE_SIZE = 100;
const DEFAULTS = {
  PUBLISH_STATUSES: "Available - Public,Available - Social Only,Available - Fospice,Hold - Applications Pending,Hold - Pending Adoption",
  COMING_SOON_STATUSES: "Unavailable - Intake / Assessment",
  UNAVAILABLE_STATUSES: "Unavailable - Medical Recovery,Unavailable - Routine Vetting",
  ADOPTED_DAYS: "60",
  TRIAL_DAYS: "30",   // an adoption returned within this many days doesn't restart an animal's days-waiting count
  SHELTER_TIMEZONE: "America/New_York",
  EVENTS_URL: "https://www.redemptionrescueinc.com/events?format=json",
};
const ADOPTED_STATUS = "Healthy In Home";
const MAX_AGE = { custody: 30 * 60, adoptions: 60 * 60, events: 30 * 60, wishlist: 8 * 60 * 60 };   // wish list: at most 3 times a day

const cfg = (env, k) => (env && env[k]) || DEFAULTS[k];
const statusSet = (env, k) => new Set(cfg(env, k).split(",").map((s) => s.trim()).filter(Boolean));
const isoNow = () => new Date().toISOString().replace(/\.\d+Z$/, "+00:00");

// ---------- Shelterluv ----------
async function get(env, path, params) {
  const url = API_URL + path + (params ? "?" + new URLSearchParams(params) : "");
  const resp = await fetch(url, { headers: { "X-Api-Key": env.SHELTERLUV_API_KEY || "" } });
  if (!resp.ok) throw new Error(`Shelterluv ${path}: HTTP ${resp.status}`);
  const data = await resp.json();
  if ((data.success ?? 1) !== 1) throw new Error(`Shelterluv ${path}: ${JSON.stringify(data).slice(0, 200)}`);
  return data;
}

// Every page of a list. The first call gives total_count; the rest are fetched a few at a time.
async function getAll(env, path, key, params, slim) {
  const first = await get(env, path, { ...params, limit: PAGE_SIZE, offset: 0 });
  let items = (first[key] || []).map(slim || ((x) => x));
  if (!first.has_more) return items;
  const offsets = [];
  for (let o = PAGE_SIZE; o < (first.total_count || 0); o += PAGE_SIZE) offsets.push(o);
  for (let i = 0; i < offsets.length; i += 4) {
    const pages = await Promise.all(offsets.slice(i, i + 4).map((o) => get(env, path, { ...params, limit: PAGE_SIZE, offset: o })));
    for (const p of pages) items = items.concat((p[key] || []).map(slim || ((x) => x)));
  }
  return items;
}

function prettyBreed(breed) {
  // Shelterluv lists some breeds surname-first ("Terrier, Rat"); show "Rat Terrier".
  breed = (breed || "").trim();
  const parts = breed.split(",");
  if (parts.length === 2 && !/[/()]/.test(breed)) return `${parts[1].trim()} ${parts[0].trim()}`;
  return breed;
}

function toPublic(a) {
  const fee = a.AdoptionFeeGroup || {};
  let photos = a.Photos || [];
  if (a.CoverPhoto && !photos.includes(a.CoverPhoto)) photos = [a.CoverPhoto, ...photos];
  return {
    id: a.ID,
    name: (a.Name || "").trim(),
    type: a.Type,
    status: a.Status,
    breed: prettyBreed(a.Breed),
    sex: a.Sex,
    ageMonths: a.Age,
    size: a.Size || null,
    color: a.Color,
    pattern: a.Pattern,
    weightLbs: a.CurrentWeightPounds || null,
    altered: a.Altered,
    adoptionFee: fee.Price,
    photos,
    videos: a.Videos || [],
    description: a.Description || "",
    // Start of the current stay (see stayStart), for "days waiting" and to give longer stays more exposure.
    intakeDate: (a.StayStartUnixTime || a.LastIntakeUnixTime) ? new Date(+(a.StayStartUnixTime || a.LastIntakeUnixTime) * 1000).toISOString().slice(0, 10) : null,
    attributes: (a.Attributes || []).filter((x) => x.Publish === "Yes" && x.AttributeName).map((x) => x.AttributeName),
  };
}

const byTypeName = (x, y) => {
  const tx = x.type || "", ty = y.type || "";
  if (tx !== ty) return tx < ty ? -1 : 1;
  const nx = x.name.toLowerCase(), ny = y.name.toLowerCase();
  return nx < ny ? -1 : nx > ny ? 1 : 0;
};
const listFile = (animals) => ({ updated: isoNow(), count: animals.length, animals });

// When the animal's current stay with us began, from its intake/outcome history: foster moves don't
// count, and neither does an adoption that came back within TRIAL_DAYS (a trial that didn't work out).
// A longer adoption, or a transfer out, ends the stay; the next intake starts a new one.
function stayStart(events, trialDays) {
  let start = null, out = false, adoptedAt = null;
  for (const e of events.slice().sort((x, y) => parseInt(x.Time, 10) - parseInt(y.Time, 10))) {
    const t = parseInt(e.Time, 10), type = e.Type || "";
    if (type === "Outcome.Foster") continue;
    if (type.startsWith("Outcome.")) { out = true; adoptedAt = type === "Outcome.Adoption" ? t : null; continue; }
    if (!type.startsWith("Intake.")) continue;
    if (type === "Intake.FosterReturn") { if (start === null) start = t; continue; }
    const trial = out && adoptedAt !== null && t - adoptedAt <= trialDays * 86400;
    if (start === null || (out && !trial)) start = t;
    out = false; adoptedAt = null;
  }
  return start;
}
const MAX_HISTORY_LOOKUPS = 40;   // Cloudflare's free plan allows 50 outside requests per refresh

// animals.json, coming-soon.json, unavailable.json and fosters.json all come from one "in custody" call
// (plus each listed animal's history, for when its current stay began).
async function buildCustody(env) {
  const inCustody = await getAll(env, "animals", "animals", { status_type: "in custody" });
  const trialDays = parseInt(cfg(env, "TRIAL_DAYS"), 10) || 30;
  const listed = inCustody.filter((a) => ["PUBLISH_STATUSES", "COMING_SOON_STATUSES", "UNAVAILABLE_STATUSES"].some((k) => statusSet(env, k).has(a.Status)));
  const look = listed.slice(0, MAX_HISTORY_LOOKUPS);
  for (let i = 0; i < look.length; i += 4) {
    await Promise.all(look.slice(i, i + 4).map(async (a) => {
      try {
        const t = stayStart(await getAll(env, `animals/${a["Internal-ID"]}/events`, "events", {}), trialDays);
        if (t) a.StayStartUnixTime = t;
      } catch (e) { /* fall back to Shelterluv's last intake date */ }
    }));
  }
  const sets = { animals: statusSet(env, "PUBLISH_STATUSES"), "coming-soon": statusSet(env, "COMING_SOON_STATUSES"), unavailable: statusSet(env, "UNAVAILABLE_STATUSES") };
  const out = {};
  for (const [name, wanted] of Object.entries(sets)) {
    out[name] = listFile(inCustody.filter((a) => wanted.has(a.Status)).map(toPublic).sort(byTypeName));
  }
  // Animal ID -> current foster's first name. First name only: never the last name or contact details.
  const fosters = {};
  for (const a of inCustody) {
    const p = a.AssociatedPerson || {}, first = (p.FirstName || "").trim();
    if ((sets.animals.has(a.Status) || sets["coming-soon"].has(a.Status) || sets.unavailable.has(a.Status)) && p.RelationshipType === "foster" && first) {
      fosters[String(a.ID)] = first;
    }
  }
  out.fosters = { fosters };
  return out;
}

// ---------- time zone helpers (the shelter's local calendar, not UTC) ----------
function tzParts(ms, tz) {
  const p = {};
  new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
    .formatToParts(new Date(ms)).forEach((x) => { p[x.type] = +x.value || x.value; });
  return p;
}
// Midnight on year-month-day in `tz`, in milliseconds (month may be < 1: it rolls back into last year).
function tzMidnight(year, month, day, tz) {
  while (month < 1) { year -= 1; month += 12; }
  const guess = Date.UTC(year, month - 1, day);
  const p = tzParts(guess, tz);
  return guess - (Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second) - guess);
}
const tzDate = (ms, tz) => { const p = tzParts(ms, tz); return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`; };
const monthName = (ms, tz) => new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "long" }).format(new Date(ms));

// adopted.json and stats.json: adoption events since January (or last month, in January) plus every animal
// record, slimmed to the few fields used, to look up who was adopted.
async function buildAdoptions(env) {
  const tz = cfg(env, "SHELTER_TIMEZONE"), days = parseInt(cfg(env, "ADOPTED_DAYS"), 10) || 60;
  const nowMs = Date.now(), now = tzParts(nowMs, tz);
  const thisMonth = tzMidnight(now.year, now.month, 1, tz), lastMonth = tzMidnight(now.year, now.month - 1, 1, tz), thisYear = tzMidnight(now.year, 1, 1, tz);
  const since = Math.floor(Math.min(lastMonth, thisYear, nowMs - days * 86400000) / 1000);

  const events = await getAll(env, "events", "events", { since }, (e) => (e.Type === "Outcome.Adoption" ? e : null));
  const adoptions = [];
  for (const e of events) {
    if (!e) continue;
    for (const r of e.AssociatedRecords || []) if (r.Type === "Animal") adoptions.push([parseInt(e.Time || 0, 10), r.Id]);
  }
  const all = new Map();
  (await getAll(env, "animals", "animals", {}, (a) => ({
    iid: a["Internal-ID"], ID: a.ID, Name: a.Name, Type: a.Type, Sex: a.Sex, Age: a.Age, Breed: a.Breed, Status: a.Status,
    photo: a.CoverPhoto || (a.Photos || [])[0] || null,
  }))).forEach((a) => all.set(a.iid, a));

  // Recently adopted: newest first, dropping any since returned (status no longer "Healthy In Home").
  const cutoff = Math.floor(nowMs / 1000) - days * 86400, adoptedAt = new Map();
  for (const [t, iid] of adoptions) if (t >= cutoff) adoptedAt.set(iid, Math.max(t, adoptedAt.get(iid) || 0));
  const adopted = [...adoptedAt.entries()].sort((x, y) => y[1] - x[1])
    .map(([iid, t]) => [all.get(iid), t]).filter(([a]) => a && a.Status === ADOPTED_STATUS)
    .map(([a, t]) => ({ id: a.ID, name: (a.Name || "").trim(), type: a.Type, sex: a.Sex, ageMonths: a.Age, breed: prettyBreed(a.Breed), photo: a.photo, adoptedDate: tzDate(t * 1000, tz) }));

  // Adoption counts (including any later returned), split into dogs, cats and other species.
  const count = (label, start, end) => {
    const types = adoptions.filter(([t]) => start / 1000 <= t && t < end / 1000).map(([, iid]) => (all.get(iid) || {}).Type);
    const dogs = types.filter((x) => x === "Dog").length, cats = types.filter((x) => x === "Cat").length;
    return { label, count: types.length, dogs, cats, other: types.length - dogs - cats };
  };
  return {
    adopted: listFile(adopted),
    stats: {
      updated: isoNow(),
      thisMonth: count(monthName(thisMonth + 86400000, tz), thisMonth, nowMs),
      lastMonth: count(monthName(lastMonth + 86400000, tz), lastMonth, thisMonth),
      thisYear: count(String(now.year), thisYear, nowMs),
    },
  };
}

// ---------- website events (Squarespace /events?format=json) ----------
function htmlToText(s) {
  s = (s || "").replace(/<br\s*\/?>|<\/p>/gi, "\n").replace(/<[^>]+>/g, "");
  s = s.replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&#8217;/g, "'")
    .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n)).replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)));
  return s.replace(/\n{3,}/g, "\n\n").replace(/[ \t]+/g, " ").trim();
}
async function buildEvents(env) {
  const url = cfg(env, "EVENTS_URL"), site = url.replace(/^(https?:\/\/[^/]+).*$/, "$1");
  const resp = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (Redemption Rescue field guide)" } });
  if (!resp.ok) throw new Error(`events feed: HTTP ${resp.status}`);
  const data = await resp.json(), nowMs = Date.now();
  // Events move to "past" once they start, so look in both for ones that haven't ended.
  const events = [...(data.upcoming || []), ...(data.past || [])]
    .filter((i) => i.startDate && (i.endDate || i.startDate) > nowMs)
    .map((i) => {
      const loc = i.location || {};
      return {
        id: i.id, title: (i.title || "").trim(), start: i.startDate, end: i.endDate,
        venue: (loc.addressTitle || "").trim(),
        address: [loc.addressLine1, loc.addressLine2].filter((x) => x && x.trim()).join(", ").trim(),
        url: i.fullUrl ? site + i.fullUrl : "",
        image: i.assetUrl ? i.assetUrl + "?format=750w" : "",
        excerpt: htmlToText(i.excerpt),
      };
    })
    .sort((x, y) => x.start - y.start);
  return { events: { updated: isoNow(), events } };
}

// ---------- caching + serving ----------
const GROUPS = {
  custody: { files: ["animals", "coming-soon", "unavailable", "fosters"], build: buildCustody },
  adoptions: { files: ["adopted", "stats"], build: buildAdoptions },
  events: { files: ["events"], build: buildEvents },
  wishlist: { files: ["wishlist"], build: async () => ({ wishlist: await fetchWishlist() }) },
};
const FILE_GROUP = {};
for (const [g, def] of Object.entries(GROUPS)) for (const f of def.files) FILE_GROUP[f] = g;

// KV when bound (survives everywhere), else this data centre's cache.
const store = {
  async get(env, key) {
    if (env.DATA) return env.DATA.get(key, "json");
    const r = await caches.default.match(`https://cache.internal/${key}`);
    return r ? r.json() : null;
  },
  async put(env, key, value) {
    if (env.DATA) return env.DATA.put(key, JSON.stringify(value));
    await caches.default.put(`https://cache.internal/${key}`, new Response(JSON.stringify(value), { headers: { "Cache-Control": "max-age=604800" } }));
  },
};

async function refresh(env, group) {
  const files = await GROUPS[group].build(env);
  const entry = { t: Date.now(), files };
  await store.put(env, "group:" + group, entry);
  return entry;
}

const refreshing = {};
export async function serveFile(context, file) {
  const { env } = context, group = FILE_GROUP[file];
  let entry = await store.get(env, "group:" + group).catch(() => null);
  const stale = !entry || Date.now() - entry.t > MAX_AGE[group] * 1000;
  if (!entry) {
    try { entry = await refresh(env, group); }
    catch (e) { return new Response(JSON.stringify({ error: "Data temporarily unavailable" }), { status: 503, headers: headers(60) }); }
  } else if (stale && !refreshing[group]) {
    // Serve what we have now; refresh for the next visitor. A failed refresh keeps the old copy.
    refreshing[group] = context.waitUntil
      ? (context.waitUntil(refresh(env, group).catch((e) => console.log("refresh failed", group, e.message)).finally(() => { delete refreshing[group]; })), true)
      : false;
  }
  return new Response(JSON.stringify(entry.files[file], null, 1), { headers: headers(300) });
}

function headers(maxAge) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": `public, max-age=${maxAge}`,
  };
}
