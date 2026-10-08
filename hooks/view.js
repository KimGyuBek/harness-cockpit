// 하네스 콕핏의 화면 트리 조립. `$` 를 받지 않고, register.js 가 넘긴 요소 생성자(E)와
// 상태 스냅샷(snap)만으로 트리를 만든다. 같은 스냅샷이면 같은 트리가 나온다.
import {
  STATE_COLORS,
  FAMILY_BORDER,
  SPINNER,
  levelColor,
  levelHex,
  mixHex,
  hexText,
  blinkColor,
  pillParts,
  PILL_COLS,
  idleText,
  fmtDur,
  fmtClock,
  branchTail,
  eventColor,
  fleetView,
} from './model.js'
import { getConfig } from './config.js'
import { CLAWD_COLS, CLAWD_ROWS } from './clawd.js'
import { ARC_COLS, ARC_ROWS } from './arc.js'

const DIM = 'inactive'
const RUN = STATE_COLORS.active
const TEAL = '#1FA89E'

// 60분 넘게 쉰 띠는 글자를 전부 흐리게 그린다. band() 가 그리는 동안에만 켠다.
let dimAll = false

function t(E, text, props) {
  const p = Object.assign({ children: [text] }, props || {})
  if (dimAll) p.dimColor = true
  return E.Text(p)
}

function sep(E) {
  return t(E, '  │  ', { color: DIM })
}

// 숨쉬기 점. 회전은 “작업중” 배지 한 곳만 쓰고(확정 사항), 나머지 진행 중 표시는
// 밝기만 바뀌는 점으로 둬서 띠가 산만해지지 않게 한다.
function breathe(E, frame, color) {
  const on = Math.floor(frame / 4) % 2 === 0
  return t(E, '●', { color: on ? color : DIM })
}

function ago(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  if (s < 60) return s + '초 전'
  if (s < 3600) return Math.floor(s / 60) + '분 전'
  return Math.floor(s / 3600) + '시간 전'
}

function stateColor(st) {
  return STATE_COLORS[st] || DIM
}

function currentColor(view) {
  const cur = view.steps.find((x) => x.state === 'active' || x.state === 'wait' || x.state === 'fail')
  if (cur) return stateColor(cur.state)
  if (view.steps.length && view.steps.every((x) => x.state === 'done')) return STATE_COLORS.done
  return RUN
}

function chip(E, c, frame) {
  const color = stateColor(c.state)
  if (c.state === 'cancel') return [t(E, ' '), t(E, c.text + ' 취소', { color: DIM, strikethrough: true })]
  const mark = c.state === 'done' ? '✓ ' : c.state === 'todo' ? '○ ' : null
  return [t(E, '  '), mark ? t(E, mark, { color }) : breathe(E, frame, color), mark ? null : t(E, ' '), t(E, c.text, { color, bold: c.state !== 'todo' })]
}

function stepperWide(E, view, frame) {
  const out = []
  view.steps.forEach((s, i) => {
    const color = stateColor(s.state)
    let icon
    if (s.state === 'done') icon = t(E, '✓', { color })
    else if (s.state === 'active') icon = breathe(E, frame, color)
    else if (s.state === 'wait') icon = t(E, '!', { color, bold: true })
    else if (s.state === 'fail') icon = t(E, '✕', { color, bold: true })
    else icon = t(E, '○', { color: DIM })
    out.push(icon, t(E, ' ' + s.label, { color, bold: s.state === 'active' || s.state === 'wait' || s.state === 'fail' }))
    const isCurrent = s.state === 'active' || s.state === 'wait' || s.state === 'fail'
    if (isCurrent) for (const c of view.chips) out.push(...chip(E, c, frame))
    if (i < view.steps.length - 1) out.push(t(E, ' ── ', { color: s.state === 'done' ? STATE_COLORS.done : DIM }))
  })
  return out
}

function stepperNarrow(E, view, frame) {
  const out = []
  view.steps.forEach((s) => {
    if (s.state === 'active') out.push(breathe(E, frame, stateColor(s.state)))
    else out.push(t(E, s.state === 'todo' ? '○' : '●', { color: stateColor(s.state) }))
  })
  const cur = view.steps.find((x) => x.state === 'active' || x.state === 'wait' || x.state === 'fail')
  const label = cur ? cur.label : view.steps.length ? '완료' : ''
  out.push(t(E, ' ' + label, { bold: true, color: currentColor(view) }))
  const c = view.chips.find((x) => x.state !== 'todo' && x.state !== 'done' && x.state !== 'cancel')
  if (c) out.push(...chip(E, c, frame))
  return out
}

// 숫자 알약: 이름과 숫자를 적고, 값만큼의 칸 바탕을 단계 색으로 채운다(칸 게이지를 대신한다).
// 터미널 바탕색(밝은 테마 · 어두운 테마)에 상관없이 읽히게: 채운 칸은 단계 색 바탕에 어두운 글자,
// 빈 칸은 테마의 흐린 색 바탕에 테마의 글자색. 바탕과 글자를 늘 같은 쪽에서 고르므로 어느 테마에서도 묻히지 않는다.
function pillSegs(E, label, pct) {
  const fill = hexText(levelHex(pct))
  return pillParts(label, pct).map((p) => t(E, p.text, p.filled ? { backgroundColor: fill, color: '#15171c', bold: p.num } : { backgroundColor: 'subtle', color: 'text', bold: p.num }))
}

function usageValues(snap) {
  const u = snap.usage
  return [
    ['ctx', u.ctx],
    ['5h', u.h5 ? u.h5.pct : null],
    ['7d', u.d7 ? u.d7.pct : null],
  ]
}

// 세로로 쌓은 알약 3개(9칸 × 3줄). 띠가 3줄일 때 오른쪽에 둔다.
function pillStack(E, snap) {
  return E.Box({ flexDirection: 'column', flexShrink: 0, paddingLeft: 1, children: usageValues(snap).map((v) => E.Text({ children: pillSegs(E, v[0], v[1]) })) })
}

// 한 줄로 놓은 사용량. 넓으면 알약 셋, 좁으면 숫자만.
function usageRow(E, snap, compact) {
  const out = []
  usageValues(snap).forEach((v, i) => {
    if (compact) {
      if (i) out.push(t(E, '  '))
      out.push(t(E, v[0] + ' ', { color: DIM }), t(E, v[1] === null || v[1] === undefined ? '—' : v[1] + '%', { color: levelColor(v[1]), bold: true }))
    } else {
      if (i) out.push(t(E, ' '))
      out.push(...pillSegs(E, v[0], v[1]))
    }
  })
  return out
}

// 반원(해 · 달의 길 + 안쪽 퇴근 숫자)과 그 아래 주간 띠. 그림은 key 로 잡아 두고 register.js 가 갈아 끼운다.
// 오늘은 테마의 글자색을 바탕으로 뒤집어 그린다(밝은 테마에서는 어두운 칸, 어두운 테마에서는 밝은 칸).
const WEEK_STYLE = {
  today: { backgroundColor: 'text', color: 'inverseText', bold: true },
  past: { color: DIM },
  future: { color: 'subtle' },
  weekend: { backgroundColor: '#9b72e8', color: '#15171c', bold: true },
}
function arcBlock(E, snap) {
  return E.Box({
    flexDirection: 'column',
    flexShrink: 0,
    alignItems: 'center',
    paddingLeft: 1,
    children: [E.Raster({ key: 'arc', columns: ARC_COLS, rows: ARC_ROWS, cells: snap.arc.cells }), E.Text({ children: (snap.week || []).map((d) => t(E, d.text, WEEK_STYLE[d.kind] || {})) })],
  })
}

// 반원을 그릴 자리가 없을 때: 요일 한 글자와 퇴근 숫자를 글자로.
function timeSegs(E, snap) {
  const out = []
  const today = (snap.week || []).find((d) => d.kind === 'today' || d.kind === 'weekend')
  if (today) out.push(t(E, today.text, { color: DIM }))
  const tm = snap.timer
  // 글자로 적을 때는 「퇴근」 을 붙여 무엇까지 남은 시간인지 밝힌다.
  if (tm && !tm.off) out.push(t(E, ' 퇴근 ', { color: DIM }), t(E, tm.text, { color: hexText(tm.color), bold: true }))
  return out
}

function identSegs(E, snap, narrow) {
  const out = []
  const dirty = snap.dirty > 0 ? t(E, ' *' + snap.dirty, { color: 'warning' }) : snap.branch ? t(E, ' ✓', { color: DIM }) : null
  const glyph = t(E, snap.repo.worktree ? '○ ' : '● ', { color: snap.repo.color })
  if (narrow) {
    out.push(glyph, t(E, snap.coKey || snap.repo.name, { color: DIM }))
    if (dirty) out.push(dirty)
    return out
  }
  if (snap.issue.title) {
    out.push(t(E, snap.issue.title, { bold: true }))
    if (snap.issue.state) out.push(t(E, '  ' + snap.issue.state, { color: '#C79BFF' }))
    out.push(sep(E))
  }
  out.push(glyph, t(E, snap.repo.name, { bold: true }))
  if (snap.coKey) out.push(t(E, ' ' + snap.coKey, { color: DIM }))
  if (snap.branch) out.push(t(E, '  ⎇ ' + branchTail(snap.branch), { color: 'success' }))
  if (dirty) out.push(dirty)
  if (snap.model) {
    out.push(sep(E), t(E, '◆ ' + snap.model, { color: RUN }))
    if (snap.effort) out.push(t(E, '·' + snap.effort, { color: DIM }))
  }
  return out
}

// 하위 작업 · 감시 · 띄운 것 칩.
function chipSegs(E, snap, narrow) {
  const out = []
  // 워커 목록은 슬림 패널에 세로로 쌓고(띠 가로 나열은 읽기 어렵다),
  // 띠에는 개수와 메인의 손이 필요한 수만 남긴다.
  const workers = snap.fleet ? fleetView(snap.fleet.tasks, snap.now) : null
  if (workers && workers.open.length) {
    const fail = workers.open.filter((x) => x.state === 'fail').length
    const wait = workers.open.filter((x) => x.state === 'wait').length
    const tail = fail ? ' · 막힘 ' + fail : wait ? ' · 검증 대기 ' + wait : ''
    out.push(t(E, '● 워커 ' + workers.open.length + (narrow ? '' : tail), { color: fail ? 'error' : wait ? 'warning' : RUN }), t(E, '   '))
  }
  const runningSubs = snap.subs.filter((s) => s.status !== 'done')
  if (runningSubs.length) {
    const stalls = runningSubs.filter((s) => s.status === 'stall').length
    out.push(t(E, '● 서브 ' + runningSubs.length + (stalls ? ' · 정체 ' + stalls : ''), { color: stalls ? 'warning' : RUN }), t(E, '   '))
  }
  const liveMons = snap.mons.filter((m) => !m.ended)
  if (liveMons.length) {
    const warn = liveMons.filter((m) => m.warn).length
    out.push(t(E, '● 감시 ' + liveMons.length + (warn ? ' · 만료 임박 ' + warn : ''), { color: warn ? '#E8833A' : DIM }), t(E, '   '))
  }
  if (snap.left.length) out.push(t(E, '● 띄운 것 ' + snap.left.length, { color: 'warning' }), t(E, '   '))
  // 화면 안 꺼짐: caffeinate 가 화면 잠자기를 막는 동안 그 이름을 그대로 적는다(네모 · 커피잔 · 「화면 켜둠」 을 거쳐 이 글자로 정했다).
  // 자리는 상태 칩 줄의 끝이다. 작업 배지 옆은 폰 표시만 둔다.
  if (snap.awake) out.push(t(E, 'caffeinate', { color: '#E0A100' }), t(E, '   '))
  return out
}

// 작업 배지와 그 왼쪽의 작은 표시(원격 = 폰).
function badgeSegs(E, snap, narrow, view, work) {
  const out = []
  if (snap.remote) out.push(t(E, '▯ ', { color: '#2FA8E0' }))
  if (snap.busy) {
    out.push(t(E, SPINNER[snap.frame % SPINNER.length], { color: currentColor(view), bold: true }))
    if (!narrow) out.push(t(E, ' 작업중', { color: currentColor(view), bold: true }))
    out.push(t(E, ' ' + fmtDur((snap.now - snap.turnStart) / 1000), { color: DIM }))
  } else if (snap.asking) {
    out.push(t(E, '… 입력 대기', { color: 'warning', bold: true }))
  } else if (work.kind === 'sub') {
    // 본체는 쉬지만 하위 세션이 일하는 중 — 작업 중으로 본다.
    out.push(t(E, SPINNER[snap.frame % SPINNER.length], { color: TEAL, bold: true }), t(E, ' 하위 ' + work.n + (narrow ? '' : ' 작업중'), { color: TEAL, bold: true }))
  } else if ((snap.idle || 0) >= 1) {
    out.push(t(E, idleText(snap.now, snap.lastActiveAt), { color: DIM }))
  } else if (snap.lastDur) {
    out.push(t(E, '✔ 완료', { color: STATE_COLORS.done, bold: true }), t(E, ' ' + fmtDur(snap.lastDur), { color: DIM }))
  }
  return out
}

function row(E, left, right) {
  return E.Box({
    flexDirection: 'row',
    justifyContent: 'space-between',
    columnGap: 2,
    children: [
      E.Box({ flexGrow: 1, flexShrink: 1, children: [E.Text({ wrap: 'truncate-end', children: left && left.length ? left : [t(E, ' ')] })] }),
      right && right.length ? E.Box({ flexShrink: 0, children: [E.Text({ wrap: 'truncate-end', children: right })] }) : null,
    ],
  })
}

// 띠 카드: [Clawd] [일 3줄] [알약 세로 3개] [반원 + 주간 띠].
// 테두리는 굵은 선이고 색은 계열을 말한다. 일하는 동안(본체 또는 하위)에는 그 색 ↔ 검정으로 깜빡인다.
// 경보 파일이 살아 있으면 레포 색과 상관없이 두 줄 빨간 테두리와 경보 줄로 바꿔, 빨강 계열 레포에서도 평소 카드와 구분되게 한다.
export function band(E, snap, view) {
  dimAll = (snap.idle || 0) >= 2
  try {
    return bandTree(E, snap, view)
  } finally {
    dimAll = false
  }
}

// 반원을 그릴 폭인가. register.js 도 같은 기준으로 「반원 그림을 갈아 끼울지」를 정한다.
export function arcFits(total, hasClawd) {
  return !!hasClawd && total >= 70 && total - (CLAWD_COLS + 1) >= 96
}

function bandTree(E, snap, view) {
  const total = snap.cols || 120
  // Clawd 는 폭이 70칸 이상일 때만 띠 왼쪽에 둔다. 그림이 있어야 띠가 3줄이 되고, 그때만 오른쪽 칸(알약 · 반원)을 세운다.
  const clawd = snap.clawd && total >= 70 ? snap.clawd : null
  const inner = total - (clawd ? CLAWD_COLS + 1 : 0)
  const showStack = !!clawd && inner >= 76
  const showArc = !!snap.arc && arcFits(total, !!clawd)
  const cols = inner - (showStack ? PILL_COLS + 2 : 0) - (showArc ? ARC_COLS + 2 : 0)
  const narrow = showStack ? cols < 62 : cols < 100
  const alert = snap.flags.length > 0
  const work = snap.work || { working: !!snap.busy, kind: snap.busy ? 'main' : 'idle', n: 0 }
  const rows = []
  if (alert) {
    const al = getConfig().alert
    const msg = narrow ? '⚠ ' + al.title + ' ' + snap.flags.join(', ') : '⚠ ' + al.title + ' 활성  ' + snap.flags.join(', ') + (al.note ? ' — ' + al.note : '')
    rows.push(E.Text({ wrap: 'truncate-end', children: [t(E, msg, { color: 'error', bold: true })] }))
  }
  const left1 = []
  if (snap.issue.key) left1.push(t(E, snap.issue.key, { bold: true, color: currentColor(view) }), sep(E))
  if (view.mode === 'none') left1.push(t(E, '진행 단계 없음', { color: DIM }))
  else left1.push(...(narrow ? stepperNarrow(E, view, snap.frame) : stepperWide(E, view, snap.frame)))
  const chips = chipSegs(E, snap, narrow)
  const badge = badgeSegs(E, snap, narrow, view, work)
  if (clawd) {
    // 3줄: 첫 줄 일 + 배지, 둘째 줄 이름, 셋째 줄 하위 작업 칩.
    rows.push(row(E, left1, badge))
    rows.push(row(E, identSegs(E, snap, narrow), showStack ? [] : usageRow(E, snap, cols < 100)))
    rows.push(row(E, chips, showArc ? [] : timeSegs(E, snap)))
  } else {
    // 그림이 없으면 2줄: 칩과 배지는 첫 줄 오른쪽, 요일 · 퇴근 숫자와 사용량은 둘째 줄 오른쪽.
    const time = timeSegs(E, snap)
    rows.push(row(E, left1, [...chips, ...badge]))
    rows.push(row(E, identSegs(E, snap, narrow), [...time, ...(time.length ? [t(E, '   ')] : []), ...usageRow(E, snap, cols < 100)]))
  }
  const frame = {
    // 테두리는 늘 굵은 한 줄이고, 작업 중에는 계열 색 ↔ 검정으로 깜빡인다(두 줄 테두리는 어색해서 되돌렸다).
    // 두 줄은 경보 파일이 살아 있을 때만 쓴다(빨강 고정 + 맨 위 경보 줄).
    borderStyle: alert ? 'double' : 'bold',
    borderColor: alert ? 'error' : dimAll ? DIM : work.working ? blinkColor(snap.family, snap.frame) : FAMILY_BORDER[snap.family] || FAMILY_BORDER.blue,
    paddingX: 1,
  }
  if (!clawd) return E.Box(Object.assign({ flexDirection: 'column', children: rows }, frame))
  // 그림은 key 로 잡아 두고 register.js 가 $.ui.blit 으로 프레임만 갈아 끼운다(띠 전체를 다시 그리지 않는다).
  const children = [
    E.Box({ flexShrink: 0, children: [E.Raster({ key: 'clawd', columns: CLAWD_COLS, rows: CLAWD_ROWS, cells: clawd.cells })] }),
    E.Box({ flexDirection: 'column', flexGrow: 1, flexShrink: 1, children: rows }),
  ]
  if (showStack) children.push(pillStack(E, snap))
  if (showArc) children.push(arcBlock(E, snap))
  return E.Box(Object.assign({ flexDirection: 'row', columnGap: 1, children }, frame))
}

// 슬림 패널. 경보 · 워커 · 서브 · 감시 · 띄운 것 중 있는 것만 위에서부터 쌓는다.
export function pane(E, snap) {
  const lines = []
  const head = (text) => lines.push(t(E, text, { color: DIM, bold: true }))
  const line = (children) => lines.push(E.Text({ wrap: 'truncate-end', children }))
  if (snap.flags.length) {
    const al = getConfig().alert
    head(al.title)
    for (const f of snap.flags) line([t(E, '⚠ ' + f, { color: 'error', bold: true })])
    if (al.note) line([t(E, '  ' + al.note, { color: 'error' })])
    lines.push(t(E, ' '))
  }
  // 이 세션이 fleet 으로 띄운 워커. 배치를 가리지 않고 모아 한 줄에 하나씩 쌓는다.
  const workers = snap.fleet ? fleetView(snap.fleet.tasks, snap.now) : null
  if (workers && workers.open.length) {
    head('워커 ' + workers.open.length)
    for (const w of workers.open) {
      const color = stateColor(w.state)
      const mark = w.state === 'todo' ? t(E, '○', { color: DIM }) : w.state === 'active' ? breathe(E, snap.frame, color) : t(E, '●', { color })
      const urgent = w.state === 'wait' || w.state === 'fail'
      line([mark, t(E, ' ' + w.tail + (w.issue ? ' ' + w.issue : ''))])
      line([t(E, '  ' + w.text + (w.min > 0 ? ' · ' + w.min + '분' : ''), { color: urgent ? color : DIM, bold: urgent })])
    }
    if (workers.done) line([t(E, '✓ 완료 ' + workers.done, { color: STATE_COLORS.done })])
    if (snap.fleet.rollupAt) line([t(E, 'ROLLUP ' + ago(snap.now - snap.fleet.rollupAt), { color: DIM })])
    lines.push(t(E, ' '))
  }
  const subs = snap.subs.filter((s) => s.status !== 'done')
  if (subs.length) {
    head('서브 ' + subs.length)
    for (const s of subs) {
      const stall = s.status === 'stall'
      line([stall ? t(E, '●', { color: 'warning' }) : breathe(E, snap.frame, RUN), t(E, ' ' + s.name)])
      line([t(E, '  ' + fmtDur(s.el / 1000) + ' · ' + ago(snap.now - s.last) + (stall ? ' · 정체' : ''), { color: stall ? 'warning' : DIM, bold: stall })])
    }
    lines.push(t(E, ' '))
  }
  const mons = snap.mons.filter((m) => !m.ended)
  if (mons.length) {
    head('감시 ' + mons.length)
    for (const m of mons) {
      const color = m.events === 0 ? DIM : eventColor(m.last) === 'text' ? STATE_COLORS.done : eventColor(m.last)
      line([t(E, '◉ ', { color }), t(E, m.desc)])
      const tail = m.warn ? [t(E, ' · 만료 ' + Math.max(0, Math.ceil(m.remainMs / 60000)) + '분 전', { color: '#E8833A', bold: true })] : []
      line([t(E, '  ' + Math.floor(m.elMs / 60000) + '/' + Math.round(m.timeoutMs / 60000) + '분 · ' + m.events + '건' + (m.last ? ' · ' + m.last : ''), { color: DIM }), ...tail])
    }
    lines.push(t(E, ' '))
  }
  if (snap.left.length) {
    head('띄운 것 ' + snap.left.length)
    for (const x of snap.left) line([t(E, '● ', { color: 'warning' }), t(E, x)])
    line([t(E, getConfig().texts.leftPane + ' — ' + snap.left.length + '개 남음', { color: 'warning', bold: true })])
  }
  // /cockpit 으로 직접 연 패널은 비어 있어도 남는다. 빈 칸 대신 무엇이 쌓이는 자리인지 적는다.
  if (!lines.length) {
    head('표시할 것 없음')
    line([t(E, '워커 · 서브 · 감시가', { color: DIM })])
    line([t(E, '생기면 여기에 쌓인다', { color: DIM })])
  }
  return E.Box({ flexDirection: 'column', children: lines })
}

// 대화 안 Agent 줄 아래에 붙이는 상태 한 줄.
export function agentStatus(E, sub, now, frame) {
  const stall = sub.status === 'stall'
  return E.Text({
    wrap: 'truncate-end',
    children: [
      t(E, '  '),
      stall ? t(E, '●', { color: 'warning' }) : breathe(E, frame, RUN),
      t(E, ' ' + fmtDur((now - sub.start) / 1000) + ' · 마지막 요청 ' + ago(now - sub.last) + (stall ? ' · 정체 의심' : ''), { color: stall ? 'warning' : DIM, bold: stall }),
    ],
  })
}

// 접힌 Monitor 알림 줄. 펼친 보기(ctrl+o)에서는 엔진 그림을 그대로 둔다.
export function monitorLine(E, desc, summary, at) {
  const color = eventColor(summary) === 'text' ? STATE_COLORS.done : eventColor(summary)
  return E.Text({
    wrap: 'truncate-end',
    children: [t(E, '◉ ', { color }), t(E, desc, { color: DIM }), t(E, ' · '), t(E, summary, { color, bold: true }), t(E, ' ' + fmtClock(at), { color: DIM })],
  })
}

export function leftoversText(left) {
  const tx = getConfig().texts
  if (!left.length) return tx.leftClear
  return '띄운 것 ' + left.length + '개 — ' + left.join(' · ') + '\n' + tx.leftBusy
}
