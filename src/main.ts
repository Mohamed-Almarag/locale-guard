import * as core from '@actions/core'

/**
 * The main function for the action.
 */
export async function run(): Promise<void> {
  try {
    core.info('hello from Locale Guard')
  } catch (error) {
    if (error instanceof Error) core.setFailed(error.message)
  }
}
