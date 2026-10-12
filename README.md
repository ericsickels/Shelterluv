# Shelterluv → Squarespace adoptable animals

Shows the shelter's adoptable animals on our Squarespace site using the Shelterluv
API instead of the Shelterluv iFrame.

```
Shelterluv API ──(API key, secret)──▶ GitHub Action (every 30 min)
                                        │ keeps only public statuses + public fields
                                        ▼
                         GitHub Pages: animals.json, adopted.json, stats.json (public, no private data)
                                       adopt.js, adopted.js, stats.js, adopt.css (widgets, from web/)
                                        │
                                        ▼
                         Squarespace Code Blocks just load adopt.js / adopted.js / stats.js
```

The API key lives only in GitHub's encrypted secrets. Visitors only ever see
`animals.json`, which contains no foster/adopter info, microchips or internal notes.

## Files

| File | Purpose |
|---|---|
| `scripts/export_animals.py` | Writes `animals.json` (adoptable animals, filtered by status), `adopted.json` (adopted in the last 60 days and still "Healthy In Home") and `stats.json` (adoptions this month, last month and this year, split into dogs and cats). No dependencies. |
| `.github/workflows/export-animals.yml` | Every 30 minutes and on every merge to `main`: runs the export and publishes it with the widget to GitHub Pages. |
| `web/adopt.js` | Adoptable animals: cards, filters and the detail pop-up. |
| `web/adopted.js` | Recently Adopted: non-clickable cards (name, sex, age, breed, photo, adoption date) with an "Adopted!" ribbon. |
| `web/stats.js` | Adoption counts: This Month / Last Month / This Year tiles with dog and cat counts, animated when scrolled into view. |
| `web/adopt.css` | Styles for all widgets. |
| `web/index.html` | Preview page: `https://ericsickels.github.io/Shelterluv/` shows the widget outside Squarespace. |
| `squarespace/adopt-code-block.html` | Two-line embed for the Adopt page, pasted into Squarespace once. |
| `squarespace/adopted-code-block.html` | Two-line embed for the Recently Adopted section, pasted once. |
| `squarespace/stats-code-block.html` | Two-line embed for the adoption counts, pasted once above Recently Adopted. |

## One-time setup

### GitHub
1. **Pages availability:** GitHub Pages on a *private* repo requires a paid plan (GitHub Pro).
   Either upgrade, or make this repo public — it contains no secrets; the key is stored separately.
2. **Settings → Secrets and variables → Actions → New repository secret:**
   `SHELTERLUV_API_KEY` = your Shelterluv API key.
3. *(Optional)* **Variables** tab: `PUBLISH_STATUSES` = comma-separated Shelterluv statuses to
   show. Default: `Available - Public,Available - Social Only,Available - Fospice,Hold - Applications Pending`.
   `ADOPTED_DAYS` = how far back Recently Adopted looks. Default `60`.
   `SHELTER_TIMEZONE` = time zone for adoption dates. Default `America/New_York`.
4. **Settings → Pages → Source:** choose **GitHub Actions**.
5. Merge to `main`, then **Actions → Export adoptable animals → Run workflow**.
   The JSON appears at `https://ericsickels.github.io/Shelterluv/animals.json`.

### Squarespace (Core plan or higher — needed for JavaScript in Code Blocks)
1. Edit your Adopt page → add a **Code Block** → set it to HTML, *Display Source* off.
2. Paste the contents of `squarespace/adopt-code-block.html` and save. This is a one-time step:
   ```html
   <div id="slv-adopt"></div>
   <script src="https://ericsickels.github.io/Shelterluv/adopt.js" defer></script>
   ```
3. For Recently Adopted, add your own heading, then a Code Block below it with
   `squarespace/adopted-code-block.html`:
   ```html
   <div id="slv-adopted"></div>
   <script src="https://ericsickels.github.io/Shelterluv/adopted.js" defer></script>
   ```
4. For the adoption counts, add a Code Block above the Recently Adopted heading with
   `squarespace/stats-code-block.html`:
   ```html
   <div id="slv-stats"></div>
   <script src="https://ericsickels.github.io/Shelterluv/stats.js" defer></script>
   ```
   Counts are every adoption outcome in the period (in `SHELTER_TIMEZONE`), including any
   animal later returned, so they match Shelterluv's outcome reports.

Settings live at the top of `web/adopt.js`:
- `APPLY_URL`: where "Apply to adopt" links; `{id}` becomes the Shelterluv animal ID.
  Currently `https://new.shelterluv.com/matchme/adopt/RES-A-{id}` (Shelterluv's hosted adoption application, opens in a new tab).
- `STATUS_BADGES`: which statuses get a badge, and its wording.

Button colour is `--slv-accent` at the top of `web/adopt.css`; the Adopted ribbon colour is
`--slv-adopted`, and its text is `RIBBON_TEXT` at the top of `web/adopted.js`.

Code Blocks don't run scripts in the Squarespace editor preview; view the live page (or
preview in a logged-out window) to see the animals.

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
SHELTERLUV_API_KEY=... python3 scripts/export_animals.py public   # writes public/animals.json + public/adopted.json
```
