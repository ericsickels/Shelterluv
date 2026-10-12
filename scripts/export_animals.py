#!/usr/bin/env python3
"""Export animals from Shelterluv to public, sanitized JSON files.

Writes two files into the output directory:
  animals.json  - animals in custody whose status is in PUBLISH_STATUSES
  adopted.json  - animals with an adoption outcome in the last ADOPTED_DAYS days
                  that are still "Healthy In Home" (i.e. not returned)

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
DEFAULT_STATUSES = "Available - Public,Available - Social Only,Available - Fospice,Hold - Applications Pending"
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


def fetch_recently_adopted(api_key, days):
    """Animals with an Outcome.Adoption event in the last `days` days, newest first,
    each paired with its adoption time. Returned animals are dropped by status."""
    since = int(time.time()) - days * 86400
    adopted_at = {}
    for event in get_all(api_key, "events", "events", {"since": since}):
        if event.get("Type") != "Outcome.Adoption":
            continue
        for record in event.get("AssociatedRecords") or []:
            if record.get("Type") == "Animal":
                t = int(event.get("Time") or 0)
                adopted_at[record["Id"]] = max(t, adopted_at.get(record["Id"], 0))

    results = []
    for internal_id, t in sorted(adopted_at.items(), key=lambda kv: -kv[1]):
        animal = get(api_key, f"animals/{internal_id}")
        if animal.get("Status") == ADOPTED_STATUS:
            results.append((animal, t))
        time.sleep(0.2)
    return results


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
        "breed": animal.get("Breed"),
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
        "breed": animal.get("Breed"),
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
    statuses = {
        s.strip()
        for s in os.environ.get("PUBLISH_STATUSES", DEFAULT_STATUSES).split(",")
        if s.strip()
    }

    animals = [
        to_public(a) for a in fetch_in_custody(api_key) if a.get("Status") in statuses
    ]
    animals.sort(key=lambda a: (a["type"] or "", a["name"].lower()))

    days = int(os.environ.get("ADOPTED_DAYS") or DEFAULT_ADOPTED_DAYS)
    tz = ZoneInfo(os.environ.get("SHELTER_TIMEZONE") or DEFAULT_TIMEZONE)
    adopted = [to_public_adopted(a, t, tz) for a, t in fetch_recently_adopted(api_key, days)]

    os.makedirs(out_dir, exist_ok=True)
    write_json(os.path.join(out_dir, "animals.json"), animals)
    write_json(os.path.join(out_dir, "adopted.json"), adopted)
    print(f"Wrote {len(animals)} animals ({', '.join(sorted(statuses))}) to animals.json")
    print(f"Wrote {len(adopted)} animals adopted in the last {days} days to adopted.json")


if __name__ == "__main__":
    main()
