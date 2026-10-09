import * as core from '@actions/core'

/** GitHub caps each step summary at 1 MiB. */
export const SUMMARY_LIMIT = 1_000_000

/** F12: writes the full report to the job summary page. */
export async function writeSummary(
  markdown: string,
  summary: typeof core.summary = core.summary
): Promise<void> {
  await summary.addRaw(markdown, true).write()
}
