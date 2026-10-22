// A small local editor for the essays. Run `npm run editor` and open
// http://localhost:4321. It reads and writes the files in this repository and,
// when you choose Publish, commits and pushes them to GitHub. Nothing is
// reachable from other computers: it only listens on this Mac.
import { createServer } from "node:http"
import { readFileSync, writeFileSync, existsSync, unlinkSync, mkdirSync, statSync } from "node:fs"
import { join, extname, normalize } from "node:path"
import { execFile } from "node:child_process"
import { tmpdir } from "node:os"
import { ROOT, loadItems, loadEssays, essayIndexJson } from "../lib/archive.mjs"
import { parseEssay, serializeEssay } from "../lib/essay.mjs"

const PORT = Number(process.env.PORT) || 4321
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".webp": "image/webp", ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg" }
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

function run(cmd, args) {
    return new Promise((resolve) => {
        execFile(cmd, args, { cwd: ROOT, maxBuffer: 4 << 20 }, (error, stdout, stderr) => resolve({ ok: !error, out: `${stdout}${stderr}`.trim() }))
    })
}

function json(res, status, body) {
    res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" })
    res.end(JSON.stringify(body))
}

function readBody(req, limit = 30 << 20) {
    return new Promise((resolve, reject) => {
        let size = 0
        const chunks = []
        req.on("data", (c) => {
            size += c.length
            if (size > limit) reject(new Error("Too large"))
            else chunks.push(c)
        })
        req.on("end", () => {
            try {
                resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"))
            } catch (e) {
                reject(e)
            }
        })
    })
}

function rebuildIndex() {
    writeFileSync(join(ROOT, "essays.json"), essayIndexJson(loadEssays()))
}

function state() {
    const items = loadItems().items.map((i) => ({ catalogue_no: i.catalogue_no, name: i.name, type: i.type, country: i.country, year: i.year, edition: i.edition, image_small: i.image_small }))
    return { items, essays: loadEssays() }
}

async function handleApi(req, res, path) {
    if (path === "/api/state" && req.method === "GET") return json(res, 200, state())
    if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" })
    // A custom header that browsers won't send cross-site without permission,
    // so other websites can't post to this editor.
    if (req.headers["x-essay-editor"] !== "1") return json(res, 403, { error: "Forbidden" })
    const body = await readBody(req)

    if (path === "/api/save") {
        const meta = body.meta || {}
        const slug = String(meta.slug || "")
        if (!SLUG.test(slug)) return json(res, 400, { error: "The address must be lower-case words joined by hyphens, like seven-boxes-one-burger." })
        const file = join(ROOT, "essays", `${slug}.md`)
        if (body.originalSlug !== slug && existsSync(file)) return json(res, 400, { error: `There is already an essay called ${slug}.` })
        mkdirSync(join(ROOT, "essays"), { recursive: true })
        writeFileSync(file, serializeEssay({ ...meta, body: String(body.body || "") }))
        if (body.originalSlug && body.originalSlug !== slug && SLUG.test(body.originalSlug)) {
            const old = join(ROOT, "essays", `${body.originalSlug}.md`)
            if (existsSync(old)) unlinkSync(old)
        }
        rebuildIndex()
        const check = await run(process.execPath, ["scripts/validate.mjs"])
        return json(res, 200, { ok: true, essay: parseEssay(readFileSync(file, "utf8"), `${slug}.md`), check })
    }

    if (path === "/api/delete") {
        const slug = String(body.slug || "")
        if (!SLUG.test(slug)) return json(res, 400, { error: "Unknown essay." })
        const file = join(ROOT, "essays", `${slug}.md`)
        if (existsSync(file)) unlinkSync(file)
        rebuildIndex()
        return json(res, 200, { ok: true })
    }

    if (path === "/api/cover") {
        const slug = String(body.slug || "")
        const m = /^data:image\/(png|jpe?g|webp|heic|tiff?);base64,(.+)$/.exec(String(body.dataUrl || ""))
        if (!SLUG.test(slug) || !m) return json(res, 400, { error: "Choose a PNG, JPEG, WebP, HEIC or TIFF image, and save the essay first." })
        const src = join(tmpdir(), `essay-cover-${Date.now()}.${m[1]}`)
        writeFileSync(src, Buffer.from(m[2], "base64"))
        mkdirSync(join(ROOT, "images", "essays"), { recursive: true })
        const stamp = Date.now().toString(36)
        const out = {}
        for (const size of [1200, 600]) {
            const file = `images/essays/${slug}-${stamp}-${size}.webp`
            const r = await run("cwebp", ["-quiet", "-q", "80", "-metadata", "none", "-resize", String(size), "0", src, "-o", join(ROOT, file)])
            if (!r.ok) return json(res, 500, { error: "Couldn’t convert the image. Is cwebp installed? (brew install webp)", detail: r.out })
            out[size] = file
        }
        unlinkSync(src)
        return json(res, 200, { ok: true, cover: out[1200] })
    }

    if (path === "/api/status") {
        const r = await run("git", ["status", "--porcelain", "--", "essays", "essays.json", "images/essays", "items.json"])
        return json(res, 200, { changes: r.out ? r.out.split("\n") : [] })
    }

    if (path === "/api/publish") {
        rebuildIndex()
        const check = await run(process.execPath, ["scripts/validate.mjs"])
        if (!check.ok) return json(res, 400, { error: "Fix these problems first:", detail: check.out })
        const paths = ["essays", "essays.json", "images/essays"].filter((p) => existsSync(join(ROOT, p)))
        await run("git", ["add", "-A", "--", ...paths])
        const staged = await run("git", ["diff", "--cached", "--name-only"])
        if (!staged.out) return json(res, 200, { ok: true, message: "Nothing has changed since the last publish." })
        const message = String(body.message || "").trim() || "Update essays"
        const commit = await run("git", ["commit", "-m", message, "--", ...paths])
        if (!commit.ok) return json(res, 500, { error: "Couldn’t commit.", detail: commit.out })
        const pull = await run("git", ["pull", "--rebase", "--autostash"])
        if (!pull.ok) return json(res, 500, { error: "Couldn’t get the latest changes from GitHub. Your work is committed locally.", detail: pull.out })
        const push = await run("git", ["push"])
        if (!push.ok) return json(res, 500, { error: "Couldn’t push to GitHub. Your work is committed locally.", detail: push.out })
        return json(res, 200, { ok: true, message: "Pushed to GitHub. The site updates in a few minutes.", detail: `${commit.out}\n${push.out}` })
    }

    return json(res, 404, { error: "Not found" })
}

const STATIC = { "/": "editor/index.html", "/app.js": "editor/app.js", "/lib/essay.mjs": "lib/essay.mjs", "/lib/essay.css": "lib/essay.css" }

const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, "http://localhost")
        const path = decodeURIComponent(url.pathname)
        if (path.startsWith("/api/")) return await handleApi(req, res, path)
        let file = STATIC[path]
        if (!file && path.startsWith("/images/")) file = normalize(path.slice(1))
        if (!file || file.includes("..")) return json(res, 404, { error: "Not found" })
        const full = join(ROOT, file)
        if (!existsSync(full) || !statSync(full).isFile()) return json(res, 404, { error: "Not found" })
        res.writeHead(200, { "Content-Type": TYPES[extname(full)] || "application/octet-stream", "Cache-Control": "no-store" })
        res.end(readFileSync(full))
    } catch (e) {
        json(res, 500, { error: String(e?.message || e) })
    }
})

server.listen(PORT, "127.0.0.1", () => {
    console.log(`Essay editor: http://localhost:${PORT}  (Ctrl+C to stop)`)
})
