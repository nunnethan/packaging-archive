// Checks items.json and the essays before they reach the website: valid JSON,
// required fields, unique catalogue numbers, an image file for every item, and
// essays that only refer to objects and notes that exist.
// Run with: node scripts/validate.mjs
import { readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { ROOT as root, loadEssays, essayIndexJson } from "../lib/archive.mjs"
import { renderEssay } from "../lib/essay.mjs"

const errors = []

let data
try {
    data = JSON.parse(readFileSync(join(root, "items.json"), "utf8"))
} catch (e) {
    console.error(`items.json is not valid JSON: ${e.message}`)
    process.exit(1)
}

if (!Number.isInteger(data.archive_size) || data.archive_size < 1) {
    errors.push("archive_size must be a whole number above 0")
}
if (!Array.isArray(data.items) || data.items.length === 0) {
    errors.push("items must be a list with at least one item")
}

const required = ["catalogue_no", "name", "type", "country", "image", "image_small"]
const text = ["catalogue_no", "name", "brand", "type", "country", "year", "edition", "material", "dimensions", "acquired", "alt", "observation", "image", "image_small"]
const seen = new Set()

for (const [i, item] of (data.items || []).entries()) {
    const at = `Item ${i + 1}${item?.catalogue_no ? ` (${item.catalogue_no})` : ""}`
    if (typeof item !== "object" || item === null) {
        errors.push(`${at}: must be an object`)
        continue
    }
    for (const key of text) {
        if (key in item && typeof item[key] !== "string") errors.push(`${at}: ${key} must be text`)
    }
    for (const key of required) {
        if (!item[key] || !String(item[key]).trim()) errors.push(`${at}: ${key} is missing`)
    }
    if (item.catalogue_no && !/^MCDPKG\d{4,}$/.test(item.catalogue_no)) {
        errors.push(`${at}: catalogue_no should look like MCDPKG0123`)
    }
    if (seen.has(item.catalogue_no)) errors.push(`${at}: catalogue_no is used more than once`)
    seen.add(item.catalogue_no)
    for (const key of ["image", "image_small"]) {
        if (item[key] && !existsSync(join(root, item[key]))) errors.push(`${at}: ${key} file not found: ${item[key]}`)
    }
    if ("tags" in item && (!Array.isArray(item.tags) || item.tags.some((t) => typeof t !== "string"))) errors.push(`${at}: tags must be a list of words, like ["football", "promotion"]`)
    if (item.acquired && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(item.acquired)) errors.push(`${at}: acquired should be a date like 2024-05-17, 2024-05 or 2024`)
    for (const key of ["name", "brand", "type", "country", "edition", "material", "dimensions", "alt", "observation"]) {
        if (typeof item[key] === "string" && item[key] !== item[key].trim()) errors.push(`${at}: ${key} has extra spaces`)
    }
}

// Essays
const objects = Object.fromEntries((data.items || []).map((i) => [i.catalogue_no, i]))
const slugs = new Set()
for (const essay of loadEssays()) {
    const at = `essays/${essay.slug}.md`
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(essay.slug)) errors.push(`${at}: the file name should be lower-case words joined by hyphens`)
    if (slugs.has(essay.slug)) errors.push(`${at}: another essay has the same file name`)
    slugs.add(essay.slug)
    if (!essay.title) errors.push(`${at}: title is missing`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(essay.date)) errors.push(`${at}: date should look like 2026-10-22`)
    if (!essay.standfirst) errors.push(`${at}: standfirst is missing`)
    for (const no of essay.objects) if (!objects[no]) errors.push(`${at}: objects lists ${no}, which isn’t in items.json`)
    const { missing, missingNotes, unusedNotes } = renderEssay(essay.body, { objects })
    for (const no of missing) errors.push(`${at}: [[${no}]] isn’t in items.json`)
    for (const id of missingNotes) errors.push(`${at}: note [^${id}] is used but never written`)
    for (const id of unusedNotes) errors.push(`${at}: note [^${id}] is written but never used`)
    if (essay.cover && !existsSync(join(root, essay.cover))) errors.push(`${at}: cover file not found: ${essay.cover}`)
    if (essay.cover && !essay.cover_alt) errors.push(`${at}: cover_alt is missing (describe the cover image)`)
    for (const m of essay.body.matchAll(/!\[[^\]]*\]\(([^)\s]+)/g)) {
        if (!/^https?:/.test(m[1]) && !existsSync(join(root, m[1]))) errors.push(`${at}: image not found: ${m[1]}`)
    }
}
const indexPath = join(root, "essays.json")
if (!existsSync(indexPath) || readFileSync(indexPath, "utf8") !== essayIndexJson(loadEssays())) {
    errors.push("essays.json is out of date: run node scripts/build-index.mjs")
}

if (errors.length) {
    console.error(`items.json has ${errors.length} problem${errors.length === 1 ? "" : "s"}:\n- ${errors.join("\n- ")}`)
    process.exit(1)
}
console.log(`Everything is valid: ${data.items.length} items, ${slugs.size} essays, archive size ${data.archive_size}.`)
