import { renderEssay, readingTime, formatDate, escapeHtml, objectMeta } from "/lib/essay.mjs"

const $ = (id) => document.getElementById(id)
const els = Object.fromEntries(["list", "new", "publish", "changes", "status", "delete", "save", "form", "title", "slug", "date", "standfirst", "draft", "objectSearch", "objectResults", "objects", "tags", "coverImg", "coverFile", "coverAlt", "body", "preview"].map((id) => [id, $(id)]))

let items = []
let objects = {}
let essays = []
let current = null // { originalSlug, meta, body }
let dirty = false
let slugTouched = false
let pickMode = "related"
let selectionForPick = null

async function api(path, body) {
    const res = await fetch(path, body === undefined ? {} : { method: "POST", headers: { "Content-Type": "application/json", "X-Essay-Editor": "1" }, body: JSON.stringify(body) })
    const data = await res.json().catch(() => ({ error: `The editor returned ${res.status}.` }))
    if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong."), { detail: data.detail })
    return data
}

function status(text, kind = "") {
    els.status.textContent = text
    els.status.className = `status ${kind}`
}

function slugify(s) {
    return s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[’']/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60)
}

function today() {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

function renderList() {
    els.list.innerHTML = essays
        .map((e) => `<li><button type="button" data-slug="${escapeHtml(e.slug)}" aria-current="${current?.originalSlug === e.slug}"><span class="t">${escapeHtml(e.title || "Untitled")}${e.draft ? '<span class="badge">Draft</span>' : '<span class="badge live">On site</span>'}</span><span class="m">${escapeHtml(formatDate(e.date))} · ${readingTime(e.body)} min</span></button></li>`)
        .join("")
}

function readForm() {
    return {
        meta: {
            title: els.title.value.trim(),
            slug: els.slug.value.trim(),
            date: els.date.value,
            standfirst: els.standfirst.value.trim(),
            draft: els.draft.checked,
            objects: current.meta.objects,
            tags: els.tags.value.split(",").map((t) => t.trim()).filter(Boolean),
            cover: current.meta.cover || "",
            cover_alt: els.coverAlt.value.trim(),
        },
        body: els.body.value,
    }
}

function fill(essay, originalSlug) {
    current = { originalSlug, meta: { ...essay, objects: [...(essay.objects || [])], tags: [...(essay.tags || [])] }, body: essay.body || "" }
    els.title.value = essay.title || ""
    els.slug.value = essay.slug || ""
    els.date.value = essay.date || today()
    els.standfirst.value = essay.standfirst || ""
    els.draft.checked = !!essay.draft
    els.tags.value = (essay.tags || []).join(", ")
    els.coverAlt.value = essay.cover_alt || ""
    els.body.value = essay.body || ""
    els.coverImg.hidden = !essay.cover
    if (essay.cover) els.coverImg.src = "/" + essay.cover
    slugTouched = !!originalSlug
    dirty = false
    renderChips()
    renderList()
    preview()
}

function renderChips() {
    els.objects.innerHTML = current.meta.objects
        .map((no) => `<span class="chip">${escapeHtml(no)} ${escapeHtml(objects[no]?.name || "(not in items.json)")}<button type="button" data-remove="${escapeHtml(no)}" aria-label="Remove ${escapeHtml(no)}">×</button></span>`)
        .join("")
}

function preview() {
    const { meta, body } = readForm()
    const { html, missing, missingNotes, unusedNotes } = renderEssay(body, { objects, assetBase: "/", objectHref: (no) => `#${no}` })
    const problems = [
        ...missing.map((no) => `${no} isn’t in items.json.`),
        ...missingNotes.map((id) => `Note [^${id}] is used but never written.`),
        ...unusedNotes.map((id) => `Note [^${id}] is written but never used.`),
        ...(meta.cover && !meta.cover_alt ? ["The cover needs a description."] : []),
    ]
    const related = meta.objects.filter((no) => objects[no])
    els.preview.innerHTML = `
        ${problems.length ? `<ul class="problems">${problems.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>` : ""}
        <header class="e-col">
            <p class="e-kicker">Collection · Essay · ${escapeHtml(formatDate(meta.date))} · ${readingTime(body)} min read${meta.draft ? " · Draft" : ""}</p>
            <h1 class="e-title">${escapeHtml(meta.title || "Untitled")}</h1>
            ${meta.standfirst ? `<p class="e-stand">${escapeHtml(meta.standfirst)}</p>` : ""}
        </header>
        ${meta.cover ? `<figure class="e-cover"><img src="/${escapeHtml(meta.cover)}" alt="${escapeHtml(meta.cover_alt)}"></figure>` : ""}
        <div class="e-col e-body">${html}</div>
        ${related.length ? `<section class="e-col e-related"><h2 class="e-notes-h">Objects in this essay</h2><ul>${related.map((no) => `<li><a href="#${no}"><span class="e-mat"><img src="/${escapeHtml(objects[no].image_small)}" alt=""></span><span class="e-card-no">${no}</span><span class="e-card-name">${escapeHtml(objects[no].name)}</span><span class="e-card-meta">${escapeHtml(objectMeta(objects[no]))}</span></a></li>`).join("")}</ul></section>` : ""}`
}

let previewTimer = 0
function changed() {
    dirty = true
    status("Unsaved changes")
    clearTimeout(previewTimer)
    previewTimer = setTimeout(preview, 120)
}

async function load(selectSlug) {
    const data = await api("/api/state")
    items = data.items
    objects = Object.fromEntries(items.map((i) => [i.catalogue_no, i]))
    essays = data.essays
    const pick = essays.find((e) => e.slug === selectSlug) || essays[0]
    if (pick) fill(pick, pick.slug)
    else newEssay()
    status(dirty ? "Unsaved changes" : "Saved")
    refreshChanges()
}

function newEssay() {
    fill({ title: "", slug: "", date: today(), standfirst: "", objects: [], tags: [], draft: true, body: "" }, null)
    els.title.focus()
}

async function save() {
    const { meta, body } = readForm()
    if (!meta.title) return status("Give the essay a title.", "err")
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(meta.slug)) return status("The address must be lower-case words joined by hyphens.", "err")
    status("Saving…")
    try {
        const r = await api("/api/save", { originalSlug: current.originalSlug, meta, body })
        dirty = false
        await load(r.essay.slug)
        status(r.check.ok ? "Saved" : "Saved, but the repository has problems: " + r.check.out.split("\n").slice(1, 3).join(" "), r.check.ok ? "ok" : "err")
    } catch (e) {
        status(e.message, "err")
    }
}

async function refreshChanges() {
    try {
        const { changes } = await api("/api/status", {})
        els.changes.textContent = changes.length ? `Not yet published:\n${changes.join("\n")}` : "Everything is published."
    } catch {
        els.changes.textContent = ""
    }
}

function insert(before, after = "", placeholder = "") {
    const t = els.body
    const s = t.selectionStart
    const e = t.selectionEnd
    const selected = t.value.slice(s, e) || placeholder
    t.setRangeText(before + selected + after, s, e, "end")
    if (!t.value.slice(s, e) && placeholder) t.setSelectionRange(s + before.length, s + before.length + placeholder.length)
    t.focus()
    changed()
}

function insertBlock(text) {
    const t = els.body
    const s = t.selectionStart
    const pre = t.value.slice(0, s)
    const lead = pre.length === 0 || pre.endsWith("\n\n") ? "" : pre.endsWith("\n") ? "\n" : "\n\n"
    t.setRangeText(`${lead}${text}\n\n`, s, t.selectionEnd, "end")
    t.focus()
    changed()
}

function nextNoteId() {
    const used = [...els.body.value.matchAll(/\[\^(\d+)\]/g)].map((m) => +m[1])
    return (used.length ? Math.max(...used) : 0) + 1
}

function search(q) {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return []
    return items.filter((i) => words.every((w) => `${i.catalogue_no} ${i.name} ${i.type} ${i.country} ${i.year} ${i.edition}`.toLowerCase().includes(w))).slice(0, 30)
}

function showResults() {
    const found = search(els.objectSearch.value)
    els.objectResults.hidden = !found.length
    els.objectResults.innerHTML = found
        .map((i) => `<li><button type="button" data-pick="${escapeHtml(i.catalogue_no)}"><img src="/${escapeHtml(i.image_small)}" alt=""><span><span class="n">${escapeHtml(i.name)}</span><br><span class="d">${escapeHtml(i.catalogue_no)} · ${escapeHtml(objectMeta(i))}${i.edition ? ` · ${escapeHtml(i.edition)}` : ""}</span></span></button></li>`)
        .join("")
}

function pick(no) {
    if (pickMode === "related") {
        if (!current.meta.objects.includes(no)) current.meta.objects.push(no)
        renderChips()
        changed()
    } else {
        els.body.focus()
        if (selectionForPick) els.body.setSelectionRange(selectionForPick[0], selectionForPick[1])
        if (pickMode === "card") insertBlock(`[[${no}]]`)
        else {
            const words = selectionForPick && selectionForPick[0] !== selectionForPick[1] ? els.body.value.slice(selectionForPick[0], selectionForPick[1]) : ""
            els.body.setRangeText(words ? `[[${no}|${words}]]` : `[[${no}]]`, els.body.selectionStart, els.body.selectionEnd, "end")
            changed()
        }
        if (!current.meta.objects.includes(no)) {
            current.meta.objects.push(no)
            renderChips()
        }
    }
    pickMode = "related"
    els.objectSearch.placeholder = "Search by name, number, type, country or year"
    els.objectSearch.value = ""
    els.objectResults.hidden = true
}

// Events
els.form.addEventListener("input", (e) => {
    if (e.target === els.title && !slugTouched) els.slug.value = slugify(els.title.value)
    if (e.target === els.slug) slugTouched = true
    if (e.target === els.objectSearch) return showResults()
    if (e.target === els.coverFile) return
    changed()
})
els.form.addEventListener("submit", (e) => e.preventDefault())
els.objectSearch.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        els.objectResults.hidden = true
        pickMode = "related"
    }
    if (e.key === "ArrowDown") {
        e.preventDefault()
        els.objectResults.querySelector("button")?.focus()
    }
    if (e.key === "Enter") {
        e.preventDefault()
        const first = els.objectResults.querySelector("button")
        if (first) pick(first.dataset.pick)
    }
})
els.objectResults.addEventListener("keydown", (e) => {
    const buttons = [...els.objectResults.querySelectorAll("button")]
    const i = buttons.indexOf(document.activeElement)
    if (e.key === "ArrowDown") (e.preventDefault(), buttons[Math.min(i + 1, buttons.length - 1)]?.focus())
    if (e.key === "ArrowUp") (e.preventDefault(), i <= 0 ? els.objectSearch.focus() : buttons[i - 1].focus())
    if (e.key === "Escape") (els.objectResults.hidden = true, els.objectSearch.focus())
})
els.objectResults.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-pick]")
    if (b) pick(b.dataset.pick)
})
els.objects.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-remove]")
    if (!b) return
    current.meta.objects = current.meta.objects.filter((no) => no !== b.dataset.remove)
    renderChips()
    changed()
})
document.querySelector(".tools").addEventListener("click", (e) => {
    const kind = e.target.closest("button")?.dataset.insert
    if (!kind) return
    if (kind === "card" || kind === "ref") {
        pickMode = kind
        selectionForPick = [els.body.selectionStart, els.body.selectionEnd]
        els.objectSearch.placeholder = kind === "card" ? "Find the object to show as a card…" : "Find the object to link to…"
        els.objectSearch.focus()
        return
    }
    if (kind === "note") {
        const n = nextNoteId()
        insert(`[^${n}]`)
        els.body.value = els.body.value.replace(/\s*$/, "") + `\n\n[^${n}]: `
        els.body.setSelectionRange(els.body.value.length, els.body.value.length)
        changed()
    }
    if (kind === "em") insert("*", "*", "italic")
    if (kind === "h2") insertBlock("## Heading")
    if (kind === "quote") insertBlock("> Quotation\n— Source")
})
els.coverFile.addEventListener("change", async () => {
    const file = els.coverFile.files[0]
    if (!file) return
    if (!current.originalSlug) return status("Save the essay before adding a cover.", "err")
    status("Converting the cover…")
    const dataUrl = await new Promise((resolve) => {
        const r = new FileReader()
        r.onload = () => resolve(r.result)
        r.readAsDataURL(file)
    })
    try {
        const { cover } = await api("/api/cover", { slug: current.originalSlug, dataUrl })
        current.meta.cover = cover
        els.coverImg.src = "/" + cover
        els.coverImg.hidden = false
        changed()
        status("Cover added. Describe it, then save.")
        els.coverAlt.focus()
    } catch (e) {
        status(e.message, "err")
    }
    els.coverFile.value = ""
})
els.list.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-slug]")
    if (!b) return
    if (dirty && !window.confirm("Discard your unsaved changes?")) return
    const essay = essays.find((x) => x.slug === b.dataset.slug)
    if (essay) fill(essay, essay.slug)
    status("Saved")
})
els.new.addEventListener("click", () => {
    if (dirty && !window.confirm("Discard your unsaved changes?")) return
    newEssay()
    status("New essay, not saved yet")
})
els.save.addEventListener("click", save)
els.delete.addEventListener("click", async () => {
    if (!current.originalSlug) return newEssay()
    if (!window.confirm(`Delete “${els.title.value}”? It disappears from the site when you next publish.`)) return
    await api("/api/delete", { slug: current.originalSlug })
    dirty = false
    await load()
    status("Deleted")
})
els.publish.addEventListener("click", async () => {
    if (dirty) await save()
    if (dirty) return
    const message = window.prompt("Describe this change (for the history):", "Update essays")
    if (message === null) return
    status("Publishing…")
    try {
        const r = await api("/api/publish", { message })
        status(r.message, "ok")
    } catch (e) {
        status(`${e.message} ${e.detail || ""}`, "err")
    }
    refreshChanges()
})
document.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault()
        save()
    }
})
window.addEventListener("beforeunload", (e) => {
    if (dirty) e.preventDefault()
})

load().catch((e) => status(e.message, "err"))
