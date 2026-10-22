// Loads the archive from disk for the scripts (Node only).
import { readFileSync, readdirSync, existsSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { parseEssay, readingTime, referencedObjects } from "./essay.mjs"

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
export const REPO = "nunnethan/packaging-archive"
export const CDN = `https://cdn.jsdelivr.net/gh/${REPO}@main/`

export function loadItems(root = ROOT) {
    return JSON.parse(readFileSync(join(root, "items.json"), "utf8"))
}

export function loadEssays(root = ROOT) {
    const dir = join(root, "essays")
    if (!existsSync(dir)) return []
    return readdirSync(dir)
        .filter((f) => f.endsWith(".md"))
        .map((f) => parseEssay(readFileSync(join(dir, f), "utf8"), f))
}

// The short index of essays that the Collection page reads for its grid.
export function essayIndex(essays) {
    return essays
        .map((e) => ({
            slug: e.slug,
            title: e.title,
            date: e.date,
            standfirst: e.standfirst,
            objects: [...new Set([...e.objects, ...referencedObjects(e.body)])],
            tags: e.tags,
            reading_time: readingTime(e.body),
            cover: e.cover || "",
            draft: e.draft,
        }))
        .sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.title.localeCompare(b.title))
}

export function essayIndexJson(essays) {
    return JSON.stringify({ essays: essayIndex(essays) }, null, 2) + "\n"
}
