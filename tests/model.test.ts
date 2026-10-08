import { expect, test } from 'claude-code/testing'
import {
  level,
  levelColor,
  gaugeCells,
  repoFamily,
  repoInfo,
  branchKey,
  branchTail,
  fmtDur,
  rateOf,
  modelLabel,
  planProgress,
  areaOf,
  classifyTool,
  newStepState,
  applyActivity,
  noteBashResult,
  viewSteps,
  subStatus,
  parseTaskNotification,
  isEndStatus,
  eventColor,
  dockerNameOf,
  fleetStatus,
  fleetView,
  flagsCreatedBy,
  levelHex,
  blinkColor,
  restoreActive,
  pillParts,
  PILL_COLS,
  workState,
  idleStage,
  isDozing,
  idleText,
  titleCandidate,
  spinnerTail,
  receiptText,
  hintTail,
  promptTag,
  nowText,
  STALL_MS,
} from '../hooks/model.js'
import { setConfig, normalizeConfig, getConfig, configText } from '../hooks/config.js'

// 시험용 환경 설정. 실제 쓰는 값은 ~/.claude/harness-cockpit.json 에 둔다.
const FIXTURE = {
  repos: [
    { match: '/redshop(/|$)|/redapp', family: 'red' },
    { match: '/redshop/worktree-fe/', name: 'RedApp-Web', color: '#4D9BFF' },
    { match: '/acme/bluedesk', name: 'BlueDesk', color: '#39C5BB' },
    { match: '/redshop(/|$)', family: 'red', brand: 'RedShop', word: 'REDSHOP' },
    { match: '/bluedesk(/|$)', family: 'blue', brand: 'BlueDesk', word: 'BLUEDESK' },
  ],
  alertFiles: [
    { path: '/tmp/.alert-alpha', label: 'alpha' },
    { path: '/tmp/.alert-beta', label: 'beta' },
    { path: '/tmp/.alert-delta', label: 'delta' },
    { path: '/tmp/.alert-gamma', label: 'gamma' },
  ],
  alert: { title: '승인 플래그', note: '다음 1건이 통과된다' },
  texts: { leftClear: '띄운 것 없음 — 닫아도 된다', leftBusy: '닫기 불가 — 정리 후 다시 확인한다', leftPane: '닫기 불가', boardHint: '→ 이어받기' },
  branchKey: '(xy|abc)-[0-9]+',
  branchKeyFlags: 'i',
}
setConfig(FIXTURE, '/home/x')

test('level: 5단계 경계 0 · 30 · 50 · 70 · 85', async () => {
  expect(level(0)).toBe(0)
  expect(level(29)).toBe(0)
  expect(level(30)).toBe(1)
  expect(level(49)).toBe(1)
  expect(level(50)).toBe(2)
  expect(level(70)).toBe(3)
  expect(level(84)).toBe(3)
  expect(level(85)).toBe(4)
  expect(level(100)).toBe(4)
  expect(level(undefined)).toBe(-1)
  expect(level(null)).toBe(-1)
  expect(levelColor(undefined)).toBe('inactive')
  expect(levelColor(90)).toBe('error')
})

test('gaugeCells: 값이 없으면 전부 빈 칸, 있으면 위치 단계 색', async () => {
  const none = gaugeCells(undefined, 6)
  expect(none.length).toBe(6)
  expect(none.every((c) => !c.filled)).toBe(true)
  const half = gaugeCells(50, 10)
  expect(half.filter((c) => c.filled).length).toBe(5)
  expect(half[0].color).toBe('success')
  expect(half[4].color).toBe('#74AD2C')
  const full = gaugeCells(100, 10)
  expect(full[9].color).toBe('error')
  expect(gaugeCells(0, 5).filter((c) => c.filled).length).toBe(0)
})

test('repoFamily · repoInfo: 설정에서 빨강으로 정한 계열은 빨강', async () => {
  expect(repoFamily('/Users/x/workspace/acme/redshop/worktree/xy-1310')).toBe('red')
  expect(repoFamily('/Users/x/workspace/acme/redapp-fe')).toBe('red')
  expect(repoFamily('/Users/x/workspace/acme/bluedesk/worktree/t-1234')).toBe('blue')
  expect(repoFamily('')).toBe('blue')
  expect(repoInfo('/Users/x/workspace/acme/bluedesk/worktree/t-1').name).toBe('BlueDesk')
  expect(repoInfo('/Users/x/workspace/acme/bluedesk/worktree/t-1').worktree).toBe(true)
  expect(repoInfo('/Users/x/workspace/acme/redshop/worktree-fe/xy-1').name).toBe('RedApp-Web')
  expect(repoInfo('/tmp/other').name).toBe('other')
})

test('branchKey · branchTail', async () => {
  expect(branchKey('feature/ABC-1234-login-page')).toBe('ABC-1234')
  expect(branchKey('feature/xy-1310-x')).toBe('XY-1310')
  expect(branchKey('develop')).toBe('')
  expect(branchTail('feature/ABC-1234-login-page')).toBe('login-page')
  expect(branchTail('feature/ABC-1234-a-very-long-branch-name-that-goes-on')).toBe('a-very-long-branch-na…')
})

test('fmtDur', async () => {
  expect(fmtDur(5)).toBe('5s')
  expect(fmtDur(72)).toBe('1m 12s')
  expect(fmtDur(3725)).toBe('1h 02m')
})

test('rateOf: 이름 · 비율 · 없음', async () => {
  const rl = [
    { kind: 'five_hour', percentUsed: 18.4, resetsAt: '2026-10-06T06:00:00Z' },
    { kind: 'seven_day', percentUsed: 27 },
  ]
  expect(rateOf(rl, '5h').pct).toBe(18)
  expect(rateOf(rl, '7d').pct).toBe(27)
  expect(rateOf(rl, '5h').resetsAt).toBe(Date.parse('2026-10-06T06:00:00Z'))
  expect(rateOf([], '5h')).toBe(null)
  expect(rateOf(undefined, '7d')).toBe(null)
  // 초기화 직후의 낮은 값을 비율로 착각해 100 을 곱하지 않는다.
  expect(rateOf([{ kind: 'seven_day', percentUsed: 1 }], '7d').pct).toBe(1)
  expect(rateOf([{ kind: 'seven_day', percentUsed: 0.42 }], '7d').pct).toBe(0)
  expect(rateOf([{ kind: 'five_hour', percentUsed: 0 }], '5h').pct).toBe(0)
})

test('modelLabel', async () => {
  expect(modelLabel('claude-opus-5-5[1m]')).toBe('Opus 5.5')
  expect(modelLabel('claude-sonnet-5')).toBe('Sonnet 5')
  expect(modelLabel('claude-haiku-4-5-20251001')).toBe('Haiku 4.5')
})

test('planProgress: 체크박스 · 검증 · Files', async () => {
  const md = [
    '## Files',
    '- api-server-be/src/v2/a.ts',
    '- web-fe/src/b.tsx',
    '## Tasks',
    '- [x] **1-1** 구현',
    '- [x] **1-2** 검증: npm run build',
    '- [ ] **2-1** 구현',
    '- [ ] **2-2** 검증: jest',
  ].join('\n')
  const p = planProgress(md)
  expect(p.total).toBe(4)
  expect(p.done).toBe(2)
  expect(p.vTotal).toBe(2)
  expect(p.vDone).toBe(1)
  expect(p.files.length).toBe(2)
  expect(planProgress('').total).toBe(0)
})

test('areaOf · classifyTool', async () => {
  expect(areaOf('/x/bluedesk/worktree/t-1/src/a.ts')).toBe('BE')
  expect(areaOf('/x/bluedesk/worktree-fe/t-1/src/a.tsx')).toBe('FE')
  expect(areaOf('/x/bluedesk/worktree-admin-fe/t-1/a.tsx')).toBe('어드민 FE')
  expect(classifyTool('Write', { file_path: '/x/bluedesk/plans/ABC-1-a.md' }).kind).toBe('plan')
  expect(classifyTool('Edit', { file_path: '/x/bluedesk/worktree/t-1/src/a.ts' }).kind).toBe('impl')
  expect(classifyTool('Edit', { file_path: '/x/bluedesk/linear/ABC-1.md' }).kind).toBe('note')
  expect(classifyTool('Write', { file_path: '/x/bluedesk/flow-test/_a/r.md' }).kind).toBe('verify')
  expect(classifyTool('Bash', { command: 'npx jest src/v2' }).kind).toBe('verify')
  expect(classifyTool('Bash', { command: 'ls -la' })).toBe(null)
  expect(classifyTool('Grep', { path: '/x/bluedesk/worktree/t-1/src' }).kind).toBe('code')
  expect(classifyTool('WebSearch', {}).kind).toBe('research')
  expect(classifyTool('Artifact', {}).kind).toBe('report')
})

test('단계 흐름: 플랜 → 코드 → 구현 → 검증 → 완료', async () => {
  const s = newStepState()
  expect(viewSteps(s).mode).toBe('none')
  applyActivity(s, classifyTool('Write', { file_path: '/x/plans/ABC-1-a.md' }))
  expect(viewSteps(s).steps[0].state).toBe('active')
  applyActivity(s, classifyTool('Grep', { path: '/x/worktree/t-1/src' }))
  expect(s.step).toBe(1)
  applyActivity(s, classifyTool('Edit', { file_path: '/x/worktree/t-1/src/a.ts' }))
  expect(s.step).toBe(2)
  applyActivity(s, classifyTool('Grep', { path: '/x/worktree/t-1/src' }))
  expect(s.step).toBe(2)
  applyActivity(s, classifyTool('Bash', { command: 'npx jest' }))
  expect(s.step).toBe(3)
  const v = viewSteps(s)
  expect(v.steps.map((x) => x.state).join(',')).toBe('done,done,done,active,todo')
  applyActivity(s, classifyTool('Edit', { file_path: '/x/worktree/t-1/src/b.ts' }))
  expect(s.step).toBe(2)
  s.plan = { done: 4, total: 4, vDone: 2, vTotal: 2, files: [] }
  expect(viewSteps(s).steps.every((x) => x.state === 'done')).toBe(true)
})

test('결정 대기 · 막힘 · phase 우선', async () => {
  const s = newStepState()
  applyActivity(s, { kind: 'impl', path: '/x/worktree/t-1/a.ts', area: 'BE' })
  s.waiting = true
  expect(viewSteps(s).steps[2].state).toBe('wait')
  expect(viewSteps(s).chips[0].text).toBe('결정 대기')
  s.waiting = false
  noteBashResult(s, 'npx jest', true)
  noteBashResult(s, 'npx jest', true)
  expect(viewSteps(s).steps[2].state).toBe('active')
  noteBashResult(s, 'npx jest', true)
  expect(viewSteps(s).steps[2].state).toBe('fail')
  noteBashResult(s, 'npx jest', false)
  expect(viewSteps(s).steps[2].state).toBe('active')
  s.override = { step: 'verify', detail: 'E2E 3/8' }
  const v = viewSteps(s)
  expect(v.steps[3].state).toBe('active')
  expect(v.chips[0].text).toBe('E2E 3/8')
})

test('조사 세션: 조사 → 정리 → 보고', async () => {
  const s = newStepState()
  applyActivity(s, classifyTool('WebSearch', {}))
  expect(viewSteps(s).labels[0]).toBe('조사')
  applyActivity(s, classifyTool('Write', { file_path: '/x/bluedesk/linear/ABC-1.md' }))
  expect(s.step).toBe(1)
  applyActivity(s, classifyTool('Artifact', {}))
  expect(viewSteps(s).steps[2].state).toBe('active')
})

test('구현 칩: 플랜 Files 기준 영역 진행률', async () => {
  const s = newStepState()
  s.plan = { done: 1, total: 6, vDone: 0, vTotal: 2, files: ['api-server-be/src/a.ts', 'api-server-be/src/b.ts', 'web-fe/src/c.tsx'] }
  applyActivity(s, { kind: 'impl', path: '/x/worktree/t-1/src/a.ts', area: 'BE' })
  const chips = viewSteps(s).chips
  expect(chips.find((c) => c.text.startsWith('BE')).text).toBe('BE 1/2')
  expect(chips.find((c) => c.text.startsWith('FE')).text).toBe('FE 0/1')
})

test('subStatus: 10분 정체', async () => {
  const now = 1_000_000_000
  expect(subStatus({ done: false, last: now - 1000 }, now)).toBe('run')
  expect(subStatus({ done: false, last: now - STALL_MS }, now)).toBe('stall')
  expect(subStatus({ done: true, last: 0 }, now)).toBe('done')
})

test('parseTaskNotification · isEndStatus · eventColor', async () => {
  const n = parseTaskNotification('<task-notification><task-id>b1</task-id><tool-use-id>toolu_9</tool-use-id><status>completed</status><summary>Monitor "x" ended</summary></task-notification>')
  expect(n.toolUseId).toBe('toolu_9')
  expect(n.status).toBe('completed')
  expect(n.summary).toBe('Monitor "x" ended')
  expect(n.monitorDesc).toBe('x')
  const ev = parseTaskNotification('<task-notification>\n<task-id>bvzq1n4qp</task-id>\n<summary>Monitor event: "cockpit 시험 감시 6"</summary>\n<event>DONE step 1</event>\nIf this event is something the user would act on now, send a PushNotification.')
  expect(ev.toolUseId).toBe('')
  expect(ev.taskId).toBe('bvzq1n4qp')
  expect(ev.event).toBe('DONE step 1')
  expect(ev.monitorDesc).toBe('cockpit 시험 감시 6')
  expect(isEndStatus('killed')).toBe(true)
  expect(isEndStatus('running')).toBe(false)
  expect(parseTaskNotification('STALL W-3 산출물 11분 무증가').summary.startsWith('STALL')).toBe(true)
  expect(eventColor('STALL W-3')).toBe('warning')
  expect(eventColor('DONE T2')).toBe('success')
  expect(eventColor('Traceback (most recent call last)')).toBe('error')
})

test('dockerNameOf', async () => {
  expect(dockerNameOf('docker run -d --name test-db-1 -p 13306:3306 mysql')).toBe('test-db-1')
  expect(dockerNameOf('docker run -d -p 13310:3306 mysql')).toBe('docker run')
  expect(dockerNameOf('docker compose -p demo1 up -d')).toBe('demo1')
  expect(dockerNameOf('docker ps')).toBe('')
})

test('fleetStatus · fleetView', async () => {
  expect(fleetStatus('SEALED')).toEqual({ state: 'todo', text: '대기' })
  expect(fleetStatus('ACKED').text).toBe('작업중')
  expect(fleetStatus('DONE')).toEqual({ state: 'wait', text: '검증 대기' })
  expect(fleetStatus('CLOSED').state).toBe('done')
  expect(fleetStatus('BLOCKED').state).toBe('fail')
  const now = 1_800_000_000_000
  const v = fleetView(
    [
      { id: 'T-20260101-0374', status: 'SEALED', issue: '', acked: 0, dispatched: 0 },
      { id: 'T-20260101-0375', status: 'ACKED', issue: 'XY-1310', acked: now - 30000, dispatched: now - 60000 },
      { id: 'T-20260101-0379', status: 'DONE', issue: '', acked: 0, dispatched: 0 },
      { id: 'T-20260101-0378', status: 'CLOSED', issue: 'XY-1309', acked: 0, dispatched: 0 },
      { id: 'T-20260101-0380', status: 'CANCELLED', issue: '', acked: 0, dispatched: 0 },
    ],
    now,
  )
  expect(v.open.map((x) => [x.tail, x.issue, x.text, x.state])).toEqual([
    ['0379', '', '검증 대기', 'wait'],
    ['0375', 'XY-1310', '작업중', 'active'],
    ['0374', '', '대기', 'todo'],
  ])
  expect(v.open[1].min).toBe(0)
  expect(v.done).toBe(1)
  expect(v.cancelled).toBe(1)
  expect(fleetView([], now)).toEqual({ open: [], done: 0, cancelled: 0 })
})

test('flagsCreatedBy: 플래그를 만드는 호출만 잡는다', async () => {
  const bash = (command: string) => flagsCreatedBy('Bash', { command })
  expect(bash('touch /tmp/.alert-alpha')).toEqual(['alpha'])
  expect(bash('touch "/tmp/.alert-beta" && echo ok')).toEqual(['beta'])
  expect(bash(': > /tmp/.alert-gamma')).toEqual(['gamma'])
  expect(bash('echo 1 >> /tmp/.alert-delta')).toEqual(['delta'])
  expect(bash('date | tee /tmp/.alert-alpha')).toEqual(['alpha'])
  expect(bash('touch /private/tmp/.alert-alpha')).toEqual(['alpha'])
  expect(flagsCreatedBy('Write', { file_path: '/tmp/.alert-gamma' })).toEqual(['gamma'])
  // 언급만 하는 명령 · 다른 이름 · 다른 툴은 만든 것이 아니다.
  expect(bash('ls -la /tmp/.alert-alpha')).toEqual([])
  expect(bash('rm -f /tmp/.alert-alpha')).toEqual([])
  expect(bash('touch /tmp/.alert-alpha-backup')).toEqual([])
  expect(bash('touch /tmp/other; ls /tmp/.alert-alpha')).toEqual([])
  expect(bash('')).toEqual([])
  expect(flagsCreatedBy('Read', { file_path: '/tmp/.alert-alpha' })).toEqual([])
  expect(flagsCreatedBy('Write', { file_path: '/tmp/.alert-alpha.bak' })).toEqual([])
})

test('levelHex · blinkColor: 단계 원색과 작업 중 테두리 깜빡임', async () => {
  expect(levelHex(11)).toBe(0x3fae58)
  expect(levelHex(32)).toBe(0x74ad2c)
  expect(levelHex(91)).toBe(0xf0506e)
  expect(levelHex(null)).toBe(0x7b8491)
  // 4프레임(0.6초)은 계열 색, 다음 4프레임은 검정.
  expect([0, 1, 2, 3, 4, 5, 6, 7, 8].map((f) => blinkColor('blue', f))).toEqual(['#4d9bff', '#4d9bff', '#4d9bff', '#4d9bff', '#000000', '#000000', '#000000', '#000000', '#4d9bff'])
  expect(blinkColor('red', 0)).toBe('#ff6b80')
  expect(blinkColor('nope', 0)).toBe('#4d9bff')
})

test('restoreActive: mod 를 다시 읽은 세션만 마지막 활동 시각을 되살린다', async () => {
  const now = 10_000_000
  // 표식이 방금 갱신됨(같은 프로세스가 다시 읽음) → 남겨 둔 시각.
  expect(restoreActive(now, String(now - 20000), String(now - 900000))).toBe(now - 900000)
  // 표식이 낡음(새로 열었거나 이어 연 세션) → 지금부터.
  expect(restoreActive(now, String(now - 300000), String(now - 900000))).toBe(now)
  // 깨진 값 · 앞날의 값 → 지금부터.
  expect(restoreActive(now, 'x', String(now - 5))).toBe(now)
  expect(restoreActive(now, String(now - 1000), '')).toBe(now)
  expect(restoreActive(now, String(now - 1000), String(now + 5000))).toBe(now)
})

test('pillParts: 9칸 · 값만큼 채움 · 이름과 숫자 구분 · 값 없음', async () => {
  const p = pillParts('ctx', 11)
  expect(p.map((x) => x.text).join('')).toBe(' ctx 11% ')
  expect(p.map((x) => x.text).join('').length).toBe(PILL_COLS)
  expect(p[0]).toEqual({ text: ' ', filled: true, num: false })
  expect(p.filter((x) => x.filled).map((x) => x.text).join('').length).toBe(1)
  expect(p.filter((x) => x.num).map((x) => x.text).join('')).toBe('11% ')
  const half = pillParts('5h', 50)
  expect(half.map((x) => x.text).join('')).toBe(' 5h  50% ')
  expect(half.filter((x) => x.filled).map((x) => x.text).join('').length).toBe(5)
  expect(pillParts('7d', 100).every((x) => x.filled)).toBe(true)
  expect(pillParts('7d', 5).map((x) => x.text).join('')).toBe(' 7d   5% ')
  // 1% 라도 한 칸은 채우고, 0% 는 채우지 않는다.
  expect(pillParts('7d', 1).filter((x) => x.filled).map((x) => x.text).join('').length).toBe(1)
  expect(pillParts('7d', 0).some((x) => x.filled)).toBe(false)
  expect(pillParts('7d', 100).map((x) => x.text).join('')).toBe(' 7d  100%')
  const none = pillParts('ctx', null)
  expect(none.map((x) => x.text).join('')).toBe(' ctx  —  ')
  expect(none.map((x) => x.text).join('').length).toBe(PILL_COLS)
  expect(none.some((x) => x.filled)).toBe(false)
})

test('workState: 본체 · 하위만 · 쉼. 백그라운드 명령과 감시는 세지 않는다', async () => {
  expect(workState({ busy: true, subs: 2, workers: 0 })).toEqual({ working: true, kind: 'main', n: 2 })
  expect(workState({ busy: false, subs: 1, workers: 1 })).toEqual({ working: true, kind: 'sub', n: 2 })
  expect(workState({ busy: false, subs: 0, workers: 0 })).toEqual({ working: false, kind: 'idle', n: 0 })
  expect(workState({ busy: false, subs: 0, workers: 0, shells: 3, mons: 2 }).working).toBe(false)
})

test('idleStage · idleText: 15분에 잠 · 60분에 흐림 · 작업 중이면 깨어 있음', async () => {
  const t = 10 * 3600 * 1000
  expect(idleStage(t, t - 60 * 1000, false)).toBe(0)
  expect(idleStage(t, t - 15 * 60 * 1000, false)).toBe(1)
  expect(idleStage(t, t - 59 * 60 * 1000, false)).toBe(1)
  expect(idleStage(t, t - 60 * 60 * 1000, false)).toBe(2)
  expect(idleStage(t, t - 90 * 60 * 1000, true)).toBe(0)
  expect(idleStage(t, 0, false)).toBe(0)
  expect(idleStage(t, t - 5000, false, { sleepMs: 3000, dimMs: 8000 })).toBe(1)
  expect(idleText(t, t - 23 * 60 * 1000)).toBe('쉼 23분')
  expect(idleText(t, t - 72 * 60 * 1000)).toBe('쉼 1시간 12분')
})

test('titleCandidate: 이름이 있으면 그대로 · 손으로 지은 줄 이름 · 이슈 제목 앞부분', async () => {
  expect(titleCandidate({ current: 'mod', issueTitle: '하네스 콕핏 mod' })).toBe('')
  expect(titleCandidate({ current: '', lineName: '배포 스크립트 정리', lineAuto: false, issueTitle: '다른 제목' })).toBe('배포 스크립트 정리')
  // 자동으로 붙은 줄 이름은 세션 이름에서 온 것이라 쓰지 않는다.
  expect(titleCandidate({ current: '', lineName: 'mod', lineAuto: true, issueTitle: '[HARNESS] 하네스 콕핏 mod — 프롬프트 위 띠 카드' })).toBe('하네스 콕핏 mod')
  expect(titleCandidate({ current: '', issueTitle: '검색 결과 화면에서 정렬을 고른다' })).toBe('검색 결과 화면에서 정')
  expect(titleCandidate({ current: '', issueTitle: '' })).toBe('')
  expect(titleCandidate({ current: '  ', issueTitle: '[A][B] 제목' })).toBe('제목')
})

test('spinnerTail · receiptText · hintTail · promptTag', async () => {
  expect(spinnerTail({ step: '검증', tool: 'Bash npx jest login', tools: 23, mid: 1 })).toBe('· 검증 · Bash npx jest login · 도구 23번째 · 도중 메시지 1건 받음')
  expect(spinnerTail({ step: '', tool: '', tools: 0, mid: 0 })).toBe('')
  expect(spinnerTail({ step: '', tool: 'x'.repeat(50), tools: 1, mid: 0 }).includes('…')).toBe(true)
  expect(receiptText({ tools: 31, files: 4, fails: 1, subs: 0, mid: 0, ctx0: 20, ctx1: 24, h50: 30, h51: 33 })).toBe('도구 31 · 고친 파일 4 · 실패 1 · ctx +4% · 5h +3%')
  expect(receiptText({ tools: 0 })).toBe('도구 0')
  expect(receiptText({ tools: 2, ctx0: null, ctx1: 5 })).toBe('도구 2')
  expect(hintTail({ shells: 0, dockers: 1, browser: true, unpushed: 2 })).toBe('남은 것: docker 1 · 브라우저 1 · 미push 2')
  expect(hintTail({ shells: 0, dockers: 0, browser: false, unpushed: 0 })).toBe('')
  const at = new Date(2026, 9, 8, 10, 12).getTime()
  expect(promptTag({ n: 12, at, mid: false })).toBe('#12 · 10:12')
  expect(promptTag({ n: 13, at, mid: true })).toBe('#13 · 10:12 · 작업 도중')
})

test('nowText: 한눈 요약 — 머리줄 · 이번 턴 · 하위와 남은 것 · 한도 · 프롬프트 목록', async () => {
  const at = new Date(2026, 9, 8, 10, 12).getTime()
  const text = nowText({
    issue: 'ABC-234', step: '검증', busy: true, turnSec: 132, subs: 2, mons: 1, idle: '',
    turn: { tools: 23, files: 4, fails: 0 }, tool: 'Bash npx jest',
    left: { shells: 0, dockers: 1, browser: false, unpushed: 0 },
    usage: { ctx: 11, h5: 32, d7: 5 },
    prompts: [{ n: 12, at, mid: false, text: '로그인 화면 만들어줘' }],
  })
  const lines = text.split('\n')
  expect(lines[0]).toBe('ABC-234 · 단계 검증 · 턴 2m 12s째')
  expect(lines[1]).toBe('이번 턴: 도구 23 · 고친 파일 4 · 지금 Bash npx jest')
  expect(lines[2]).toBe('서브 2 · 감시 1 · 남은 것: docker 1')
  expect(lines[3]).toBe('한도: ctx 11% · 5h 32% · 7d 5%')
  expect(lines[5]).toBe('  #12 · 10:12  로그인 화면 만들어줘')
  const idle = nowText({ issue: '', step: '', busy: false, subs: 0, mons: 0, idle: '쉼 23분', turn: { tools: 0 }, tool: '', left: {}, usage: null, prompts: [] })
  expect(idle.split('\n')[0]).toBe('이슈 없음 · 단계 없음 · 쉼 23분')
})

test('isDozing: 5분부터 졸고 15분부터는 잠(졸음 아님) · 작업 중이면 아님', async () => {
  const now = 100_000_000
  const min = 60_000
  expect(isDozing(now, now - 4 * min, false)).toBe(false)
  expect(isDozing(now, now - 5 * min, false)).toBe(true)
  expect(isDozing(now, now - 14 * min, false)).toBe(true)
  expect(isDozing(now, now - 15 * min, false)).toBe(false)
  expect(isDozing(now, now - 6 * min, true)).toBe(false)
  expect(idleStage(now, now - 6 * min, false)).toBe(0)
  expect(idleStage(now, now - 15 * min, false)).toBe(1)
  // 시험용 기준: 잠 9초면 졸음 3초.
  expect(isDozing(now, now - 4000, false, { dozeMs: 3000, sleepMs: 9000, dimMs: 600000 })).toBe(true)
})

test('설정: 없으면 기본값 · 깨진 항목만 버림 · ~ 펼침 · 기본 브랜치 키', async () => {
  const d = normalizeConfig(null, '/home/x')
  expect(d.repos).toEqual([])
  expect(d.alertFiles).toEqual([])
  expect(d.alert).toEqual({ title: '경보 파일', note: '' })
  expect(d.issue.boardCommand).toBe(null)
  expect(d.issue.mcpServer).toBe('linear')
  expect(d.fleetRoot).toBe('')
  expect(d.serviceWindow).toBe(null)
  expect(d.location).toBe(null)
  expect(d.texts).toEqual({ leftClear: '띄운 것 없음 — 세션을 닫아도 된다', leftBusy: '닫기 전에 정리한다', leftPane: '닫기 전 정리 필요', boardHint: '' })
  expect(d.quitMin).toBe(18 * 60)
  expect(d.bells).toEqual([])
  expect(d.verifyRe).toBe(null)
  const t2 = normalizeConfig({ location: { lat: 10.5, lon: -20 }, quitTime: '17:30', bells: ['14:10', 'x', '9:05'], verifyCommand: 'make check' }, '')
  expect(t2.location).toEqual({ lat: 10.5, lon: -20 })
  expect(t2.quitMin).toBe(17 * 60 + 30)
  expect(t2.bells).toEqual([850, 545])
  expect(t2.verifyRe.test('make check all')).toBe(true)
  expect(normalizeConfig({ location: { lat: 95, lon: 0 }, quitTime: '25:00' }, '').location).toBe(null)
  expect(normalizeConfig({ quitTime: '25:00' }, '').quitMin).toBe(18 * 60)
  expect(normalizeConfig({ serviceWindow: { label: 'dev', startHour: 7, endHour: 19 } }, '').serviceWindow).toEqual({ label: 'dev', start: 7, end: 19 })
  expect(normalizeConfig({ serviceWindow: { label: 'dev', startHour: 19, endHour: 7 } }, '').serviceWindow).toBe(null)
  const c = normalizeConfig(
    {
      repos: [{ match: '(', name: 'broken' }, { match: '/ok/', name: 'Ok' }, { name: 'no-match' }],
      alertFiles: [{ path: 'relative', label: 'x' }, { path: '/tmp/a', label: 'a' }, { path: '/tmp/b' }],
      issue: { boardCommand: ['~/bin/board', 'ls'], boardLineDir: '~/board/lines', mcpServer: '', keyPattern: '^T-[0-9]+$' },
      fleetRoot: '~/work',
      branchKey: '(',
    },
    '/home/x',
  )
  expect(c.repos.map((x) => x.name)).toEqual(['Ok'])
  expect(c.alertFiles).toEqual([{ path: '/tmp/a', label: 'a' }])
  expect(c.issue.boardCommand).toEqual(['/home/x/bin/board', 'ls'])
  expect(c.issue.boardLineDir).toBe('/home/x/board/lines')
  expect(c.issue.mcpServer).toBe('')
  expect(c.issue.keyRe.test('T-12')).toBe(true)
  expect(c.fleetRoot).toBe('/home/x/work')
  // 깨진 브랜치 키 무늬는 기본 무늬로 돌아간다.
  expect(c.branchKeyRe.test('feature/ABC-12-x')).toBe(true)
  expect(configText(c, '/home/x/.claude/harness-cockpit.json', true).includes('레포 이름표 1')).toBe(true)
  // 설정이 없을 때: 폴더 이름이 레포 이름, 계열은 파랑, 브랜치의 대문자 키만 잡는다.
  setConfig(null, '/home/x')
  expect(repoInfo('/w/my-app').name).toBe('my-app')
  expect(repoFamily('/w/redshop/a')).toBe('blue')
  expect(branchKey('feature/ABC-1234-x')).toBe('ABC-1234')
  expect(branchKey('release-2024')).toBe('')
  expect(flagsCreatedBy('Bash', { command: 'touch /tmp/.alert-alpha' })).toEqual([])
  setConfig(FIXTURE, '/home/x')
  expect(getConfig().alertFiles.length).toBe(4)
})
