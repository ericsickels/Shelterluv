# Shelterluv → Squarespace adoptable animals

Shows the shelter's adoptable animals on our Squarespace site using the Shelterluv
API instead of the Shelterluv iFrame.

```
Shelterluv API ──(API key, secret)──▶ GitHub Action (every 30 min)
                                        │ keeps only public statuses + public fields
                                        ▼
                         GitHub Pages: …/animals.json (public, no private data)
                                        │
                                        ▼
                         Squarespace Code Block renders cards + detail pop-up
```

The API key lives only in GitHub's encrypted secrets. Visitors only ever see
`animals.json`, which contains no foster/adopter info, microchips or internal notes.

## Files

| File | Purpose |
|---|---|
| `scripts/export_animals.py` | Fetches in-custody animals, filters by status, writes sanitized JSON. No dependencies. |
| `.github/workflows/export-animals.yml` | Runs the export every 30 minutes and publishes it to GitHub Pages. |
| `squarespace/adopt-code-block.html` | Paste into a Squarespace Code Block. |

## One-time setup

### GitHub
1. **Pages availability:** GitHub Pages on a *private* repo requires a paid plan (GitHub Pro).
   Either upgrade, or make this repo public — it contains no secrets; the key is stored separately.
2. **Settings → Secrets and variables → Actions → New repository secret:**
   `SHELTERLUV_API_KEY` = your Shelterluv API key.
3. *(Optional)* **Variables** tab: `PUBLISH_STATUSES` = comma-separated Shelterluv statuses to
   show. Default: `Available - Public,Available - Social Only,Available - Fospice,Hold - Applications Pending`.
4. **Settings → Pages → Source:** choose **GitHub Actions**.
5. Merge to `main`, then **Actions → Export adoptable animals → Run workflow**.
   The JSON appears at `https://ericsickels.github.io/Shelterluv/animals.json`.

### Squarespace (Core plan or higher — needed for JavaScript in Code Blocks)
1. Edit your Adopt page → add a **Code Block** → set it to HTML, *Display Source* off.
2. Paste the full contents of `squarespace/adopt-code-block.html` and save.
3. Check the two settings at the top of the `<script>`:
   - `DATA_URL` — the GitHub Pages URL above.
   - `APPLY_URL` — where "Apply to adopt" links; `{id}` becomes the Shelterluv animal ID.
     Currently `https://new.shelterluv.com/matchme/adopt/RES-A-{id}` (Shelterluv's hosted adoption application, opens in a new tab).

Code Blocks don't run scripts in the Squarespace editor preview; view the live page (or
preview in a logged-out window) to see the animals.

## Day to day

- Nothing to do: change an animal's status in Shelterluv and the site updates within ~30–40 minutes.
- Need it now? Run the workflow manually from the Actions tab.
- Individual animals can be linked directly: `yoursite.org/adopt#animal-9608`.
- GitHub pauses scheduled workflows after 60 days with no commits to the repo. If that
  happens you'll get an email; click **Enable workflow** in the Actions tab.

## Run locally

```sh
SHELTERLUV_API_KEY=... python3 scripts/export_animals.py public/animals.json
```
