// Copies the essays into the Essays collection in the Framer CMS, so each
// essay gets its own page on typen.me. Objects are not in the CMS: the site
// reads them from items.json, like the images. GitHub stays the source:
// anything edited in the Essays collection in Framer is overwritten on the next sync.
import { renderEssay, readingTime, referencedObjects, objectMeta } from "./essay.mjs"

export const SITE_OBJECT_PATH = "/collection/object?no="

// Turns the essays (and the objects they mention) into the records the sync writes.
export function buildRecords({ items, essays, cdn }) {
    const objects = Object.fromEntries(items.map((i) => [i.catalogue_no, i]))
    return {
        essays: essays.map((e) => {
            const nos = [...new Set([...e.objects, ...referencedObjects(e.body)])].filter((no) => objects[no])
            const { html } = renderEssay(e.body, { objects, assetBase: cdn, objectHref: (no) => SITE_OBJECT_PATH + no.toLowerCase() })
            const record = {
                slug: e.slug,
                title: e.title,
                date: e.date,
                standfirst: e.standfirst,
                reading_time: readingTime(e.body),
                draft: e.draft,
                tags: e.tags,
                cover: e.cover ? cdn + e.cover : "",
                cover_alt: e.cover_alt || "",
                html,
                objects: nos.map((no) => {
                    const o = objects[no]
                    return { no, name: o.name, meta: objectMeta(o), edition: o.edition || "", image: cdn + o.image_small }
                }),
            }
            return {
                slug: e.slug,
                draft: e.draft,
                fields: {
                    title: e.title,
                    date: e.date,
                    standfirst: e.standfirst,
                    body: html,
                    readingTime: record.reading_time,
                    tags: e.tags.join(", "),
                    cover: record.cover,
                    coverAlt: record.cover_alt,
                    record: JSON.stringify(record),
                },
            }
        }),
    }
}

// Writes the records into Framer. `framer` is a connected Framer API instance.
// Self-contained so it can also run inside the Framer agent's exec sandbox.
export async function syncToFramer(framer, records, log = console.log) {
    const FIELDS = [
        ["title", "Title", "string"],
        ["date", "Date", "date"],
        ["standfirst", "Standfirst", "string"],
        ["body", "Body", "formattedText"],
        ["readingTime", "Reading time", "number"],
        ["tags", "Tags", "string"],
        ["cover", "Cover", "image"],
        ["coverSource", "Cover source", "string"],
        ["coverAlt", "Cover alt text", "string"],
        ["record", "Record", "string"],
    ]

    const collections = await framer.getCollections()
    const coll = collections.find((c) => c.name === "Essays") || (await framer.createCollection("Essays"))

    let fields = await coll.getFields()
    const missing = FIELDS.filter(([, name]) => !fields.some((f) => f.name === name))
    if (missing.length) {
        await coll.addFields(missing.map(([, name, type]) => ({ name, type })))
        fields = await coll.getFields()
        log(`Essays: added fields ${missing.map(([, n]) => n).join(", ")}`)
    }
    const ids = {}
    for (const [key, name, type] of FIELDS) {
        const f = fields.find((x) => x.name === name)
        if (f.type !== type) throw new Error(`Essays › ${name} is a ${f.type} field; expected ${type}. Rename or delete it in Framer.`)
        ids[key] = f.id
    }

    const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
    const existing = await coll.getItems()
    const bySlug = new Map(existing.map((i) => [i.slug, i]))
    const changes = []
    for (const rec of records.essays) {
        const old = bySlug.get(rec.slug)
        const prevField = (key) => old?.fieldData?.[ids[key]]?.value
        const fieldData = {}
        for (const [key, , type] of FIELDS) {
            const value = key === "coverSource" ? rec.fields.cover || "" : rec.fields[key] ?? (type === "number" ? 0 : "")
            if (old) {
                // Images are re-uploaded only when their source changes; Framer
                // normalises stored HTML, so the body is compared through its record.
                if (type === "image" && prevField("coverSource") === (rec.fields.cover || "")) continue
                if (type === "formattedText" && same(prevField("record"), rec.fields.record)) continue
                if (type === "date" && String(prevField(key) || "").slice(0, 10) === String(value || "").slice(0, 10)) continue
                if (type !== "image" && type !== "formattedText" && type !== "date" && same(prevField(key), value)) continue
            }
            fieldData[ids[key]] = { type, value: type === "date" || type === "image" ? value || null : value }
        }
        if (!old) changes.push({ slug: rec.slug, draft: rec.draft, fieldData })
        else if (Object.keys(fieldData).length || old.draft !== rec.draft) changes.push({ id: old.id, draft: rec.draft, fieldData })
    }
    for (let i = 0; i < changes.length; i += 50) await coll.addItems(changes.slice(i, i + 50))
    const keep = new Set(records.essays.map((r) => r.slug))
    const remove = existing.filter((i) => !keep.has(i.slug)).map((i) => i.id)
    if (remove.length) await coll.removeItems(remove)
    const order = new Map(records.essays.map((r, i) => [r.slug, i]))
    const after = await coll.getItems()
    await coll.setItemOrder([...after].sort((a, b) => (order.get(a.slug) ?? 1e9) - (order.get(b.slug) ?? 1e9)).map((i) => i.id))
    log(`Essays: ${changes.filter((c) => !c.id).length} added, ${changes.filter((c) => c.id).length} updated, ${remove.length} removed`)
    return { changed: changes.length + remove.length, collection: coll.id, fieldIds: ids }
}
