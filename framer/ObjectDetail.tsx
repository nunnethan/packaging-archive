import { startTransition, useEffect, useMemo, useState } from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

// One object from the archive, on its own page. Bound to the Record field of
// the Objects CMS collection, which the sync from GitHub fills in.

type EssayLink = { slug: string; title: string; date: string; standfirst: string; reading_time: number; draft: boolean }
type ObjectRecord = {
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
    images: { src: string; small: string }[]
    essays: EssayLink[]
    prev: { no: string; name: string } | null
    next: { no: string; name: string } | null
}

const SAMPLE: ObjectRecord = {
    no: "MCDPKG0747",
    name: "Large fry box",
    brand: "McDonald’s",
    type: "Fry box",
    country: "UK",
    year: "1991",
    edition: "",
    material: "",
    dimensions: "",
    acquired: "",
    tags: [],
    alt: "Large fry box, Fry box · UK · 1991",
    observation: "",
    images: [
        {
            src: "https://cdn.jsdelivr.net/gh/nunnethan/packaging-archive@main/images/MCDPKG0747-1200.webp",
            small: "https://cdn.jsdelivr.net/gh/nunnethan/packaging-archive@main/images/MCDPKG0747-600.webp",
        },
    ],
    essays: [],
    prev: { no: "MCDPKG0739", name: "Flag" },
    next: { no: "MCDPKG0748", name: "Sugar sachets" },
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
function formatDate(iso: string) {
    const full = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    if (full) return `${+full[3]} ${MONTHS[+full[2] - 1]} ${full[1]}`
    const month = /^(\d{4})-(\d{2})$/.exec(iso)
    if (month) return `${MONTHS[+month[2] - 1]} ${month[1]}`
    return iso
}

function parse(record: string): ObjectRecord | null {
    try {
        const r = JSON.parse(record)
        return r && typeof r.no === "string" ? r : null
    } catch {
        return null
    }
}

interface Props {
    record: string
    collectionPath: string
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
export default function ObjectDetail(props: Props) {
    const { record = "", collectionPath = "/collection", essayPath = "/collection/essays/", paper = "#E8E7E3", ink = "#161613", muted = "#5E5D59", rule = "#C6C4BE" } = props
    const data = useMemo(() => parse(record) || SAMPLE, [record])
    const [view, setView] = useState(0)
    const [showDrafts, setShowDrafts] = useState(false)

    useEffect(() => {
        setView(0)
    }, [data.no])
    useEffect(() => {
        const canvas = RenderTarget.current() === RenderTarget.canvas
        setShowDrafts(canvas || (typeof window !== "undefined" && new URLSearchParams(window.location.search).has("drafts")))
    }, [])

    const image = data.images[view] || data.images[0]
    const objectHref = (no: string) => `${collectionPath}/${no.toLowerCase()}`
    const essays = data.essays.filter((e) => showDrafts || !e.draft)
    const facts: [string, string][] = [
        ["Catalogue no.", data.no],
        ["Category", data.type],
        ["Brand", data.brand],
        ["Origin", data.country],
        ["Date", data.year || "Undated"],
        ["Material", data.material],
        ["Dimensions", data.dimensions],
        ["Acquired", formatDate(data.acquired)],
        ["Tags", data.tags.join(", ")],
    ]
    const vars = { "--od-paper": paper, "--od-ink": ink, "--od-muted": muted, "--od-rule": rule } as React.CSSProperties

    return (
        <article className="od" style={{ ...props.style, ...vars, position: "relative" }}>
            <style dangerouslySetInnerHTML={{ __html: CSS }} />
            <nav className="od-crumbs" aria-label="Breadcrumb">
                <a href={collectionPath}>Collection</a>
                <span aria-hidden="true"> / </span>
                <span aria-current="page">{data.no}</span>
            </nav>
            <div className="od-layout">
                <div className="od-media">
                    <figure className="od-figure">
                        <img
                            key={image?.src}
                            src={image?.src}
                            srcSet={image ? `${image.small} 600w, ${image.src} 1200w` : undefined}
                            sizes="(max-width: 809px) 100vw, 58vw"
                            alt={data.alt}
                            decoding="async"
                        />
                    </figure>
                    {data.images.length > 1 && (
                        <div className="od-thumbs" role="group" aria-label="Views">
                            {data.images.map((im, i) => (
                                <button key={im.src} type="button" aria-pressed={i === view} aria-label={`View ${i + 1} of ${data.images.length}`} onClick={() => startTransition(() => setView(i))}>
                                    <img src={im.small} alt="" loading="lazy" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div className="od-text">
                    <h1 className="od-name">{data.name}</h1>
                    {data.edition && <p className="od-edition">{data.edition}</p>}
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
                    {data.observation && <p className="od-notes">{data.observation}</p>}
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
                                                {formatDate(e.date)} · {e.reading_time} min read{e.draft ? " · draft" : ""}
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
                {data.prev ? (
                    <a href={objectHref(data.prev.no)} rel="prev">
                        <span className="od-label">← Previous</span>
                        <span className="od-pager-name">{data.prev.name}</span>
                    </a>
                ) : (
                    <span />
                )}
                {data.next ? (
                    <a href={objectHref(data.next.no)} rel="next" className="od-next">
                        <span className="od-label">Next →</span>
                        <span className="od-pager-name">{data.next.name}</span>
                    </a>
                ) : (
                    <span />
                )}
            </nav>
        </article>
    )
}

const CSS = `
.od { container-type: inline-size; width: 100%; color: var(--od-ink); background: var(--od-paper); font-family: "IBM Plex Sans", system-ui, sans-serif; -webkit-font-smoothing: antialiased; }
.od *, .od *::before, .od *::after { box-sizing: border-box; }
.od a { color: inherit; text-decoration: none; }
.od :focus-visible { outline: 2px solid var(--od-ink); outline-offset: 3px; }
.od-crumbs { font-size: 13px; font-weight: 500; letter-spacing: 0.04em; text-transform: uppercase; color: var(--od-muted); padding-bottom: 24px; }
.od-crumbs a { text-decoration: underline; text-decoration-color: var(--od-rule); text-underline-offset: 4px; transition: text-decoration-color 0.2s cubic-bezier(0.44, 0, 0.56, 1); }
.od-crumbs a:hover { text-decoration-color: var(--od-ink); color: var(--od-ink); }
.od-layout { display: grid; grid-template-columns: minmax(0, 1fr); gap: 32px; border-top: 1px solid var(--od-rule); padding-top: 24px; }
.od-figure { margin: 0; position: relative; aspect-ratio: 1; max-height: 78vh; width: 100%; }
.od-figure img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; object-position: center top; mix-blend-mode: multiply; }
.od-thumbs { display: flex; gap: 8px; margin-top: 12px; }
.od-thumbs button { width: 64px; aspect-ratio: 1; padding: 4px; background: none; border: 1px solid var(--od-rule); cursor: pointer; }
.od-thumbs button[aria-pressed="true"] { border-color: var(--od-ink); }
.od-thumbs img { width: 100%; height: 100%; object-fit: contain; mix-blend-mode: multiply; }
.od-text { display: grid; gap: 16px; align-content: start; min-width: 0; }
.od-name { margin: 0; font-size: 32px; font-weight: 700; line-height: 1.15; letter-spacing: -0.04em; text-wrap: balance; }
.od-edition { margin: -8px 0 0; font-family: "Literata", Georgia, serif; font-style: italic; font-size: 18px; line-height: 1.45; color: var(--od-ink); }
.od-facts { margin: 8px 0 0; display: grid; }
.od-fact { display: grid; grid-template-columns: 128px minmax(0, 1fr); gap: 16px; border-top: 1px solid var(--od-rule); padding: 9px 0; }
.od-fact:last-child { border-bottom: 1px solid var(--od-rule); }
.od-fact dt { font-size: 12px; font-weight: 500; line-height: 1.7; letter-spacing: 0.06em; text-transform: uppercase; color: var(--od-muted); }
.od-fact dd { margin: 0; font-family: "Literata", Georgia, serif; font-size: 16px; line-height: 1.5; color: var(--od-ink); font-variant-numeric: oldstyle-nums; }
.od-notes { margin: 8px 0 0; font-family: "Literata", Georgia, serif; font-size: 17px; line-height: 1.6; color: #2b2a27; max-width: 34em; text-wrap: pretty; }
.od-label { display: block; margin: 0; font-size: 12px; font-weight: 500; line-height: 1.5; letter-spacing: 0.06em; text-transform: uppercase; color: var(--od-muted); }
.od-essays ul { list-style: none; margin: 8px 0 0; padding: 0; display: grid; gap: 12px; }
.od-essays a { display: grid; gap: 2px; }
.od-essay-title { font-size: 19px; font-weight: 600; line-height: 1.25; letter-spacing: -0.03em; text-decoration: underline; text-decoration-thickness: 1px; text-decoration-color: var(--od-rule); text-underline-offset: 4px; transition: text-decoration-color 0.2s cubic-bezier(0.44, 0, 0.56, 1); }
.od-essays a:hover .od-essay-title { text-decoration-color: var(--od-ink); }
.od-essay-meta { font-family: "Literata", Georgia, serif; font-size: 14px; color: var(--od-muted); font-variant-numeric: oldstyle-nums; }
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
    record: { type: ControlType.String, title: "Record", defaultValue: "", displayTextArea: true, description: "Bind to the Record field of the Objects collection." },
    collectionPath: { type: ControlType.String, title: "Collection path", defaultValue: "/collection" },
    essayPath: { type: ControlType.String, title: "Essay path", defaultValue: "/collection/essays/" },
    paper: { type: ControlType.Color, title: "Paper", defaultValue: "#E8E7E3" },
    ink: { type: ControlType.Color, title: "Ink", defaultValue: "#161613" },
    muted: { type: ControlType.Color, title: "Muted", defaultValue: "#5E5D59" },
    rule: { type: ControlType.Color, title: "Rule", defaultValue: "#C6C4BE" },
})
