import { startTransition, useCallback, useEffect, useMemo, useState } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

// The essay archive: every essay, newest first, as a ledger. Each entry shows
// its date, title, standfirst and the objects it discusses as register cards.
// Items and essays come from the GitHub repository nunnethan/packaging-archive
// through jsDelivr.

// Items and images come from media.typen.me (Cloudflare R2, kept in sync with
// the GitHub repository nunnethan/packaging-archive by its GitHub Action). If
// that fails, the same files load from the repository through jsDelivr.
const MEDIA = "https://media.typen.me/collection/"
const FALLBACK = "https://cdn.jsdelivr.net/gh/nunnethan/packaging-archive@main/"
let BASE = MEDIA

// Fetch one of the archive's JSON files, falling back to jsDelivr; images
// then come from wherever the data did.
function getJSON(file: string): Promise<any> {
    const from = (base: string) =>
        fetch(base + file, { cache: "no-cache" }).then((r) => {
            if (!r.ok) throw new Error(`${file}: ${r.status}`)
            return r.json()
        })
    return from(MEDIA).catch(() =>
        from(FALLBACK).then((data) => {
            BASE = FALLBACK
            return data
        })
    )
}

type Item = { no: string; name: string; type: string; country: string; year: string; edition: string; src: string; srcSmall: string }
type Essay = { slug: string; title: string; date: string; standfirst: string; objects: string[]; readingTime: number; draft: boolean }
type Archive = { items: Item[]; essays: Essay[] }

function text(v: unknown) {
    return typeof v === "string" ? v.trim() : ""
}

function parseItems(data: any): Item[] {
    const list = Array.isArray(data?.items) ? data.items : []
    const items: Item[] = []
    for (const raw of list) {
        const no = text(raw?.catalogue_no)
        const name = text(raw?.name)
        const image = text(raw?.image)
        if (!no || !name || !image) continue
        items.push({
            no,
            name,
            type: text(raw?.type) || "Uncategorised",
            country: text(raw?.country),
            year: text(raw?.year),
            edition: text(raw?.edition),
            src: BASE + image,
            srcSmall: BASE + (text(raw?.image_small) || image),
        })
    }
    return items
}

function parseEssays(data: any): Essay[] {
    const list = Array.isArray(data?.essays) ? data.essays : []
    return list
        .filter((e: any) => text(e?.slug) && text(e?.title))
        .map((e: any) => ({
            slug: text(e.slug),
            title: text(e.title),
            date: text(e.date),
            standfirst: text(e.standfirst),
            objects: Array.isArray(e.objects) ? e.objects.filter((o: unknown) => typeof o === "string") : [],
            readingTime: Number(e.reading_time) || 1,
            draft: e.draft === true,
        }))
}

let request: Promise<Archive> | null = null
function loadArchive(): Promise<Archive> {
    if (!request) {
        const get = getJSON
        request = Promise.all([get("items.json"), get("essays.json").catch(() => ({ essays: [] }))])
            .then(([items, essays]) => ({ items: parseItems(items), essays: parseEssays(essays) }))
            .catch((e) => {
                request = null
                throw e
            })
    }
    return request
}

function metaLine(item: Item) {
    return [item.type, item.country, item.year || "undated"].filter(Boolean).join(" · ")
}

// The card shows the type on the image's mat, so its own line is place and date.
function placeLine(item: Item) {
    return [item.country, item.year || "undated"].filter(Boolean).join(" · ")
}

function formatDate(iso: string) {
    const d = new Date(iso + "T12:00:00Z")
    return isNaN(+d) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
}

interface Props {
    objectPath: string
    essayPath: string
    allPath: string
    paper: string
    ink: string
    muted: string
    rule: string
    style?: React.CSSProperties
}

// The site's arrow, as in the image captions: a triangle head on a stem,
// outlined, 13px with a 2.25 stroke, turned to point where it leads.
function Arrow({ dir = "right" }: { dir?: "up" | "right" | "down" | "left" }) {
    const turn = { up: 0, right: 90, down: 180, left: 270 }[dir]
    return (
        <svg viewBox="0 0 24 24" width={13} height={13} aria-hidden="true" focusable="false" style={{ display: "inline-block", verticalAlign: "-2px" }}>
            <g transform={`rotate(${turn} 12 12)`} fill="none" stroke="currentColor" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round">
                <path d="M 0 6.75 L 6.75 0 L 13.5 6.75 Z" transform="translate(5.25 3.75)" />
                <path d="M 0 9.75 L 0 0" transform="translate(12 10.5)" />
            </g>
        </svg>
    )
}

/**
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight auto
 */
export default function EssayArchive(props: Props) {
    const {
        objectPath = "/collection/object?no=",
        essayPath = "/collection/essays/",
        allPath = "/collection/all",
        paper = "#E8E7E3",
        ink = "#161613",
        muted = "#5E5D59",
        rule = "#C6C4BE",
    } = props
    const [archive, setArchive] = useState<Archive | null>(null)
    const [failed, setFailed] = useState(false)
    const [showDrafts, setShowDrafts] = useState(false)

    const load = useCallback(() => {
        setFailed(false)
        loadArchive().then(
            (a) => startTransition(() => setArchive(a)),
            () => startTransition(() => setFailed(true))
        )
    }, [])

    useEffect(() => {
        const isCanvas = RenderTarget.current() === RenderTarget.canvas
        setShowDrafts(isCanvas || (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("drafts")))
        load()
    }, [load])

    const byNo = useMemo(() => new Map((archive?.items || []).map((i) => [i.no, i])), [archive])
    const essays = useMemo(
        () =>
            (archive?.essays || [])
                .filter((e) => showDrafts || !e.draft)
                .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)),
        [archive, showDrafts]
    )

    const href = (no: string) => objectPath + encodeURIComponent(no.toLowerCase())
    const vars = { "--ea-paper": paper, "--ea-ink": ink, "--ea-muted": muted, "--ea-rule": rule } as React.CSSProperties

    return (
        <div className="ea" style={{ ...vars, ...props.style }}>
            <style>{CSS}</style>
            <div className="ea-lh" aria-hidden="true">
                <span>Date</span>
                <span>Essay</span>
                <span className="ea-r">Objects</span>
            </div>
            {failed && (
                <p className="ea-note">
                    The essays couldn’t be loaded.{" "}
                    <button type="button" onClick={load}>
                        Try again
                    </button>
                </p>
            )}
            {archive && essays.length === 0 && <p className="ea-note">No essays yet.</p>}
            <ol className="ea-list">
                {essays.map((e) => {
                    const objs = [...new Set(e.objects)].map((no) => byNo.get(no)).filter(Boolean) as Item[]
                    return (
                        <li key={e.slug} className="ea-row">
                            <time className="ea-date" dateTime={e.date}>
                                {formatDate(e.date)}
                            </time>
                            <div className="ea-body">
                                <h2 className="ea-title">
                                    <a href={essayPath + e.slug}>{e.title}</a>
                                </h2>
                                <p className="ea-stand">{e.standfirst}</p>
                                <a className="ea-link" href={essayPath + e.slug}>
                                    Read · {e.readingTime} min{e.draft ? " · draft" : ""}
                                </a>
                            </div>
                            <span className="ea-r ea-count">{objs.length}</span>
                            {objs.length > 0 && (
                                <ul className="ea-cards" aria-label={`Objects in ${e.title}`}>
                                    {objs.map((item) => (
                                        <li key={item.no}>
                                            <a className="ea-cell" href={href(item.no)} aria-label={`${item.name}, ${metaLine(item)}${item.edition ? `, ${item.edition}` : ""}`}>
                                                <span className="ea-mat">
                                                    <span className="ea-tag ea-tag-no">{item.no}</span>
                                                    <img src={item.srcSmall} srcSet={`${item.srcSmall} 600w, ${item.src} 1200w`} sizes="(max-width: 519px) 45vw, 180px" alt="" loading="lazy" decoding="async" />
                                                    <span className="ea-tag ea-tag-type">{item.type}</span>
                                                </span>
                                                <span className="ea-name">{item.name}</span>
                                                <span className="ea-meta">{placeLine(item)}</span>
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </li>
                    )
                })}
            </ol>
            <a className="ea-link ea-all" href={allPath}>
                {archive ? `All ${archive.items.length.toLocaleString("en-GB")} objects` : "All objects"} <Arrow />
            </a>
        </div>
    )
}

const CSS = `
.ea { container-type: inline-size; width: 100%; color: var(--ea-ink); background: var(--ea-paper); font-family: "IBM Plex Sans", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.ea *, .ea *::before, .ea *::after { box-sizing: border-box; }
.ea a { color: inherit; text-decoration: none; }
.ea :focus-visible { outline: 2px solid var(--ea-ink); outline-offset: 2px; }
.ea-note { margin: 0; padding: 16px 0; font-family: "Literata", Georgia, serif; font-size: 15px; color: var(--ea-muted); }
.ea-note button { font: inherit; color: var(--ea-ink); background: none; border: 0; padding: 0; text-decoration: underline; cursor: pointer; }
.ea-lh, .ea-row { display: grid; grid-template-columns: 88px minmax(0, 1fr) 56px; column-gap: 16px; }
.ea-lh { padding-bottom: 8px; border-bottom: 1px solid var(--ea-ink); font-size: 11px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ea-muted); }
.ea-r { text-align: right; }
.ea-list { list-style: none; margin: 0; padding: 0; }
.ea-row { align-items: baseline; padding: 20px 0 28px; border-bottom: 1px solid var(--ea-rule); }
.ea-date { font-family: "Literata", Georgia, serif; font-size: 13px; color: var(--ea-muted); font-variant-numeric: oldstyle-nums; }
.ea-body { display: flex; flex-direction: column; gap: 8px; max-width: 40em; }
.ea-title { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.03em; line-height: 1.15; text-wrap: balance; }
.ea-title a:hover { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 4px; }
.ea-stand { margin: 0; font-family: "Literata", Georgia, serif; font-size: 16px; line-height: 1.5; font-variant-numeric: oldstyle-nums; }
.ea-link { align-self: flex-start; font-size: 13px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; text-decoration: underline !important; text-underline-offset: 3px; }
.ea-count { font-size: 13px; font-variant-numeric: tabular-nums; }
.ea-all { display: inline-block; margin-top: 24px; }

/* Cards: the same as the register's */
.ea-cards { grid-column: 2 / 4; list-style: none; margin: 20px 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); border-top: 1px solid var(--ea-rule); border-left: 1px solid var(--ea-rule); }
.ea-cards li { display: flex; }
.ea-cell { display: grid; grid-template-rows: auto auto auto; align-content: start; gap: 3px; width: 100%; padding: 10px 10px 12px; border-right: 1px solid var(--ea-rule); border-bottom: 1px solid var(--ea-rule); min-width: 0; }
.ea-mat { position: relative; display: block; aspect-ratio: 1; overflow: hidden; }
.ea-mat img { position: absolute; inset: 15% 7%; width: 86%; height: 70%; object-fit: contain; mix-blend-mode: multiply; transition: transform 0.2s cubic-bezier(0.44, 0, 0.56, 1); }
.ea-name, .ea-meta { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ea-name { font-size: 13px; font-weight: 600; line-height: 1.3; letter-spacing: -0.02em; text-underline-offset: 3px; white-space: normal; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; height: 2.6em; }
.ea-tag { position: absolute; left: 0; max-width: 100%; font-size: 10px; line-height: 1.3; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ea-muted); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ea-tag-no { top: 0; }
.ea-tag-type { bottom: 0; }
.ea-meta { font-family: "Literata", Georgia, serif; font-size: 12px; line-height: 1.45; color: var(--ea-muted); font-variant-numeric: oldstyle-nums; }
.ea-cell:hover .ea-mat img { transform: scale(1.04); }
.ea-cell:hover .ea-name { text-decoration: underline; text-decoration-thickness: 1px; }

@container (min-width: 520px) { .ea-cards { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@container (min-width: 800px) { .ea-cards { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
@container (min-width: 1100px) { .ea-cards { grid-template-columns: repeat(8, minmax(0, 1fr)); } }
@container (max-width: 519px) {
    .ea-lh { display: none; }
    .ea-row { grid-template-columns: minmax(0, 1fr) auto; row-gap: 8px; }
    .ea-date { grid-row: 1; grid-column: 1; }
    .ea-count { grid-row: 1; grid-column: 2; }
    .ea-count::after { content: " objects"; }
    .ea-body { grid-column: 1 / 3; }
    .ea-cards { grid-column: 1 / 3; }
}
`

addPropertyControls(EssayArchive, {
    objectPath: { type: ControlType.String, title: "Object path", defaultValue: "/collection/object?no=" },
    essayPath: { type: ControlType.String, title: "Essay path", defaultValue: "/collection/essays/" },
    allPath: { type: ControlType.String, title: "All objects", defaultValue: "/collection/all" },
    paper: { type: ControlType.Color, title: "Paper", defaultValue: "#E8E7E3" },
    ink: { type: ControlType.Color, title: "Ink", defaultValue: "#161613" },
    muted: { type: ControlType.Color, title: "Muted", defaultValue: "#5E5D59" },
    rule: { type: ControlType.Color, title: "Rule", defaultValue: "#C6C4BE" },
})
