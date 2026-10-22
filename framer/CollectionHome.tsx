import { startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

// The Collection's home page. On wide screens: a ledger of the latest essays
// beside a day's selection of objects from the archive. Hovering an essay
// lifts its objects into their own row, level with the essay, and draws a
// line between the two; the rest of the selection slides down as one block.
// On narrow screens: links to the full collection and the essay archive,
// then the latest essays with a few of their objects as cards.
// Items and essays come from the GitHub repository nunnethan/packaging-archive
// through jsDelivr.

const REPO = "nunnethan/packaging-archive"
const BASE = `https://cdn.jsdelivr.net/gh/${REPO}@main/`
const WIDE = 840 // below this width the phone layout is used
const CARD_TEXT = 64 // height of a card's padding, number, name and meta line
const GAP = 40 // space between an essay's row and the rest of the selection
const EASE = "cubic-bezier(0.22, 0.8, 0.24, 1)"

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
        const get = (file: string) =>
            fetch(BASE + file, { cache: "no-cache" }).then((r) => {
                if (!r.ok) throw new Error(`${file}: ${r.status}`)
                return r.json()
            })
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

function formatDate(iso: string) {
    const d = new Date(iso + "T12:00:00Z")
    return isNaN(+d) ? iso : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
}

// The same selection for everyone on a given day: a shuffle seeded by the date.
function seededShuffle<T>(list: T[], seed: string): T[] {
    let h = 2166136261
    for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619)
    const rand = () => {
        h = (h + 0x6d2b79f5) | 0
        let t = Math.imul(h ^ (h >>> 15), 1 | h)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const out = list.slice()
    for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1))
        ;[out[i], out[j]] = [out[j], out[i]]
    }
    return out
}

interface Props {
    count: number
    essayCount: number
    objectPath: string
    essayPath: string
    allPath: string
    archivePath: string
    stickyTop: number
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
export default function CollectionHome(props: Props) {
    const {
        count = 36,
        essayCount = 3,
        objectPath = "/collection/object?no=",
        essayPath = "/collection/essays/",
        allPath = "/collection/all",
        archivePath = "/collection/essays",
        stickyTop = 112,
        paper = "#E8E7E3",
        ink = "#161613",
        muted = "#5E5D59",
        rule = "#C6C4BE",
    } = props
    const [archive, setArchive] = useState<Archive | null>(null)
    const [failed, setFailed] = useState(false)
    const [showDrafts, setShowDrafts] = useState(false)
    const [day, setDay] = useState("")
    const [width, setWidth] = useState(0)
    const [sheetW, setSheetW] = useState(0)
    const [hl, setHl] = useState<string | null>(null)
    const [bandY, setBandY] = useState<Record<string, number>>({})
    const [line, setLine] = useState({ left: 0, top: 0, width: 0, on: false })
    const root = useRef<HTMLDivElement>(null)
    const wrap = useRef<HTMLDivElement>(null)
    const side = useRef<HTMLElement>(null)
    const sheet = useRef<HTMLUListElement>(null)
    const leave = useRef<ReturnType<typeof setTimeout> | null>(null)

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
        setDay(new Date().toISOString().slice(0, 10))
        load()
    }, [load])

    // Track the component's width (layout) and the selection's width (columns).
    useEffect(() => {
        if (typeof ResizeObserver === "undefined") return
        const ro = new ResizeObserver(() => {
            if (root.current) setWidth(root.current.clientWidth)
            if (sheet.current) setSheetW(sheet.current.clientWidth)
        })
        if (root.current) ro.observe(root.current)
        if (sheet.current) ro.observe(sheet.current)
        return () => ro.disconnect()
    }, [archive, width >= WIDE])

    const wide = width >= WIDE

    const essays = useMemo(() => {
        const list = (archive?.essays || []).filter((e) => showDrafts || !e.draft)
        return list.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, essayCount)
    }, [archive, showDrafts, essayCount])

    const byNo = useMemo(() => new Map((archive?.items || []).map((i) => [i.no, i])), [archive])

    // Each essay's objects, in the order the essay discusses them.
    const order = useMemo(() => {
        const m = new Map<string, string[]>()
        for (const e of essays) m.set(e.slug, [...new Set(e.objects)].filter((no) => byNo.has(no)))
        return m
    }, [essays, byNo])

    const selection = useMemo(() => {
        if (!archive || !day) return []
        const featured = [...new Set([...order.values()].flat())]
        const rest = seededShuffle(archive.items.filter((i) => !featured.includes(i.no)), day).slice(0, Math.max(0, count - featured.length))
        return seededShuffle([...featured.map((no) => byNo.get(no)!), ...rest], day + "/order")
    }, [archive, day, order, byNo, count])

    const cols = sheetW >= 640 ? 6 : 4
    const colW = sheetW / cols
    const H = colW + CARD_TEXT

    const hlNow = useRef<string | null>(null)
    hlNow.current = hl
    const pending = useRef<ReturnType<typeof setTimeout> | null>(null)
    const clear = () => {
        if (leave.current) clearTimeout(leave.current)
        if (pending.current) clearTimeout(pending.current)
    }
    // Passing over another essay on the way to the current one's objects
    // shouldn't take over: switching waits until the pointer rests there.
    const enter = (slug: string, now = false) => {
        clear()
        if (now || !hlNow.current || hlNow.current === slug) setHl(slug)
        else pending.current = setTimeout(() => setHl(slug), 250)
    }
    // Leaving lingers long enough to cross the gap to the essay's row; while
    // the pointer or focus is in the selection, the current essay stays put.
    const exit = () => {
        clear()
        leave.current = setTimeout(() => setHl(null), 400)
    }
    const stay = () => clear()
    useEffect(() => clear, [])

    // Where the hovered title sits relative to the page and the selection.
    const measure = useCallback(() => {
        if (!hl || !wrap.current || !side.current || !sheet.current) return null
        const title = wrap.current.querySelector(`[data-essay="${hl}"] .ch-t`)
        if (!title) return null
        const rects = title.getClientRects()
        const last = rects[rects.length - 1]
        const W = wrap.current.getBoundingClientRect()
        const S = sheet.current.getBoundingClientRect()
        const cy = last.top + last.height / 2
        const x0 = side.current.getBoundingClientRect().right + 12
        return { cy: cy - S.top, line: { left: x0 - W.left, top: cy - W.top, width: Math.max(0, S.left - x0) } }
    }, [hl])

    // Place the essay's row level with its title, and the line between them.
    useLayoutEffect(() => {
        if (!hl || !wide) return
        const m = measure()
        if (!m) return
        const y = Math.max(0, Math.round(m.cy - H / 2))
        setBandY((b) => (b[hl] === y ? b : { ...b, [hl]: y }))
        setLine({ ...m.line, on: true })
    }, [hl, wide, H, measure])

    // The essay list is sticky: while scrolling, the line follows the title and
    // disappears once the title is no longer level with the essay's row.
    useEffect(() => {
        if (!hl || !wide) return
        const onScroll = () => {
            const m = measure()
            if (!m) return
            const y = bandY[hl] || 0
            const rows = Math.ceil((order.get(hl) || []).length / cols)
            setLine({ ...m.line, on: m.cy >= y && m.cy <= y + rows * H })
        }
        window.addEventListener("scroll", onScroll, { passive: true })
        return () => window.removeEventListener("scroll", onScroll)
    }, [hl, wide, H, cols, bandY, order, measure])

    const href = (no: string) => objectPath + encodeURIComponent(no.toLowerCase())
    const vars = { "--ch-paper": paper, "--ch-ink": ink, "--ch-muted": muted, "--ch-rule": rule } as React.CSSProperties

    const card = (item: Item, extra?: { hidden?: boolean }) => (
        <a
            className="ch-cell"
            href={href(item.no)}
            aria-label={`${item.name}, ${metaLine(item)}${item.edition ? `, ${item.edition}` : ""}`}
            aria-hidden={extra?.hidden || undefined}
            tabIndex={extra?.hidden ? -1 : undefined}
        >
            <span className="ch-no">{item.no}</span>
            <span className="ch-mat">
                <img src={item.srcSmall} srcSet={`${item.srcSmall} 600w, ${item.src} 1200w`} sizes="(max-width: 839px) 45vw, 180px" alt="" loading="lazy" decoding="async" />
            </span>
            <span className="ch-name">{item.name}</span>
            <span className="ch-meta">{metaLine(item)}</span>
        </a>
    )

    const itemCount = archive ? archive.items.length.toLocaleString("en-GB") : ""

    // Until the width is known, hold the space without guessing a layout.
    if (!width) return <div ref={root} className="ch" style={{ ...vars, minHeight: 720, ...props.style }} />

    // ——— Narrow screens ———
    if (!wide) {
        return (
            <div ref={root} className="ch" style={{ ...vars, ...props.style }}>
                <style>{CSS}</style>
                <nav className="ch-go" aria-label="The collection">
                    <a href={allPath}>
                        <span className="ch-go-t">Full collection →</span>
                        <span className="ch-go-s">{archive ? `All ${itemCount} objects` : " "}</span>
                    </a>
                    <a href={archivePath}>
                        <span className="ch-go-t">Essay archive →</span>
                        <span className="ch-go-s">{archive ? `${(archive.essays.filter((e) => showDrafts || !e.draft)).length} essays` : " "}</span>
                    </a>
                </nav>
                <section aria-labelledby="ch-latest">
                    <h2 id="ch-latest" className="ch-head">Latest essays</h2>
                    {failed && <Failed onRetry={load} />}
                    {essays.map((e) => {
                        const objs = (order.get(e.slug) || []).map((no) => byNo.get(no)!)
                        const more = objs.length - Math.min(4, objs.length)
                        return (
                            <article key={e.slug} className="ch-pe">
                                <div className="ch-pe-meta">
                                    <time dateTime={e.date}>{formatDate(e.date)}</time>
                                    <span>
                                        {e.readingTime} min · {objs.length} objects{e.draft ? " · draft" : ""}
                                    </span>
                                </div>
                                <h3 className="ch-pe-title">
                                    <a href={essayPath + e.slug}>{e.title}</a>
                                </h3>
                                <p className="ch-stand">{e.standfirst}</p>
                                <ul className="ch-cards">
                                    {objs.slice(0, 4).map((item) => (
                                        <li key={item.no}>{card(item)}</li>
                                    ))}
                                </ul>
                                <a className="ch-more" href={essayPath + e.slug}>
                                    {more === 0 ? "Read the essay →" : `Read, with ${more} more object${more === 1 ? "" : "s"} →`}
                                </a>
                            </article>
                        )
                    })}
                </section>
                {selection.length > 0 && (
                    <section className="ch-today" aria-labelledby="ch-today">
                        <h2 id="ch-today" className="ch-head">
                            Today’s selection
                        </h2>
                        <ul className="ch-cards">
                            {selection
                                .filter((i) => ![...order.values()].flat().includes(i.no))
                                .slice(0, 6)
                                .map((item) => (
                                    <li key={item.no}>{card(item)}</li>
                                ))}
                        </ul>
                        <a className="ch-more" href={allPath}>
                            All {itemCount} objects →
                        </a>
                    </section>
                )}
            </div>
        )
    }

    // ——— Wide screens ———
    const band = hl ? order.get(hl) || [] : []
    const bandRows = Math.ceil(band.length / cols)
    const y0 = hl ? (bandY[hl] || 0) : 0
    const top = hl ? y0 + bandRows * H + GAP : 0
    const rows = Math.ceil(selection.length / cols)
    const sheetH = selection.length ? top + rows * H + 1 : 6 * (colW + CARD_TEXT)
    const at = (i: number, y: number) => `translate(${(i % cols) * colW}px, ${y + Math.floor(i / cols) * H}px)`
    const current = essays.find((e) => e.slug === hl) || essays[0]

    return (
        <div ref={root} className="ch" style={{ ...vars, ...props.style }}>
            <style>{CSS}</style>
            <div ref={wrap} className="ch-wrap">
                <aside ref={side} className="ch-side" aria-labelledby="ch-latest" style={{ top: stickyTop }}>
                    <div className="ch-lh">
                        <span>Date</span>
                        <h2 id="ch-latest">Latest essays</h2>
                        <span className="ch-r">Objects</span>
                    </div>
                    {failed && <Failed onRetry={load} />}
                    {essays.map((e) => (
                        <a
                            key={e.slug}
                            className="ch-row"
                            href={essayPath + e.slug}
                            data-essay={e.slug}
                            onMouseEnter={() => enter(e.slug)}
                            onMouseLeave={exit}
                            onFocus={() => enter(e.slug, true)}
                            onBlur={exit}
                            style={{ opacity: hl && hl !== e.slug ? 0.35 : 1 }}
                        >
                            <time className="ch-date" dateTime={e.date}>
                                {formatDate(e.date)}
                            </time>
                            <span className="ch-title">
                                <span className="ch-t">{e.title}</span>
                            </span>
                            <span className="ch-r ch-count">
                                {(order.get(e.slug) || []).length}
                                <span className="ch-sr"> objects</span>
                            </span>
                        </a>
                    ))}
                    {current && (
                        <div className="ch-preview" aria-live="polite">
                            <span className="ch-preview-k">
                                {current.title} · {current.readingTime} min read{current.draft ? " · draft" : ""}
                            </span>
                            <p className="ch-stand">{current.standfirst}</p>
                            <a className="ch-read" href={essayPath + current.slug}>
                                Read the essay →
                            </a>
                        </div>
                    )}
                    <a className="ch-link" href={archivePath}>
                        The essay archive →
                    </a>
                </aside>
                <section className="ch-sec" aria-labelledby="ch-today">
                    <div className="ch-sh">
                        <h2 id="ch-today">Today’s selection</h2>
                        <span>{archive ? `${selection.length} of ${itemCount}` : " "}</span>
                    </div>
                    <ul ref={sheet} className="ch-sheet" style={{ height: sheetH }} onMouseEnter={stay} onMouseLeave={exit} onFocus={stay} onBlur={exit}>
                        {colW > 0 &&
                            selection.map((item, k) => (
                                <li
                                    key={"slot-" + item.no}
                                    className="ch-slot"
                                    aria-hidden="true"
                                    style={{
                                        width: colW + 1,
                                        height: H + 1,
                                        transform: at(k, top),
                                        opacity: band.includes(item.no) ? 1 : 0,
                                        transition: hl ? `transform .6s ${EASE} 200ms, opacity .25s ease 0ms` : `transform .6s ${EASE} 0ms, opacity .25s ease 450ms`,
                                    }}
                                />
                            ))}
                        {colW > 0 &&
                            selection.map((item, k) => (
                                <li key={item.no} className="ch-li" style={{ width: colW + 1, height: H + 1, transform: at(k, top), transitionDelay: hl ? "200ms" : "0ms" }}>
                                    <div className="ch-fade" style={{ opacity: !hl ? 1 : band.includes(item.no) ? 0 : 0.4, transitionDelay: hl ? "0ms" : "480ms" }}>
                                        {card(item)}
                                    </div>
                                </li>
                            ))}
                        {colW > 0 &&
                            essays.flatMap((e) =>
                                (order.get(e.slug) || []).map((no, i) => {
                                    const shown = hl === e.slug
                                    return (
                                        <li
                                            key={e.slug + "/" + no}
                                            className="ch-li ch-copy"
                                            style={{
                                                width: colW + 1,
                                                height: H + 1,
                                                transform: at(i, bandY[e.slug] || 0),
                                                opacity: shown ? 1 : 0,
                                                transitionDelay: shown ? "150ms" : "0ms",
                                                pointerEvents: shown ? "auto" : "none",
                                            }}
                                        >
                                            {card(byNo.get(no)!, { hidden: !shown })}
                                        </li>
                                    )
                                })
                            )}
                        <li className="ch-cap" aria-hidden="true" style={{ transform: `translateY(${y0 + bandRows * H + 14}px)`, opacity: hl ? 1 : 0 }}>
                            Also on this page
                        </li>
                    </ul>
                    <div className="ch-foot">
                        <span>{archive ? "A new selection every day." : " "}</span>
                        <a className="ch-link" href={allPath}>
                            {archive ? `All ${itemCount} objects →` : "All objects →"}
                        </a>
                    </div>
                </section>
                <span
                    className="ch-line"
                    aria-hidden="true"
                    style={{ left: line.left, top: line.top, width: line.width, transform: hl && line.on ? "scaleX(1)" : "scaleX(0)", transitionDelay: hl && line.on ? "500ms" : "0ms" }}
                />
            </div>
        </div>
    )
}

function Failed({ onRetry }: { onRetry: () => void }) {
    return (
        <p className="ch-failed">
            The collection couldn’t be loaded.{" "}
            <button type="button" onClick={onRetry}>
                Try again
            </button>
        </p>
    )
}

const CSS = `
.ch { width: 100%; color: var(--ch-ink); background: var(--ch-paper); font-family: "IBM Plex Sans", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.ch *, .ch *::before, .ch *::after { box-sizing: border-box; }
.ch a { color: inherit; text-decoration: none; }
.ch :focus-visible { outline: 2px solid var(--ch-ink); outline-offset: 2px; }
.ch-failed { margin: 0; padding: 16px 0; font-family: "Literata", Georgia, serif; font-size: 15px; color: var(--ch-muted); }
.ch-failed button { font: inherit; color: var(--ch-ink); background: none; border: 0; padding: 0; text-decoration: underline; cursor: pointer; }
.ch-link, .ch-more, .ch-read { font-size: 13px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; text-decoration: underline !important; text-underline-offset: 3px; }
.ch-stand { font-family: "Literata", Georgia, serif; font-size: 15px; line-height: 1.5; font-variant-numeric: oldstyle-nums; }

/* Cards: the same as the register's */
.ch-cell { display: grid; grid-template-rows: auto auto auto auto; align-content: start; gap: 4px; width: 100%; height: 100%; padding: 10px 10px 12px; border: 1px solid var(--ch-rule); background: var(--ch-paper); min-width: 0; overflow: hidden; }
.ch-no { font-size: 11px; line-height: 1.4; letter-spacing: 0.03em; color: var(--ch-muted); font-variant-numeric: tabular-nums; }
.ch-mat { position: relative; display: block; aspect-ratio: 1; overflow: hidden; }
.ch-mat img { position: absolute; inset: 7%; width: 86%; height: 86%; object-fit: contain; mix-blend-mode: multiply; transition: transform 0.2s cubic-bezier(0.44, 0, 0.56, 1); }
.ch-name, .ch-meta { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ch-name { font-size: 13px; font-weight: 600; line-height: 1.35; letter-spacing: -0.02em; text-underline-offset: 3px; }
.ch-meta { font-family: "Literata", Georgia, serif; font-size: 12px; line-height: 1.45; color: var(--ch-muted); font-variant-numeric: oldstyle-nums; }
.ch-cell:hover .ch-mat img { transform: scale(1.04); }
.ch-cell:hover .ch-name { text-decoration: underline; text-decoration-thickness: 1px; }

/* Wide: ledger and selection */
.ch-wrap { position: relative; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 24px; align-items: start; }
.ch-side { position: sticky; display: flex; flex-direction: column; }
.ch-lh { display: grid; grid-template-columns: 88px minmax(0, 1fr) 56px; gap: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--ch-ink); font-size: 11px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ch-muted); }
.ch-lh h2 { margin: 0; font: inherit; }
.ch-r { text-align: right; }
.ch-row { display: grid; grid-template-columns: 88px minmax(0, 1fr) 56px; gap: 16px; align-items: baseline; padding: 16px 0; border-bottom: 1px solid var(--ch-rule); transition: opacity 0.3s cubic-bezier(0.44, 0, 0.56, 1); }
.ch-row:hover .ch-t { text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; }
.ch-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.ch-preview { display: flex; flex-direction: column; gap: 8px; min-height: 200px; padding: 16px 0 20px; border-bottom: 1px solid var(--ch-rule); }
.ch-preview-k { font-size: 11px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ch-muted); }
.ch-preview .ch-stand { margin: 0; }
.ch-preview .ch-read { align-self: flex-start; }
.ch-date { font-family: "Literata", Georgia, serif; font-size: 13px; color: var(--ch-muted); font-variant-numeric: oldstyle-nums; }
.ch-title { font-size: 20px; font-weight: 600; letter-spacing: -0.025em; line-height: 1.2; text-wrap: balance; }
.ch-count { font-size: 13px; font-variant-numeric: tabular-nums; }
.ch-side > .ch-link { margin-top: 20px; align-self: flex-start; }
.ch-sec { grid-column: 2 / span 2; display: flex; flex-direction: column; gap: 16px; min-width: 0; }
.ch-sh { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; padding-bottom: 8px; border-bottom: 1px solid var(--ch-ink); font-size: 11px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ch-muted); }
.ch-sh h2 { margin: 0; font: inherit; }
.ch-sh span { font-variant-numeric: tabular-nums; }
.ch-sheet { position: relative; list-style: none; margin: 0; padding: 0; transition: height 0.6s ${EASE}; }
.ch-li, .ch-slot { position: absolute; top: 0; left: 0; display: flex; }
.ch-li { transition: transform 0.6s ${EASE}; }
.ch-copy { transition: opacity 0.35s cubic-bezier(0.44, 0, 0.56, 1); }
.ch-fade { display: flex; width: 100%; height: 100%; transition: opacity 0.35s cubic-bezier(0.44, 0, 0.56, 1); }
.ch-slot { border: 1px solid var(--ch-rule); background: rgba(22, 22, 19, 0.025); }
.ch-cap { position: absolute; top: 0; left: 0; list-style: none; font-size: 11px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ch-muted); transition: transform 0.6s ${EASE}, opacity 0.3s; }
.ch-foot { display: flex; justify-content: space-between; align-items: baseline; gap: 16px; font-family: "Literata", Georgia, serif; font-size: 14px; color: var(--ch-muted); }
.ch-foot .ch-link { font-family: "IBM Plex Sans", system-ui, sans-serif; color: var(--ch-ink); }
.ch-line { position: absolute; height: 1px; background: var(--ch-muted); transform-origin: left center; pointer-events: none; transition: transform 0.35s cubic-bezier(0.44, 0, 0.56, 1); }

/* Narrow: links, then the latest essays */
.ch-go { display: grid; grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); border-top: 1px solid var(--ch-rule); border-left: 1px solid var(--ch-rule); margin-bottom: 28px; }
.ch-go a { display: flex; flex-direction: column; justify-content: center; gap: 2px; min-height: 64px; padding: 10px 12px; border-right: 1px solid var(--ch-rule); border-bottom: 1px solid var(--ch-rule); }
.ch-go-t { font-size: 17px; font-weight: 600; letter-spacing: -0.02em; }
.ch-go a:hover .ch-go-t { text-decoration: underline; text-underline-offset: 3px; }
.ch-go-s { font-family: "Literata", Georgia, serif; font-size: 12px; color: var(--ch-muted); }
.ch-head { margin: 0; padding-bottom: 8px; border-bottom: 1px solid var(--ch-ink); font-size: 11px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ch-muted); }
.ch-pe { display: flex; flex-direction: column; gap: 10px; padding: 18px 0 8px; border-bottom: 1px solid var(--ch-rule); }
.ch-pe-meta { display: flex; justify-content: space-between; gap: 12px; font-family: "Literata", Georgia, serif; font-size: 13px; color: var(--ch-muted); font-variant-numeric: oldstyle-nums; }
.ch-pe-title { margin: 0; font-size: 24px; font-weight: 600; letter-spacing: -0.03em; line-height: 1.15; }
.ch-pe .ch-stand { margin: 0; font-size: 16px; }
.ch-cards { list-style: none; margin: 4px 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.ch-cards li { display: flex; margin: 0 -1px -1px 0; }
.ch-more { align-self: flex-start; padding: 12px 0; }
.ch-today { display: flex; flex-direction: column; gap: 12px; margin-top: 32px; }

@media (prefers-reduced-motion: reduce) {
    .ch-sheet, .ch-li, .ch-slot, .ch-copy, .ch-fade, .ch-cap, .ch-line { transition: none !important; }
}
`

addPropertyControls(CollectionHome, {
    count: { type: ControlType.Number, title: "Objects", defaultValue: 36, min: 12, max: 60, step: 1 },
    essayCount: { type: ControlType.Number, title: "Essays", defaultValue: 3, min: 1, max: 6, step: 1 },
    objectPath: { type: ControlType.String, title: "Object path", defaultValue: "/collection/object?no=" },
    essayPath: { type: ControlType.String, title: "Essay path", defaultValue: "/collection/essays/" },
    allPath: { type: ControlType.String, title: "All objects", defaultValue: "/collection/all" },
    archivePath: { type: ControlType.String, title: "Essay archive", defaultValue: "/collection/essays" },
    stickyTop: { type: ControlType.Number, title: "Sticky top", defaultValue: 112, min: 0, max: 300, step: 1, unit: "px" },
    paper: { type: ControlType.Color, title: "Paper", defaultValue: "#E8E7E3" },
    ink: { type: ControlType.Color, title: "Ink", defaultValue: "#161613" },
    muted: { type: ControlType.Color, title: "Muted", defaultValue: "#5E5D59" },
    rule: { type: ControlType.Color, title: "Rule", defaultValue: "#C6C4BE" },
})
