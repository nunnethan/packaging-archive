// Writes essays.json, the short list of essays the Collection page reads.
// Run with: node scripts/build-index.mjs
import { writeFileSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { ROOT, loadEssays, essayIndexJson } from "../lib/archive.mjs"

const out = join(ROOT, "essays.json")
const next = essayIndexJson(loadEssays())
const prev = existsSync(out) ? readFileSync(out, "utf8") : ""
if (next !== prev) {
    writeFileSync(out, next)
    console.log("Updated essays.json")
} else {
    console.log("essays.json is up to date")
}
