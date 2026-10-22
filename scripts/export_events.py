#!/usr/bin/env python3
"""Export upcoming events from our Squarespace Events page for the volunteer field guide.

Reads the page's built-in JSON feed (EVENTS_URL) and writes events.json into the output
directory: events that haven't ended yet (including ones happening right now), soonest first,
with only the fields the field guide shows. No dependencies.

Usage:
    python3 scripts/export_events.py public
"""

import html
import json
import os
import re
import sys
import time
import urllib.request

EVENTS_URL = os.environ.get("EVENTS_URL") or "https://www.redemptionrescueinc.com/events?format=json"
SITE_URL = re.sub(r"^(https?://[^/]+).*$", r"\1", EVENTS_URL)


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Redemption Rescue field guide)"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def text(s):
    """HTML excerpt -> plain text."""
    s = re.sub(r"<br\s*/?>|</p>", "\n", s or "")
    s = html.unescape(re.sub(r"<[^>]+>", "", s))
    return re.sub(r"[ \t]+", " ", re.sub(r"\n{3,}", "\n\n", s)).strip()


def to_public(item):
    loc = item.get("location") or {}
    address = ", ".join(x for x in (loc.get("addressLine1"), loc.get("addressLine2")) if x and x.strip())
    image = item.get("assetUrl") or ""
    return {
        "id": item.get("id"),
        "title": (item.get("title") or "").strip(),
        "start": item.get("startDate"),  # milliseconds since 1970 (UTC)
        "end": item.get("endDate"),
        "venue": (loc.get("addressTitle") or "").strip(),
        "address": address.strip(),
        "url": SITE_URL + item["fullUrl"] if item.get("fullUrl") else "",
        "image": image + "?format=750w" if image else "",
        "excerpt": text(item.get("excerpt")),
    }


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "public"
    data = fetch(EVENTS_URL)
    now_ms = time.time() * 1000
    # Events move to "past" once they start, so look in both for ones that haven't ended.
    items = (data.get("upcoming") or []) + (data.get("past") or [])
    events = [to_public(i) for i in items if i.get("startDate") and (i.get("endDate") or i["startDate"]) > now_ms]
    events.sort(key=lambda e: e["start"])
    os.makedirs(out_dir, exist_ok=True)
    with open(os.path.join(out_dir, "events.json"), "w", encoding="utf-8") as f:
        json.dump({"updated": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "events": events}, f, ensure_ascii=False, indent=1)
    print("Wrote %d upcoming events to events.json" % len(events))


if __name__ == "__main__":
    main()
