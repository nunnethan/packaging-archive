// Checks items.json before it reaches the website: valid JSON, required fields,
// unique catalogue numbers and an image file for every item.
// Run with: node scripts/validate.mjs
import { readFileSync, existsSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = join(dirname(fileURLToPath(import.meta.url)), "..")
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
const text = ["catalogue_no", "name", "type", "country", "year", "edition", "observation", "image", "image_small"]
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
    for (const key of ["name", "type", "country", "edition", "observation"]) {
        if (typeof item[key] === "string" && item[key] !== item[key].trim()) errors.push(`${at}: ${key} has extra spaces`)
    }
}

if (errors.length) {
    console.error(`items.json has ${errors.length} problem${errors.length === 1 ? "" : "s"}:\n- ${errors.join("\n- ")}`)
    process.exit(1)
}
console.log(`items.json is valid: ${data.items.length} items, archive size ${data.archive_size}.`)
