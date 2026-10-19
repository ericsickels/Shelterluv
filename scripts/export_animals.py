#!/usr/bin/env python3
"""Export animals from Shelterluv to public, sanitized JSON files.

Writes two files into the output directory:
  animals.json  - animals in custody whose status is in PUBLISH_STATUSES
  coming-soon.json - animals in custody whose status is in COMING_SOON_STATUSES
  adopted.json  - animals with an adoption outcome in the last ADOPTED_DAYS days
                  that are still "Healthy In Home" (i.e. not returned)
  stats.json    - number of adoptions this month, last month and this year, by dogs/cats

Only a whitelist of public fields is written. Nothing about people (fosters,
adopters), microchips or internal attributes is ever written out.

Usage:
    SHELTERLUV_API_KEY=... python3 scripts/export_animals.py public
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from zoneinfo import ZoneInfo

API_URL = "https://new.shelterluv.com/api/v1/"
PAGE_SIZE = 100
DEFAULT_STATUSES = "Available - Public,Available - Social Only,Available - Fospice,Hold - Applications Pending,Hold - Pending Adoption"
DEFAULT_COMING_SOON_STATUSES = "Unavailable - Intake / Assessment"
DEFAULT_ADOPTED_DAYS = 60
ADOPTED_STATUS = "Healthy In Home"
# Adoption dates are shown in the shelter's local time zone, not UTC.
DEFAULT_TIMEZONE = "America/New_York"


def get(api_key, path, params=None):
    url = API_URL + path + ("?" + urllib.parse.urlencode(params) if params else "")
    req = urllib.request.Request(url)
    if api_key:
        req.add_header("X-Api-Key", api_key)
    with urllib.request.urlopen(req, timeout=30) as resp:
        data = json.load(resp)
    if data.get("success", 1) != 1:
        raise RuntimeError(f"Shelterluv API returned an error for {path}: {data}")
    return data


def get_all(api_key, path, key, params):
    items, offset = [], 0
    while True:
        page = get(api_key, path, dict(params, limit=PAGE_SIZE, offset=offset))
        items.extend(page.get(key, []))
        if not page.get("has_more"):
            return items
        offset += PAGE_SIZE
        time.sleep(0.5)


def fetch_in_custody(api_key):
    return get_all(api_key, "animals", "animals", {"status_type": "in custody"})


def fetch_all_animals(api_key):
    """Every animal record, keyed by Internal-ID (used to look up adopted animals)."""
    return {a["Internal-ID"]: a for a in get_all(api_key, "animals", "animals", {})}


def fetch_adoptions(api_key, since):
    """(time, animal internal ID) for every Outcome.Adoption event since `since`."""
    adoptions = []
    for event in get_all(api_key, "events", "events", {"since": since}):
        if event.get("Type") != "Outcome.Adoption":
            continue
        for record in event.get("AssociatedRecords") or []:
            if record.get("Type") == "Animal":
                adoptions.append((int(event.get("Time") or 0), record["Id"]))
    return adoptions


def recently_adopted(all_animals, adoptions, days):
    """Animals adopted in the last `days` days, newest first, each paired with its
    adoption time. Returned animals are dropped by status."""
    since = int(time.time()) - days * 86400
    adopted_at = {}
    for t, internal_id in adoptions:
        if t >= since:
            adopted_at[internal_id] = max(t, adopted_at.get(internal_id, 0))

    results = []
    for internal_id, t in sorted(adopted_at.items(), key=lambda kv: -kv[1]):
        animal = all_animals.get(internal_id)
        if animal and animal.get("Status") == ADOPTED_STATUS:
            results.append((animal, t))
    return results


def month_start(year, month, tz):
    while month < 1:
        year, month = year - 1, month + 12
    return datetime(year, month, 1, tzinfo=tz)


def adoption_stats(adoptions, all_animals, now):
    """Counts of adoption outcomes (including any later returned) in the shelter's time zone,
    split into dogs, cats and other species."""
    this_month = month_start(now.year, now.month, tz=now.tzinfo)
    last_month = month_start(now.year, now.month - 1, tz=now.tzinfo)
    this_year = datetime(now.year, 1, 1, tzinfo=now.tzinfo)

    def count(label, start, end):
        types = [
            (all_animals.get(internal_id) or {}).get("Type")
            for t, internal_id in adoptions
            if start.timestamp() <= t < end.timestamp()
        ]
        dogs, cats = types.count("Dog"), types.count("Cat")
        return {"label": label, "count": len(types), "dogs": dogs, "cats": cats,
                "other": len(types) - dogs - cats}

    return {
        "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "thisMonth": count(this_month.strftime("%B"), this_month, now),
        "lastMonth": count(last_month.strftime("%B"), last_month, this_month),
        "thisYear": count(str(now.year), this_year, now),
    }


def pretty_breed(breed):
    """Shelterluv lists some breeds surname-first ("Terrier, Rat"); show "Rat Terrier"."""
    breed = (breed or "").strip()
    parts = breed.split(",")
    if len(parts) == 2 and not any(c in breed for c in "/()"):
        return f"{parts[1].strip()} {parts[0].strip()}"
    return breed


def to_public(animal):
    fee = animal.get("AdoptionFeeGroup") or {}
    photos = animal.get("Photos") or []
    cover = animal.get("CoverPhoto")
    if cover and cover not in photos:
        photos = [cover] + photos
    return {
        "id": animal.get("ID"),
        "name": (animal.get("Name") or "").strip(),
        "type": animal.get("Type"),
        "status": animal.get("Status"),
        "breed": pretty_breed(animal.get("Breed")),
        "sex": animal.get("Sex"),
        "ageMonths": animal.get("Age"),
        "size": animal.get("Size") or None,
        "color": animal.get("Color"),
        "pattern": animal.get("Pattern"),
        "weightLbs": animal.get("CurrentWeightPounds") or None,
        "altered": animal.get("Altered"),
        "adoptionFee": fee.get("Price"),
        "photos": photos,
        "videos": animal.get("Videos") or [],
        "description": animal.get("Description") or "",
        "attributes": [
            a["AttributeName"]
            for a in animal.get("Attributes") or []
            if a.get("Publish") == "Yes" and a.get("AttributeName")
        ],
    }


def to_public_adopted(animal, adopted_time, tz):
    # Deliberately minimal: what the "Recently Adopted" cards show, nothing more.
    return {
        "id": animal.get("ID"),
        "name": (animal.get("Name") or "").strip(),
        "type": animal.get("Type"),
        "sex": animal.get("Sex"),
        "ageMonths": animal.get("Age"),
        "breed": pretty_breed(animal.get("Breed")),
        "photo": animal.get("CoverPhoto") or ((animal.get("Photos") or [None])[0]),
        "adoptedDate": datetime.fromtimestamp(adopted_time, tz).date().isoformat(),
    }


def write_json(path, animals):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "updated": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                "count": len(animals),
                "animals": animals,
            },
            f,
            ensure_ascii=False,
            indent=1,
        )


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "public"
    api_key = os.environ.get("SHELTERLUV_API_KEY", "")
    def status_set(var, default):
        return {s.strip() for s in (os.environ.get(var) or default).split(",") if s.strip()}

    statuses = status_set("PUBLISH_STATUSES", DEFAULT_STATUSES)
    coming_statuses = status_set("COMING_SOON_STATUSES", DEFAULT_COMING_SOON_STATUSES)

    in_custody = fetch_in_custody(api_key)

    def listing(wanted):
        found = [to_public(a) for a in in_custody if a.get("Status") in wanted]
        return sorted(found, key=lambda a: (a["type"] or "", a["name"].lower()))

    animals = listing(statuses)
    coming_soon = listing(coming_statuses)

    days = int(os.environ.get("ADOPTED_DAYS") or DEFAULT_ADOPTED_DAYS)
    tz = ZoneInfo(os.environ.get("SHELTER_TIMEZONE") or DEFAULT_TIMEZONE)
    now = datetime.now(tz)
    # One events fetch covers both the stats (back to January, or to last month in
    # January) and the Recently Adopted window.
    since = min(
        month_start(now.year, now.month - 1, tz).timestamp(),
        datetime(now.year, 1, 1, tzinfo=tz).timestamp(),
        time.time() - days * 86400,
    )
    adoptions = fetch_adoptions(api_key, int(since))
    all_animals = fetch_all_animals(api_key)
    adopted = [to_public_adopted(a, t, tz) for a, t in recently_adopted(all_animals, adoptions, days)]
    stats = adoption_stats(adoptions, all_animals, now)

    os.makedirs(out_dir, exist_ok=True)
    write_json(os.path.join(out_dir, "animals.json"), animals)
    write_json(os.path.join(out_dir, "coming-soon.json"), coming_soon)
    write_json(os.path.join(out_dir, "adopted.json"), adopted)
    with open(os.path.join(out_dir, "stats.json"), "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=1)
    print(f"Wrote {len(animals)} animals ({', '.join(sorted(statuses))}) to animals.json")
    print(f"Wrote {len(coming_soon)} animals ({', '.join(sorted(coming_statuses))}) to coming-soon.json")
    print(f"Wrote {len(adopted)} animals adopted in the last {days} days to adopted.json")
    print(
        "Wrote adoption counts to stats.json: "
        + ", ".join(
            f"{v['label']} = {v['count']} ({v['dogs']} dogs, {v['cats']} cats)"
            for k, v in stats.items() if k != "updated"
        )
    )


if __name__ == "__main__":
    main()
