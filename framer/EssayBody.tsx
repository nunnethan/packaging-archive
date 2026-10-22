// Built from EssayBody.template.tsx by scripts/build-components.mjs. Edit those, not this file.
import { useMemo } from "react"
import { addPropertyControls, ControlType } from "framer"

// An essay from the Collection, on its own page. Bound to the Record field of
// the Essays CMS collection: the sync renders the Markdown from GitHub into
// HTML, so this component only lays it out. The styles come from
// lib/essay.css in the repository (built by scripts/build-components.mjs).

type Card = { no: string; name: string; meta: string; edition: string; image: string }
type EssayRecord = {
    slug: string
    title: string
    date: string
    standfirst: string
    reading_time: number
    draft: boolean
    tags: string[]
    cover: string
    cover_alt: string
    html: string
    objects: Card[]
}

const SAMPLE: EssayRecord = {
    slug: "sample",
    title: "An essay from the collection",
    date: "2026-10-22",
    standfirst: "Bind the Record control to the Essays collection’s Record field to show an essay here.",
    reading_time: 1,
    draft: false,
    tags: [],
    cover: "",
    cover_alt: "",
    html: '<p class="e-p e-first">This is placeholder text for the canvas. On the live site, each essay page shows the essay written in the GitHub repository.</p>',
    objects: [],
}

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
function formatDate(iso: string) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    return m ? `${+m[3]} ${MONTHS[+m[2] - 1]} ${m[1]}` : iso
}

function parse(record: string): EssayRecord | null {
    try {
        const r = JSON.parse(record)
        return r && typeof r.html === "string" ? r : null
    } catch {
        return null
    }
}

const FONTS = "https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400;1,7..72,600&display=swap"

interface Props {
    record: string
    collectionPath: string
    style?: React.CSSProperties
}

/**
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight auto
 */
export default function EssayBody(props: Props) {
    const { record = "", collectionPath = "/collection" } = props
    const data = useMemo(() => parse(record) || SAMPLE, [record])
    const objectHref = (no: string) => `${collectionPath}/${no.toLowerCase()}`

    return (
        <article className="essay" style={{ ...props.style, position: "relative" }} lang="en-GB">
            <link rel="stylesheet" href={FONTS} />
            <style dangerouslySetInnerHTML={{ __html: CSS }} />
            <header className="e-col">
                <p className="e-kicker">
                    <a href={collectionPath}>Collection</a> · Essay · <time dateTime={data.date}>{formatDate(data.date)}</time> · {data.reading_time} min read
                    {data.draft ? " · Draft" : ""}
                </p>
                <h1 className="e-title">{data.title}</h1>
                <p className="e-stand">{data.standfirst}</p>
            </header>
            {data.cover && (
                <figure className="e-cover">
                    <img src={data.cover} alt={data.cover_alt} decoding="async" />
                </figure>
            )}
            <div className="e-col e-body" dangerouslySetInnerHTML={{ __html: data.html }} />
            {data.objects.length > 0 && (
                <section className="e-col e-related" aria-labelledby="e-related-h">
                    <h2 id="e-related-h" className="e-notes-h">
                        Objects in this essay
                    </h2>
                    <ul>
                        {data.objects.map((o) => (
                            <li key={o.no}>
                                <a href={objectHref(o.no)}>
                                    <span className="e-mat">
                                        <img src={o.image} alt="" loading="lazy" />
                                    </span>
                                    <span className="e-card-no">{o.no}</span>
                                    <span className="e-card-name">{o.name}</span>
                                    <span className="e-card-meta">{o.meta}</span>
                                </a>
                            </li>
                        ))}
                    </ul>
                </section>
            )}
        </article>
    )
}

const CSS = `
.essay {
--paper: #e8e7e3;
--ink: #161613;
--text: #2b2a27;
--muted: #5e5d59;
--rule: #c6c4be;
--mat: #dcdad4;
--measure: 646px;
--indent: 1.4em;
--hang: 0.42em;
--sans: "IBM Plex Sans", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif;
--serif: "Literata", Georgia, "Times New Roman", serif;
container-type: inline-size;
color: var(--text);
font-family: var(--serif);
font-size: 19px;
line-height: 1.6;
letter-spacing: -0.005em;
font-kerning: normal;
font-variant-numeric: oldstyle-nums proportional-nums;
font-feature-settings: "kern", "liga";
hanging-punctuation: first allow-end;
-webkit-font-smoothing: antialiased;
text-rendering: optimizeLegibility;
}
.essay * { box-sizing: border-box; }
.essay .e-col { max-width: var(--measure); }
.essay .e-kicker { font: 500 13px/1.4 var(--sans); letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); font-variant-numeric: lining-nums; margin: 0; }
.essay .e-kicker a { color: inherit; text-decoration: none; }
.essay .e-kicker a:hover { color: var(--ink); }
.essay .e-title { font: 700 40px/1.12 var(--sans); letter-spacing: -0.04em; color: var(--ink); margin: 12px 0 16px; text-wrap: balance; }
.essay .e-stand { font-size: 22px; line-height: 1.45; font-style: italic; color: var(--ink); margin: 0 0 40px; text-wrap: pretty; }
.essay .e-cover { margin: 0 0 40px; max-width: calc(var(--measure) + 120px); }
.essay .e-cover img { display: block; width: 100%; height: auto; mix-blend-mode: multiply; }
.essay .e-cover figcaption, .essay .e-fig figcaption { font: 400 14px/1.5 var(--sans); color: var(--muted); margin-top: 8px; }
.essay .e-body { position: relative; }
.essay .e-p { margin: 0; text-indent: var(--indent); text-wrap: pretty; }
.essay .e-p.e-first { text-indent: 0; }
.essay .e-p.e-hang { text-indent: calc(var(--indent) - var(--hang)); }
.essay .e-p.e-first.e-hang { text-indent: calc(0px - var(--hang)); }
@supports (hanging-punctuation: first) {
.essay .e-p.e-hang { text-indent: var(--indent); }
.essay .e-p.e-first.e-hang { text-indent: 0; }
}
.essay em { font-style: italic; }
.essay strong { font-weight: 600; color: var(--ink); }
.essay a { color: var(--ink); text-decoration: underline; text-decoration-thickness: 1px; text-underline-offset: 3px; text-decoration-color: var(--muted); transition: text-decoration-color 0.2s cubic-bezier(0.44, 0, 0.56, 1); }
.essay a:hover { text-decoration-color: var(--ink); }
.essay a:focus-visible { outline: 2px solid var(--ink); outline-offset: 2px; }
.essay .e-caps { font-variant-caps: all-small-caps; letter-spacing: 0.04em; font-variant-numeric: oldstyle-nums; }
.essay .e-no { font-variant-caps: all-small-caps; letter-spacing: 0.05em; font-variant-numeric: oldstyle-nums; }
.essay .e-h2 { font: 600 24px/1.3 var(--sans); letter-spacing: -0.04em; color: var(--ink); margin: 48px 0 16px; text-wrap: balance; }
.essay .e-h3 { font: 600 19px/1.35 var(--sans); letter-spacing: -0.03em; color: var(--ink); margin: 32px 0 8px; }
.essay .e-break { border: 0; height: auto; margin: 32px 0; text-align: center; }
.essay .e-break::before { content: "⁂"; color: var(--muted); font-size: 19px; }
.essay .e-quote { margin: 28px 0; padding: 0 0 0 var(--indent); font-style: italic; color: var(--ink); }
.essay .e-quote p { margin: 0; }
.essay .e-quote p.e-hang { text-indent: calc(0px - var(--hang)); }
.essay .e-quote footer { font: 400 14px/1.5 var(--sans); font-style: normal; color: var(--muted); margin-top: 6px; }
.essay .e-list { margin: 16px 0; padding-left: var(--indent); }
.essay .e-list li + li { margin-top: 4px; }
.essay .e-fig { margin: 32px 0; }
.essay .e-fig img { display: block; max-width: 100%; height: auto; mix-blend-mode: multiply; }
.essay .e-fn { font: 600 0.62em/0 var(--sans); vertical-align: 0.62em; margin-left: 1px; font-variant-numeric: lining-nums; }
.essay .e-fn a { text-decoration: none; color: var(--ink); padding: 0 1px; }
.essay .e-side { display: none; }
.essay .e-notes { border-top: 1px solid var(--rule); margin-top: 40px; padding-top: 12px; }
.essay .e-notes-h { font: 500 13px/1.4 var(--sans); letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); margin: 0 0 8px; }
.essay .e-notes ol { margin: 0; padding-left: 1.4em; font: 400 15px/1.55 var(--sans); color: var(--muted); }
.essay .e-notes li + li { margin-top: 6px; }
.essay .e-back { text-decoration: none; margin-left: 2px; }
.essay .e-card { margin: 32px 0; max-width: calc(var(--measure) + 64px); border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
.essay .e-card a { display: grid; grid-template-columns: 128px minmax(0, 1fr); gap: 20px; align-items: center; padding: 16px 0; text-decoration: none; color: inherit; }
.essay .e-mat { position: relative; display: block; aspect-ratio: 1; background: var(--mat); overflow: hidden; }
.essay .e-mat img { position: absolute; inset: 10px; width: calc(100% - 20px); height: calc(100% - 20px); object-fit: contain; mix-blend-mode: multiply; transition: transform 0.2s cubic-bezier(0.44, 0, 0.56, 1); }
.essay .e-card a:hover .e-mat img { transform: scale(1.03); }
.essay .e-card figcaption { display: grid; gap: 2px; }
.essay .e-card-no { font: 400 12px/1.4 var(--sans); color: var(--muted); letter-spacing: 0.02em; font-variant-numeric: tabular-nums; }
.essay .e-card-name { font: 600 17px/1.3 var(--sans); letter-spacing: -0.03em; color: var(--ink); }
.essay .e-card-meta { font: 400 15px/1.45 var(--serif); color: var(--muted); }
.essay .e-card-ed { font: italic 400 15px/1.45 var(--serif); color: var(--muted); }
.essay .e-missing { font: 500 14px/1.4 var(--sans); color: #a33; border: 1px dashed #a33; padding: 8px 12px; }
.essay .e-related { border-top: 1px solid var(--rule); margin-top: 48px; padding-top: 12px; }
.essay .e-related ul { list-style: none; margin: 12px 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 16px; }
.essay .e-related a { display: grid; gap: 6px; text-decoration: none; color: inherit; }
.essay .e-related .e-card-name { font-size: 13px; }
.essay .e-related .e-card-meta { font-size: 13px; }
@container (min-width: 980px) {
.essay .e-side { display: block; float: right; clear: right; width: 220px; margin: 0 calc(-220px - 48px) 12px 0; position: relative; text-indent: 0; font: 400 13px/1.5 var(--sans); font-style: normal; color: var(--muted); letter-spacing: 0; hyphens: none; }
.essay .e-side-n { font-weight: 600; color: var(--ink); margin-right: 6px; }
.essay .e-notes { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; margin: 0; padding: 0; }
}
@container (max-width: 600px) {
.essay { font-size: 18px; }
.essay .e-title { font-size: 32px; }
.essay .e-stand { font-size: 20px; }
.essay .e-card a { grid-template-columns: 96px minmax(0, 1fr); gap: 16px; }
}
@media (prefers-reduced-motion: reduce) {
.essay a, .essay .e-mat img { transition: none; }
.essay .e-card a:hover .e-mat img { transform: none; }
}
`

addPropertyControls(EssayBody, {
    record: { type: ControlType.String, title: "Record", defaultValue: "", displayTextArea: true, description: "Bind to the Record field of the Essays collection." },
    collectionPath: { type: ControlType.String, title: "Collection path", defaultValue: "/collection" },
})
