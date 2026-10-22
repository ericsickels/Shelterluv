# Shelterluv → Squarespace adoptable animals

Shows the shelter's adoptable animals on our Squarespace site using the Shelterluv
API instead of the Shelterluv iFrame.

```
Shelterluv API ──(API key, secret)──▶ GitHub Action (every 30 min)
                                        │ keeps only public statuses + public fields
                                        ▼
                         GitHub Pages: animals.json, coming-soon.json, adopted.json, stats.json (public, no private data)
                                       adopt.js, adopted.js, stats.js, spotlight.js, adopt.css (widgets, from web/)
                                        │
                                        ▼
                         Squarespace Code Blocks just load adopt.js / adopted.js / stats.js
```

The API key lives only in GitHub's encrypted secrets. Visitors only ever see
`animals.json`, which contains no foster/adopter info, microchips or internal notes.

## Files

| File | Purpose |
|---|---|
| `scripts/export_animals.py` | Writes `animals.json` (adoptable animals, filtered by status), `coming-soon.json` (Intake / Assessment animals), `unavailable.json` (Medical Recovery / Routine Vetting, for the field guide), `adopted.json` (adopted in the last 60 days and still "Healthy In Home") and `stats.json` (adoptions this month, last month and this year, split into dogs and cats). No dependencies. |
| `.github/workflows/export-animals.yml` | Every 30 minutes and on every merge to `main`: runs the export and publishes it with the widget to GitHub Pages. |
| `web/adopt.js` | Adoptable animals and Coming Soon: cards, filters and the detail pop-up (Coming Soon shows a note instead of the Apply button). Missing or broken photos show a dog/cat "Photo coming soon" placeholder. |
| `web/adopted.js` | Recently Adopted: non-clickable cards (name, sex, age, breed, photo, adoption date) with an "Adopted!" ribbon. |
| `web/stats.js` | Adoption counts: This Month / Last Month / This Year tiles with dog and cat counts, animated when scrolled into view. |
| `web/spotlight.js` | Homepage spotlight: "N dogs and N cats are looking for homes" count, then a rotating "Meet [name]" panel. Photo-only, Pending animals left out (still counted), longer stays weighted toward the front, pause button, no auto-motion for reduce-motion visitors. |
| `web/screen.html` | Full-screen digital sign for partner screens (e.g. a restaurant TV), 16:9 or 9:16. See below. |
| `web/fieldguide.html` | Volunteer field guide for events (phones), at `/fieldguide`. See below. |
| `scripts/make_icons.py` | Makes the field guide's home screen icons from our logo during each publish. |
| `web/qrcode.js` | QR code generator used by the sign ([qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 1.4.4, MIT). |
| `web/adopt.css` | Styles for all widgets. |
| `web/index.html` | Preview page: `https://animals.redemptionrescueinc.com/` shows the widget outside Squarespace. |
| `squarespace/adopt-code-block.html` | Two-line embed for the Adopt page, pasted into Squarespace once. |
| `squarespace/adopted-code-block.html` | Two-line embed for the Recently Adopted section, pasted once. |
| `squarespace/coming-soon-code-block.html` | Two-line embed for the Coming Soon section, pasted once. |
| `squarespace/spotlight-code-block.html` | Two-line embed for the homepage spotlight, pasted once below the hero. |
| `squarespace/stats-code-block.html` | Two-line embed for the adoption counts, pasted once above Recently Adopted. |

## One-time setup

### GitHub
1. **Pages availability:** GitHub Pages on a *private* repo requires a paid plan (GitHub Pro).
   Either upgrade, or make this repo public — it contains no secrets; the key is stored separately.
2. **Settings → Secrets and variables → Actions → New repository secret:**
   `SHELTERLUV_API_KEY` = your Shelterluv API key.
3. *(Optional)* **Variables** tab: `PUBLISH_STATUSES` = comma-separated Shelterluv statuses to
   show. Default: `Available - Public,Available - Social Only,Available - Fospice,Hold - Applications Pending,Hold - Pending Adoption`.
   `COMING_SOON_STATUSES` = statuses shown under Coming Soon. Default `Unavailable - Intake / Assessment`.
   `UNAVAILABLE_STATUSES` = statuses in the field guide's Currently Unavailable section. Default `Unavailable - Medical Recovery,Unavailable - Routine Vetting`.
   `ADOPTED_DAYS` = how far back Recently Adopted looks. Default `60`.
   `SHELTER_TIMEZONE` = time zone for adoption dates. Default `America/New_York`.
4. **Settings → Pages → Source:** choose **GitHub Actions**. **Custom domain:** `animals.redemptionrescueinc.com`
   (DNS: a `CNAME` record named `animals` pointing to `ericsickels.github.io`, in Squarespace → Domains → DNS),
   then tick **Enforce HTTPS**. Our own subdomain avoids work networks that block `*.github.io`.
5. Merge to `main`, then **Actions → Export adoptable animals → Run workflow**.
   The JSON appears at `https://animals.redemptionrescueinc.com/animals.json`.

### Squarespace (Core plan or higher — needed for JavaScript in Code Blocks)
1. Edit your Adopt page → add a **Code Block** → set it to HTML, *Display Source* off.
2. Paste the contents of `squarespace/adopt-code-block.html` and save. This is a one-time step:
   ```html
   <div id="slv-adopt"><p>Loading our animals&hellip; (fallback text, see the file)</p></div>
   <script src="https://animals.redemptionrescueinc.com/adopt.js" defer></script>
   ```
3. For Recently Adopted, add your own heading, then a Code Block below it with
   `squarespace/adopted-code-block.html`:
   ```html
   <div id="slv-adopted"><p>Loading our animals&hellip; (fallback text, see the file)</p></div>
   <script src="https://animals.redemptionrescueinc.com/adopted.js" defer></script>
   ```
4. For Coming Soon, add your own heading, then a Code Block below it with
   `squarespace/coming-soon-code-block.html`:
   ```html
   <div id="slv-coming-soon"><p>Loading our animals&hellip; (fallback text, see the file)</p></div>
   <script src="https://animals.redemptionrescueinc.com/adopt.js" defer></script>
   ```
5. For the adoption counts, add a Code Block above the Recently Adopted heading with
   `squarespace/stats-code-block.html`:
   ```html
   <div id="slv-stats"></div>
   <script src="https://animals.redemptionrescueinc.com/stats.js" defer></script>
   ```
   Counts are every adoption outcome in the period (in `SHELTER_TIMEZONE`), including any
   animal later returned, so they match Shelterluv's outcome reports.

6. For the homepage spotlight, add a Code Block in a section below the hero with
   `squarespace/spotlight-code-block.html`:
   ```html
   <div id="slv-spotlight"><p>Loading our animals&hellip; (fallback text, see the file)</p></div>
   <script src="https://animals.redemptionrescueinc.com/spotlight.js" defer></script>
   ```
   Settings at the top of `web/spotlight.js`: `SLIDE_MS` (time per animal), `STAY_WEIGHT` (how strongly
   longer stays come first; 0 = pure random), `SKIP_STATUSES` (kept out of the rotation), and the
   `ANIMAL_URL` / `ALL_URL` links.

Settings live at the top of `web/adopt.js`:
- `APPLY_URL`: where "Apply to adopt" links; `{id}` becomes the Shelterluv animal ID.
  Currently `https://new.shelterluv.com/matchme/adopt/RES-A-{id}` (Shelterluv's hosted adoption application, opens in a new tab).
- `STATUS_BADGES`: which statuses get a badge, and its wording.
- `PENDING_STATUSES`, `PENDING_RIBBON`, `PENDING_NOTICE`: Hold statuses that stay listed with an amber
  "Pending" ribbon and a note in the pop-up (ribbon colour: `--slv-pending` in `web/adopt.css`).
- `WIDGETS`: per-section wording, e.g. the Coming Soon badge, the note shown in its pop-up, and
  the title/text shown when a section has no animals (`emptyTitle`, `emptyText`).
  Recently Adopted's empty message is `EMPTY_TITLE` / `EMPTY_TEXT` at the top of `web/adopted.js`.

Button colour is `--slv-accent` at the top of `web/adopt.css`; the Adopted ribbon colour is
`--slv-adopted`, and its text is `RIBBON_TEXT` at the top of `web/adopted.js`.

Code Blocks don't run scripts in the Squarespace editor preview; view the live page (or
preview in a logged-out window) to see the animals.

## Digital sign (partner screens)

Open **https://animals.redemptionrescueinc.com/screen.html** full-screen on the screen's browser
or signage player. It needs no login and nothing on Squarespace.

- Rotates available animals (photo-only, Pending left out, longer stays shown more often), about 15s
  each, showing 3 of their photos at random (each wipes in over the last; no zooming). Shows name, sex/age/breed, one line from the bio, days
  waiting since their latest intake, and a QR code to that animal on our Adopt page.
- After every 5 animals: "Who we are" (mission + live counts), "How to adopt", or "Happy tails"
  (recent adoptions). A strip with our name and website is always on screen.
- Detects landscape/portrait and scales to the screen. Refreshes data every 30 minutes, keeps the
  last good data if the internet drops, and reloads itself around 4am.
- Address options: `?seconds=20` (time per animal), `?only=dogs` / `?only=cats`, `?qr=off`.
- Check it from a laptop with `?preview=1` (16:9 / 9:16 frame and buttons to jump to the info slides).
- Wording (mission line, logo, links, timings) is in the Configuration block at the top of the script
  in `web/screen.html`; the orange is `--brand` at the top of its styles.

## Volunteer field guide (events)

Open **https://animals.redemptionrescueinc.com/fieldguide** on a phone (add it to the home screen for
one-tap access). Not linked from the website.

- **Animals tab:** search, Dogs/Cats filter, and three sections: Available (Pending animals included,
  with an "Applications pending" / "Adoption pending" tag), Available soon (Intake / Assessment) and
  Currently unavailable (Medical Recovery, Routine Vetting; photos greyed out).
- Tap an animal for photos, facts, days with us and their full bio. Available and Pending animals get a
  **Show QR code** button: a full-screen white QR to their page on our site (with the Apply button),
  keeping the screen awake while it's shown. Other statuses explain why they aren't available yet.
- **QR codes tab:** Donate, Adoption application, Foster application, Facebook, Instagram. Set the links
  in `LINKS` at the top of the script in `web/fieldguide.html`; an empty link shows as "Link needed".
- **Add to Home Screen** (Share menu on iPhone, ⋮ menu on Android) gives an "RR Field Guide" icon
  with our logo. The publish run makes the icons from the logo on our website (`scripts/make_icons.py`);
  the name is in `web/fieldguide.webmanifest` and the `apple-mobile-web-app-title` tag in `web/fieldguide.html`.
- The phone's back button/gesture closes the QR, then the animal. The last data is saved on the phone,
  so the guide still works on weak event Wi-Fi (the header then says "Offline").

## Day to day

- Nothing to do: change an animal's status in Shelterluv and the site updates within ~30–40 minutes.
- Need it now? Run the workflow manually from the Actions tab.
- Changing the widget: edit `web/adopt.js` / `web/adopt.css` and merge to `main`. The site picks it
  up automatically, usually within ~10 minutes (browser cache), with no Squarespace changes.
  Check the preview page first if you like.
- Individual animals can be linked directly: `yoursite.org/adopt#animal-9608`.
- GitHub pauses scheduled workflows after 60 days with no commits to the repo. If that
  happens you'll get an email; click **Enable workflow** in the Actions tab.

## Run locally

```sh
SHELTERLUV_API_KEY=... python3 scripts/export_animals.py public   # writes animals.json, coming-soon.json, adopted.json, stats.json
```
