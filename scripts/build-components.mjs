// Builds framer/EssayBody.tsx from its template, inlining lib/essay.css, so the
// essay pages on the site and the editor's preview share one stylesheet.
// Run after changing lib/essay.css, then paste the result into Framer.
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { ROOT } from "../lib/archive.mjs"

const css = readFileSync(join(ROOT, "lib/essay.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\s*\n\s*/g, "\n").trim()
const template = readFileSync(join(ROOT, "framer/EssayBody.template.tsx"), "utf8")
const out = template.replace("/*ESSAY_CSS*/ ``", "`\n" + css.replace(/[`\\]/g, "\\$&").replace(/\$\{/g, "\\${") + "\n`")
writeFileSync(join(ROOT, "framer/EssayBody.tsx"), "// Built from EssayBody.template.tsx by scripts/build-components.mjs. Edit those, not this file.\n" + out)
console.log("Wrote framer/EssayBody.tsx")
