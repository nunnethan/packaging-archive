import { startTransition, useEffect, useMemo, useState } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

// One object from the archive, on the /collection/object page. The object is
// chosen by the address (?no=mcdpkg0747) and read, with its essays, from the
// GitHub repository nunnethan/packaging-archive through jsDelivr, the same
// way the Collection page and the images are served.

const REPO = "nunnethan/packaging-archive"
const BASE = `https://cdn.jsdelivr.net/gh/${REPO}@main/`

type Item = {
    no: string
    name: string
    brand: string
    type: string
    country: string
    year: string
    edition: string
    material: string
    dimensions: string
    acquired: string
    tags: string[]
    alt: string
    observation: string
    src: string
    srcSmall: string
}
type Essay = { slug: string; title: string; date: string; objects: string[]; readingTime: number; draft: boolean }
type Archive = { items: Item[]; essays: Essay[] }

function text(v: unknown) {
    return typeof v === "string" ? v.trim() : ""
}

let request: Promise<Archive> | null = null
function loadArchive(): Promise<Archive> {
    if (!request) {
        const get = (file: string) =>
            fetch(BASE + file, { cache: "no-cache" }).then((r) => {
                if (!r.ok) throw new Error(`${file}: ${r.status}`)
                return r.json()
            })
        request = Promise.all([get("items.json"), get("essays.json").catch(() => ({ essays: [] }))])
            .then(([itemData, essayData]) => {
                const items: Item[] = (Array.isArray(itemData?.items) ? itemData.items : [])
                    .filter((i: any) => text(i?.catalogue_no) && text(i?.name) && text(i?.image))
                    .map((i: any) => ({
                        no: text(i.catalogue_no),
                        name: text(i.name),
                        brand: text(i.brand),
                        type: text(i.type),
                        country: text(i.country),
                        year: text(i.year),
                        edition: text(i.edition),
                        material: text(i.material),
                        dimensions: text(i.dimensions),
                        acquired: text(i.acquired),
                        tags: Array.isArray(i.tags) ? i.tags.filter((t: unknown) => typeof t === "string") : [],
                        alt: text(i.alt),
                        observation: text(i.observation),
                        src: BASE + text(i.image),
                        srcSmall: BASE + (text(i.image_small) || text(i.image)),
                    }))
                    .sort((a: Item, b: Item) => a.no.localeCompare(b.no))
                const essays: Essay[] = (Array.isArray(essayData?.essays) ? essayData.essays : [])
                    .filter((e: any) => text(e?.slug) && text(e?.title))
                    .map((e: any) => ({
                        slug: text(e.slug),
                        title: text(e.title),
                        date: text(e.date),
                        objects: Array.isArray(e.objects) ? e.objects : [],
                        readingTime: Number(e.reading_time) || 1,
                        draft: e.draft === true,
                    }))
                return { items, essays }
            })
            .catch((e) => {
                request = null
                throw e
            })
    }
    return request
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
function formatDate(iso: string) {
    const full = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    if (full) return `${+full[3]} ${MONTHS[+full[2] - 1]} ${full[1]}`
    const month = /^(\d{4})-(\d{2})$/.exec(iso)
    if (month) return `${MONTHS[+month[2] - 1]} ${month[1]}`
    return iso
}

function metaLine(i: Item) {
    return [i.type, i.country, i.year || "undated"].filter(Boolean).join(" · ")
}

interface Props {
    collectionPath: string
    objectPath: string
    essayPath: string
    sampleNo: string
    paper: string
    ink: string
    muted: string
    rule: string
    style?: React.CSSProperties
}

/**
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight auto
 */
export default function ObjectDetail(props: Props) {
    const {
        collectionPath = "/collection",
        objectPath = "/collection/object?no=",
        essayPath = "/collection/essays/",
        sampleNo = "MCDPKG0747",
        paper = "#E8E7E3",
        ink = "#161613",
        muted = "#5E5D59",
        rule = "#C6C4BE",
    } = props
    const [archive, setArchive] = useState<Archive | null>(null)
    const [failed, setFailed] = useState(false)
    const [no, setNo] = useState("")
    const [showDrafts, setShowDrafts] = useState(false)

    useEffect(() => {
        const canvas = RenderTarget.current() === RenderTarget.canvas
        const q = typeof window !== "undefined" && !canvas ? new URLSearchParams(window.location.search) : null
        setNo((q?.get("no") || (canvas ? sampleNo : "")).toUpperCase())
        setShowDrafts(canvas || !!q?.has("drafts"))
        loadArchive().then(
            (a) => startTransition(() => setArchive(a)),
            () => startTransition(() => setFailed(true))
        )
    }, [sampleNo])

    const index = useMemo(() => (archive ? archive.items.findIndex((i) => i.no === no) : -1), [archive, no])
    const item = archive && index >= 0 ? archive.items[index] : null
    const prev = archive && index > 0 ? archive.items[index - 1] : null
    const next = archive && index >= 0 && index < archive.items.length - 1 ? archive.items[index + 1] : null
    const essays = useMemo(() => (archive && item ? archive.essays.filter((e) => e.objects.includes(item.no) && (showDrafts || !e.draft)) : []), [archive, item, showDrafts])

    useEffect(() => {
        if (item && typeof document !== "undefined" && RenderTarget.current() !== RenderTarget.canvas) {
            document.title = `${item.name}, ${item.no} – Collection – Ethan Nunn`
        }
    }, [item])

    const href = (n: string) => objectPath + n.toLowerCase()
    const vars = { "--od-paper": paper, "--od-ink": ink, "--od-muted": muted, "--od-rule": rule } as React.CSSProperties
    const crumbs = (
        <nav className="od-crumbs" aria-label="Breadcrumb">
            <a href={collectionPath}>Collection</a>
            <span aria-hidden="true"> / </span>
            <span aria-current="page">{item ? item.no : no || "Object"}</span>
        </nav>
    )

    if (failed || (archive && !item)) {
        return (
            <article className="od" style={{ ...props.style, ...vars, position: "relative" }}>
                <style dangerouslySetInnerHTML={{ __html: CSS }} />
                {crumbs}
                <div className="od-missing">
                    <h1 className="od-name">{failed ? "The archive couldn’t be loaded" : "This object isn’t in the collection"}</h1>
                    <p className="od-notes">
                        {failed ? "Please try again in a moment. " : `There’s no object ${no ? `numbered ${no}` : "chosen"}. `}
                        <a href={collectionPath}>Browse the collection</a>.
                    </p>
                </div>
            </article>
        )
    }

    if (!item) {
        return (
            <article className="od" style={{ ...props.style, ...vars, position: "relative" }} aria-busy="true">
                <style dangerouslySetInnerHTML={{ __html: CSS }} />
                {crumbs}
                <div className="od-layout">
                    <div className="od-figure od-ghost" />
                    <div className="od-text">
                        <p className="od-label" role="status">
                            Loading the object…
                        </p>
                    </div>
                </div>
            </article>
        )
    }

    const facts: [string, string][] = [
        ["Catalogue no.", item.no],
        ["Category", item.type],
        ["Brand", item.brand],
        ["Origin", item.country],
        ["Date", item.year || "Undated"],
        ["Material", item.material],
        ["Dimensions", item.dimensions],
        ["Acquired", formatDate(item.acquired)],
        ["Tags", item.tags.join(", ")],
    ]

    return (
        <article className="od" style={{ ...props.style, ...vars, position: "relative" }}>
            <style dangerouslySetInnerHTML={{ __html: CSS }} />
            {crumbs}
            <div className="od-layout">
                <figure className="od-figure">
                    <img src={item.src} srcSet={`${item.srcSmall} 600w, ${item.src} 1200w`} sizes="(max-width: 809px) 100vw, 58vw" alt={item.alt || `${item.name}, ${metaLine(item)}`} decoding="async" />
                </figure>
                <div className="od-text">
                    <h1 className="od-name">{item.name}</h1>
                    {item.edition && <p className="od-edition">{item.edition}</p>}
                    <dl className="od-facts">
                        {facts
                            .filter(([, v]) => v)
                            .map(([k, v]) => (
                                <div key={k} className="od-fact">
                                    <dt>{k}</dt>
                                    <dd>{v}</dd>
                                </div>
                            ))}
                    </dl>
                    {item.observation && <p className="od-notes">{item.observation}</p>}
                    {essays.length > 0 && (
                        <section className="od-essays" aria-labelledby="od-essays-h">
                            <h2 id="od-essays-h" className="od-label">
                                Written about in
                            </h2>
                            <ul>
                                {essays.map((e) => (
                                    <li key={e.slug}>
                                        <a href={essayPath + e.slug}>
                                            <span className="od-essay-title">{e.title}</span>
                                            <span className="od-essay-meta">
                                                {formatDate(e.date)} · {e.readingTime} min read{e.draft ? " · draft" : ""}
                                            </span>
                                        </a>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}
                </div>
            </div>
            <nav className="od-pager" aria-label="Other objects">
                {prev ? (
                    <a href={href(prev.no)} rel="prev">
                        <span className="od-label">← Previous</span>
                        <span className="od-pager-name">{prev.name}</span>
                    </a>
                ) : (
                    <span />
                )}
                {next ? (
                    <a href={href(next.no)} rel="next" className="od-next">
                        <span className="od-label">Next →</span>
                        <span className="od-pager-name">{next.name}</span>
                    </a>
                ) : (
                    <span />
                )}
            </nav>
        </article>
    )
}

const CSS = `
.od { container-type: inline-size; width: 100%; color: var(--od-ink); background: var(--od-paper); font-family: "IBM Plex Sans", system-ui, sans-serif; -webkit-font-smoothing: antialiased; font-variant-numeric: tabular-nums; }
.od *, .od *::before, .od *::after { box-sizing: border-box; }
.od a { color: inherit; text-decoration: none; }
.od :focus-visible { outline: 2px solid var(--od-ink); outline-offset: 3px; }
.od-crumbs { font-size: 13px; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; color: var(--od-muted); padding-bottom: 24px; }
.od-crumbs a { text-decoration: underline; text-decoration-color: var(--od-rule); text-underline-offset: 4px; transition: text-decoration-color 0.2s cubic-bezier(0.44, 0, 0.56, 1); }
.od-crumbs a:hover { text-decoration-color: var(--od-ink); color: var(--od-ink); }
.od-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 32px; border-top: 1px solid var(--od-rule); padding-top: 24px; }
.od-figure { margin: 0; position: relative; aspect-ratio: 1; max-height: 78vh; width: 100%; }
.od-figure img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; object-position: center top; mix-blend-mode: multiply; }
.od-ghost { background: rgba(0, 0, 0, 0.03); }
.od-text { display: grid; gap: 16px; align-content: start; min-width: 0; }
.od-name { margin: 0; font-size: 32px; font-weight: 700; line-height: 1.15; letter-spacing: -0.04em; text-wrap: balance; }
.od-edition { margin: -8px 0 0; font-family: "Literata", Georgia, serif; font-style: italic; font-size: 18px; line-height: 1.45; color: var(--od-ink); }
.od-facts { margin: 8px 0 0; display: grid; }
.od-fact { display: grid; grid-template-columns: 128px minmax(0, 1fr); gap: 16px; border-top: 1px solid var(--od-rule); padding: 9px 0; }
.od-fact:last-child { border-bottom: 1px solid var(--od-rule); }
.od-fact dt { font-size: 12px; font-weight: 500; line-height: 1.7; letter-spacing: 0.06em; text-transform: uppercase; color: var(--od-muted); }
.od-fact dd { margin: 0; font-family: "Literata", Georgia, serif; font-size: 16px; line-height: 1.5; color: var(--od-ink); font-variant-numeric: tabular-nums; }
.od-notes { margin: 8px 0 0; font-family: "Literata", Georgia, serif; font-size: 17px; line-height: 1.6; color: #2b2a27; max-width: 34em; text-wrap: pretty; }
.od-notes a { text-decoration: underline; text-underline-offset: 3px; }
.od-missing { display: grid; gap: 12px; border-top: 1px solid var(--od-rule); padding-top: 24px; }
.od-label { display: block; margin: 0; font-size: 12px; font-weight: 500; line-height: 1.5; letter-spacing: 0.06em; text-transform: uppercase; color: var(--od-muted); }
.od-essays ul { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 12px; }
.od-essays a { display: grid; gap: 2px; }
.od-essay-title { font-size: 19px; font-weight: 600; line-height: 1.25; letter-spacing: -0.03em; text-decoration: underline; text-decoration-thickness: 1px; text-decoration-color: var(--od-rule); text-underline-offset: 4px; transition: text-decoration-color 0.2s cubic-bezier(0.44, 0, 0.56, 1); }
.od-essays a:hover .od-essay-title { text-decoration-color: var(--od-ink); }
.od-essay-meta { font-family: "Literata", Georgia, serif; font-size: 14px; color: var(--od-muted); font-variant-numeric: tabular-nums; }
.od-pager { display: flex; justify-content: space-between; gap: 24px; border-top: 1px solid var(--od-rule); margin-top: 48px; padding-top: 16px; }
.od-pager a { display: grid; gap: 2px; min-width: 0; }
.od-next { text-align: right; }
.od-pager-name { font-size: 15px; font-weight: 600; letter-spacing: -0.02em; }
.od-pager a:hover .od-pager-name { text-decoration: underline; text-underline-offset: 3px; }
@container (min-width: 760px) {
    .od-layout { grid-template-columns: minmax(0, 7fr) minmax(0, 5fr); gap: 48px; }
    .od-name { font-size: 40px; }
    .od-text { position: sticky; top: 24px; }
}
@media (prefers-reduced-motion: reduce) { .od a, .od-essay-title, .od-crumbs a { transition: none; } }
`

addPropertyControls(ObjectDetail, {
    collectionPath: { type: ControlType.String, title: "Collection path", defaultValue: "/collection" },
    objectPath: { type: ControlType.String, title: "Object path", defaultValue: "/collection/object?no=" },
    essayPath: { type: ControlType.String, title: "Essay path", defaultValue: "/collection/essays/" },
    sampleNo: { type: ControlType.String, title: "Canvas object", defaultValue: "MCDPKG0747", description: "Shown on the Framer canvas only. On the site, the address chooses the object." },
    paper: { type: ControlType.Color, title: "Paper", defaultValue: "#E8E7E3" },
    ink: { type: ControlType.Color, title: "Ink", defaultValue: "#161613" },
    muted: { type: ControlType.Color, title: "Muted", defaultValue: "#5E5D59" },
    rule: { type: ControlType.Color, title: "Rule", defaultValue: "#C6C4BE" },
})
