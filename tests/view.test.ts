import { expect, test } from 'claude-code/testing'
import { band, pane, agentStatus, monitorLine, leftoversText } from '../hooks/view.js'
import { newStepState, applyActivity, viewSteps } from '../hooks/model.js'
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

// 요소 생성자 대역. 트리 모양만 확인하므로 받은 props 를 그대로 담는다.
const E = {
  Box: (p) => ({ type: 'Box', props: p }),
  Text: (p) => ({ type: 'Text', props: p }),
  Raster: (p) => ({ type: 'Raster', props: p }),
}

function textOf(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).join('')
  const ch = node.props && node.props.children
  return Array.isArray(ch) ? ch.map(textOf).join('') : textOf(ch)
}

function baseSnap(over) {
  const now = 1_800_000_000_000
  return Object.assign(
    {
      now,
      cols: 140,
      frame: 0,
      family: 'blue',
      flags: [],
      issue: { key: 'ABC-234', title: '하네스 콕핏 mod', state: 'In Progress' },
      repo: { name: 'BlueDesk', color: '#39C5BB', worktree: true },
      coKey: 'ABC-1234',
      branch: 'feature/ABC-1234-login-page',
      dirty: 3,
      model: 'Opus 5.5',
      effort: 'xhigh',
      usage: { ctx: 41, h5: { pct: 21, resetsAt: now + 3600000 }, d7: { pct: 24, resetsAt: null } },
      busy: true,
      turnStart: now - 72000,
      lastDur: 0,
      asking: false,
      fleet: null,
      subs: [],
      mons: [],
      left: [],
    },
    over || {},
  )
}

test('band: 굵은 파랑 카드 · 2줄 · 이슈 키와 단계 · 사용량', async () => {
  const s = newStepState()
  applyActivity(s, { kind: 'impl', path: '/x/worktree/t-1/a.ts', area: 'BE' })
  const tree = band(E, baseSnap(), viewSteps(s))
  // 테두리는 일할 때도 쉴 때도 굵은 한 줄.
  expect(tree.props.borderStyle).toBe('bold')
  expect(band(E, baseSnap({ busy: false }), viewSteps(s)).props.borderStyle).toBe('bold')
  // 작업 중에는 계열 색 ↔ 검정으로 깜빡인다(4프레임씩).
  expect(tree.props.borderColor).toBe('#4d9bff')
  expect(band(E, baseSnap({ frame: 3 }), viewSteps(s)).props.borderColor).toBe('#4d9bff')
  expect(band(E, baseSnap({ frame: 4 }), viewSteps(s)).props.borderColor).toBe('#000000')
  expect(band(E, baseSnap({ frame: 8 }), viewSteps(s)).props.borderColor).toBe('#4d9bff')
  expect(band(E, baseSnap({ busy: false }), viewSteps(s)).props.borderColor).toBe('#4D9BFF')
  expect(tree.props.children.length).toBe(2)
  const all = textOf(tree)
  expect(all.includes('ABC-234')).toBe(true)
  expect(all.includes('구현')).toBe(true)
  expect(all.includes('작업중')).toBe(true)
  expect(all.includes('ctx')).toBe(true)
  expect(all.includes('41%')).toBe(true)
  expect(all.includes('5h')).toBe(true)
  expect(all.includes('7d')).toBe(true)
  expect(all.includes('$')).toBe(false)
})

test('band: 경보 파일이 살아 있으면 두 줄 빨간 테두리 + 경보 줄(글귀는 설정의 alert)', async () => {
  const tree = band(E, baseSnap({ flags: ['beta'] }), viewSteps(newStepState()))
  expect(tree.props.borderStyle).toBe('double')
  expect(tree.props.borderColor).toBe('error')
  expect(tree.props.children.length).toBe(3)
  expect(textOf(tree.props.children[0]).includes('승인 플래그 활성')).toBe(true)
  expect(textOf(tree.props.children[0]).includes('다음 1건이 통과된다')).toBe(true)
})

test('band: 빨강 계열은 빨강 테두리 — 쉬는 동안은 그대로, 작업 중에는 깜빡인다', async () => {
  expect(band(E, baseSnap({ family: 'red', busy: false }), viewSteps(newStepState())).props.borderColor).toBe('error')
  expect(band(E, baseSnap({ family: 'red' }), viewSteps(newStepState())).props.borderColor).toBe('#ff6b80')
})

test('band: 사용량 값이 없으면 — 로 그린다', async () => {
  const tree = band(E, baseSnap({ usage: { ctx: null, h5: null, d7: null } }), viewSteps(newStepState()))
  const all = textOf(tree)
  expect(all.includes('ctx')).toBe(true)
  expect(all.includes(' —')).toBe(true)
  expect(all.includes('0%')).toBe(false)
})

test('band: 좁은 폭에서도 단계와 사용량이 남는다', async () => {
  const s = newStepState()
  applyActivity(s, { kind: 'impl', path: '/x/worktree/t-1/a.ts', area: 'BE' })
  const all = textOf(band(E, baseSnap({ cols: 80 }), viewSteps(s)))
  expect(all.includes('구현')).toBe(true)
  expect(all.includes('ctx')).toBe(true)
  expect(all.includes('7d')).toBe(true)
})

test('band: 사용량은 숫자 알약이다 — 칸 게이지(▊ · ▰▱)는 쓰지 않는다', async () => {
  const tree = band(E, baseSnap(), viewSteps(newStepState()))
  const all = textOf(tree)
  expect(all.includes(' ctx 41% ')).toBe(true)
  expect(all.includes(' 5h  21% ')).toBe(true)
  expect(all.includes(' 7d  24% ')).toBe(true)
  expect(all.includes('▊')).toBe(false)
  expect(all.includes('▰')).toBe(false)
  // 알약 조각은 바탕색을 갖고, 값만큼의 앞 칸은 단계 색으로 채운다.
  const segs = []
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(walk)
    if (n.type === 'Text' && n.props.backgroundColor) segs.push(n.props)
    walk(n.props && n.props.children)
  }
  walk(tree)
  expect(segs.length >= 6).toBe(true)
  // 빈 칸은 테마의 흐린 바탕 + 테마 글자색, 채운 칸은 단계 색 바탕 + 어두운 글자 — 밝은 테마 · 어두운 테마 어디서나 읽힌다.
  const rest = segs.filter((p) => p.backgroundColor === 'subtle')
  const fill = segs.filter((p) => p.backgroundColor !== 'subtle')
  expect(rest.length > 0 && rest.every((p) => p.color === 'text')).toBe(true)
  expect(fill.length > 0 && fill.every((p) => /^#[0-9a-f]{6}$/.test(p.backgroundColor) && p.color === '#15171c')).toBe(true)
})

test('워커: 띠에는 개수 칩만, 패널에 세로 목록', async () => {
  const now = 1_800_000_000_000
  const fleet = {
    bids: ['B-20260101-01', 'B-20260101-02'],
    tasks: [
      { id: 'T-20260101-0374', status: 'DONE', issue: 'XY-1309', acked: 0, dispatched: 0 },
      { id: 'T-20260101-0375', status: 'ACKED', issue: 'XY-1310', acked: now - 12 * 60000, dispatched: 0 },
      { id: 'T-20260101-0376', status: 'SEALED', issue: '', acked: 0, dispatched: 0 },
      { id: 'T-20260101-0378', status: 'CLOSED', issue: 'XY-1309', acked: 0, dispatched: 0 },
    ],
    rollupAt: null,
  }
  const snap = baseSnap({ now, fleet })
  const bandText = textOf(band(E, snap, viewSteps(newStepState())))
  expect(bandText.includes('● 워커 3 · 검증 대기 1')).toBe(true)
  expect(bandText.includes('0375')).toBe(false)
  const p = pane(E, snap)
  const lines = p.props.children.map(textOf)
  const at = lines.indexOf('워커 3')
  expect(at >= 0).toBe(true)
  expect(lines.slice(at + 1, at + 7)).toEqual(['● 0374 XY-1309', '  검증 대기', '● 0375 XY-1310', '  작업중 · 12분', '○ 0376', '  대기'])
  expect(lines.includes('✓ 완료 1')).toBe(true)
  expect(lines.some((l) => l.includes('0378'))).toBe(false)
})

test('pane: 서브 · 감시 · 띄운 것 · 플래그를 모두 그린다', async () => {
  const now = 1_800_000_000_000
  const snap = baseSnap({
    flags: ['beta'],
    subs: [{ name: 'explorer', status: 'run', el: 120000, last: now - 5000, start: now - 120000 }],
    mons: [{ desc: 'queue watch', ended: false, events: 2, last: 'DONE T2', elMs: 26 * 60000, timeoutMs: 30 * 60000, remainMs: 4 * 60000, warn: true }],
    left: ['셸 npm run start:local'],
  })
  const all = textOf(pane(E, snap))
  expect(all.includes('승인 플래그')).toBe(true)
  expect(all.includes('서브 1')).toBe(true)
  expect(all.includes('감시 1')).toBe(true)
  expect(all.includes('queue watch')).toBe(true)
  expect(all.includes('만료 4분 전')).toBe(true)
  expect(all.includes('띄운 것 1')).toBe(true)
  expect(all.includes('닫기 불가 — 1개 남음')).toBe(true)
})

test('agentStatus · monitorLine · leftoversText', async () => {
  const now = 1_800_000_000_000
  expect(textOf(agentStatus(E, { status: 'stall', start: now - 700000, last: now - 660000 }, now, 0)).includes('정체 의심')).toBe(true)
  expect(textOf(monitorLine(E, '서브 감시', 'STALL W-3', now)).includes('STALL W-3')).toBe(true)
  expect(leftoversText([]).includes('없음')).toBe(true)
  expect(leftoversText(['docker test-db']).includes('불가')).toBe(true)
})

test('band: Clawd 가 켜져 있으면 왼쪽에 3줄 그림, 좁으면 뺀다', async () => {
  const snap = baseSnap({ clawd: { cells: 'AAAA' } })
  const tree = band(E, snap, viewSteps(newStepState()))
  expect(tree.props.flexDirection).toBe('row')
  expect(tree.props.borderStyle).toBe('bold')
  const pic = tree.props.children[0].props.children[0]
  expect(pic.type).toBe('Raster')
  expect(pic.props.key).toBe('clawd')
  expect(pic.props.columns).toBe(15)
  expect(pic.props.rows).toBe(3)
  expect(textOf(tree).includes('ctx')).toBe(true)
  const narrow = band(E, baseSnap({ cols: 60, clawd: { cells: 'AAAA' } }), viewSteps(newStepState()))
  expect(narrow.props.flexDirection).toBe('column')
})

const FULL = {
  clawd: { cells: 'AAAA' },
  arc: { cells: 'BBBB' },
  week: [
    { text: '월', kind: 'past' },
    { text: '화', kind: 'past' },
    { text: '수', kind: 'past' },
    { text: '목', kind: 'today' },
    { text: '금', kind: 'future' },
  ],
  timer: { text: '2h14m', color: 0x3fae58, blink: false, done: false },
  work: { working: true, kind: 'main', n: 0 },
  idle: 0,
  lastActiveAt: 1_800_000_000_000 - 1000,
  remote: false,
  awake: false,
}

test('배치 가: [Clawd] [일 3줄] [알약 세로 3개] [반원 + 주간 띠]', async () => {
  const tree = band(E, baseSnap(FULL), viewSteps(newStepState()))
  const kids = tree.props.children
  expect(kids.length).toBe(4)
  expect(kids[0].props.children[0].props.key).toBe('clawd')
  // 일 3줄: 첫 줄 단계 + 배지, 둘째 줄 이름, 셋째 줄 칩(없으면 빈 줄).
  expect(kids[1].props.children.length).toBe(3)
  expect(textOf(kids[1].props.children[0]).includes('작업중')).toBe(true)
  expect(textOf(kids[1].props.children[1]).includes('BlueDesk')).toBe(true)
  expect(textOf(kids[1]).includes('ctx')).toBe(false)
  // 알약 세로 3개.
  expect(kids[2].props.flexDirection).toBe('column')
  expect(kids[2].props.children.map(textOf)).toEqual([' ctx 41% ', ' 5h  21% ', ' 7d  24% '])
  // 반원 그림(14 × 2) 아래에 주간 띠. 오늘은 바탕색이 있는 글자.
  const arc = kids[3].props.children
  expect(arc[0].type).toBe('Raster')
  expect(arc[0].props.key).toBe('arc')
  expect(arc[0].props.columns).toBe(14)
  expect(arc[0].props.rows).toBe(2)
  expect(textOf(arc[1])).toBe('월화수목금')
  // 오늘은 테마 글자색을 바탕으로 뒤집는다.
  expect(arc[1].props.children[3].props.backgroundColor).toBe('text')
  expect(arc[1].props.children[3].props.color).toBe('inverseText')
})

test('배치 가: 폭이 줄면 반원 → 알약 순으로 접고, 요일과 퇴근 숫자는 글자로 남긴다', async () => {
  const mid = band(E, baseSnap(Object.assign({}, FULL, { cols: 105 })), viewSteps(newStepState()))
  expect(mid.props.children.length).toBe(3)
  expect(textOf(mid.props.children[1].props.children[2]).includes('목 퇴근 2h14m')).toBe(true)
  const small = band(E, baseSnap(Object.assign({}, FULL, { cols: 84 })), viewSteps(newStepState()))
  expect(small.props.children.length).toBe(2)
  const all = textOf(small)
  expect(all.includes('ctx')).toBe(true)
  expect(all.includes('퇴근 2h14m')).toBe(true)
  // 주말: 숫자 없이 요일만.
  const sat = band(E, baseSnap(Object.assign({}, FULL, { cols: 105, timer: { off: true }, week: [{ text: '토', kind: 'weekend' }] })), viewSteps(newStepState()))
  expect(textOf(sat.props.children[1].props.children[2]).trim()).toBe('토')
})

test('표시: 원격이면 배지 왼쪽에 폰, 화면이 안 꺼지면 셋째 줄(상태 칩 줄)에 caffeinate', async () => {
  const rows = (over) => band(E, baseSnap(Object.assign({}, FULL, over)), viewSteps(newStepState())).props.children[1].props.children.map(textOf)
  expect(rows({})[0].includes('▯')).toBe(false)
  expect(rows({}).join('').includes('caffeinate')).toBe(false)
  const r = rows({ remote: true, awake: true })
  expect(r[0].includes('▯ ')).toBe(true)
  expect(r[0].indexOf('▯') < r[0].indexOf('작업중')).toBe(true)
  expect(r[0].includes('caffeinate')).toBe(false)
  expect(r[2].includes('caffeinate')).toBe(true)
  // 다른 칩이 있으면 그 뒤에 온다.
  const withLeft = rows({ awake: true, left: ['docker test-db'] })[2]
  expect(withLeft.indexOf('띄운 것') < withLeft.indexOf('caffeinate')).toBe(true)
  // 그림이 없어 2줄일 때는 첫 줄 오른쪽(칩 자리)에 온다.
  const two = band(E, baseSnap(Object.assign({}, FULL, { clawd: null, awake: true })), viewSteps(newStepState()))
  expect(textOf(two.props.children[0]).includes('caffeinate')).toBe(true)
})

test('작업 중: 본체가 쉬어도 하위가 일하면 테두리가 깜빡이고 배지가 「하위 N 작업중」', async () => {
  const sub = band(E, baseSnap(Object.assign({}, FULL, { busy: false, frame: 5, work: { working: true, kind: 'sub', n: 2 } })), viewSteps(newStepState()))
  expect(textOf(sub).includes('하위 2 작업중')).toBe(true)
  expect(sub.props.borderStyle).toBe('bold')
  expect(sub.props.borderColor).toBe('#000000')
  const idle = band(E, baseSnap(Object.assign({}, FULL, { busy: false, lastDur: 6, work: { working: false, kind: 'idle', n: 0 } })), viewSteps(newStepState()))
  expect(idle.props.borderColor).toBe('#4D9BFF')
  expect(idle.props.borderStyle).toBe('bold')
  expect(textOf(idle).includes('✔ 완료')).toBe(true)
})

test('오래 쉼: 15분이면 배지가 「쉼 N분」, 60분이면 테두리와 글자가 흐려진다', async () => {
  const now = 1_800_000_000_000
  const base = { busy: false, lastDur: 6, work: { working: false, kind: 'idle', n: 0 } }
  const asleep = band(E, baseSnap(Object.assign({}, FULL, base, { idle: 1, lastActiveAt: now - 23 * 60000 })), viewSteps(newStepState()))
  expect(textOf(asleep).includes('쉼 23분')).toBe(true)
  expect(textOf(asleep).includes('완료')).toBe(false)
  expect(asleep.props.borderColor).toBe('#4D9BFF')
  const dim = band(E, baseSnap(Object.assign({}, FULL, base, { idle: 2, lastActiveAt: now - 72 * 60000 })), viewSteps(newStepState()))
  expect(dim.props.borderColor).toBe('inactive')
  expect(textOf(dim).includes('쉼 1시간 12분')).toBe(true)
  let dimmed = 0
  let plain = 0
  const walk = (n) => {
    if (!n || typeof n !== 'object') return
    if (Array.isArray(n)) return n.forEach(walk)
    if (n.type === 'Text' && typeof n.props.children[0] === 'string') n.props.dimColor ? (dimmed += 1) : (plain += 1)
    walk(n.props && n.props.children)
  }
  walk(dim)
  expect(dimmed > 5).toBe(true)
  expect(plain).toBe(0)
  // 흐림은 그 띠를 그리는 동안만 — 다음에 그리는 띠는 평소대로.
  const again = band(E, baseSnap(FULL), viewSteps(newStepState()))
  dimmed = 0
  walk(again)
  expect(dimmed).toBe(0)
})
