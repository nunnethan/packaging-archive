import { startTransition, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

// The full collection: every object in the archive on a ruled specimen
// sheet, or as a ledger. Items come from the GitHub repository
// nunnethan/packaging-archive through jsDelivr. Images only load once their
// card is on screen.

const REPO = "nunnethan/packaging-archive"
const BASE = `https://cdn.jsdelivr.net/gh/${REPO}@main/`
const PAGE = 48

type Item = { no: string; name: string; type: string; country: string; year: string; edition: string; src: string; srcSmall: string; alt: string; sortYear: number }
type Archive = { items: Item[]; size: number | null }
type Filters = { category: string; decade: string; sort: string; view: string }

const DEFAULTS: Filters = { category: "All", decade: "All", sort: "new", view: "grid" }

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

let request: Promise<Archive> | null = null
function loadArchive(): Promise<Archive> {
    if (!request) {
        const get = (file: string) =>
            fetch(BASE + file, { cache: "no-cache" }).then((r) => {
                if (!r.ok) throw new Error(`${file}: ${r.status}`)
                return r.json()
            })
        request = get("items.json")
            .then(parseItems)
            .catch((e) => {
                request = null
                throw e
            })
    }
    return request
}

// One observer for every image: an image gets its source only when its card
// comes within 100px of the screen, so scrolling past the archive costs
// nothing until something is actually seen.
const pending = new Map<Element, () => void>()
let observer: IntersectionObserver | null = null
function whenOnscreen(el: Element, show: () => void) {
    if (typeof IntersectionObserver === "undefined") {
        show()
        return () => {}
    }
    if (!observer) {
        observer = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const done = entry.isIntersecting && pending.get(entry.target)
                    if (!done) continue
                    pending.delete(entry.target)
                    observer!.unobserve(entry.target)
                    done()
                }
            },
            { rootMargin: "100px 0px" }
        )
    }
    pending.set(el, show)
    observer.observe(el)
    return () => {
        pending.delete(el)
        observer?.unobserve(el)
    }
}

function OnscreenImg({ src, srcSet, ...rest }: React.ImgHTMLAttributes<HTMLImageElement>) {
    const ref = useRef<HTMLImageElement>(null)
    const [shown, setShown] = useState(false)
    const [loaded, setLoaded] = useState(false)
    useEffect(() => {
        const el = ref.current
        return el ? whenOnscreen(el, () => setShown(true)) : undefined
    }, [])
    return (
        <img
            ref={ref}
            {...rest}
            src={shown ? src : undefined}
            srcSet={shown ? srcSet : undefined}
            className={loaded ? "cr-on" : undefined}
            onLoad={() => setLoaded(true)}
            onError={() => setLoaded(true)}
        />
    )
}

function decadeOf(item: Item) {
    return item.sortYear ? `${Math.floor(item.sortYear / 10) * 10}s` : "Undated"
}

function metaLine(item: Item) {
    return [item.type, item.country, item.year || "undated"].filter(Boolean).join(" · ")
}

// The card shows the type on the image's mat, so its own line is place and date.
function placeLine(item: Item) {
    return [item.country, item.year || "undated"].filter(Boolean).join(" · ")
}

function counts<T>(list: T[], key: (t: T) => string) {
    const m = new Map<string, number>()
    for (const t of list) m.set(key(t), (m.get(key(t)) || 0) + 1)
    return [...m.entries()]
}

interface Props {
    objectPath: string
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
    const { objectPath = "/collection/object?no=", paper = "#E8E7E3", ink = "#161613", muted = "#5E5D59", rule = "#C6C4BE" } = props
    const [archive, setArchive] = useState<Archive | null>(null)
    const [failed, setFailed] = useState(false)
    const [filters, setFilters] = useState<Filters>(DEFAULTS)
    const [limit, setLimit] = useState(PAGE)
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

    const items = archive?.items || []
    const filtered = useMemo(() => {
        const list = items.filter(
            (i) =>
                (filters.category === "All" || i.type === filters.category) &&
                (filters.decade === "All" || decadeOf(i) === filters.decade)
        )
        if (filters.sort === "old") list.sort((a, b) => (a.sortYear || 9999) - (b.sortYear || 9999) || a.no.localeCompare(b.no))
        else if (filters.sort === "no") list.sort((a, b) => a.no.localeCompare(b.no))
        else list.sort((a, b) => b.sortYear - a.sortYear || a.no.localeCompare(b.no))
        return list
    }, [items, filters])

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

    const status = !archive ? (failed ? "" : "Loading the archive…") : `${filtered.length} ${filtered.length === 1 ? "object" : "objects"}${filters.category !== "All" || filters.decade !== "All" ? " match" : ""}`

    return (
        <div className="cr" style={{ ...props.style, ...vars, position: "relative" }}>
            <style dangerouslySetInnerHTML={{ __html: CSS }} />
            {archive && (
                <div className="cr-filters">
                    {row("Category", "category", [["All", "All", items.length], ...categories.map(([c, n]) => [c, c, n] as [string, string, number])])}
                    {row("Decade", "decade", [["All", "All", items.length], ...decades.map(([d, n]) => [d, d, n] as [string, string, number])])}
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
                        }}
                    >
                        Clear filters
                    </button>
                </p>
            )}

            {archive && filters.view === "grid" && filtered.length > 0 && (
                <ul className="cr-grid">
                    {filtered.slice(0, limit).map((item) => (
                        <li key={item.no} className="cr-cell-li">
                            <ObjectCell item={item} href={href(item.no)} />
                        </li>
                    ))}
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
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map((i) => (
                                <tr key={i.no}>
                                    <td className="cr-l-no">{i.no}</td>
                                    <td>
                                        <OnscreenImg src={i.srcSmall} alt="" decoding="async" width={40} height={40} />
                                    </td>
                                    <td className="cr-l-name">
                                        <a href={href(i.no)}>{i.name}</a>
                                    </td>
                                    <td>{i.type}</td>
                                    <td className="cr-wide">{i.country}</td>
                                    <td>{i.year || "undated"}</td>
                                    <td className="cr-wide cr-ed">{i.edition}</td>
                                </tr>
                            ))}
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
            <span className="cr-mat">
                <span className="cr-tag cr-tag-no">{item.no}</span>
                <OnscreenImg
                    src={item.srcSmall}
                    srcSet={`${item.srcSmall} 600w, ${item.src} 1200w`}
                    sizes="(max-width: 519px) 45vw, (max-width: 799px) 23vw, (max-width: 1099px) 16vw, 180px"
                    alt=""
                    decoding="async"
                />
                <span className="cr-tag cr-tag-type">{item.type}</span>
            </span>
            <span className="cr-name">{item.name}</span>
            <span className="cr-meta">{placeLine(item)}</span>
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
.cr-cell { display: grid; grid-template-rows: auto auto auto; align-content: start; gap: 3px; width: 100%; padding: 10px 10px 12px; border-right: 1px solid var(--cr-rule); border-bottom: 1px solid var(--cr-rule); min-width: 0; }
.cr-mat { position: relative; display: block; aspect-ratio: 1; overflow: hidden; }
.cr-mat img { position: absolute; inset: 15% 7%; width: 86%; height: 70%; object-fit: contain; mix-blend-mode: multiply; opacity: 0; transition: transform 0.2s cubic-bezier(0.44, 0, 0.56, 1), opacity 0.3s ease; }
.cr .cr-on { opacity: 1; }
.cr-name, .cr-meta { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cr-name { font-size: 13px; font-weight: 600; line-height: 1.3; letter-spacing: -0.02em; text-underline-offset: 3px; white-space: normal; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; height: 2.6em; }
.cr-tag { position: absolute; left: 0; max-width: 100%; font-size: 10px; line-height: 1.3; letter-spacing: 0.06em; text-transform: uppercase; color: var(--cr-muted); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cr-tag-no { top: 0; }
.cr-tag-type { bottom: 0; }
.cr-meta { font-family: "Literata", Georgia, serif; font-size: 12px; line-height: 1.45; color: var(--cr-muted); font-variant-numeric: oldstyle-nums; }
.cr-cell:hover .cr-mat img { transform: scale(1.04); }
.cr-cell:hover .cr-name { text-decoration: underline; text-decoration-thickness: 1px; }
.cr-ghost { list-style: none; }
.cr-ghost .cr-mat { background: rgba(0, 0, 0, 0.03); }
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
.cr-ledger img { display: block; width: 40px; height: 40px; object-fit: contain; mix-blend-mode: multiply; opacity: 0; transition: opacity 0.3s ease; }
.cr-ed { font-style: italic; }
.cr-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@container (min-width: 520px) { .cr-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
@container (min-width: 800px) { .cr-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); } }
@container (min-width: 1100px) { .cr-grid { grid-template-columns: repeat(8, minmax(0, 1fr)); } }
@container (max-width: 699px) {
    .cr-row { grid-template-columns: minmax(0, 1fr); }
    .cr-wide { display: none; }
}
@media (prefers-reduced-motion: reduce) {
    .cr-mat img, .cr-ledger img, .cr-opt { transition: none; }
    .cr-cell:hover .cr-mat img { transform: none; }
}
`

addPropertyControls(CollectionRegister, {
    objectPath: { type: ControlType.String, title: "Object path", defaultValue: "/collection/object?no=" },
    paper: { type: ControlType.Color, title: "Paper", defaultValue: "#E8E7E3" },
    ink: { type: ControlType.Color, title: "Ink", defaultValue: "#161613" },
    muted: { type: ControlType.Color, title: "Muted", defaultValue: "#5E5D59" },
    rule: { type: ControlType.Color, title: "Rule", defaultValue: "#C6C4BE" },
})
