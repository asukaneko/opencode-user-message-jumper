import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { transformSolidSource } from "../node_modules/@opentui/solid/scripts/solid-transform.js"

const source = fileURLToPath(new URL("../src/tui.tsx", import.meta.url))
const output = fileURLToPath(new URL("../dist/tui.js", import.meta.url))

const code = await readFile(source, "utf8")
const transformed = await transformSolidSource(code, {
  filename: source,
  moduleName: "@opentui/solid",
})

await mkdir(dirname(output), { recursive: true })
await writeFile(output, `${transformed}\n`)
