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
    const objectHref = (no: string) => `${collectionPath}/object?no=${no.toLowerCase()}`

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

const CSS = /*ESSAY_CSS*/ ``

addPropertyControls(EssayBody, {
    record: { type: ControlType.String, title: "Record", defaultValue: "", displayTextArea: true, description: "Bind to the Record field of the Essays collection." },
    collectionPath: { type: ControlType.String, title: "Collection path", defaultValue: "/collection" },
})
