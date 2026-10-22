import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

// The Collection page's register: every object in the archive on a ruled
// specimen sheet, with essays previewed in the two cells after the first
// object they discuss. Items and essays come from the GitHub repository
// nunnethan/packaging-archive through jsDelivr.

const REPO = "nunnethan/packaging-archive"
const BASE = `https://cdn.jsdelivr.net/gh/${REPO}@main/`
const PAGE = 48

type Item = { no: string; name: string; type: string; country: string; year: string; edition: string; src: string; srcSmall: string; alt: string; sortYear: number }
type Essay = { slug: string; title: string; date: string; standfirst: string; objects: string[]; readingTime: number; draft: boolean }
type Archive = { items: Item[]; essays: Essay[]; size: number | null }
type Filters = { category: string; decade: string; show: string; sort: string; view: string }

const DEFAULTS: Filters = { category: "All", decade: "All", show: "all", sort: "new", view: "grid" }

function text(v: unknown) {
    return typeof v === "string" ? v.trim() : ""
}

function parseItems(data: any): { items: Item[]; size: number | null } {
    const list = Array.isArray(data?.items) ? data.items : []
    const items: Item[] = []
    for (const raw of list) {
        const no = text(raw?.catalogue_no)
        const name = text(raw?.name)
        const image = text(raw?.image)
        if (!no || !name || !image) continue
        const year = text(raw?.year)
        const m = /(\d{4})/.exec(year)
        items.push({
            no,
            name,
            type: text(raw?.type) || "Uncategorised",
            country: text(raw?.country),
            year,
            edition: text(raw?.edition),
            src: BASE + image,
            srcSmall: BASE + (text(raw?.image_small) || image),
            alt: text(raw?.alt),
            sortYear: m ? +m[1] : 0,
        })
    }
    const size = Number.isInteger(data?.archive_size) && data.archive_size > 0 ? data.archive_size : null
    return { items, size }
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
        const get = (file: string) =>
            fetch(BASE + file, { cache: "no-cache" }).then((r) => {
                if (!r.ok) throw new Error(`${file}: ${r.status}`)
                return r.json()
            })
        request = Promise.all([get("items.json"), get("essays.json").catch(() => ({ essays: [] }))])
            .then(([items, essays]) => ({ ...parseItems(items), essays: parseEssays(essays) }))
            .catch((e) => {
                request = null
                throw e
            })
    }
    return request
}

function decadeOf(item: Item) {
    return item.sortYear ? `${Math.floor(item.sortYear / 10) * 10}s` : "Undated"
}

function metaLine(item: Item) {
    return [item.type, item.country, item.year || "undated"].filter(Boolean).join(" · ")
}

function counts<T>(list: T[], key: (t: T) => string) {
    const m = new Map<string, number>()
    for (const t of list) m.set(key(t), (m.get(key(t)) || 0) + 1)
    return [...m.entries()]
}

interface Props {
    objectPath: string
    essayPath: string
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
export default function CollectionRegister(props: Props) {
    const { objectPath = "/collection/", essayPath = "/collection/essays/", paper = "#E8E7E3", ink = "#161613", muted = "#5E5D59", rule = "#C6C4BE" } = props
    const [archive, setArchive] = useState<Archive | null>(null)
    const [failed, setFailed] = useState(false)
    const [filters, setFilters] = useState<Filters>(DEFAULTS)
    const [limit, setLimit] = useState(PAGE)
    const [showDrafts, setShowDrafts] = useState(false)
    const sentinel = useRef<HTMLDivElement>(null)

    const load = useCallback(() => {
        setFailed(false)
        loadArchive().then(
            (a) => startTransition(() => setArchive(a)),
            () => startTransition(() => setFailed(true))
        )
    }, [])

    useEffect(() => {
        const isCanvas = RenderTarget.current() === RenderTarget.canvas
        if (typeof window !== "undefined" && !isCanvas) {
            const q = new URLSearchParams(window.location.search)
            const next = { ...DEFAULTS }
            for (const key of Object.keys(DEFAULTS) as (keyof Filters)[]) {
                const v = q.get(key)
                if (v) next[key] = v
            }
            setFilters(next)
            setShowDrafts(q.has("drafts"))
        } else {
            setShowDrafts(true)
        }
        load()
    }, [load])

    const update = useCallback((key: keyof Filters, value: string) => {
        startTransition(() => {
            setFilters((f) => {
                const next = { ...f, [key]: value }
                if (typeof window !== "undefined" && RenderTarget.current() !== RenderTarget.canvas) {
                    const q = new URLSearchParams(window.location.search)
                    for (const k of Object.keys(DEFAULTS) as (keyof Filters)[]) {
                        if (next[k] === DEFAULTS[k]) q.delete(k)
                        else q.set(k, next[k])
                    }
                    const qs = q.toString()
                    window.history.replaceState(window.history.state, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash)
                }
                return next
            })
            if (key !== "view") setLimit(PAGE)
        })
    }, [])

    const essays = useMemo(() => (archive?.essays || []).filter((e) => showDrafts || !e.draft), [archive, showDrafts])
    const essaysByObject = useMemo(() => {
        const m = new Map<string, Essay[]>()
        for (const e of essays) for (const no of e.objects) m.set(no, [...(m.get(no) || []), e])
        return m
    }, [essays])

    const items = archive?.items || []
    const filtered = useMemo(() => {
        const list = items.filter(
            (i) =>
                (filters.category === "All" || i.type === filters.category) &&
                (filters.decade === "All" || decadeOf(i) === filters.decade) &&
                (filters.show !== "essays" || essaysByObject.has(i.no))
        )
        if (filters.sort === "old") list.sort((a, b) => (a.sortYear || 9999) - (b.sortYear || 9999) || a.no.localeCompare(b.no))
        else if (filters.sort === "no") list.sort((a, b) => a.no.localeCompare(b.no))
        else list.sort((a, b) => b.sortYear - a.sortYear || a.no.localeCompare(b.no))
        return list
    }, [items, filters, essaysByObject])

    // Each essay appears once, after the first of its objects in the current order.
    const entries = useMemo(() => {
        const placed = new Set<string>()
        return filtered.slice(0, limit).map((item) => {
            const essay = (essaysByObject.get(item.no) || []).find((e) => !placed.has(e.slug))
            if (essay) placed.add(essay.slug)
            return { item, essay }
        })
    }, [filtered, limit, essaysByObject])

    useEffect(() => {
        const el = sentinel.current
        if (!el || filters.view !== "grid" || limit >= filtered.length || typeof IntersectionObserver === "undefined") return
        const io = new IntersectionObserver((e) => {
            if (e[0].isIntersecting) startTransition(() => setLimit((l) => l + PAGE))
        }, { rootMargin: "800px 0px" })
        io.observe(el)
        return () => io.disconnect()
    }, [filters.view, limit, filtered.length])

    const categories = useMemo(() => counts(items, (i) => i.type).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])), [items])
    const decades = useMemo(() => counts(items, decadeOf).sort((a, b) => (a[0] === "Undated" ? 1 : b[0] === "Undated" ? -1 : a[0].localeCompare(b[0]))), [items])
    const withEssays = items.filter((i) => essaysByObject.has(i.no)).length

    const vars = { "--cr-paper": paper, "--cr-ink": ink, "--cr-muted": muted, "--cr-rule": rule } as React.CSSProperties
    const href = (no: string) => objectPath + no.toLowerCase()

    const row = (label: string, key: keyof Filters, options: [string, string, number?][]) => (
        <div className="cr-row" role="group" aria-label={label}>
            <span className="cr-label">{label}</span>
            <div className="cr-opts">
                {options.map(([value, title, n]) => (
                    <button key={value} type="button" className="cr-opt" aria-pressed={filters[key] === value} onClick={() => update(key, value)}>
                        {title}
                        {n !== undefined && <sup>{n}</sup>}
                    </button>
                ))}
            </div>
        </div>
    )

    const status = !archive ? (failed ? "" : "Loading the archive…") : `${filtered.length} ${filtered.length === 1 ? "object" : "objects"}${filters.category !== "All" || filters.decade !== "All" || filters.show !== "all" ? " match" : ""}`

    return (
        <div className="cr" style={{ ...props.style, ...vars, position: "relative" }}>
            <style dangerouslySetInnerHTML={{ __html: CSS }} />
            {archive && (
                <div className="cr-filters">
                    {row("Category", "category", [["All", "All", items.length], ...categories.map(([c, n]) => [c, c, n] as [string, string, number])])}
                    {row("Decade", "decade", [["All", "All", items.length], ...decades.map(([d, n]) => [d, d, n] as [string, string, number])])}
                    {essays.length > 0 && row("Show", "show", [["all", "Everything"], ["essays", "Objects with essays", withEssays]])}
                    {row("Sort", "sort", [["new", "Newest first"], ["old", "Oldest first"], ["no", "Catalogue number"]])}
                </div>
            )}
            <div className="cr-tools">
                <p className="cr-count" aria-live="polite">
                    {status}
                    {archive && archive.size ? <span className="cr-of"> · from more than {archive.size.toLocaleString("en-GB")} in the archive</span> : null}
                </p>
                {archive && (
                    <div className="cr-views" role="group" aria-label="View">
                        {[["grid", "Grid"], ["list", "Ledger"]].map(([v, t]) => (
                            <button key={v} type="button" className="cr-view" aria-pressed={filters.view === v} onClick={() => update("view", v)}>
                                {t}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {failed && (
                <p className="cr-empty">
                    The archive couldn’t be loaded.{" "}
                    <button type="button" className="cr-opt cr-retry" onClick={load}>
                        Try again
                    </button>
                </p>
            )}

            {!archive && !failed && (
                <ul className="cr-grid" aria-hidden="true">
                    {Array.from({ length: 16 }, (_, i) => (
                        <li key={i} className="cr-cell cr-ghost">
                            <span className="cr-no">&nbsp;</span>
                            <span className="cr-mat" />
                            <span className="cr-name">&nbsp;</span>
                            <span className="cr-meta">&nbsp;</span>
                        </li>
                    ))}
                </ul>
            )}

            {archive && filtered.length === 0 && (
                <p className="cr-empty">
                    Nothing matches these filters.{" "}
                    <button
                        type="button"
                        className="cr-opt cr-retry"
                        onClick={() => {
                            update("category", "All")
                            update("decade", "All")
                            update("show", "all")
                        }}
                    >
                        Clear filters
                    </button>
                </p>
            )}

            {archive && filters.view === "grid" && filtered.length > 0 && (
                <ul className="cr-grid">
                    {entries.map(({ item, essay }) =>
                        essay ? (
                            <li key={item.no} className="cr-group">
                                <ObjectCell item={item} href={href(item.no)} />
                                <a className="cr-essay" href={essayPath + essay.slug}>
                                    <span className="cr-essay-in">
                                        <span className="cr-kicker">
                                            Essay · {essay.readingTime} min{essay.draft ? " · draft" : ""}
                                        </span>
                                        <span className="cr-essay-title">{essay.title}</span>
                                        <span className="cr-stand">{essay.standfirst}</span>
                                        <span className="cr-read">Read the essay →</span>
                                    </span>
                                </a>
                            </li>
                        ) : (
                            <li key={item.no} className="cr-cell-li">
                                <ObjectCell item={item} href={href(item.no)} />
                            </li>
                        )
                    )}
                </ul>
            )}

            {archive && filters.view === "list" && filtered.length > 0 && (
                <div className="cr-ledger-wrap">
                    <table className="cr-ledger">
                        <thead>
                            <tr>
                                <th scope="col">No.</th>
                                <th scope="col">
                                    <span className="cr-sr">Image</span>
                                </th>
                                <th scope="col">Name</th>
                                <th scope="col">Category</th>
                                <th scope="col" className="cr-wide">Origin</th>
                                <th scope="col">Date</th>
                                <th scope="col" className="cr-wide">Edition</th>
                                <th scope="col" className="cr-wide">Essay</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((i) => {
                                const e = essaysByObject.get(i.no)?.[0]
                                return (
                                    <tr key={i.no}>
                                        <td className="cr-l-no">{i.no}</td>
                                        <td>
                                            <img src={i.srcSmall} alt="" loading="lazy" decoding="async" width={40} height={40} />
                                        </td>
                                        <td className="cr-l-name">
                                            <a href={href(i.no)}>{i.name}</a>
                                        </td>
                                        <td>{i.type}</td>
                                        <td className="cr-wide">{i.country}</td>
                                        <td>{i.year || "undated"}</td>
                                        <td className="cr-wide cr-ed">{i.edition}</td>
                                        <td className="cr-wide">{e ? <a href={essayPath + e.slug}>{e.title}</a> : ""}</td>
                                    </tr>
                                )
                            })}
                        </tbody>
                    </table>
                </div>
            )}

            {archive && filters.view === "grid" && limit < filtered.length && (
                <div ref={sentinel} className="cr-more">
                    <button type="button" className="cr-opt" onClick={() => setLimit((l) => l + PAGE)}>
                        Show more ({filtered.length - limit} left)
                    </button>
                </div>
            )}
        </div>
    )
}

function ObjectCell({ item, href }: { item: Item; href: string }) {
    return (
        <a className="cr-cell" href={href} aria-label={`${item.name}, ${metaLine(item)}${item.edition ? `, ${item.edition}` : ""}`}>
            <span className="cr-no">{item.no}</span>
            <span className="cr-mat">
                <img
                    src={item.srcSmall}
                    srcSet={`${item.srcSmall} 600w, ${item.src} 1200w`}
                    sizes="(max-width: 519px) 45vw, (max-width: 799px) 23vw, (max-width: 1099px) 16vw, 180px"
                    alt=""
                    loading="lazy"
                    decoding="async"
                />
            </span>
            <span className="cr-name">{item.name}</span>
            <span className="cr-meta">{metaLine(item)}</span>
        </a>
    )
}

const CSS = `
.cr { container-type: inline-size; width: 100%; color: var(--cr-ink); background: var(--cr-paper); font-family: "IBM Plex Sans", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.cr *, .cr *::before, .cr *::after { box-sizing: border-box; }
.cr button { font: inherit; color: inherit; background: none; border: 0; padding: 0; cursor: pointer; }
.cr a { color: inherit; text-decoration: none; }
.cr :focus-visible { outline: 2px solid var(--cr-ink); outline-offset: 2px; }
.cr-filters { display: grid; gap: 8px; padding: 0 0 20px; border-bottom: 1px solid var(--cr-rule); }
.cr-row { display: grid; grid-template-columns: 112px minmax(0, 1fr); gap: 4px 16px; align-items: baseline; }
.cr-label { font-size: 13px; font-weight: 500; line-height: 1.5; letter-spacing: 0.06em; text-transform: uppercase; color: var(--cr-muted); }
.cr-opts { display: flex; flex-wrap: wrap; gap: 2px 16px; }
.cr-opt { font-size: 14px; line-height: 1.5; color: var(--cr-muted) !important; transition: color 0.2s cubic-bezier(0.44, 0, 0.56, 1); text-underline-offset: 4px; }
.cr-opt:hover, .cr-opt[aria-pressed="true"] { color: var(--cr-ink) !important; }
.cr-opt[aria-pressed="true"] { text-decoration: underline; text-decoration-thickness: 1px; }
.cr-opt sup { font-size: 10px; margin-left: 2px; font-variant-numeric: tabular-nums; }
.cr-tools { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; flex-wrap: wrap; padding: 16px 0; }
.cr-count { margin: 0; font-family: "Literata", Georgia, serif; font-size: 15px; line-height: 1.5; color: var(--cr-muted); font-variant-numeric: oldstyle-nums; }
.cr-views { display: flex; gap: 16px; }
.cr-view { font-size: 13px; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; color: var(--cr-muted) !important; text-underline-offset: 4px; }
.cr-view[aria-pressed="true"] { color: var(--cr-ink) !important; text-decoration: underline; }
.cr-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); grid-auto-flow: row dense; border-top: 1px solid var(--cr-rule); border-left: 1px solid var(--cr-rule); }
.cr-cell-li { display: flex; }
.cr-cell { display: grid; grid-template-rows: auto auto auto auto; align-content: start; gap: 4px; width: 100%; padding: 10px 10px 12px; border-right: 1px solid var(--cr-rule); border-bottom: 1px solid var(--cr-rule); min-width: 0; }
.cr-no { font-size: 11px; line-height: 1.4; letter-spacing: 0.03em; color: var(--cr-muted); font-variant-numeric: tabular-nums; }
.cr-mat { position: relative; display: block; aspect-ratio: 1; overflow: hidden; }
.cr-mat img { position: absolute; inset: 7%; width: 86%; height: 86%; object-fit: contain; mix-blend-mode: multiply; transition: transform 0.2s cubic-bezier(0.44, 0, 0.56, 1); }
.cr-name, .cr-meta { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cr-name { font-size: 13px; font-weight: 600; line-height: 1.35; letter-spacing: -0.02em; text-underline-offset: 3px; }
.cr-meta { font-family: "Literata", Georgia, serif; font-size: 12px; line-height: 1.45; color: var(--cr-muted); font-variant-numeric: oldstyle-nums; }
.cr-cell:hover .cr-mat img { transform: scale(1.04); }
.cr-cell:hover .cr-name { text-decoration: underline; text-decoration-thickness: 1px; }
.cr-ghost { list-style: none; }
.cr-ghost .cr-mat { background: rgba(0, 0, 0, 0.03); }
.cr-group { grid-column: span 2; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); box-shadow: inset 0 2px 0 var(--cr-ink); }
.cr-essay { position: relative; display: block; border-right: 1px solid var(--cr-rule); border-bottom: 1px solid var(--cr-rule); min-width: 0; }
.cr-essay-in { position: absolute; inset: 0; container-type: size; display: flex; flex-direction: column; gap: 6px; padding: 12px 14px 14px; overflow: hidden; }
.cr-kicker { font-size: 11px; font-weight: 500; line-height: 1.4; letter-spacing: 0.06em; text-transform: uppercase; color: var(--cr-muted); }
.cr-essay-title { font-size: 19px; font-weight: 600; line-height: 1.2; letter-spacing: -0.035em; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 3; overflow: hidden; text-wrap: balance; }
.cr-stand { flex: 1 1 auto; min-height: 0; font-family: "Literata", Georgia, serif; font-size: 14px; line-height: 1.45; color: var(--cr-ink); opacity: 0.82; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 6; overflow: hidden; font-variant-numeric: oldstyle-nums; }
.cr-read { font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; text-decoration: underline; text-underline-offset: 3px; }
.cr-essay:hover .cr-essay-title { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
@container (max-height: 250px) { .cr-stand { -webkit-line-clamp: 4; } }
@container (max-height: 205px) { .cr-stand { -webkit-line-clamp: 2; } .cr-essay-title { -webkit-line-clamp: 2; font-size: 16px; } }
@container (max-width: 200px) { .cr-essay-title { font-size: 15px; } .cr-stand { font-size: 13px; } }
.cr-more { display: flex; justify-content: center; padding: 24px 0 0; }
.cr-empty { margin: 0; padding: 24px 0; font-family: "Literata", Georgia, serif; font-size: 16px; color: var(--cr-muted); }
.cr-retry { text-decoration: underline; color: var(--cr-ink) !important; }
.cr-ledger-wrap { overflow-x: auto; border-top: 1px solid var(--cr-rule); }
.cr-ledger { width: 100%; border-collapse: collapse; font-variant-numeric: tabular-nums; }
.cr-ledger th { text-align: left; font-size: 12px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: var(--cr-muted); padding: 10px 12px 8px 0; border-bottom: 1px solid var(--cr-rule); white-space: nowrap; }
.cr-ledger td { padding: 6px 12px 6px 0; border-bottom: 1px solid var(--cr-rule); font-family: "Literata", Georgia, serif; font-size: 14px; line-height: 1.4; color: var(--cr-muted); vertical-align: middle; }
.cr-ledger td.cr-l-no { font-family: "IBM Plex Sans", system-ui, sans-serif; font-size: 12px; white-space: nowrap; }
.cr-ledger td.cr-l-name { font-family: "IBM Plex Sans", system-ui, sans-serif; font-weight: 600; font-size: 14px; color: var(--cr-ink); }
.cr-ledger td a { color: var(--cr-ink); text-decoration: underline; text-decoration-color: var(--cr-rule); text-underline-offset: 3px; }
.cr-ledger td a:hover { text-decoration-color: var(--cr-ink); }
.cr-ledger img { display: block; width: 40px; height: 40px; object-fit: contain; mix-blend-mode: multiply; }
.cr-ed { font-style: italic; }
.cr-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@container (min-width: 520px) {
    .cr-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); }
    .cr-group { grid-column: span 3; grid-template-columns: minmax(0, 1fr) minmax(0, 2fr); }
}
@container (min-width: 800px) { .cr-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
@container (min-width: 1100px) { .cr-grid { grid-template-columns: repeat(8, minmax(0, 1fr)); } }
@container (max-width: 699px) {
    .cr-row { grid-template-columns: minmax(0, 1fr); }
    .cr-wide { display: none; }
}
@media (prefers-reduced-motion: reduce) {
    .cr-mat img, .cr-opt { transition: none; }
    .cr-cell:hover .cr-mat img { transform: none; }
}
`

addPropertyControls(CollectionRegister, {
    objectPath: { type: ControlType.String, title: "Object path", defaultValue: "/collection/" },
    essayPath: { type: ControlType.String, title: "Essay path", defaultValue: "/collection/essays/" },
    paper: { type: ControlType.Color, title: "Paper", defaultValue: "#E8E7E3" },
    ink: { type: ControlType.Color, title: "Ink", defaultValue: "#161613" },
    muted: { type: ControlType.Color, title: "Muted", defaultValue: "#5E5D59" },
    rule: { type: ControlType.Color, title: "Rule", defaultValue: "#C6C4BE" },
})
