# Shelterluv API Reference (v1)

Condensed from Shelterluv's API docs (OpenAPI 3.0.0, rendered with Scalar).

## Basics

- **Base URL:** `https://new.shelterluv.com`
- **Auth:** `Authorization: Bearer <API_KEY>` on every request. Keys are created in the Shelterluv configuration area. Never commit a key — read it from the `SHELTERLUV_API_KEY` environment variable.
- **Rate limit:** 300 requests per key per minute. Over the limit returns `429`; back off and/or cache.
- **Caching:** animal endpoints are served from a cache refreshed every 30 minutes (updates to existing animals may lag up to 30 min; brand-new animals appear immediately).
- **Access:** read-only. Only Animals endpoints are documented (a "Shelter" group appears in the docs navigation but contains no endpoints).

### Key terms

- **Internal-ID** — Shelterluv's internal unique identifier for a record. Not shown on profiles. Used in API paths.
- **Shelter prefix** — 3–4 letter code on user-facing IDs, e.g. for prefix `XYZ`: animal `XYZ-A-23`, person `XYZ-P-28`, transaction `XYZ-T-138`, username `xyz_jsmith`.

### Pagination

List endpoints are paginated with `limit` (1–100, default 100) and `offset` (default 0).
Page 2 at 50/page → `limit=50&offset=50`; page 3 → `offset=100`.
Responses carry `has_more` (bool) and `total_count` (int).

> ⚠️ The docs' example response for `GET /api/v1/animals` is a bare JSON array, yet the pagination section describes `has_more` / `total_count` fields. The real envelope is likely an object wrapping the array (e.g. `{ "animals": [...], "has_more": ..., "total_count": ... }`). Verify against a live response before relying on the shape; client code should handle both.

## Endpoints

### `GET /api/v1/animals` — Feed of all animals

Every animal ever intaked by the shelter (unless filtered).

| Query param   | Type    | Notes |
|---------------|---------|-------|
| `status_type` | enum    | `"in custody"` (current inventory) or `"publishable"` (status marked "publish" — typically, but not always, adoptable). |
| `sort`        | enum    | Only value: `updated_at`. Makes `since` compare against last-updated time instead of intake time. |
| `since`       | integer | Unix timestamp. Returns records with an intake after this time (or updated after, with `sort=updated_at`). |
| `limit`       | integer | 1–100, default 100. |
| `offset`      | integer | Default 0. |

Responses: `200` list of [Animal](#animal-model) · `401` unauthorized · `422` validation failed · `429` too many attempts.

```sh
curl 'https://new.shelterluv.com/api/v1/animals?status_type=publishable&limit=100&offset=0' \
  --header "Authorization: Bearer $SHELTERLUV_API_KEY"
```

### `GET /api/v1/animals/{id}` — Animal details

| Path param | Type    | Notes |
|------------|---------|-------|
| `id`       | integer | **Internal-ID** of the animal (required). |

Responses: `200` [Animal](#animal-model) · `401` · `404` not found · `429`.

```sh
curl https://new.shelterluv.com/api/v1/animals/1078738 \
  --header "Authorization: Bearer $SHELTERLUV_API_KEY"
```

## Animal model

| Field | Type | Description |
|-------|------|-------------|
| `Name` | string | Animal's name. |
| `ID` | string | User-facing animal ID (e.g. `381`). |
| `Internal-ID` | string | Shelterluv internal ID (use for `/animals/{id}`). |
| `LitterGroupId` | integer \| null | Same value ⇒ same litter. Null if not added as a litter. |
| `Type` | enum | `Dog`, `Cat`, `Bird`, `Rabbit`, `Equine`, `Barnyard`, `Small Mammal`, `Large Mammal`, `Exotic/Other`. |
| `CurrentLocation` | object | `{ "Tier1": ..., "Tier2": ..., ... }` — location and its parents. (Docs say "array of string" but example is an object.) |
| `Campus` | string \| null | Campus name, null if location has no campus. |
| `Sex` | enum | `Male`, `Female`, `Unknown`. |
| `Status` | string | Current Shelterluv status, e.g. `Available in foster`. |
| `InFoster` | boolean | Currently in a foster home. |
| `AssociatedPerson` | array | Foster parent(s): `FirstName`, `LastName`, `OutDateUnixTime`, `RelationshipType` (e.g. `foster`). |
| `CurrentWeightPounds` | string | Weight in lbs, up to 4 decimals (string!). |
| `Size` | string | Size group, e.g. `Medium (20-59)`. |
| `Altered` | enum | Spayed/neutered: `Yes`, `No`, `Unknown`. |
| `DOBUnixTime` | integer | Estimated date of birth (Unix). |
| `Age` | integer | Age in **months**. |
| `CoverPhoto` | string | Cover photo URL. |
| `Photos` | string[] | All published photo URLs. |
| `Videos` | object[][] | Published videos (array of arrays): `VideoId`, `EmbedUrl`, `YoutubeUrl`, `ThumbUrl`. |
| `Breed` | string | One or two breeds, e.g. `Chihuahua /Mix`. |
| `Color` | string | Primary / secondary color, e.g. `Black /White`. |
| `Pattern` | string | e.g. `Tabby`. |
| `AdoptionFeeGroup` | array | Present only if assigned: `Id`, `Name`, `Price`, `Discount`, `Tax`, `IsVariable`. |
| `Description` | string | Kennel card / website memo for adopters. |
| `PreviousIds` | array | `IdValue`, `IssuingShelter`, `Type` (e.g. `PetPoint`). |
| `Microchips` | array | `Id`, `Issuer`, `ImplantUnixTime`. |
| `LastIntakeUnixTime` | integer | Most recent intake (Unix). Useful for length-of-stay. |
| `Attributes` | array | `Internal-ID`, `AttributeName` (e.g. `Foster-to-Adopt`), `Publish` (`Yes`/`No`). |
| `LastUpdatedUnixTime` | integer | Last update (Unix). |

### Example

```json
{
  "Name": "Camelia",
  "ID": "381",
  "Internal-ID": "1078738",
  "LitterGroupId": 1078738,
  "Type": "Cat",
  "CurrentLocation": { "Tier1": "Feral Kitten Colony", "Tier2": "Feral Cat Colony" },
  "Campus": "Main Campus",
  "Sex": "Unknown",
  "Status": "Available in foster",
  "InFoster": true,
  "AssociatedPerson": [
    { "FirstName": "John", "LastName": "Doe", "OutDateUnixTime": 1672531199, "RelationshipType": "foster" }
  ],
  "CurrentWeightPounds": "4.4092",
  "Size": "Medium (20-59)",
  "Altered": "Unknown",
  "DOBUnixTime": 1672531199,
  "Age": 5,
  "CoverPhoto": "https://www.shelterluv.com/sites/default/files/default_images/default_dog.png",
  "Photos": ["https://www.shelterluv.com/sites/default/files/default_images/default_cat.png"],
  "Videos": [[{
    "VideoId": "dQw4w9WgXcQ",
    "EmbedUrl": "//www.youtube.com/embed/dQw4w9WgXcQ?rel=0&wmode=opaque&controls=1&showinfo=0&enablejsapi=1",
    "YoutubeUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    "ThumbUrl": "https://img.youtube.com/vi/dQw4w9WgXcQ/0.jpg"
  }]],
  "Breed": "Chihuahua /Mix",
  "Color": "Black /White",
  "Pattern": "Tabby",
  "AdoptionFeeGroup": [
    { "Id": "123", "Name": "Adult Cat", "Price": 100, "Discount": 10, "Tax": 0, "IsVariable": true }
  ],
  "Description": "This dog is incredibly sweet and loves to play with other dogs.",
  "PreviousIds": [{ "IdValue": "ABC123", "IssuingShelter": "Shelter Name", "Type": "PetPoint" }],
  "Microchips": [{ "Id": "12345", "Issuer": "24PetWatch", "ImplantUnixTime": 1672531199 }],
  "LastIntakeUnixTime": 1672531199,
  "Attributes": [{ "Internal-ID": "20182", "AttributeName": "Foster-to-Adopt", "Publish": "Yes" }],
  "LastUpdatedUnixTime": 1672531199
}
```
