// Reads and renders essays. Used by the local editor, the build and the sync,
// and copied into the EssayBody component in Framer, so it must not import
// anything and must run in both Node and the browser.
//
// An essay is a Markdown file with a short header:
//
//   ---
//   title: Seven boxes, one burger
//   date: 2026-10-22
//   standfirst: One or two sentences.
//   objects: MCDPKG0037, MCDPKG1018
//   tags: comparison, typography
//   cover: images/essays/seven-boxes-1200.webp
//   cover_alt: Seven Big Mac boxes laid flat
//   draft: true
//   ---
//
// The body supports paragraphs, ## and ### headings, > quotes, - and 1. lists,
// ![alt](images/file.webp "caption"), --- for a section break, footnotes
// ([^1] in the text and "[^1]: The note." on its own line) and objects:
// [[MCDPKG0747]] on its own line makes an object card, and inside a sentence
// it makes a link (or [[MCDPKG0747|the 1991 fry box]] to choose the words).

export const ESSAY_FIELDS = ["title", "date", "standfirst", "objects", "tags", "cover", "cover_alt", "draft"]
const LIST_FIELDS = new Set(["objects", "tags"])

export function slugFromFilename(name) {
    return name.replace(/^.*\//, "").replace(/\.md$/i, "")
}

export function parseEssay(text, filename = "") {
    const meta = { slug: slugFromFilename(filename), title: "", date: "", standfirst: "", objects: [], tags: [], cover: "", cover_alt: "", draft: false }
    let body = text.replace(/\r\n?/g, "\n")
    const m = /^---\n([\s\S]*?)\n---\n?/.exec(body)
    if (m) {
        body = body.slice(m[0].length)
        for (const line of m[1].split("\n")) {
            const kv = /^([a-z_]+):\s*(.*)$/.exec(line.trim())
            if (!kv) continue
            const [, key, raw] = kv
            const value = raw.trim()
            if (LIST_FIELDS.has(key)) meta[key] = value.replace(/^\[|\]$/g, "").split(",").map((s) => s.trim()).filter(Boolean)
            else if (key === "draft") meta.draft = /^(true|yes)$/i.test(value)
            else meta[key] = value
        }
    }
    meta.body = body.replace(/^\n+/, "").replace(/\s+$/, "") + "\n"
    return meta
}

export function serializeEssay(meta) {
    const lines = ["---"]
    for (const key of ESSAY_FIELDS) {
        const v = meta[key]
        if (LIST_FIELDS.has(key)) lines.push(`${key}: ${(v || []).join(", ")}`)
        else if (key === "draft") lines.push(`draft: ${v ? "true" : "false"}`)
        else if (v || key === "title" || key === "date" || key === "standfirst") lines.push(`${key}: ${String(v || "").replace(/\n+/g, " ").trim()}`)
    }
    lines.push("---", "")
    return lines.join("\n") + (meta.body || "").replace(/\s+$/, "") + "\n"
}

export function wordCount(body) {
    const text = stripComments(body).replace(/\[\^[^\]]+\]:?/g, " ").replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[\[[^\]]+\]\]/g, " x ")
    return (text.match(/[\p{L}\p{N}’']+/gu) || []).length
}

export function readingTime(body) {
    return Math.max(1, Math.round(wordCount(body) / 230))
}

// Catalogue numbers mentioned anywhere in the body.
export function referencedObjects(body) {
    return [...new Set([...stripComments(body).matchAll(/\[\[([A-Z]+\d+)(?:\|[^\]]*)?\]\]/g)].map((m) => m[1]))]
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
export function formatDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "")
    return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : iso || ""
}

export function objectMeta(o) {
    return [o.type, o.country, o.year || "undated"].filter(Boolean).join(" · ")
}

function stripComments(s) {
    return s.replace(/<!--[\s\S]*?-->/g, "")
}

export function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

// Curly quotes, dashes and ellipses, for text that has already been escaped.
export function smarten(s) {
    return s
        .replace(/---/g, "—")
        .replace(/--/g, "–")
        .replace(/\.\.\./g, "…")
        .replace(/(^|[\s(\[{—–-])&quot;/g, "$1“")
        .replace(/&quot;/g, "”")
        .replace(/(^|\s)'(?=\d)/g, "$1’")
        .replace(/(^|[\s(\[{—–-])'/g, "$1‘")
        .replace(/'/g, "’")
}

// Runs of two or more capitals (UK, USA, FIFA) are set in small caps.
function caps(s) {
    return s.replace(/(^|[^\p{L}\p{N}&#;])(\p{Lu}[\p{Lu}\d]*\p{Lu}[\p{Lu}\d]*)(?=$|[^\p{L}\p{N}])/gu, '$1<span class="e-caps">$2</span>')
}

function resolveSrc(src, assetBase) {
    return /^(https?:)?\/\//.test(src) || src.startsWith("data:") ? src : assetBase + src.replace(/^\.?\//, "")
}

export function renderEssay(body, options = {}) {
    const objects = options.objects || {}
    const assetBase = options.assetBase || ""
    const objectHref = options.objectHref || ((no) => `/collection/${no.toLowerCase()}`)
    const notes = new Map()
    const noteOrder = []
    const missing = new Set()

    let src = stripComments(body).replace(/\r\n?/g, "\n")
    // Footnote definitions, including indented continuation lines.
    src = src.replace(/^\[\^([^\]]+)\]:[ \t]*(.*(?:\n(?:[ \t]+).*)*)/gm, (_, id, text) => {
        notes.set(id, text.replace(/\n[ \t]+/g, " ").trim())
        return ""
    })

    function inline(text) {
        const slots = []
        const keep = (html) => `\u0000${slots.push(html) - 1}\u0000`
        let s = escapeHtml(text)
        s = s.replace(/\[\[([A-Z]+\d+)(?:\|([^\]]*))?\]\]/g, (_, no, words) => {
            const o = objects[no]
            if (!o) missing.add(no)
            const label = words ? smarten(words) : `<span class="e-no">${no}</span>`
            return keep(o ? `<a class="e-ref" href="${escapeHtml(objectHref(no))}">${label}</a>` : label)
        })
        s = s.replace(/\[\^([^\]]+)\]/g, (_, id) => {
            if (!noteOrder.includes(id)) noteOrder.push(id)
            const n = noteOrder.indexOf(id) + 1
            const note = notes.get(id)
            const side = note === undefined ? "" : `<span class="e-side" aria-hidden="true"><span class="e-side-n">${n}</span>${inline(note).replace(/<a /g, '<a tabindex="-1" ')}</span>`
            return keep(`<sup class="e-fn"><a href="#note-${n}" id="ref-${n}" aria-label="Note ${n}">${n}</a></sup>${side}`)
        })
        s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (_, alt, url) => keep(`<img src="${escapeHtml(resolveSrc(url, assetBase))}" alt="${alt}" loading="lazy">`))
        s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, words, url) => {
            const external = /^https?:/.test(url)
            return keep(`<a href="${url}"${external ? ' target="_blank" rel="noopener"' : ""}>${caps(smarten(words))}</a>`)
        })
        s = caps(smarten(s))
        s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>").replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, "$1<em>$2</em>").replace(/(^|[^\w])_([^_\s][^_]*?)_(?!\w)/g, "$1<em>$2</em>")
        return s.replace(/\u0000(\d+)\u0000/g, (_, i) => slots[+i])
    }

    function card(no) {
        const o = objects[no]
        if (!o) {
            missing.add(no)
            return `<p class="e-missing">${escapeHtml(no)} isn’t in items.json.</p>`
        }
        const img = o.image_small ? `<img src="${escapeHtml(resolveSrc(o.image_small, assetBase))}" alt="" loading="lazy">` : ""
        return `<figure class="e-card"><a href="${escapeHtml(objectHref(no))}"><span class="e-mat">${img}</span><figcaption><span class="e-card-no">${escapeHtml(no)}</span><span class="e-card-name">${escapeHtml(o.name)}</span><span class="e-card-meta">${escapeHtml(objectMeta(o))}</span>${o.edition ? `<span class="e-card-ed">${escapeHtml(o.edition)}</span>` : ""}</figcaption></a></figure>`
    }

    const out = []
    let afterBreak = true
    const para = (html) => {
        const hang = /^(<[^>]+>)*[“‘"']/.test(html) ? " e-hang" : ""
        out.push(`<p class="e-p${afterBreak ? " e-first" : ""}${hang}">${html}</p>`)
        afterBreak = false
    }
    for (const block of src.split(/\n{2,}/)) {
        const b = block.trim()
        if (!b) continue
        let m
        if ((m = /^\[\[([A-Z]+\d+)\]\]$/.exec(b))) {
            out.push(card(m[1]))
            afterBreak = true
        } else if ((m = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"([^"]*)")?\)$/.exec(b))) {
            out.push(`<figure class="e-fig"><img src="${escapeHtml(resolveSrc(m[2], assetBase))}" alt="${escapeHtml(m[1])}" loading="lazy">${m[3] ? `<figcaption>${inline(m[3])}</figcaption>` : ""}</figure>`)
            afterBreak = true
        } else if ((m = /^(#{2,3})\s+(.+)$/.exec(b))) {
            const tag = m[1].length === 2 ? "h2" : "h3"
            out.push(`<${tag} class="e-${tag}">${inline(m[2])}</${tag}>`)
            afterBreak = true
        } else if (/^(-{3,}|\*{3,})$/.test(b)) {
            out.push('<hr class="e-break">')
            afterBreak = true
        } else if (b.startsWith(">")) {
            const lines = b.split("\n").map((l) => l.replace(/^>\s?/, ""))
            const cite = lines.length > 1 && /^(—|--)\s*/.test(lines[lines.length - 1]) ? lines.pop().replace(/^(—|--)\s*/, "") : ""
            const q = inline(lines.join(" "))
            out.push(`<blockquote class="e-quote"><p${/^[“‘]/.test(q) ? ' class="e-hang"' : ""}>${q}</p>${cite ? `<footer>— ${inline(cite)}</footer>` : ""}</blockquote>`)
            afterBreak = true
        } else if (/^([-*]|\d+\.)\s/.test(b)) {
            const ordered = /^\d+\./.test(b)
            const items = b.split(/\n(?=(?:[-*]|\d+\.)\s)/).map((i) => `<li>${inline(i.replace(/^([-*]|\d+\.)\s+/, "").replace(/\n\s*/g, " "))}</li>`)
            out.push(`<${ordered ? "ol" : "ul"} class="e-list">${items.join("")}</${ordered ? "ol" : "ul"}>`)
            afterBreak = true
        } else {
            para(inline(b.replace(/\n\s*/g, " ")))
        }
    }

    if (noteOrder.length) {
        out.push(`<section class="e-notes" aria-label="Notes"><h2 class="e-notes-h">Notes</h2><ol>${noteOrder
            .map((id, i) => `<li id="note-${i + 1}">${notes.has(id) ? inline(notes.get(id)) : "<em>Missing note.</em>"} <a href="#ref-${i + 1}" class="e-back" aria-label="Back to the text">↩</a></li>`)
            .join("")}</ol></section>`)
    }
    const unused = [...notes.keys()].filter((id) => !noteOrder.includes(id))
    return { html: out.join("\n"), missing: [...missing], unusedNotes: unused, missingNotes: noteOrder.filter((id) => !notes.has(id)) }
}
