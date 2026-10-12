#!/usr/bin/env python3
"""Export adoptable animals from Shelterluv to a public, sanitized JSON file.

Reads SHELTERLUV_API_KEY from the environment, fetches every animal currently
in custody, keeps only those whose status is in PUBLISH_STATUSES, and writes a
whitelist of public fields. Nothing about people (fosters, adopters), microchips
or internal attributes is ever written out.

Usage:
    SHELTERLUV_API_KEY=... python3 scripts/export_animals.py public/animals.json
"""

import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

API_URL = "https://new.shelterluv.com/api/v1/animals"
PAGE_SIZE = 100
DEFAULT_STATUSES = "Available - Public,Available - Social Only,Available - Fospice,Hold - Applications Pending"


def fetch_in_custody(api_key):
    animals, offset = [], 0
    while True:
        query = urllib.parse.urlencode(
            {"status_type": "in custody", "limit": PAGE_SIZE, "offset": offset}
        )
        req = urllib.request.Request(f"{API_URL}?{query}")
        if api_key:
            req.add_header("X-Api-Key", api_key)
        with urllib.request.urlopen(req, timeout=30) as resp:
            page = json.load(resp)
        if page.get("success") != 1:
            raise RuntimeError(f"Shelterluv API returned an error: {page}")
        animals.extend(page.get("animals", []))
        if not page.get("has_more"):
            return animals
        offset += PAGE_SIZE
        time.sleep(0.5)


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


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else "public/animals.json"
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

    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
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
    print(f"Wrote {len(animals)} animals ({', '.join(sorted(statuses))}) to {out_path}")


if __name__ == "__main__":
    main()
