import { appendFile } from 'node:fs/promises'

const DEBUG_LOG_PATH = '/tmp/codexui-debug.log'

export type DebugLogEntry = {
  tag: string
  timestamp: string
  message: string
  extra?: Record<string, unknown>
}

export function resolveDebugLogPath(): string {
  return DEBUG_LOG_PATH
}

export async function writeDebugLog(
  tag: string,
  message: string,
  extra?: Record<string, unknown>,
): Promise<void> {
  const entry: DebugLogEntry = {
    tag,
    timestamp: new Date().toISOString(),
    message,
    ...(extra ? { extra } : {}),
  }
  try {
    await appendFile(DEBUG_LOG_PATH, JSON.stringify(entry) + '\n', 'utf8')
  } catch {
    // Fail silently — debug log is best-effort.
  }
}

export function writeDebugLogSync(
  tag: string,
  message: string,
  extra?: Record<string, unknown>,
): void {
  const { writeFileSync, appendFileSync, existsSync: fsExists } = require('node:fs')
  const entry: DebugLogEntry = {
    tag,
    timestamp: new Date().toISOString(),
    message,
    ...(extra ? { extra } : {}),
  }
  try {
    appendFileSync(DEBUG_LOG_PATH, JSON.stringify(entry) + '\n', 'utf8')
  } catch {
    // Fail silently — debug log is best-effort.
  }
}
