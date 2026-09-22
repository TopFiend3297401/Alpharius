/**
 * goal-oracle-gate: a DeepSeek Harness (dsh) plugin that gates goal completion
 * on an external oracle command the model never sees.
 *
 * Seam: the `tools/pre-execute` waterfall of @deepseek-ai/dsh-tools. When the
 * model calls `update_goal` with `action: "complete"`, the oracle runs in the
 * session's working directory. Exit 0 lets the call through unchanged. Any
 * other outcome returns a `deny` decision, so the tool body never runs, the
 * goal stays `active`, and the round driver schedules the next round (subject
 * to the goal's own `maxGoalRounds`).
 *
 * Zero runtime dependencies: plain ESM, node: built-ins only, and a
 * hand-written Standard Schema for `Config` (cordis only calls
 * `Config['~standard'].validate`), so the module loads from an absolute path
 * without resolving anything from the dsh installation.
 * @module goal-oracle-gate
 */

import { spawn } from 'node:child_process'
import path from 'node:path'

export const name = 'goal-oracle-gate'
export const inject = ['tools']

const DEFAULTS = Object.freeze({
  timeoutMs: 600_000,
  maxFeedbackChars: 2_000,
  revealOutput: false,
  feedbackPattern: '^\\s*FAIL\\b',
})

/** Hard cap on captured oracle output, independent of the feedback bound. */
const CAPTURE_LIMIT = 1_048_576

/**
 * Validate and default a raw config object.
 * @param {unknown} raw
 * @returns {{ value: object } | { issues: { message: string, path?: string[] }[] }}
 */
export function validateConfig(raw) {
  const issues = []
  const input = raw === undefined || raw === null ? {} : raw
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { issues: [{ message: 'config must be an object' }] }
  }
  const out = { ...DEFAULTS, ...input }
  if (!Array.isArray(out.command) || out.command.length === 0
    || !out.command.every(a => typeof a === 'string' && a.length > 0)) {
    issues.push({ message: 'command must be a non-empty array of non-empty strings (argv)', path: ['command'] })
  }
  if (!Number.isSafeInteger(out.timeoutMs) || out.timeoutMs < 1) {
    issues.push({ message: 'timeoutMs must be a positive integer', path: ['timeoutMs'] })
  }
  if (!Number.isSafeInteger(out.maxFeedbackChars) || out.maxFeedbackChars < 1) {
    issues.push({ message: 'maxFeedbackChars must be a positive integer', path: ['maxFeedbackChars'] })
  }
  if (typeof out.revealOutput !== 'boolean') {
    issues.push({ message: 'revealOutput must be a boolean', path: ['revealOutput'] })
  }
  if (typeof out.feedbackPattern !== 'string') {
    issues.push({ message: 'feedbackPattern must be a string', path: ['feedbackPattern'] })
  } else {
    try { new RegExp(out.feedbackPattern) } catch (error) {
      issues.push({ message: `feedbackPattern is not a valid RegExp: ${String(error)}`, path: ['feedbackPattern'] })
    }
  }
  for (const key of Object.keys(input)) {
    if (!['command', ...Object.keys(DEFAULTS)].includes(key)) {
      issues.push({ message: `unknown config key "${key}"`, path: [key] })
    }
  }
  return issues.length > 0 ? { issues } : { value: out }
}

/** Standard Schema (v1) wrapper consumed by the cordis loader. */
export const Config = {
  '~standard': {
    version: 1,
    vendor: 'goal-oracle-gate',
    validate: validateConfig,
  },
}

/**
 * Strings that would reveal where the oracle lives: every argv element that
 * looks like a path, plus its directory and (when distinctive) its basename.
 * @param {string[]} command
 * @param {string} cwd
 * @returns {string[]} longest first, so longer matches are redacted before their substrings
 */
export function secretsOf(command, cwd) {
  const secrets = new Set()
  for (const arg of command) {
    if (!arg.includes('/') && !arg.includes(path.sep)) continue
    const abs = path.resolve(cwd, arg)
    for (const s of [arg, abs, path.dirname(abs)]) {
      if (s.length > 1 && s !== '/' && s !== '.') secrets.add(s)
    }
    const base = path.basename(abs)
    if (base.length >= 4) secrets.add(base)
  }
  return [...secrets].sort((a, b) => b.length - a.length)
}

/** Replace every secret with a neutral placeholder. */
export function redact(text, secrets) {
  let out = text
  for (const s of secrets) out = out.split(s).join('<oracle>')
  return out
}

/** Bound text to `max` characters, marking the cut. */
function truncate(text, max) {
  if (text.length <= max) return text
  const marker = '\n[... truncated]'
  return text.slice(0, Math.max(0, max - marker.length)) + marker
}

/**
 * Run the oracle and settle with its outcome. Never rejects.
 * @param {string[]} command
 * @param {{ cwd: string, timeoutMs: number, signal?: AbortSignal }} opts
 * @returns {Promise<{ kind: 'exit', code: number | null, signal: string | null, output: string }
 *   | { kind: 'timeout', output: string } | { kind: 'aborted' } | { kind: 'spawn-error', error: Error }>}
 */
export function runOracle(command, { cwd, timeoutMs, signal }) {
  return new Promise((resolve) => {
    let child
    try {
      child = spawn(command[0], command.slice(1), {
        cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        env: process.env,
      })
    } catch (error) {
      resolve({ kind: 'spawn-error', error })
      return
    }
    let output = ''
    let settled = false
    let timedOut = false
    let aborted = false
    const collect = (chunk) => {
      if (output.length < CAPTURE_LIMIT) output += chunk.toString('utf8')
    }
    child.stdout.on('data', collect)
    child.stderr.on('data', collect)
    const kill = () => {
      try {
        if (child.pid !== undefined && process.platform !== 'win32') process.kill(-child.pid, 'SIGKILL')
        else child.kill('SIGKILL')
      } catch { /* already gone */ }
    }
    const timer = setTimeout(() => { timedOut = true; kill() }, timeoutMs)
    const onAbort = () => { aborted = true; kill() }
    signal?.addEventListener('abort', onAbort, { once: true })
    const finish = (result) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve(result)
    }
    child.on('error', error => finish({ kind: 'spawn-error', error }))
    child.on('close', (code, sig) => {
      if (aborted) return finish({ kind: 'aborted' })
      if (timedOut) return finish({ kind: 'timeout', output })
      finish({ kind: 'exit', code, signal: sig, output })
    })
    if (signal?.aborted) onAbort()
  })
}

const NOT_DONE = 'The goal is NOT complete. An independent verification of the objective ran and did not pass, '
  + 'so this completion was refused and the goal remains active. Keep working on the objective, verify your '
  + 'own work, and only call update_goal complete again when it is actually achieved.'

/**
 * Build the model-facing refusal for a failed or unrunnable oracle.
 * Contains only redacted, pattern-matched lines (or redacted output when
 * `revealOutput` is set) and never the oracle's command or location.
 * @param {Awaited<ReturnType<typeof runOracle>>} outcome
 * @param {ReturnType<typeof validateConfig>['value']} config
 * @param {string} cwd
 * @returns {string}
 */
export function refusalMessage(outcome, config, cwd) {
  if (outcome.kind === 'timeout') {
    return `${NOT_DONE}\nThe verification timed out after ${Math.round(config.timeoutMs / 1000)}s `
      + 'without passing. Check for work that hangs, never finishes, or waits for input.'
  }
  if (outcome.kind === 'spawn-error') {
    return `${NOT_DONE}\nThe verification could not be run, so completion cannot be certified. `
      + 'This is not something you can fix from inside the task; continue working or ask the user.'
  }
  const secrets = secretsOf(config.command, cwd)
  const clean = redact(outcome.output.replace(/\r\n?/g, '\n'), secrets)
  let detail
  if (config.revealOutput) {
    detail = clean.trim()
  } else {
    const re = new RegExp(config.feedbackPattern)
    detail = clean.split('\n').filter(line => re.test(line)).map(l => l.trim()).join('\n')
  }
  if (detail.length === 0) {
    return `${NOT_DONE}\nThe verification failed without naming individual checks.`
  }
  const heading = config.revealOutput ? 'Verification output:' : 'Failing checks:'
  return `${NOT_DONE}\n${heading}\n${truncate(detail, config.maxFeedbackChars)}`
}

/**
 * Whether a pending execution is a model attempt to complete the goal.
 * @param {{ name: string, arguments: unknown }} exec
 */
export function isCompletionAttempt(exec) {
  if (exec.name !== 'update_goal') return false
  const args = exec.arguments
  return typeof args === 'object' && args !== null && args.action === 'complete'
}

/**
 * The `tools/pre-execute` listener, exported for tests.
 * @param {{ logger?: { info?: Function, warn?: Function } }} ctx
 * @param {ReturnType<typeof validateConfig>['value']} config
 * @param {{ run?: typeof runOracle }} [deps]
 */
export function createGate(ctx, config, deps = {}) {
  const run = deps.run ?? runOracle
  return async function goalOracleGate(exec, next) {
    const decision = await next()
    if (!isCompletionAttempt(exec)) return decision
    // Earlier policy already refused or cancelled: do not spend an oracle run on it.
    if (decision.kind === 'deny' || decision.kind === 'cancel') return decision
    const cwd = exec.agent?.session?.header?.cwd ?? process.cwd()
    const outcome = await run(config.command, { cwd, timeoutMs: config.timeoutMs, signal: exec.signal })
    // Fail closed on cancellation. A `{ kind: 'cancel' }` decision exists only in
    // newer dsh-tools; 0.1.5-rc.3 treats an unknown kind with no reason as allow.
    if (outcome.kind === 'aborted') {
      return { kind: 'deny', reason: 'Goal completion was not verified because the call was cancelled; the goal remains active.' }
    }
    if (outcome.kind === 'exit' && outcome.code === 0) {
      ctx.logger?.info?.('goal-oracle-gate: oracle passed; completion allowed')
      return decision
    }
    const detail = outcome.kind === 'exit'
      ? `exit ${outcome.code ?? outcome.signal}`
      : outcome.kind === 'timeout' ? 'timeout' : `spawn error: ${String(outcome.error?.message ?? outcome.error)}`
    // Host-side log only; the model never receives this line.
    ctx.logger?.warn?.(`goal-oracle-gate: completion refused (${detail})`)
    return {
      kind: 'deny',
      reason: refusalMessage(outcome, config, cwd),
      info: {
        name: 'GoalOracleGate',
        code: outcome.kind === 'timeout' ? 'GOAL_ORACLE_TIMEOUT'
          : outcome.kind === 'spawn-error' ? 'GOAL_ORACLE_UNAVAILABLE' : 'GOAL_ORACLE_FAILED',
      },
    }
  }
}

/**
 * Plugin entry.
 * @param {any} ctx - cordis Context with `ctx.tools` injected.
 * @param {object} rawConfig - validated by `Config` when loaded through cordis.
 */
export function apply(ctx, rawConfig) {
  const checked = validateConfig(rawConfig)
  if ('issues' in checked) {
    throw new TypeError(`goal-oracle-gate: invalid config: ${checked.issues.map(i => i.message).join('; ')}`)
  }
  ctx.on('tools/pre-execute', createGate(ctx, checked.value))
  ctx.logger?.info?.('goal-oracle-gate: armed on update_goal complete')
}
