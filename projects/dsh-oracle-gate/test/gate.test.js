// Unit tests for goal-oracle-gate. Run: node --test test/gate.test.js
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { apply, Config, createGate, validateConfig, secretsOf, redact } from '../index.js'

const root = mkdtempSync(path.join(tmpdir(), 'gate-test-'))
const secretDir = path.join(root, 'hidden-grader-dir')
const workspace = path.join(root, 'workspace')
mkdirSync(secretDir)
mkdirSync(workspace)

/** Write an executable sh oracle into the secret directory. */
function oracle(file, body) {
  const p = path.join(secretDir, file)
  writeFileSync(p, `#!/bin/sh\n${body}\n`)
  chmodSync(p, 0o755)
  return p
}

const passOracle = oracle('grade-pass.sh', 'echo "PASS all 15 checks"; exit 0')
const failOracle = oracle('grade-fail.sh', [
  'echo "running $0 from $(dirname "$0")"',
  'echo "PASS build compiles"',
  'echo "FAIL cli_parses_empty_input: expected exit 2, got 0"',
  'echo "  detail: see $0 line 40 for the assertion"',
  'echo "FAIL config roundtrip (asserted in $0)" 1>&2',
  'echo "SCORE 13/15"',
  'exit 1',
].join('\n'))
const cwdOracle = oracle('grade-cwd.sh', '[ "$(pwd)" = "$EXPECT_CWD" ] && exit 0; echo "FAIL wrong cwd $(pwd)"; exit 1')
const slowOracle = oracle('grade-slow.sh', 'echo "FAIL never reached"; sleep 30; exit 0')
const noisyOracle = oracle('grade-noisy.sh', 'i=0; while [ $i -lt 200 ]; do echo "FAIL check_number_$i with a long explanatory tail"; i=$((i+1)); done; exit 3')

/** A fake cordis context that records the pre-execute listener. */
function fakeCtx() {
  const listeners = {}
  const logs = []
  return {
    listeners,
    logs,
    on(event, fn) { listeners[event] = fn },
    logger: { info: m => logs.push(['info', m]), warn: m => logs.push(['warn', m]) },
  }
}

function config(command, extra = {}) {
  const r = validateConfig({ command, ...extra })
  assert.ok('value' in r, JSON.stringify(r))
  return r.value
}

function exec(args, cwd = workspace, name = 'update_goal') {
  return {
    name,
    arguments: args,
    agent: { session: { header: { cwd } } },
    signal: new AbortController().signal,
  }
}

const allow = () => Promise.resolve({ kind: 'allow' })
const complete = { goal_id: 'g1', revision: 3, action: 'complete' }

function assertNoLeak(text, oraclePath) {
  assert.ok(!text.includes(secretDir), `leaks directory: ${text}`)
  assert.ok(!text.includes(oraclePath), `leaks path: ${text}`)
  assert.ok(!text.includes(path.basename(oraclePath)), `leaks file name: ${text}`)
  assert.ok(!text.includes('hidden-grader-dir'), `leaks dir name: ${text}`)
}

test('oracle pass allows completion unchanged', async () => {
  const gate = createGate(fakeCtx(), config(['sh', passOracle]))
  const d = await gate(exec(complete), allow)
  assert.deepEqual(d, { kind: 'allow' })
})

test('oracle fail refuses completion with FAIL lines only', async () => {
  const gate = createGate(fakeCtx(), config([failOracle]))
  const d = await gate(exec(complete), allow)
  assert.equal(d.kind, 'deny')
  assert.equal(d.info.code, 'GOAL_ORACLE_FAILED')
  assert.match(d.reason, /NOT complete/)
  assert.match(d.reason, /remains active/)
  assert.match(d.reason, /FAIL cli_parses_empty_input: expected exit 2, got 0/)
  assert.match(d.reason, /FAIL config roundtrip \(asserted in <oracle>\)/)
  assert.doesNotMatch(d.reason, /PASS build compiles/)
  assert.doesNotMatch(d.reason, /SCORE/)
  assert.doesNotMatch(d.reason, /detail: see/)
  assert.doesNotMatch(d.reason, /running/)
  assertNoLeak(d.reason, failOracle)
})

test('oracle timeout refuses with a timeout message and kills the process', async () => {
  const gate = createGate(fakeCtx(), config([slowOracle], { timeoutMs: 300 }))
  const t0 = Date.now()
  const d = await gate(exec(complete), allow)
  assert.ok(Date.now() - t0 < 5000, 'did not wait for the 30s sleep')
  assert.equal(d.kind, 'deny')
  assert.equal(d.info.code, 'GOAL_ORACLE_TIMEOUT')
  assert.match(d.reason, /timed out after 0s|timed out after 1s/)
  assert.doesNotMatch(d.reason, /never reached/)
  assertNoLeak(d.reason, slowOracle)
})

test('command path never leaks, even with revealOutput', async () => {
  const gate = createGate(fakeCtx(), config([failOracle], { revealOutput: true }))
  const d = await gate(exec(complete), allow)
  assert.equal(d.kind, 'deny')
  assert.match(d.reason, /Verification output:/)
  assert.match(d.reason, /SCORE 13\/15/)
  assertNoLeak(d.reason, failOracle)
})

test('missing oracle refuses without naming it', async () => {
  const missing = path.join(secretDir, 'does-not-exist.sh')
  const ctx = fakeCtx()
  const gate = createGate(ctx, config([missing]))
  const d = await gate(exec(complete), allow)
  assert.equal(d.kind, 'deny')
  assert.equal(d.info.code, 'GOAL_ORACLE_UNAVAILABLE')
  assertNoLeak(d.reason, missing)
  assert.ok(!JSON.stringify(d).includes(secretDir), 'structured info leaks path')
  assert.ok(ctx.logs.some(([lvl]) => lvl === 'warn'), 'host log records the refusal')
})

test('feedback is truncated to maxFeedbackChars', async () => {
  const gate = createGate(fakeCtx(), config([noisyOracle], { maxFeedbackChars: 300 }))
  const d = await gate(exec(complete), allow)
  const tail = d.reason.split('Failing checks:\n')[1]
  assert.ok(tail.length <= 300, `feedback ${tail.length} chars`)
  assert.match(tail, /\[\.\.\. truncated\]$/)
})

test('oracle runs in the session cwd', async () => {
  process.env.EXPECT_CWD = workspace
  const gate = createGate(fakeCtx(), config([cwdOracle]))
  const d = await gate(exec(complete, workspace), allow)
  assert.deepEqual(d, { kind: 'allow' })
})

test('other goal actions and other tools are not gated', async () => {
  let runs = 0
  const run = () => { runs += 1; return Promise.resolve({ kind: 'exit', code: 1, signal: null, output: 'FAIL x' }) }
  const gate = createGate(fakeCtx(), config([failOracle]), { run })
  for (const e of [
    exec({ ...complete, action: 'blocked', blocked_reason: 'r' }),
    exec({ ...complete, action: 'pause' }),
    exec(complete, workspace, 'get_goal'),
    exec({ command: 'update_goal complete' }, workspace, 'bash'),
  ]) {
    assert.deepEqual(await gate(e, allow), { kind: 'allow' })
  }
  assert.equal(runs, 0)
})

test('an earlier deny is preserved and the oracle is not run', async () => {
  let runs = 0
  const run = () => { runs += 1; return Promise.resolve({ kind: 'exit', code: 0, signal: null, output: '' }) }
  const gate = createGate(fakeCtx(), config([failOracle]), { run })
  const d = await gate(exec(complete), () => Promise.resolve({ kind: 'deny', reason: 'policy' }))
  assert.deepEqual(d, { kind: 'deny', reason: 'policy' })
  assert.equal(runs, 0)
})

test('caller cancellation while the oracle runs fails closed (deny, never allow)', async () => {
  const ac = new AbortController()
  const gate = createGate(fakeCtx(), config([slowOracle], { timeoutMs: 20_000 }))
  const e = { ...exec(complete), signal: ac.signal }
  setTimeout(() => ac.abort(), 200)
  const t0 = Date.now()
  const d = await gate(e, allow)
  assert.ok(Date.now() - t0 < 5000, 'oracle killed on abort')
  assert.equal(d.kind, 'deny')
  assert.match(d.reason, /not verified/)
})

test('apply registers exactly one tools/pre-execute listener; bad config throws', () => {
  const ctx = fakeCtx()
  apply(ctx, { command: ['true'] })
  assert.deepEqual(Object.keys(ctx.listeners), ['tools/pre-execute'])
  assert.throws(() => apply(fakeCtx(), {}), /command must be/)
})

test('Config is a Standard Schema that fills defaults and rejects junk', () => {
  const ok = Config['~standard'].validate({ command: ['./x'] })
  assert.deepEqual(ok.value, { command: ['./x'], timeoutMs: 600000, maxFeedbackChars: 2000, revealOutput: false, feedbackPattern: '^\\s*FAIL\\b' })
  assert.ok(Config['~standard'].validate({ command: [] }).issues)
  assert.ok(Config['~standard'].validate({ command: ['x'], timeoutMs: -1 }).issues)
  assert.ok(Config['~standard'].validate({ command: ['x'], typo: 1 }).issues)
})

test('redaction covers relative argv, absolute form, dir and basename', () => {
  const s = secretsOf(['python3', '../grader/check_all.py', '--strict'], '/w/repo')
  const text = redact('ran /w/grader/check_all.py via ../grader/check_all.py in /w/grader; check_all.py said FAIL', s)
  assert.equal(text, 'ran <oracle> via <oracle> in <oracle>; <oracle> said FAIL')
})
