# Packaging archive

Items from Ethan Nunn’s archive of printed fast-food packaging, their photographs, and short essays about them. The [Collection page](https://www.typen.me/collection) and the “From the collection” section on [typen.me](https://www.typen.me) read everything from this repository, so anything changed here appears on the site without opening Framer.

## What’s here

- `items.json`: the items and their details.
- `images/`: two WebP images for each item, 1,200px and 600px on the longest edge.
- `essays/`: one Markdown file per essay. `essays.json` is a short index of them, built automatically.
- `editor/` and `scripts/editor.mjs`: a local editor for the essays (`npm run editor`).
- `scripts/validate.mjs`: checks `items.json` and the essays for mistakes.
- `scripts/add-image.sh`: makes the two web images from an original photo.
- `scripts/sync-framer.mjs`: copies everything into the Framer CMS, which gives each object and essay its own page.
- `framer/`: the Framer code components, for reference (CollectionRegister, ObjectDetail, EssayBody).

## items.json

```json
{
  "archive_size": 2000,
  "items": [
    {
      "catalogue_no": "MCDPKG0747",
      "name": "Large fry box",
      "brand": "McDonald’s",
      "type": "Fry box",
      "country": "UK",
      "year": "1991",
      "edition": "",
      "observation": "",
      "image": "images/MCDPKG0747-1200.webp",
      "image_small": "images/MCDPKG0747-600.webp"
    }
  ]
}
```

| Field | Shown as | Notes |
|---|---|---|
| `archive_size` | “One of more than 2,000 items…” | The size of the whole archive, not the number of items in this file. |
| `catalogue_no` | MCDPKG0747 | Required. Must be unique. |
| `name` | Large fry box | Required. Sentence case for generic objects; McDonald’s product names keep their own capitals (Big Mac, Filet-O-Fish). |
| `type` | Fry box · UK · 1991 | Required. |
| `country` | | Required. Write “Hong Kong”, not “China – Hong Kong”. |
| `year` | | Leave as `""` to show “undated”. “c. 1990” is fine. |
| `edition` | *Euro 96 edition* | Optional, shown in italics. Editions and promotions only, not condition notes. |
| `brand` | | Optional. McDonald’s for everything so far. |
| `material`, `dimensions` | | Optional text, as you’d write it: “Printed paperboard”, “140 × 95 × 60 mm”. Shown on the object’s page. |
| `acquired` | | Optional. When you got it: `2024-05-17`, `2024-05` or `2024`. |
| `tags` | | Optional list: `["football", "promotion"]`. |
| `alt` | | Optional alt text. Without it, the site uses “name, type · country · year”. |
| `observation` | | Optional. A design observation, shown as notes on the object’s page. |
| `image`, `image_small` | | Required. Paths to the two WebP files. |

Use curly quotes and apostrophes (‘ ’ “ ”), and British spelling.

## Adding an item

1. Make the images (needs `cwebp`: `brew install webp`):
   ```sh
   scripts/add-image.sh ~/path/to/original.jpg MCDPKG0123
   ```
2. Add an entry to `items` in `items.json`.
3. Check it: `node scripts/validate.mjs`
4. Commit and push to `main`.

You can also edit `items.json` straight on GitHub. Uploading images through GitHub’s web page works too, as long as you make the two WebP files first.

## Essays

The easiest way to write is the local editor:

```sh
npm install      # once
npm run editor   # then open http://localhost:4321
```

It shows a live preview in the site’s typography, lets you pick objects to link or show as cards, adds notes, converts a cover image, and **Publish to the site** commits and pushes your changes. You can also edit the files in `essays/` directly or on GitHub; the format is described at the top of `lib/essay.mjs`.

- `draft: true` keeps an essay off the site. Drafts are still public in this repository. To preview drafts on the live Collection page, add `?drafts` to its address.
- `[[MCDPKG0747]]` on its own line shows an object card; inside a sentence it links to the object.
- `[^1]` marks a note and `[^1]: The note.` writes it. Notes sit in the margin on wide screens and at the end on phones.
- An essay appears in the Collection grid beside the first of its objects, and on each object’s page.

## How changes reach the site

The site loads `items.json` and the images through [jsDelivr](https://www.jsdelivr.com), a free CDN for public GitHub repositories:

```
https://cdn.jsdelivr.net/gh/nunnethan/packaging-archive@main/items.json
```

jsDelivr caches files from a branch for up to 12 hours. After each push, the **Check and publish** GitHub Action rebuilds `essays.json`, validates everything and clears jsDelivr’s cache for the files that changed, so edits usually appear within a few minutes.

Object and essay pages live in the Framer CMS (the Objects and Essays collections). The same Action copies the repository into them and publishes typen.me when something changed. Don’t edit those collections in Framer: the next sync overwrites them. The Action needs a Framer API key, stored once as a repository secret:

1. In Framer, open Site settings › API Keys and create a key.
2. Run `gh secret set FRAMER_API_KEY -R nunnethan/packaging-archive` and paste the key.

Without the key, the Collection grid still updates, but object and essay pages don’t. You can also sync by hand: `FRAMER_API_KEY=… npm run sync -- --publish`. Publishing puts any other unpublished Framer changes live too. If the check fails (look for a red cross on the commit), fix the problem and push again; the site keeps showing what it last loaded successfully until the cache is cleared.

If `items.json` can’t be loaded at all, the site shows the empty mat with no item, rather than an error.

The site checks for a new `items.json` on every visit, but browsers keep images for up to a week. **To replace an image, give the new file a new name** (for example `images/MCDPKG0123-v2-1200.webp`) and update `items.json` to point to it, instead of overwriting the old file.

## Rights

The photographs are Ethan Nunn’s. This repository is public so the site can load from it; that doesn’t grant permission to reuse the images.
