# Packaging archive

Items from Ethan Nunn’s archive of printed fast-food packaging, with their photographs. The “From the collection” section on [typen.me](https://www.typen.me) reads its items from this repository, so anything changed here appears on the site without opening Framer.

## What’s here

- `items.json`: the items and their details. The site picks one at random.
- `images/`: two WebP images for each item, 1,200px and 600px on the longest edge.
- `scripts/validate.mjs`: checks `items.json` for mistakes.
- `scripts/add-image.sh`: makes the two web images from an original photo.

## items.json

```json
{
  "archive_size": 2000,
  "items": [
    {
      "catalogue_no": "MCDPKG0747",
      "name": "Large fry box",
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
| `observation` | | Optional. A one-line design observation. |
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

## How changes reach the site

The site loads `items.json` and the images through [jsDelivr](https://www.jsdelivr.com), a free CDN for public GitHub repositories:

```
https://cdn.jsdelivr.net/gh/nunnethan/packaging-archive@main/items.json
```

jsDelivr caches files from a branch for up to 12 hours. After each push, the **Check and publish** GitHub Action validates `items.json` and clears jsDelivr’s cache for the files that changed, so edits usually appear within a few minutes. If the check fails (look for a red cross on the commit), fix `items.json` and push again; the site keeps showing what it last loaded successfully until the cache is cleared.

If `items.json` can’t be loaded at all, the site shows the empty mat with no item, rather than an error.

## Rights

The photographs are Ethan Nunn’s. This repository is public so the site can load from it; that doesn’t grant permission to reuse the images.
