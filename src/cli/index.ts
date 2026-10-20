import { readFileSync } from 'node:fs'
import { styleText } from 'node:util'
import { runCli } from './run.js'

// cli/dist/cli.js sits next to cli/package.json
const { version } = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
) as { version: string }

process.exitCode = await runCli(process.argv.slice(2), {
  cwd: process.cwd(),
  version,
  out: (text) => process.stdout.write(`${text}\n`),
  err: (text) =>
    process.stderr.write(
      `${styleText('red', text, { stream: process.stderr })}\n`
    ),
  // Plain when the output is not a terminal, or NO_COLOR is set
  style: (format, text) =>
    styleText(format as Parameters<typeof styleText>[0], text)
})
