import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

// The public GitHub repository that holds items.json and the images, served through jsDelivr.
// Change this one line to point the component somewhere else.
const REPO = "nunnethan/packaging-archive"
const BASE = `https://cdn.jsdelivr.net/gh/${REPO}@main/`

type Item = {
    no: string
    name: string
    type: string
    country: string
    year: string
    edition: string
    observation: string
    src: string
    srcSmall: string
}

type Archive = { items: Item[]; size: number | null }

// Stands in, hidden, to reserve the label's space until an item is chosen
const PLACEHOLDER: Item = {
    no: "MCDPKG0000",
    name: "From the collection",
    type: "Type",
    country: "Country",
    year: "2000",
    edition: "",
    observation: "",
    src: "",
    srcSmall: "",
}

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "")
const url = (path: string) => (!path ? "" : /^https?:\/\//.test(path) ? path : BASE + path.replace(/^\//, ""))

// Keeps only items with what the label needs, so one bad entry can't break the section
function parseArchive(data: any): Archive {
    const list: any[] = Array.isArray(data?.items) ? data.items : []
    const items = list
        .map((raw) => ({
            no: text(raw?.catalogue_no),
            name: text(raw?.name),
            type: text(raw?.type),
            country: text(raw?.country),
            year: text(raw?.year),
            edition: text(raw?.edition),
            observation: text(raw?.observation),
            src: url(text(raw?.image)),
            srcSmall: url(text(raw?.image_small)),
        }))
        .filter((item) => item.no && item.name && item.type && item.country && item.src)
    const size = Number.isInteger(data?.archive_size) && data.archive_size > 0 ? data.archive_size : null
    return { items, size }
}

// One request per page load, shared by every copy of the component
let archiveRequest: Promise<Archive> | null = null
function loadArchive() {
    if (!archiveRequest) {
        // jsDelivr tells browsers to keep files for a week, so check for a newer copy each visit
        archiveRequest = fetch(BASE + "items.json", { cache: "no-cache" })
            .then((res) => (res.ok ? res.json() : Promise.reject(res.status)))
            .then(parseArchive)
            .catch(() => {
                archiveRequest = null
                return { items: [], size: null }
            })
    }
    return archiveRequest
}

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect

const FADE_MS = 200
const SIZES = "(max-width: 809.98px) 120px, 280px"

const srcSet = (item: Item) => (item.srcSmall ? `${item.srcSmall} 600w, ${item.src} 1200w` : `${item.src} 1200w`)
const yearOf = (item: Item) => item.year || "undated"
const altOf = (item: Item) => `${item.name}, ${item.type}, ${item.country}, ${yearOf(item)}`
const prefersReducedMotion = () =>
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches

function randomIndex(count: number, exclude: number | null) {
    if (count < 2) return 0
    let i = Math.floor(Math.random() * (count - (exclude === null ? 0 : 1)))
    if (exclude !== null && i >= exclude) i += 1
    return i
}

type Props = {
    background: string
    primary: string
    secondary: string
    rule: string
    mat: string
    contentWidth: number
    leftOffset: number
    mobileGutter: number
    itemCount: number
    collectionUrl: string
    objectPath: string
}

/**
 * A randomly chosen item from the packaging archive, labelled like a museum
 * object. Items and images load from the GitHub repository in REPO. Renders an
 * empty mat on the server and picks the item after mount, so pre-rendered
 * pages hydrate without mismatches or layout shift.
 *
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight auto
 */
export default function CollectionItem(props: Props) {
    const { background, primary, secondary, rule, mat, contentWidth, leftOffset, mobileGutter, itemCount, collectionUrl, objectPath } = props
    const isCanvas = RenderTarget.current() === RenderTarget.canvas

    const [archive, setArchive] = useState<Archive | null>(null)
    const [index, setIndex] = useState<number | null>(null)
    const [ready, setReady] = useState(isCanvas)
    const [faded, setFaded] = useState(false)
    const [announcement, setAnnouncement] = useState("")
    const busy = useRef(false)
    const imgRef = useRef<HTMLImageElement>(null)

    const gridRef = useRef<HTMLDivElement>(null)
    const nameRef = useRef<HTMLParagraphElement>(null)
    const labelRef = useRef<HTMLDivElement>(null)
    const [leaderTop, setLeaderTop] = useState<number | null>(null)
    const [matSize, setMatSize] = useState<number | null>(null)

    // Load the items and choose the first one, only on the client
    useEffect(() => {
        let cancelled = false
        loadArchive().then((loaded) => {
            if (cancelled || !loaded.items.length) return
            setArchive(loaded)
            setIndex(isCanvas ? 0 : randomIndex(loaded.items.length, null))
        })
        return () => {
            cancelled = true
        }
    }, [isCanvas])

    const items = archive?.items ?? []
    const item = index === null ? null : items[index] ?? null

    // A cached image can finish loading before its load handler is attached
    useEffect(() => {
        if (imgRef.current?.complete && imgRef.current.naturalWidth) setReady(true)
    }, [index])

    const another = useCallback(() => {
        if (busy.current || index === null || items.length < 2) return
        busy.current = true
        const next = randomIndex(items.length, index)
        const nextItem = items[next]
        const swap = () => {
            const reduce = prefersReducedMotion()
            const show = () => {
                setIndex(next)
                setReady(false) // The new image fades in from its own load event
                setFaded(false)
                setAnnouncement(`Now showing ${altOf(nextItem)}`)
                busy.current = false
            }
            if (reduce) return show()
            setFaded(true)
            window.setTimeout(show, FADE_MS / 2)
        }
        // Wait for the next image so a label is never paired with a blank mat
        const img = new Image()
        img.sizes = SIZES
        img.srcset = srcSet(nextItem)
        img.src = nextItem.src
        const done = () => swap()
        if (img.decode) img.decode().then(done, done)
        else {
            img.onload = done
            img.onerror = done
        }
    }, [index, items])

    // Draw the leader line level with the item name
    useIsoLayoutEffect(() => {
        const place = () => {
            const grid = gridRef.current
            const name = nameRef.current
            if (!grid || !name) return
            const g = grid.getBoundingClientRect()
            const n = name.getBoundingClientRect()
            const lineHeight = parseFloat(getComputedStyle(name).lineHeight) || n.height
            setLeaderTop(Math.round(n.top - g.top + lineHeight / 2))
            // The square mat matches the height of the label beside it
            if (labelRef.current) setMatSize(Math.round(labelRef.current.offsetHeight))
        }
        place()
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(place) : null
        if (ro && gridRef.current) ro.observe(gridRef.current)
        return () => ro?.disconnect()
    }, [index])

    const visible = ready && !faded
    // Each item opens its own page in the collection
    const objectHref = item && objectPath ? objectPath + encodeURIComponent(item.no.toLowerCase()) : undefined
    const shown = item || PLACEHOLDER

    const vars = {
        "--ci-bg": background,
        "--ci-primary": primary,
        "--ci-secondary": secondary,
        "--ci-rule": rule,
        "--ci-mat": mat,
        "--ci-width": `${contentWidth}px`,
        "--ci-offset": `${leftOffset}px`,
        "--ci-gutter": `${mobileGutter}px`,
        "--ci-fade": `${FADE_MS / 2}ms`,
    } as React.CSSProperties

    return (
        <section className="ci" style={vars} aria-label="From the collection">
            <style dangerouslySetInnerHTML={{ __html: css }} />
            <div className="ci-inner">
                <div
                    className="ci-grid"
                    ref={gridRef}
                    style={matSize ? ({ "--ci-size": `${matSize}px` } as React.CSSProperties) : undefined}
                >
                    <figure className="ci-mat">
                        {item && (
                            <a className="ci-mat-link" href={objectHref} tabIndex={-1} aria-hidden>
                                <img
                                    key={item.no}
                                    ref={imgRef}
                                    className={"ci-img" + (visible ? " on" : "")}
                                    src={item.src}
                                    srcSet={srcSet(item)}
                                    sizes={SIZES}
                                    alt={altOf(item)}
                                    loading="lazy"
                                    decoding="async"
                                    onLoad={() => setReady(true)}
                                    onError={() => setReady(true)}
                                />
                            </a>
                        )}
                    </figure>
                    {leaderTop !== null && (
                        <div className={"ci-leader" + (visible ? " on" : "")} style={{ top: leaderTop }} aria-hidden />
                    )}
                    <div className="ci-label" ref={labelRef}>
                        <p className="ci-eyebrow">From the collection</p>
                        <div className={"ci-fields" + (visible ? " on" : "")} aria-hidden={!visible}>
                            <p className="ci-no">{shown.no}</p>
                            <p className="ci-name" ref={nameRef}>
                                {objectHref ? (
                                    <a className="ci-name-link" href={objectHref}>
                                        {shown.name}
                                    </a>
                                ) : (
                                    shown.name
                                )}
                            </p>
                            <p className="ci-meta">
                                {shown.type} · {shown.country} · {yearOf(shown)}
                            </p>
                            {shown.edition && <p className="ci-edition">{shown.edition}</p>}
                            {shown.observation && <p className="ci-observation">{shown.observation}</p>}
                        </div>
                        <p className="ci-context">
                            One of more than {(archive?.size ?? itemCount).toLocaleString("en-GB")} items in my archive of printed fast-food packaging.
                        </p>
                        <div className="ci-actions">
                            <button type="button" className="ci-action" onClick={another} disabled={items.length < 2}>
                                Another item <span aria-hidden>↻</span>
                            </button>
                            {collectionUrl && (
                                <a className="ci-action" href={collectionUrl}>
                                    See the collection <span aria-hidden>→</span>
                                </a>
                            )}
                        </div>
                        <p className="ci-sr" aria-live="polite">
                            {announcement}
                        </p>
                    </div>
                </div>
            </div>
        </section>
    )
}

const css = `
.ci { width: 100%; background: var(--ci-bg); border-top: 1px solid var(--ci-rule); padding: 96px 0; box-sizing: border-box; }
.ci *, .ci *::before, .ci *::after { box-sizing: border-box; }
.ci p, .ci figure { margin: 0; }
.ci-inner { max-width: var(--ci-width); margin-left: var(--ci-offset); }
.ci-grid { position: relative; display: grid; grid-template-columns: var(--ci-size, 224px) 96px minmax(0, 1fr); align-items: center; }
.ci-mat {
    grid-column: 1; width: var(--ci-size, 224px); height: var(--ci-size, 224px); aspect-ratio: 1 / 1;
    background: var(--ci-mat); padding: calc(var(--ci-size, 224px) * 0.08); display: flex; align-items: center; justify-content: center; overflow: hidden;
}
.ci-mat-link { display: flex; width: 100%; height: 100%; align-items: center; justify-content: center; }
.ci-name-link { color: inherit; text-decoration: none; text-decoration-thickness: 1px; text-underline-offset: 3px; }
.ci-name-link:hover, .ci-grid:has(.ci-mat-link:hover) .ci-name-link { text-decoration: underline; }
.ci-name-link:focus-visible { outline: 1px solid var(--ci-primary); outline-offset: 4px; }
.ci-img { display: block; width: 100%; height: 100%; object-fit: contain; mix-blend-mode: multiply; opacity: 0; transition: opacity var(--ci-fade) ease; }
.ci-img.on { opacity: 1; }
.ci-leader {
    position: absolute; left: var(--ci-size, 224px); width: 84px; height: 1px;
    background: var(--ci-rule); opacity: 0; transition: opacity var(--ci-fade) ease;
}
.ci-leader.on { opacity: 1; }
.ci-label { grid-column: 3; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; min-height: 224px; }
.ci-fields { display: flex; flex-direction: column; align-items: flex-start; opacity: 0; transition: opacity var(--ci-fade) ease; }
.ci-fields.on { opacity: 1; }
.ci-eyebrow {
    font-family: "IBM Plex Sans", sans-serif; font-size: 12px; font-weight: 500; line-height: 1.4;
    letter-spacing: 0.08em; text-transform: uppercase; color: var(--ci-secondary); margin-bottom: 16px !important;
}
.ci-no {
    font-family: "IBM Plex Sans", sans-serif; font-size: 13px; line-height: 1.4; letter-spacing: 0;
    font-variant-numeric: tabular-nums lining-nums; color: var(--ci-secondary); margin-bottom: 6px !important;
}
.ci-name {
    font-family: "IBM Plex Sans", sans-serif; font-size: 21px; font-weight: 600; line-height: 1.3;
    letter-spacing: -0.04em; color: var(--ci-primary); margin-bottom: 8px !important;
}
.ci-meta, .ci-edition {
    font-family: "Literata", serif; font-size: 16px; line-height: 1.5; letter-spacing: -0.01em;
    font-variant-numeric: oldstyle-nums proportional-nums; color: var(--ci-secondary);
}
.ci-edition { font-style: italic; }
.ci-observation {
    font-family: "Literata", serif; font-size: 17px; line-height: 1.55; letter-spacing: -0.01em;
    font-variant-numeric: oldstyle-nums proportional-nums; color: var(--ci-primary); max-width: 34em; margin-top: 16px !important;
}
.ci-context {
    font-family: "Literata", serif; font-size: 14px; line-height: 1.5; letter-spacing: -0.01em;
    font-variant-numeric: oldstyle-nums proportional-nums; color: var(--ci-secondary); margin-top: 24px !important;
}
.ci-actions { display: flex; flex-wrap: wrap; gap: 12px 24px; margin-top: 20px; }
.ci-action {
    appearance: none; background: none; border: 0; padding: 0; margin: 0; cursor: pointer;
    font-family: "IBM Plex Sans", sans-serif; font-size: 13px; font-weight: 500; line-height: 1.4;
    letter-spacing: 0.06em; text-transform: uppercase; color: var(--ci-primary);
    text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px;
    text-decoration-color: var(--ci-primary); transition: text-decoration-color .15s ease;
}
.ci-action:hover { text-decoration-color: var(--ci-secondary); }
.ci-action:focus-visible { outline: 1px solid var(--ci-primary); outline-offset: 4px; }
.ci-action:disabled { cursor: default; }
.ci-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 809.98px) {
    .ci { padding: 64px 0; }
    .ci-inner { padding: 0 var(--ci-gutter); }
    .ci-grid { grid-template-columns: minmax(0, 1fr); }
    .ci-mat, .ci-label { grid-column: 1; }
    .ci-mat { width: 120px; height: 120px; padding: 8px; }
    .ci-label { margin-top: 24px; min-height: 248px; justify-content: flex-start; }
    .ci-leader { display: none; }
}
@media (prefers-reduced-motion: reduce) {
    .ci-img, .ci-fields, .ci-leader, .ci-action { transition: none; }
}
`

CollectionItem.defaultProps = {
    background: "#000000",
    primary: "#F2F2F2",
    secondary: "#999999",
    rule: "#333333",
    mat: "#E8E7E3",
    contentWidth: 1440,
    leftOffset: 0,
    mobileGutter: 16,
    itemCount: 2000,
    collectionUrl: "",
    objectPath: "/collection/object?no=",
}

addPropertyControls(CollectionItem, {
    background: { type: ControlType.Color, title: "Background" },
    primary: { type: ControlType.Color, title: "Primary text" },
    secondary: { type: ControlType.Color, title: "Secondary" },
    rule: { type: ControlType.Color, title: "Rule" },
    mat: { type: ControlType.Color, title: "Image mat" },
    contentWidth: { type: ControlType.Number, title: "Content width", min: 320, max: 2400, step: 8, unit: "px" },
    leftOffset: { type: ControlType.Number, title: "Left offset", min: 0, max: 400, step: 1, unit: "px" },
    mobileGutter: { type: ControlType.Number, title: "Mobile gutter", min: 0, max: 64, step: 1, unit: "px" },
    itemCount: { type: ControlType.Number, title: "Archive size", min: 1, max: 100000, step: 1, displayStepper: true },
    collectionUrl: { type: ControlType.Link, title: "Collection link" },
    objectPath: { type: ControlType.String, title: "Object path" },
})
