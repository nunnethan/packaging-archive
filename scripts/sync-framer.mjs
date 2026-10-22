// Copies items.json and the essays into the Framer CMS (Objects and Essays),
// then, with --publish, publishes typen.me if anything changed.
// Needs a Framer API key: FRAMER_API_KEY=… node scripts/sync-framer.mjs --publish
// (Framer › Site settings › API Keys). The GitHub Action runs this after each push.
import { connect } from "framer-api"
import { CDN, loadItems, loadEssays } from "../lib/archive.mjs"
import { buildRecords, syncToFramer } from "../lib/framer-sync.mjs"

const PROJECT = "https://framer.com/projects/F6JfbDul5VB29A0mcYci"
const publish = process.argv.includes("--publish")
const dryRun = process.argv.includes("--dry-run")

const records = buildRecords({ items: loadItems().items, essays: loadEssays(), cdn: CDN })
if (dryRun) {
    console.log(`${records.objects.length} objects, ${records.essays.length} essays ready to sync (dry run, nothing sent).`)
    process.exit(0)
}
if (!process.env.FRAMER_API_KEY) {
    console.error("FRAMER_API_KEY isn’t set, so nothing was synced. Create a key in Framer › Site settings › API Keys.")
    process.exit(1)
}

const framer = await connect(PROJECT, process.env.FRAMER_API_KEY)
try {
    const { changed } = await syncToFramer(framer, records)
    if (!changed) {
        console.log("The Framer CMS was already up to date.")
    } else if (publish) {
        const { deployment } = await framer.publish()
        const hosts = await framer.deploy(deployment.id)
        console.log(`Published ${deployment.id} to ${hosts.map((h) => h.hostname ?? h).join(", ") || "the site"}.`)
    } else {
        console.log("Synced. Publish the site in Framer to put the changes live, or run again with --publish.")
    }
} finally {
    await framer.disconnect()
}
