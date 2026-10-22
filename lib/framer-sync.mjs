// Copies the archive into two Framer CMS collections, Objects and Essays, so
// each object and essay gets its own page on typen.me. GitHub stays the source:
// anything edited in these collections in Framer is overwritten on the next sync.
import { renderEssay, readingTime, referencedObjects, objectMeta } from "./essay.mjs"

export const SITE_OBJECT_PATH = "/collection/"
export const SITE_ESSAY_PATH = "/collection/essays/"

// Turns items.json and the essays into the records the sync writes.
export function buildRecords({ items, essays, cdn }) {
    const objects = Object.fromEntries(items.map((i) => [i.catalogue_no, i]))
    const sorted = [...items].sort((a, b) => a.catalogue_no.localeCompare(b.catalogue_no))
    const essaysByObject = {}
    const essayRecords = essays.map((e) => {
        const nos = [...new Set([...e.objects, ...referencedObjects(e.body)])].filter((no) => objects[no])
        const summary = { slug: e.slug, title: e.title, date: e.date, standfirst: e.standfirst, reading_time: readingTime(e.body), draft: e.draft }
        for (const no of nos) (essaysByObject[no] ||= []).push(summary)
        const { html } = renderEssay(e.body, { objects, assetBase: cdn, objectHref: (no) => SITE_OBJECT_PATH + no.toLowerCase() })
        const record = {
            ...summary,
            tags: e.tags,
            cover: e.cover ? cdn + e.cover : "",
            cover_alt: e.cover_alt || "",
            html,
            objects: nos.map((no) => card(objects[no], cdn)),
        }
        return {
            slug: e.slug,
            draft: e.draft,
            fields: {
                title: e.title,
                date: e.date,
                standfirst: e.standfirst,
                body: html,
                readingTime: summary.reading_time,
                tags: e.tags.join(", "),
                cover: record.cover,
                coverAlt: e.cover_alt || "",
                record: JSON.stringify(record),
            },
            objectSlugs: nos.map((no) => no.toLowerCase()),
        }
    })
    const objectRecords = sorted.map((o, i) => {
        const prev = sorted[i - 1]
        const next = sorted[i + 1]
        const essaysHere = (essaysByObject[o.catalogue_no] || []).sort((a, b) => b.date.localeCompare(a.date))
        const images = [{ src: cdn + o.image, small: cdn + o.image_small }]
        const year = /(\d{4})/.exec(o.year || "")
        const record = {
            no: o.catalogue_no,
            name: o.name,
            brand: o.brand || "",
            type: o.type,
            country: o.country,
            year: o.year || "",
            edition: o.edition || "",
            material: o.material || "",
            dimensions: o.dimensions || "",
            acquired: o.acquired || "",
            tags: o.tags || [],
            alt: o.alt || `${o.name}, ${objectMeta(o)}`,
            observation: o.observation || "",
            images,
            essays: essaysHere,
            prev: prev ? { no: prev.catalogue_no, name: prev.name } : null,
            next: next ? { no: next.catalogue_no, name: next.name } : null,
        }
        return {
            slug: o.catalogue_no.toLowerCase(),
            draft: false,
            fields: {
                name: o.name,
                catalogueNo: o.catalogue_no,
                category: o.type,
                brand: o.brand || "",
                origin: o.country,
                date: o.year || "",
                dateSort: year ? +year[1] : 0,
                edition: o.edition || "",
                material: o.material || "",
                dimensions: o.dimensions || "",
                acquired: o.acquired || "",
                tags: (o.tags || []).join(", "),
                alt: record.alt,
                notes: o.observation || "",
                image: images[0].src,
                description: [o.name, objectMeta(o), o.edition].filter(Boolean).join(". ") + ". From Ethan Nunn’s archive of printed fast-food packaging.",
                record: JSON.stringify(record),
            },
            essaySlugs: essaysHere.map((e) => e.slug),
        }
    })
    return { objects: objectRecords, essays: essayRecords }
}

function card(o, cdn) {
    return { no: o.catalogue_no, name: o.name, meta: objectMeta(o), edition: o.edition || "", image: cdn + o.image_small }
}

// Writes the records into Framer. `framer` is a connected Framer API instance.
// Self-contained so it can also run inside the Framer agent's exec sandbox.
export async function syncToFramer(framer, records, log = console.log) {
    const OBJECT_FIELDS = [
        ["name", "Name", "string"],
        ["catalogueNo", "Catalogue no", "string"],
        ["category", "Category", "string"],
        ["brand", "Brand", "string"],
        ["origin", "Origin", "string"],
        ["date", "Date", "string"],
        ["dateSort", "Date sort", "number"],
        ["edition", "Edition", "string"],
        ["material", "Material", "string"],
        ["dimensions", "Dimensions", "string"],
        ["acquired", "Acquired", "string"],
        ["tags", "Tags", "string"],
        ["alt", "Alt text", "string"],
        ["notes", "Notes", "string"],
        ["image", "Image", "image"],
        ["imageSource", "Image source", "string"],
        ["description", "Description", "string"],
        ["essays", "Essays", "multiCollectionReference", "Essays"],
        ["record", "Record", "string"],
    ]
    const ESSAY_FIELDS = [
        ["title", "Title", "string"],
        ["date", "Date", "date"],
        ["standfirst", "Standfirst", "string"],
        ["body", "Body", "formattedText"],
        ["readingTime", "Reading time", "number"],
        ["tags", "Tags", "string"],
        ["cover", "Cover", "image"],
        ["coverSource", "Cover source", "string"],
        ["coverAlt", "Cover alt text", "string"],
        ["objects", "Objects", "multiCollectionReference", "Objects"],
        ["record", "Record", "string"],
    ]

    const all = await framer.getCollections()
    async function collection(name) {
        return all.find((c) => c.name === name) || (await framer.createCollection(name))
    }
    const objectsCollection = await collection("Objects")
    const essaysCollection = await collection("Essays")
    const byName = { Objects: objectsCollection, Essays: essaysCollection }

    async function ensureFields(coll, spec) {
        let fields = await coll.getFields()
        const missing = spec.filter(([, name]) => !fields.some((f) => f.name === name))
        if (missing.length) {
            await coll.addFields(missing.map(([, name, type, ref]) => (ref ? { name, type, collectionId: byName[ref].id } : { name, type })))
            fields = await coll.getFields()
            log(`${coll.name}: added fields ${missing.map(([, n]) => n).join(", ")}`)
        }
        const ids = {}
        for (const [key, name, type] of spec) {
            const f = fields.find((x) => x.name === name)
            if (f.type !== type) throw new Error(`${coll.name} › ${name} is a ${f.type} field; expected ${type}. Rename or delete it in Framer.`)
            ids[key] = f.id
        }
        return ids
    }
    const objectIds = await ensureFields(objectsCollection, OBJECT_FIELDS)
    const essayIds = await ensureFields(essaysCollection, ESSAY_FIELDS)

    const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null)
    function entry(type, value) {
        if (type === "date") return { type, value: value || null }
        if (type === "image") return { type, value: value || null }
        if (type === "multiCollectionReference") return { type, value }
        return { type, value }
    }

    async function upsert(coll, spec, ids, list, refKey, refColl) {
        const existing = await coll.getItems()
        const bySlug = new Map(existing.map((i) => [i.slug, i]))
        const refItems = refKey ? await refColl.getItems() : []
        const refIdBySlug = new Map(refItems.map((i) => [i.slug, i.id]))
        const changes = []
        let changed = 0
        for (const rec of list) {
            const old = bySlug.get(rec.slug)
            const fieldData = {}
            for (const [key, , type] of spec) {
                let value
                if (type === "multiCollectionReference") value = (rec[refKey] || []).map((s) => refIdBySlug.get(s)).filter(Boolean)
                else if (key === "imageSource") value = rec.fields.image || ""
                else if (key === "coverSource") value = rec.fields.cover || ""
                else value = rec.fields[key] ?? (type === "number" ? 0 : "")
                const prev = old?.fieldData?.[ids[key]]?.value
                // Images are re-uploaded only when their source address changes.
                if (type === "image") {
                    const sourceKey = key === "image" ? "imageSource" : "coverSource"
                    const prevSource = old?.fieldData?.[ids[sourceKey]]?.value
                    if (old && prevSource === value) continue
                } else if (type === "date") {
                    if (old && String(prev || "").slice(0, 10) === String(value || "").slice(0, 10)) continue
                } else if (type === "multiCollectionReference") {
                    // Framer may return references as slugs or as ids.
                    const prevIds = [...(prev || [])].map((v) => refIdBySlug.get(v) ?? v)
                    if (old && same(prevIds.sort(), [...value].sort())) continue
                } else if (type === "formattedText") {
                    // Framer normalises stored HTML, so compare the record it came from instead.
                    if (old && same(old.fieldData?.[ids.record]?.value, rec.fields.record)) continue
                } else if (old && same(prev, value)) continue
                fieldData[ids[key]] = entry(type, value)
            }
            const draftChanged = old ? old.draft !== rec.draft : true
            if (!old) changes.push({ slug: rec.slug, draft: rec.draft, fieldData })
            else if (Object.keys(fieldData).length || draftChanged) changes.push({ id: old.id, draft: rec.draft, fieldData })
        }
        for (let i = 0; i < changes.length; i += 50) {
            await coll.addItems(changes.slice(i, i + 50))
            changed += changes.slice(i, i + 50).length
        }
        const keep = new Set(list.map((r) => r.slug))
        const remove = existing.filter((i) => !keep.has(i.slug)).map((i) => i.id)
        if (remove.length) await coll.removeItems(remove)
        const after = await coll.getItems()
        const order = new Map(list.map((r, i) => [r.slug, i]))
        await coll.setItemOrder([...after].sort((a, b) => (order.get(a.slug) ?? 1e9) - (order.get(b.slug) ?? 1e9)).map((i) => i.id))
        log(`${coll.name}: ${changes.filter((c) => !c.id).length} added, ${changes.filter((c) => c.id).length} updated, ${remove.length} removed`)
        return changed + remove.length
    }

    // Objects first without their essay links, then essays, then the links.
    let changed = await upsert(objectsCollection, OBJECT_FIELDS.filter(([k]) => k !== "essays"), objectIds, records.objects)
    changed += await upsert(essaysCollection, ESSAY_FIELDS, essayIds, records.essays, "objectSlugs", objectsCollection)
    changed += await upsert(objectsCollection, OBJECT_FIELDS, objectIds, records.objects, "essaySlugs", essaysCollection)
    return { changed, collections: { objects: objectsCollection.id, essays: essaysCollection.id }, fieldIds: { objects: objectIds, essays: essayIds } }
}
