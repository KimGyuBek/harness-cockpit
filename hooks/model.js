// 하네스 콕핏의 순수 로직. 이 파일의 함수는 `$` 를 받지 않는다 — mods 검증은 `$` 를
// 같은 파일 최상위 함수에만 넘기도록 허용하므로, 상태 계산과 서식은 여기서 하고
// 실제 호출(파일 · 프로세스 · 화면)은 register.js 가 맡는다.
import { getConfig } from './config.js'

// 게이지 · 퍼센트 색 단계. 경계는 확정 시안(5단계)의 0 · 30 · 50 · 70 · 85% 다.
// 연두 · 주황은 Claude Code 테마 키에 없어 원색 값을 쓴다. 다크 · 라이트 둘 다에서
// 읽히도록 중간 밝기로 골랐다.
export const LEVEL_BOUNDS = [30, 50, 70, 85]
export const LEVEL_COLORS = ['success', '#74AD2C', 'warning', '#E0762B', 'error']

// 단계 상태 4색(B안). 아직 · 취소는 색을 쓰지 않는다.
export const STATE_COLORS = {
  done: 'success',
  active: '#4D9BFF',
  wait: 'warning',
  fail: 'error',
  todo: 'inactive',
  cancel: 'inactive',
}

// 띠 카드 테두리. 설정에서 빨강 계열로 정한 레포는 빨강, 그 외는 파랑이다.
export const FAMILY_BORDER = { red: 'error', blue: '#4D9BFF' }

export const IMPL_STEPS = ['플랜', '코드', '구현', '검증', '완료']
export const RESEARCH_STEPS = ['조사', '정리', '보고']
export const SPINNER = ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷']

// 서브에이전트가 이 시간 동안 모델 요청이 없으면 정체로 본다.
export const STALL_MS = 10 * 60 * 1000
// Monitor 만료 이 시간 전에 한 번 알린다.
export const MONITOR_WARN_MS = 4 * 60 * 1000

// 경보 파일: 이 파일이 있는 동안 띠가 두 줄 빨간 테두리 + 경보 줄로 바뀐다(설정의 alertFiles). 예: 위험한 작업을 한 번 허용하는 승인 플래그.
export function alertFiles() {
  return getConfig().alertFiles
}

// 이 툴 호출이 경보 파일을 「만드는」 호출이면 그 파일의 label 들을 돌려준다.
// Bash 는 touch · tee · 리다이렉트(> · >>)로 그 경로에 쓰는 경우만, Write 는 그 경로가 대상일 때만 본다.
// ls · rm 처럼 경로를 언급만 하는 명령은 만든 것이 아니다. macOS 의 /private/tmp 표기도 같은 파일로 본다.
// 경보를 만든 세션의 띠에만 띄우는 데 쓴다(플래그 파일 자체는 세션을 가리지 않는다).
export function flagsCreatedBy(tool, input) {
  const i = input || {}
  const out = []
  for (const f of alertFiles()) {
    if (tool === 'Write') {
      const path = String(i.file_path || '')
      if (path === f.path || path === '/private' + f.path) out.push(f.label)
      continue
    }
    if (tool !== 'Bash') continue
    const p = f.path.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')
    const re = new RegExp('(?:\\b(?:touch|tee)\\b[^|;&\\n]*|>>?\\s*)["\']?(?:\\/private)?' + p + '(?![\\w-])')
    if (re.test(String(i.command || ''))) out.push(f.label)
  }
  return out
}

export function level(p) {
  if (p === null || p === undefined || Number.isNaN(p)) return -1
  let i = 0
  for (const b of LEVEL_BOUNDS) if (p >= b) i += 1
  return i
}

export function levelColor(p) {
  const l = level(p)
  return l < 0 ? 'inactive' : LEVEL_COLORS[l]
}

// 칸 게이지의 칸별 색. 칸은 자기 위치(가운데 지점)의 단계 색으로 칠한다.
export function gaugeCells(p, n) {
  const cells = []
  if (p === null || p === undefined) {
    for (let i = 0; i < n; i += 1) cells.push({ filled: false, color: 'inactive' })
    return cells
  }
  const k = Math.round((Math.max(0, Math.min(100, p)) / 100) * n)
  for (let i = 0; i < n; i += 1) {
    const at = Math.round(((i + 0.5) / n) * 100)
    cells.push(i < k ? { filled: true, color: levelColor(at) } : { filled: false, color: 'inactive' })
  }
  return cells
}

// 계열(테두리 색). 설정의 repos 중 family 가 있는 첫 항목을 따르고, 없으면 파랑이다.
export function repoFamily(cwd) {
  const c = cwd || ''
  for (const x of getConfig().repos) if (x.family && x.re.test(c)) return x.family
  return 'blue'
}

// 레포 이름과 점 색. 설정의 repos 중 name 이 있는 첫 항목을 따르고, 없으면 폴더 이름을 흐린 색으로 쓴다.
export function repoInfo(cwd) {
  const c = cwd || ''
  const wt = /\/worktree[^/]*\//.test(c)
  for (const x of getConfig().repos) if (x.name && x.re.test(c)) return { name: x.name, color: x.color || 'inactive', worktree: wt }
  const base = c.split('/').filter(Boolean).pop() || ''
  return { name: base, color: 'inactive', worktree: wt }
}

// 브랜치 이름에서 이슈 키(feature/ABC-1234-slug 의 ABC-1234)를 뽑는다. 무늬는 설정의 branchKey 다.
export function branchKey(branch) {
  const m = getConfig().branchKeyRe.exec(branch || '')
  return m ? m[0].toUpperCase() : ''
}

export function branchTail(branch) {
  let t = branch || ''
  const m = getConfig().branchKeyRe.exec(t)
  if (m && t[m.index + m[0].length] === '-') t = t.slice(m.index + m[0].length + 1)
  return t.length > 22 ? t.slice(0, 21) + '…' : t
}

export function fmtDur(sec) {
  const s = Math.max(0, Math.floor(sec || 0))
  if (s >= 3600) return Math.floor(s / 3600) + 'h ' + String(Math.floor((s % 3600) / 60)).padStart(2, '0') + 'm'
  if (s >= 60) return Math.floor(s / 60) + 'm ' + String(s % 60).padStart(2, '0') + 's'
  return s + 's'
}

export function fmtClock(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
}

// 한도 창 하나를 고른다. 이름은 status line 의 five_hour · seven_day 를 먼저 찾고,
// 없으면 같은 뜻의 다른 표기를 받는다. percentUsed 는 퍼센트 값(0~100)이다.
// 주의: 1 이하를 비율(0~1)로 보고 100 을 곱하지 않는다 — 주간 한도가 초기화된 직후의 1% 가 100% 로 보였다(2026-10-08).
export function rateOf(rateLimits, which) {
  const arr = Array.isArray(rateLimits) ? rateLimits : []
  const exact = which === '5h' ? 'five_hour' : 'seven_day'
  const loose = which === '5h' ? /five|5h|5_h/i : /seven|7d|7_d|week/i
  const r = arr.find((x) => x && x.kind === exact) || arr.find((x) => x && loose.test(String(x.kind)))
  if (!r || typeof r.percentUsed !== 'number') return null
  const pct = Math.max(0, r.percentUsed)
  let resetsAt = null
  if (r.resetsAt) {
    const t = typeof r.resetsAt === 'number' ? r.resetsAt * (r.resetsAt < 1e12 ? 1000 : 1) : Date.parse(r.resetsAt)
    if (!Number.isNaN(t)) resetsAt = t
  }
  return { pct: Math.round(pct), resetsAt }
}

export function modelLabel(model) {
  const m = /(opus|sonnet|haiku|fable)[-_ ]?(\d+)?(?:[-_.](\d+))?/i.exec(model || '')
  if (!m) return model || ''
  const name = m[1].charAt(0).toUpperCase() + m[1].slice(1).toLowerCase()
  const ver = m[2] ? (m[3] ? m[2] + '.' + m[3] : m[2]) : ''
  return ver ? name + ' ' + ver : name
}

// 플랜 파일의 체크박스 진행률. “검증” 이 든 항목은 따로 센다 — 검증 단계 칩에 쓴다.
// `## Files` 아래 목록은 영역별 파일 수를 세는 데 쓴다.
export function planProgress(text) {
  const lines = String(text || '').split('\n')
  let done = 0
  let total = 0
  let vDone = 0
  let vTotal = 0
  const files = []
  let inFiles = false
  for (const line of lines) {
    if (/^##\s/.test(line)) inFiles = /^##\s+Files\b/.test(line)
    const box = /^\s*-\s\[( |x|X)\]\s(.*)$/.exec(line)
    if (box) {
      total += 1
      const checked = box[1] !== ' '
      if (checked) done += 1
      if (/검증/.test(box[2])) {
        vTotal += 1
        if (checked) vDone += 1
      }
      continue
    }
    if (inFiles) {
      const f = /^\s*-\s+`?([^`\s]+)`?/.exec(line)
      if (f) files.push(f[1])
    }
  }
  return { done, total, vDone, vTotal, files }
}

// 경로로 코드 영역을 정한다. 폴더 이름의 -fe · -be · admin 꼬리와 worktree 폴더 이름을 본다.
export function areaOf(path) {
  const p = path || ''
  if (/\/worktree-admin-fe\/|admin-fe/.test(p)) return '어드민 FE'
  if (/\/worktree-admin-be\/|admin-be/.test(p)) return '어드민 BE'
  if (/\/worktree-fe\/|-fe[-/]|web-fe/.test(p)) return 'FE'
  if (/\/worktree\/|-be[-/]|service-be|app-be/.test(p)) return 'BE'
  return '코드'
}

// 산출물 · 기록 경로. 여기 쓰는 것은 구현이 아니라 정리로 본다.
const RECORD_PATH = /\/(plans|linear|flow-test|docs|report|troubleshooting|error-analysis|memory|scratchpad)\//
const VERIFY_CMD = /\b(jest|vitest|npm (run )?(test|build|lint)|yarn (test|build|lint)|gradlew?\b.*\b(test|build)|curl|playwright|plugin (test|validate))\b/

// 툴 호출 하나를 활동 종류로 분류한다. null 이면 단계에 영향을 주지 않는다.
export function classifyTool(tool, input) {
  const t = tool || ''
  const i = input || {}
  const path = i.file_path || i.notebook_path || i.path || ''
  if (t === 'Write' || t === 'Edit' || t === 'NotebookEdit') {
    if (/\/plans\/[^/]+\.md$/.test(path)) return { kind: 'plan', path }
    if (/\/flow-test\//.test(path)) return { kind: 'verify', path }
    if (RECORD_PATH.test(path)) return { kind: 'note', path }
    return { kind: 'impl', path, area: areaOf(path) }
  }
  if (t === 'Read' || t === 'Grep' || t === 'Glob' || t === 'LSP') {
    const p = path || i.pattern || ''
    if (/\/worktree[^/]*\/|-be\/|-fe\//.test(p)) return { kind: 'code', path: p, area: areaOf(p) }
    return { kind: 'research' }
  }
  if (t === 'WebFetch' || t === 'WebSearch' || /^mcp__(mysql|context7|linear|serena)/.test(t)) return { kind: 'research' }
  if (t === 'Bash') {
    const cmd = String(i.command || '')
    const extra = getConfig().verifyRe
    if (VERIFY_CMD.test(cmd) || (extra && extra.test(cmd))) return { kind: 'verify', cmd }
    return null
  }
  if (/^mcp__playwright__|^mcp__mobile-mcp__/.test(t)) return { kind: 'verify' }
  if (t === 'Artifact' || t === 'SendMessage') return { kind: 'report' }
  return null
}

export function newStepState() {
  return {
    mode: 'none', // none | research | impl
    step: -1,
    planPath: '',
    plan: null,
    areas: {}, // 영역 → { edited: Set, read: Set }
    verifyRuns: 0,
    waiting: false,
    failKey: '',
    failCount: 0,
    override: null, // phase 툴이 알린 값 { step, detail, state }
    cancelled: [],
  }
}

function areaSlot(s, area) {
  if (!s.areas[area]) s.areas[area] = { edited: new Set(), read: new Set() }
  return s.areas[area]
}

// 활동 하나를 단계 상태에 반영한다. 구현 중에 코드를 읽거나 플랜 체크박스를 고치는 것은
// 앞 단계로 되돌리지 않는다. 검증 뒤에 코드를 다시 고치면 구현으로 돌아간다.
export function applyActivity(s, act) {
  if (!act) return s
  if (act.kind === 'plan') {
    s.planPath = act.path
    if (s.mode !== 'impl') s.mode = 'impl'
    if (s.step < 0) s.step = 0
    return s
  }
  if (act.kind === 'impl') {
    s.mode = 'impl'
    areaSlot(s, act.area).edited.add(act.path)
    s.step = 2
    return s
  }
  if (act.kind === 'code') {
    areaSlot(s, act.area).read.add(act.path)
    if (s.mode === 'impl' && s.step < 1) s.step = 1
    if (s.mode === 'none' || s.mode === 'research') {
      s.mode = 'research'
      if (s.step < 0) s.step = 0
    }
    return s
  }
  if (act.kind === 'verify') {
    s.verifyRuns += 1
    if (s.mode === 'impl' && s.step >= 2) s.step = 3
    return s
  }
  if (act.kind === 'research') {
    if (s.mode === 'none') {
      s.mode = 'research'
      s.step = 0
    }
    return s
  }
  if (act.kind === 'note') {
    if (s.mode === 'research' && s.step < 1) s.step = 1
    return s
  }
  if (act.kind === 'report') {
    if (s.mode === 'research') s.step = 2
    return s
  }
  return s
}

// 같은 Bash 명령이 연속으로 실패하면 막힘으로 본다. 성공하거나 다른 명령이 오면 다시 센다.
export function noteBashResult(s, cmd, failed) {
  const key = String(cmd || '').slice(0, 200)
  if (!failed) {
    if (s.failKey === key) {
      s.failKey = ''
      s.failCount = 0
    }
    return s
  }
  if (s.failKey === key) s.failCount += 1
  else {
    s.failKey = key
    s.failCount = 1
  }
  return s
}

const PHASE_INDEX = { plan: 0, code: 1, impl: 2, verify: 3, done: 4, research: 0, organize: 1, report: 2 }

// 띠 1줄에 그릴 단계 표시를 만든다. phase 툴이 알린 값이 있으면 그것이 우선한다.
export function viewSteps(s) {
  let mode = s.mode
  let step = s.step
  let state = 'active'
  let detail = ''
  if (s.override) {
    const o = s.override
    mode = ['research', 'organize', 'report'].includes(o.step) ? 'research' : 'impl'
    step = PHASE_INDEX[o.step] ?? step
    state = o.state || 'active'
    detail = o.detail || ''
  }
  if (mode === 'none' || step < 0) return { mode: 'none', labels: [], steps: [], chips: [] }
  const labels = mode === 'research' ? RESEARCH_STEPS : IMPL_STEPS
  const plan = s.plan
  if (mode === 'impl' && plan && plan.total > 0 && plan.done === plan.total && !s.override) step = 4
  if (s.waiting) state = 'wait'
  else if (s.failCount >= 3) state = 'fail'
  const finished = mode === 'impl' && step === 4
  const steps = labels.map((label, i) => {
    let st = 'todo'
    if (finished || i < step) st = 'done'
    else if (i === step) st = state
    return { label, state: st }
  })
  const chips = []
  if (s.waiting) chips.push({ text: '결정 대기', state: 'wait' })
  else if (s.failCount >= 3) chips.push({ text: '같은 실패 ' + s.failCount + '회', state: 'fail' })
  else if (detail) chips.push({ text: detail, state: state })
  else if (mode === 'impl') {
    if (step === 0 && plan && plan.total) chips.push({ text: 'Tasks ' + plan.total, state: 'active' })
    if (step === 1) {
      for (const [area, slot] of Object.entries(s.areas)) if (slot.read.size) chips.push({ text: area + ' ' + slot.read.size + '파일', state: 'active' })
    }
    if (step === 2) {
      const planned = plannedByArea(plan)
      const names = new Set([...Object.keys(planned), ...Object.keys(s.areas).filter((a) => s.areas[a].edited.size)])
      for (const area of names) {
        const edited = s.areas[area] ? s.areas[area].edited.size : 0
        const want = planned[area] || 0
        const cancelled = s.cancelled.includes(area)
        if (cancelled) chips.push({ text: area, state: 'cancel' })
        else if (want) chips.push({ text: area + ' ' + Math.min(edited, want) + '/' + want, state: edited >= want ? 'done' : edited ? 'active' : 'todo' })
        else chips.push({ text: area + ' 수정 ' + edited, state: 'active' })
      }
    }
    if (step === 3) {
      if (plan && plan.vTotal) chips.push({ text: '검증 ' + plan.vDone + '/' + plan.vTotal, state: 'active' })
      else chips.push({ text: '검증 실행 ' + s.verifyRuns, state: 'active' })
    }
  }
  return { mode, labels, steps, chips }
}

function plannedByArea(plan) {
  const out = {}
  if (!plan || !plan.files) return out
  for (const f of plan.files) {
    if (/\/$/.test(f)) continue
    const a = areaOf(f)
    out[a] = (out[a] || 0) + 1
  }
  return out
}

// 서브에이전트 레지스트리.
export function subStatus(sub, now) {
  if (sub.done) return 'done'
  return now - sub.last >= STALL_MS ? 'stall' : 'run'
}

// 백그라운드 작업 알림 본문을 읽는다. 2.1.291 실측 형식:
//   이벤트: <task-id> · <summary>Monitor event: "설명"</summary> · <event>내용</event> (tool-use-id 없음)
//   종료:   <task-id> · <tool-use-id> · <status>completed</status> · <summary>Monitor "설명" stream ended</summary>
// 이벤트에는 tool-use-id 가 없으므로 Monitor 는 요약 속 설명으로도 찾는다.
export function parseTaskNotification(text) {
  const t = String(text || '')
  const pick = (tag) => {
    const m = new RegExp('<' + tag + '>([\\s\\S]*?)</' + tag + '>').exec(t)
    return m ? m[1].trim() : ''
  }
  const toolUseId = pick('tool-use-id')
  const taskId = pick('task-id')
  const status = pick('status')
  const event = pick('event')
  let summary = pick('summary') || event || pick('result')
  if (!summary) {
    const stripped = t.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    summary = stripped.split(/(?<=[.!?])\s/)[0] || stripped
  }
  const d = /Monitor(?: event:)?\s+"([^"]+)"/.exec(summary)
  return { toolUseId, taskId, status, event, monitorDesc: d ? d[1] : '', summary: summary.slice(0, 200) }
}

export function isEndStatus(status) {
  return /^(completed|failed|killed|stopped|timeout|expired|error)$/i.test(status || '')
}

// 알림 요약의 낱말로 색을 정한다. 문제 낱말이 먼저다.
export function eventColor(summary) {
  const s = String(summary || '')
  if (/\b(FAIL|FAILED|ERROR|DEAD|KILLED|Traceback|OOM)\b|실패|죽음|에러/i.test(s)) return 'error'
  if (/\b(STALL|WAIT|WAITING|TIMEOUT|EXPIRED)\b|정체|대기|만료/i.test(s)) return 'warning'
  if (/\b(DONE|PASS|PASSED|OK|SUCCESS|COMPLETED|idle)\b|완료|통과/i.test(s)) return 'success'
  return 'text'
}

export function monitorRemainMs(m, now) {
  return m.start + m.timeoutMs - now
}

// 만료 알림 시점. 긴 감시는 4분 전, 짧은 감시는 제한 시간의 20% 전이다. 고정 4분이면
// 5분짜리 기본 감시가 시작 1분 만에 “만료 임박”이 되어 신호가 소음이 된다.
export function monitorWarnMs(m) {
  return Math.min(MONITOR_WARN_MS, Math.round((m.timeoutMs || 0) * 0.2))
}

// 띄운 것 판정. 이 세션이 시작한 컨테이너 · 브라우저만 다룬다. 백그라운드 셸은
// 턴 종료(Stop) 때 엔진이 주는 진행 중 작업 목록을 그대로 쓴다.
export function dockerNameOf(cmd) {
  const c = String(cmd || '')
  if (!/\bdocker\s+(run|compose\b[\s\S]*\bup)\b/.test(c)) return ''
  const n = /--name[= ]([A-Za-z0-9_.-]+)/.exec(c)
  if (n) return n[1]
  if (/\bdocker\s+compose\b/.test(c)) {
    // compose 의 -p 는 프로젝트 이름이다. docker run 의 -p(포트)와 섞이지 않게 compose 일 때만 본다.
    const p = /\s-p\s+([A-Za-z0-9_.-]+)|--project-name[= ]([A-Za-z0-9_.-]+)/.exec(c)
    return p ? p[1] || p[2] : 'compose'
  }
  return 'docker run'
}

// fleet 태스크 상태를 띠 표시로 바꾼다. 상태 원어(SEALED · ACKED)는 fleet 내부 어휘라,
// 띠에는 사용자가 다음에 무엇을 봐야 하는지(대기 · 작업중 · 검증 대기)를 적는다.
const FLEET_STATUS = {
  SEALED: { state: 'todo', text: '대기' },
  DISPATCHED: { state: 'active', text: '기동' },
  ACKED: { state: 'active', text: '작업중' },
  DONE: { state: 'wait', text: '검증 대기' },
  VERIFIED: { state: 'done', text: '완료' },
  CLOSED: { state: 'done', text: '완료' },
  CANCELLED: { state: 'cancel', text: '취소' },
}

export function fleetStatus(status) {
  const s = String(status || '').toUpperCase()
  if (FLEET_STATUS[s]) return FLEET_STATUS[s]
  if (/STALL|BLOCK|FAIL/.test(s)) return { state: 'fail', text: '막힘' }
  if (/CANCEL/.test(s)) return FLEET_STATUS.CANCELLED
  return { state: 'active', text: s.toLowerCase() || '?' }
}

const FLEET_ORDER = { fail: 0, wait: 1, active: 2, todo: 3 }

// 이 세션이 띄운 워커를 띠 한 줄로 줄인다. 끝난 워커는 개수로만 남겨서,
// 아직 돌고 있거나 메인의 손이 필요한 워커가 앞에 보이게 한다.
// tasks: [{ id, status, issue, acked, dispatched }] (acked · dispatched 는 epoch ms, 없으면 0)
export function fleetView(tasks, now) {
  const open = []
  let done = 0
  let cancelled = 0
  for (const x of tasks || []) {
    const st = fleetStatus(x.status)
    if (st.state === 'done') {
      done += 1
      continue
    }
    if (st.state === 'cancel') {
      cancelled += 1
      continue
    }
    const tail = String(x.id || '').slice(-4)
    const since = st.state === 'active' ? x.acked || x.dispatched || 0 : 0
    const min = since ? Math.floor((now - since) / 60000) : 0
    open.push({ id: x.id, state: st.state, tail, issue: x.issue || '', text: st.text, min })
  }
  open.sort((a, b) => FLEET_ORDER[a.state] - FLEET_ORDER[b.state] || String(a.id).localeCompare(String(b.id)))
  return { open, done, cancelled }
}

// ── 띠 최종 시안(2026-10-08) ─────────────────────────────────────────────────────

// 단계 색의 원색 값. 그림 칸(Raster)과 알약 바탕은 테마 키를 못 쓰고 숫자 색만 받는다.
// 밝은 바탕 · 어두운 바탕 모두에서 읽히는 중간 밝기(위에 놓는 글자는 늘 어두운 색을 쓴다).
export const LEVEL_HEX = [0x3fae58, 0x74ad2c, 0xcf9400, 0xe0762b, 0xf0506e]
export function levelHex(p) {
  const l = level(p)
  return l < 0 ? 0x7b8491 : LEVEL_HEX[l]
}

// 계열 테두리의 원색 값. 작업 중에는 테두리가 이 색 ↔ 검정으로 깜빡인다(0.6초씩 · 한 바퀴 1.2초).
// 거쳐 온 모양: 색을 서서히 어둡게 돌리기(티가 안 남) → 두 줄 테두리(어색함) → 지금의 깜빡임.
export const FAMILY_HEX = { red: 0xff6b80, blue: 0x4d9bff }
export const BLINK_OFF = '#000000'
const BLINK_HALF = 4
export function mixHex(a, b, k) {
  const f = (s) => Math.round(((a >> s) & 255) * k + ((b >> s) & 255) * (1 - k))
  return (f(16) << 16) | (f(8) << 8) | f(0)
}
export function hexText(n) {
  return '#' + n.toString(16).padStart(6, '0')
}
export function blinkColor(family, frame) {
  const base = FAMILY_HEX[family] || FAMILY_HEX.blue
  return Math.floor((frame || 0) / BLINK_HALF) % 2 === 0 ? hexText(base) : BLINK_OFF
}

// 숫자 알약: 이름과 숫자를 한 덩어리로 적고, 값만큼의 칸을 단계 색으로 채운다.
// 돌려주는 값은 바탕 · 글자 모양이 같은 조각들 — { text, filled, num }.
export const PILL_COLS = 9
export function pillParts(label, pct) {
  const known = pct !== null && pct !== undefined && !Number.isNaN(pct)
  const name = String(label).padEnd(3)
  // 숫자 칸은 늘 4칸(「 5% 」 「50% 」 「100%」 「 —  」)이라 세로로 쌓아도 폭이 같다.
  const text = ' ' + name + ' ' + (known ? (Math.round(pct) >= 100 ? '100%' : String(Math.round(pct)).padStart(2) + '% ') : ' —  ')
  const n = text.length
  // 값이 조금이라도 있으면 한 칸은 채운다(1~5% 에서도 단계 색이 보이게).
  const k = known && pct > 0 ? Math.max(1, Math.min(n, Math.round((n * Math.min(100, pct)) / 100))) : 0
  const numAt = name.length + 2
  const out = []
  let i = 0
  while (i < n) {
    const filled = i < k
    const num = i >= numAt
    let j = i
    while (j < n && j < k === filled && j >= numAt === num) j += 1
    out.push({ text: text.slice(i, j), filled, num })
    i = j
  }
  return out
}

// 작업 중인가. 본체 턴이 돌거나, 본체가 쉬어도 하위 세션(서브에이전트 · 워커)이 일하면 작업 중이다.
// 백그라운드 명령과 감시는 세지 않는다 — dev 서버처럼 계속 떠 있는 것이 있으면 영영 작업 중이 된다.
export function workState(s) {
  const n = (s.subs || 0) + (s.workers || 0)
  if (s.busy) return { working: true, kind: 'main', n }
  if (n > 0) return { working: true, kind: 'sub', n }
  return { working: false, kind: 'idle', n: 0 }
}

// 오래 쉰 단계. 0 깨어 있음 · 1 잠(15분) · 2 흐림(60분). 작업 중이면 늘 0 이다.
// 잠들기 전 5분부터는 존다(isDozing) — 단계 번호는 그대로 두고 따로 판정한다(잠 단계에 걸린 폴링 완화 · 밤하늘은 졸 때 적용하지 않는다).
export const IDLE_DEFAULT = { dozeMs: 5 * 60 * 1000, sleepMs: 15 * 60 * 1000, dimMs: 60 * 60 * 1000 }
export function isDozing(now, lastActiveAt, working, cfg) {
  const c = cfg || IDLE_DEFAULT
  if (working || !lastActiveAt) return false
  const idle = now - lastActiveAt
  const doze = c.dozeMs === undefined ? IDLE_DEFAULT.dozeMs : c.dozeMs
  return idle >= doze && idle < c.sleepMs
}
export function idleStage(now, lastActiveAt, working, cfg) {
  const c = cfg || IDLE_DEFAULT
  if (working || !lastActiveAt) return 0
  const idle = now - lastActiveAt
  return idle >= c.dimMs ? 2 : idle >= c.sleepMs ? 1 : 0
}
// mod 를 다시 읽으면 모듈 변수가 지워져, 열려 있는 세션 전부의 쉼 시계가 같은 순간에 0 으로 돌아간다(잠든 세션이 한꺼번에 깬다).
// 그래서 세션마다 마지막 활동 시각을 파일에 남기고, 다시 읽을 때 되살린다.
// 표식(markerTs)이 방금까지 갱신됐으면 같은 프로세스가 mod 만 다시 읽은 것이므로 남겨 둔 시각을 쓰고,
// 표식이 낡았으면 세션을 새로 열었거나 이어 연 것이므로 지금부터 센다.
export function restoreActive(now, markerTs, savedTs) {
  const m = Number(markerTs)
  const s = Number(savedTs)
  if (!Number.isFinite(m) || !Number.isFinite(s) || s <= 0) return now
  if (now - m > 120000 || s > now) return now
  return s
}
export function idleText(now, lastActiveAt) {
  const min = Math.max(0, Math.floor((now - lastActiveAt) / 60000))
  return min >= 60 ? '쉼 ' + Math.floor(min / 60) + '시간 ' + (min % 60) + '분' : '쉼 ' + min + '분'
}

// 세션 이름 후보. 이름이 이미 있으면 붙이지 않는다(손으로 붙인 이름은 건드리지 않는다).
// 손으로 지은 작업 대장 줄 이름이 있으면 그것을, 없으면 이슈 제목의 앞부분을 쓴다. 지어내지 않는다.
export function titleCandidate(s) {
  if (String(s.current || '').trim()) return ''
  const line = String(s.lineName || '').trim()
  if (line && s.lineAuto === false) return line
  let t = String(s.issueTitle || '')
    .replace(/^(\s*\[[^\]]+\]\s*)+/, '')
    .trim()
  if (!t) return ''
  const cut = t.search(/\s[—–-]\s|\s·\s/)
  if (cut > 0) t = t.slice(0, cut)
  const chars = [...t]
  return (chars.length > 12 ? chars.slice(0, 12).join('') : t).trim()
}

// 띠 밖 ①: 스피너 줄 끝에 붙는 한 줄 — 지금 단계 · 돌리는 일 · 몇 번째 도구 · 작업 도중 받은 메시지.
export function spinnerTail(s) {
  const parts = []
  if (s.step) parts.push(s.step)
  if (s.tool) parts.push(s.tool.length > 36 ? s.tool.slice(0, 35) + '…' : s.tool)
  if (s.tools > 0) parts.push('도구 ' + s.tools + '번째')
  if (s.mid > 0) parts.push('도중 메시지 ' + s.mid + '건 받음')
  return parts.length ? '· ' + parts.join(' · ') : ''
}

// 띠 밖 ③: 턴 영수증. 0 인 항목은 적지 않는다.
export function receiptText(r) {
  const parts = ['도구 ' + (r.tools || 0)]
  if (r.files > 0) parts.push('고친 파일 ' + r.files)
  if (r.fails > 0) parts.push('실패 ' + r.fails)
  if (r.subs > 0) parts.push('서브 ' + r.subs)
  if (r.mid > 0) parts.push('도중 메시지 ' + r.mid)
  const delta = (label, a, b) => {
    if (a === null || a === undefined || b === null || b === undefined) return
    const d = Math.round(b - a)
    if (d > 0) parts.push(label + ' +' + d + '%')
  }
  delta('ctx', r.ctx0, r.ctx1)
  delta('5h', r.h50, r.h51)
  return parts.join(' · ')
}

// 띠 밖 ④: 입력칸 아래 줄 끝에 붙는 「남은 것」. 없으면 빈 글자(아무것도 붙이지 않는다).
export function hintTail(s) {
  const parts = []
  if (s.shells > 0) parts.push('셸 ' + s.shells)
  if (s.dockers > 0) parts.push('docker ' + s.dockers)
  if (s.browser) parts.push('브라우저 1')
  if (s.unpushed > 0) parts.push('미push ' + s.unpushed)
  return parts.length ? '남은 것: ' + parts.join(' · ') : ''
}

// 띠 밖 ⑤: 내 프롬프트 줄의 꼬리표.
export function promptTag(p) {
  const d = new Date(p.at)
  const hm = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0')
  return '#' + p.n + ' · ' + hm + (p.mid ? ' · 작업 도중' : '')
}

// 띠 밖 ②: `/now` — 모델을 부르지 않고 지금까지를 한눈에.
export function nowText(s) {
  const lines = []
  const head = [s.issue || '이슈 없음', s.step ? '단계 ' + s.step : '단계 없음']
  if (s.busy) head.push('턴 ' + fmtDur(s.turnSec) + '째')
  else if (s.subs > 0) head.push('본체는 쉬고 하위 ' + s.subs + '개 작업 중')
  else head.push(s.idle || '쉬는 중')
  lines.push(head.join(' · '))
  lines.push('이번 턴: ' + receiptText(s.turn) + (s.tool ? ' · 지금 ' + s.tool : ''))
  const left = hintTail(s.left)
  lines.push('서브 ' + s.subs + ' · 감시 ' + s.mons + (left ? ' · ' + left : ' · 남은 것 없음'))
  if (s.usage) lines.push('한도: ctx ' + (s.usage.ctx ?? '—') + '% · 5h ' + (s.usage.h5 ?? '—') + '% · 7d ' + (s.usage.d7 ?? '—') + '%')
  if (s.prompts && s.prompts.length) {
    lines.push('보낸 프롬프트(최근 ' + s.prompts.length + '개):')
    for (const p of s.prompts) lines.push('  ' + promptTag(p) + '  ' + (p.text.length > 60 ? p.text.slice(0, 59) + '…' : p.text))
  }
  return lines.join('\n')
}
