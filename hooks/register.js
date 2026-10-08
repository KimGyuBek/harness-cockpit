// 하네스 콕핏 진입점. 이벤트를 관찰만 하고(항상 next 로 넘긴다) 모듈 변수에 상태를 모아
// 프롬프트 위 띠 · 슬림 패널 · Agent 줄 · Monitor 알림 줄 · 토스트를 그린다.
// 툴 호출을 막거나 바꾸지 않는다. 직접 답하는 툴 호출은 이 mod 가 등록한 phase 툴뿐이다.
import {
  alertFiles,
  IMPL_STEPS,
  repoFamily,
  repoInfo,
  branchKey,
  rateOf,
  modelLabel,
  planProgress,
  classifyTool,
  newStepState,
  applyActivity,
  noteBashResult,
  viewSteps,
  subStatus,
  parseTaskNotification,
  isEndStatus,
  monitorRemainMs,
  monitorWarnMs,
  dockerNameOf,
  flagsCreatedBy,
  fmtDur,
  fmtClock,
  fleetView,
  workState,
  idleStage,
  isDozing,
  restoreActive,
  idleText,
  titleCandidate,
  spinnerTail,
  receiptText,
  hintTail,
  nowText,
} from './model.js'
import { band, pane, agentStatus, monitorLine, leftoversText, arcFits } from './view.js'
import { clawdFrame } from './clawd.js'
import { sunTimes, quitTimer, quitMood, arcCells, weekSpans, chimeAt, skyOf, sleepSky, SKY_PHASES, SUN_FIXED } from './arc.js'
import { normalizePoll, setPoll, pollText, due, SYS_CMD, parseSys, smoothCpu, sustain, sysLevel, parseAwake, shouldSample, SLEEP_FACTOR } from './poll.js'
import { setConfig, getConfig, configText } from './config.js'
import { FX, draw, bootCard, parseBoard, devWindow, dateTexts, repoOf, normalizeChoice, parseIds, introLayout } from './fx.js'

const PANE_ID = 'cockpit'
const PHASE_TOOL = 'mcp__harness-cockpit__phase'

let sid = ''
let home = ''
let cwd = ''
let family = 'blue'
let repo = { name: '', color: 'inactive', worktree: false }
let branch = ''
let dirty = 0
let issue = { key: '', title: '', state: '' }
let issueFetchedKey = ''
let issueFetchedAt = 0
let model = ''
let effort = ''
let usage = { ctx: null, h5: null, d7: null }
let busy = false
let turnStart = 0
let lastDur = 0
let asking = 0
let frame = 0
let lastViewportCols = 0
let lastStepKey = ''

const steps = newStepState()
const subs = new Map()
const subByTool = new Map()
const mons = new Map()
const dockers = new Set()
let shells = []
let browserOpen = false
// 경보 파일의 경보는 그 파일을 「만든 세션」의 띠에만 띄운다(모든 세션에 뜨면 어느 세션 일인지 헷갈린다).
// flags = 이 세션이 만든 플래그 중 아직 살아 있는 것. flagOwned 는 파일(/tmp/.claude-cockpit/<sid>.flags)에도 남겨 mod 를 다시 읽어도 유지한다.
// 부재 시 동작: 콕핏이 없는 세션이나 사람이 직접 만든 플래그는 주인이 없어 어느 띠에도 뜨지 않는다. 그 파일을 읽는 쪽의 동작은 그대로다.
let flags = []
const flagOwned = new Set()
const flagTouched = new Map()

async function saveOwned($) {
  if (!sid) return
  try {
    await $.fs.write('/tmp/.claude-cockpit/' + sid + '.flags', JSON.stringify([...flagOwned]))
  } catch (err) {
    $.ui.log('cockpit: 플래그 주인 기록 실패 ' + String(err), { to: 'debug' })
  }
}

async function loadOwned($) {
  try {
    const path = '/tmp/.claude-cockpit/' + sid + '.flags'
    if (!sid || !(await $.fs.exists(path))) return
    for (const label of JSON.parse(await $.fs.read(path))) flagOwned.add(String(label))
  } catch (err) {
    $.ui.log('cockpit: 플래그 주인 읽기 실패 ' + String(err), { to: 'debug' })
  }
}
let fleet = null
let rollupAt = 0

let paneOpen = false
let paneInline = false
let paneUserClosed = false
let paneAsked = false

// 새 세션 시작 효과. intro 가 있으면 고른 효과들을 함께 재생한다(1번은 띠 자리에서, 나머지는 띠 위에).
// introChoice: 효과 번호 배열, 빈 배열 = 끔. `/fx use 1 3` 이 $.store 에 남겨 다음 세션에도 이어진다.
// 부재 시 동작: 저장된 값이 없으면 INTRO_DEFAULT(부팅 스윕)를 쓴다.
const INTRO_DEFAULT = [1]
let intro = null
let introTimer = null
let introChoice = INTRO_DEFAULT.slice()
let interactive = false
// 새로 연 세션인지는 세션 시작 시각으로 가린다 — 이어 연 세션은 처음 연 시각을 그대로 갖고 있어 오래된 값이 나온다.
const FRESH_MS = 20000
// 모듈이 올라온 직후부터 session.start 가 「새 세션인가」를 정할 때까지는 꺼진 카드를 그린다.
// 평소 띠가 먼저 보였다가 부팅 스윕으로 바뀌는 깜빡임을 막는다. 3초가 지나면 무조건 평소 띠로 돌아간다.
let booting = true
const loadedAt = Date.now()

// 띠 왼쪽의 Clawd. 그림은 띠가 그려질 때 한 번 올리고, 150ms 마다 $.ui.blit 으로 프레임만 갈아 끼운다.
// clawdOn: `/clawd` 로 켜고 끄며 $.store 에 남는다. 부재 시 동작: 저장된 값이 없으면 켠다.
let clawdOn = true
let bandId = ''
let doneAt = 0
// Clawd 가 따라 하는 일들. clawdAct: 가장 최근 툴의 종류(읽기 · 고치기 · 실행) — 6초가 지나면 「생각 중」으로 돌아간다.
// clawdHold: 아직 끝나지 않은 Bash 수(오래 도는 테스트 동안 계속 달리게 한다).
const ACT_SCENE = { plan: 'edit', impl: 'edit', note: 'edit', report: 'edit', code: 'read', research: 'read', verify: 'run' }
let clawdAct = 'think'
let clawdActAt = 0
let clawdHold = 0
let errAt = 0
let coinAt = 0
let submitAt = 0
// 스피너가 마지막으로 그려진 시각과, busy 를 스피너를 보고 추정했는지(턴 시작 이벤트를 못 본 경우).
let spinAt = 0
let spinFirst = 0
let busyGuess = false

// ── 띠 최종 시안(2026-10-08) ─────────────────────────────────────────────────────
// 요소별 폴링 주기(초). `/cockpit poll` 로 바꾸면 $.store 에 남는다. 부재 시 동작: 저장된 값이 없으면 poll.js 의 기본값을 쓴다.
let poll = normalizePoll(null)
const lastRun = {}
const pollBusy = {}
// 맥 자원 · 화면 안 꺼짐은 한 세션만 재서 /tmp/.claude-cockpit/ 에 남기고 나머지 세션은 그 파일을 읽는다(세션 수만큼 재지 않는다).
let sysBusy = false
let sysCpu = null
const sysHist = []
let heat = 0
let awake = false
let awakeBusy = false
// 원격(Remote Control): 켜면 엔진이 ~/.claude/sessions/<pid>.json 에 bridgeSessionId 를 적는다(2026-10-08 실측).
// 폰이 붙기 전에도 「켜져 있음」 을 알 수 있어, 붙은 화면 목록만 볼 때 표시가 안 뜨던 것을 고쳤다.
let sessionFile = ''
// Clawd 뒤 하늘. `/cockpit sky on|off` 로 켜고 끄며 $.store 에 남는다. 부재 시 동작: 저장된 값이 없으면 켠다.
let skyOn = true
// `/cockpit sky <시간대>` 로 잠깐 다른 시간대를 본다(저장하지 않는다). 빈 값이면 지금 시각을 따른다.
let skyForce = ''
let remote = false
// 오래 쉼: 본체 턴 · 하위 작업 · 프롬프트가 모두 없던 때부터 센다. 0 깨어 있음 · 1 잠(15분) · 2 흐림(60분).
// idleCfg 는 `/cockpit idle <초> <초>` 로 시험할 때만 바꾸고 저장하지 않는다.
let lastActiveAt = Date.now()
// 파일에 남긴 마지막 활동 시각(같은 값을 다시 쓰지 않으려고 기억한다).
let activeSaved = 0
let idleNow = 0
let idleCfg = null
// 반원: 일출 · 일몰은 날짜가 바뀔 때만 다시 셈한다. bellAt · flashAt 은 효과가 시작된 시각.
let sunDay = ''
let sun = { rise: 392, set: 1086 }
let lastMinute = -1
let bellAt = 0
let flashAt = 0
let arcShown = ''
let bodyCols = 0
// 세션 이름: 비어 있을 때 한 번만 붙인다(손으로 붙인 이름은 건드리지 않는다).
let sessionTitle = ''
let titleTried = false
let issueFullTitle = ''
let wipLine = { name: '', auto: true }
// 띠 밖: 이번 턴의 셈 · 보낸 프롬프트 · 줄마다의 꼬리표.
let unpushed = 0
let turn = newTurn()
let toolLabel = ''
let promptSeq = 0
const prompts = []
// 끝난 턴의 영수증. 「Worked for …」 줄과는 걸린 시간(ms)으로 짝을 짓는다 — 줄이 그려지는 순서에 기대면 mod 를 다시 읽은 뒤 옛 줄에 붙는다.
const receipts = []

function newTurn() {
  return { tools: 0, files: new Set(), fails: 0, subs: 0, mid: 0, ctx0: null, h50: null }
}

function runningSubs() {
  return [...subs.values()].filter((s) => !s.done).length
}

function activeWorkers() {
  return fleet ? fleetView(fleet.tasks, now()).open.filter((w) => w.state === 'active').length : 0
}

// 작업 중인가 — 본체 턴 또는 하위 세션(서브에이전트 · 워커).
function work() {
  return workState({ busy, subs: runningSubs(), workers: activeWorkers() })
}

// 사용자 환경 설정(레포 이름표 · 경보 파일 · 작업 대장 등)을 읽는다. 부재 시 동작: 파일이 없으면 기본값이고 해당 기능만 빠진다.
let configFound = false
function configPath() {
  return home + '/.claude/harness-cockpit.json'
}
async function loadConfig($) {
  configFound = false
  try {
    if (home && (await $.fs.exists(configPath()))) {
      setConfig(JSON.parse(await $.fs.read(configPath())), home)
      configFound = true
      return
    }
  } catch (err) {
    $.ui.log('cockpit: 설정 파일 읽기 실패 ' + String(err), { to: 'debug' })
  }
  setConfig(null, home)
}

function clockNow() {
  const d = new Date(now())
  return { d, min: d.getHours() * 60 + d.getMinutes(), dow: d.getDay(), key: d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate() }
}

// 그날의 일출 · 일몰. 위치가 설정에 있으면 계산하고(시간대는 이 컴퓨터의 것), 없으면 06:00 · 18:00 으로 고정한다.
function sunOf(d) {
  const loc = getConfig().location
  if (!loc) return SUN_FIXED
  return sunTimes(d.getFullYear(), d.getMonth() + 1, d.getDate(), loc.lat, loc.lon, -d.getTimezoneOffset() / 60)
}

function skyNow() {
  const c = clockNow()
  if (c.key !== sunDay) {
    sunDay = c.key
    sun = sunOf(c.d)
  }
  // 잠든 세션은 낮이어도 밤하늘에 달을 띄운다(미리 보기를 켜 둔 동안은 미리 보기가 먼저다).
  if (idleNow >= 1 && !skyForce && moodNow() !== 'party') return sleepSky()
  // 시간대를 미리 볼 때는 그 시간대의 한가운데 시각으로 그린다.
  const at = { morning: 450, day: 780, sunset: sun.set - 20, night: 1290 }[skyForce]
  return Object.assign({}, skyOf(at === undefined ? c.min : at, sun.rise, sun.set), { showOrb: !arcFits(bodyCols, clawdOn) })
}

function flashPhase(t) {
  return flashAt && t - flashAt < 2000 ? Math.floor((t - flashAt) / 250) + 1 : 0
}

function arcNow() {
  const c = clockNow()
  if (c.key !== sunDay) {
    sunDay = c.key
    sun = sunOf(c.d)
  }
  const t = now()
  // 숫자가 깜빡이는 것은 마지막 10분뿐이다. 그때가 아니면 위상을 0 으로 고정해, 분이 바뀔 때만 그림이 달라지게 한다(잠든 세션도 같다).
  const timer = quitTimer(c.min, c.dow, getConfig().quitMin)
  return arcCells({ min: c.min, rise: sun.rise, set: sun.set, timer, tick: timer.blink && idleNow < 1 ? Math.floor(t / 1000) : 0, flash: flashPhase(t) })
}

// 퇴근 무렵의 기분. `/cockpit fx party|gloom` 으로 10초 동안 미리 볼 수 있다(moodForce).
let moodForce = ''
let moodForceUntil = 0
function moodNow() {
  if (moodForce && now() < moodForceUntil) return moodForce
  const c = clockNow()
  return quitMood(c.min, c.dow, getConfig().quitMin)
}

function clawdNow() {
  const t = now()
  const since = (at) => (at ? t - at : -1)
  return clawdFrame(
    {
      asking: asking > 0,
      busy,
      activity: clawdHold > 0 || t - clawdActAt < 6000 ? clawdAct : 'think',
      sinceDone: since(doneAt),
      sinceErr: since(errAt),
      sinceSubmit: since(submitAt),
      sinceCoin: since(coinAt),
      sinceBell: since(bellAt),
      hot: (usage.ctx !== null && usage.ctx >= 85) || !!(usage.h5 && usage.h5.pct >= 85),
      heat,
      asleep: idleNow >= 1,
      dozing: isDozing(t, lastActiveAt, work().working, idleCfg),
      mood: moodNow(),
      sky: skyOn ? skyNow() : null,
    },
    t,
  )
}

function now() {
  return Date.now()
}

function snapshot(cols) {
  const t = now()
  return {
    now: t,
    cols,
    frame,
    family,
    flags,
    issue,
    repo,
    coKey: branchKey(branch),
    branch,
    dirty,
    model,
    effort,
    usage,
    busy,
    turnStart,
    lastDur,
    asking: asking > 0,
    work: work(),
    idle: idleNow,
    lastActiveAt,
    remote,
    awake,
    arc: { cells: arcNow() },
    week: weekSpans(clockNow().dow),
    timer: quitTimer(clockNow().min, clockNow().dow, getConfig().quitMin),
    clawd: clawdOn ? { cells: clawdNow() } : null,
    fleet: fleet ? Object.assign({}, fleet, { rollupAt }) : null,
    subs: [...subs.values()].map((s) => Object.assign({}, s, { status: subStatus(s, t), el: t - s.start })),
    mons: [...mons.values()].map((m) => {
      const remainMs = monitorRemainMs(m, t)
      return Object.assign({}, m, { remainMs, elMs: t - m.start, warn: !m.ended && remainMs <= monitorWarnMs(m) })
    }),
    left: leftList(),
  }
}

function leftList() {
  const out = []
  for (const s of shells) out.push('셸 ' + s)
  for (const d of dockers) out.push('docker ' + d)
  if (browserOpen) out.push('Playwright 브라우저')
  return out
}

function endIntro($) {
  intro = null
  if (introTimer) introTimer.cancel()
  introTimer = null
  $.ui.invalidate('ui.render')
}

// 작업 대장 요약은 `wip ls` 출력에서 읽는다. `wip ls` 는 「N번 이어서」용 번호 파일을 세션별로 다시 쓰므로,
// 세션 id 변수를 빼고 실행해 이 세션의 번호 파일을 건드리지 않는다.
async function readBoard($) {
  try {
    // 부재 시 동작: 설정에 작업 대장 명령(issue.boardCommand)이 없으면 읽지 않는다 — 시작 효과의 브리핑 카드에서 그 칸만 빠진다.
    const cmd = getConfig().issue.boardCommand
    if (!cmd) return null
    const r = await $.process.run(['/usr/bin/env', '-u', 'CLAUDE_CODE_SESSION_ID', ...cmd], { timeoutMs: 8000 })
    return r.exitCode === 0 ? parseBoard(r.stdout) : null
  } catch (err) {
    $.ui.log('cockpit: 작업 대장 읽기 실패 ' + String(err), { to: 'debug' })
    return null
  }
}

// 새 세션 첫 몇 초는 엔진이 한도 값을 아직 모른다. statusLine 스크립트가 남긴 최근 값(계정 공통)을 먼저 써서
// 부팅 스윕의 게이지가 빈 채로 지나가지 않게 한다. 엔진 값이 오면 그 값이 덮어쓴다.
// 부재 시 동작: 파일이 없거나 30분보다 오래됐으면 값 없이(—) 간다.
async function seedUsageFromCache($) {
  try {
    const j = JSON.parse(await $.fs.read('/tmp/.claude-usage/current.json'))
    if (!j || now() / 1000 - Number(j.ts) > 1800) return
    const pick = (w) => (w && typeof w.used_percentage === 'number' ? { pct: Math.round(w.used_percentage), resetsAt: w.resets_at ? Number(w.resets_at) * 1000 : null } : null)
    usage = { ctx: usage.ctx, h5: usage.h5 || pick(j.five_hour), d7: usage.d7 || pick(j.seven_day) }
  } catch (err) {
    $.ui.log('cockpit: 최근 한도 값 읽기 실패 ' + String(err), { to: 'debug' })
  }
}

function usageForFx() {
  return {
    ctx: usage.ctx,
    h5: usage.h5 ? usage.h5.pct : null,
    d7: usage.d7 ? usage.d7.pct : null,
    h5Reset: usage.h5 && usage.h5.resetsAt ? fmtClock(usage.h5.resetsAt) : '',
  }
}

// keep: 새 세션 시작 재생 — 브리핑(2)이 들어 있으면 첫 턴이 시작될 때까지 남긴다. 미리 보기는 정해진 길이만 재생한다.
// 효과는 바로 시작하고, 사용량 · 작업 대장은 읽어 오는 대로 채운다(읽기를 기다리면 평소 띠가 먼저 보인다).
function startIntro($, ids, keep) {
  const d = new Date()
  const ctx = Object.assign({ family, name: repo.name, word: repoOf(cwd).word, tall: clawdOn }, dateTexts(d), { usage: usageForFx(), board: null, dev: devWindow(d) })
  if (introTimer) introTimer.cancel()
  intro = { ids, start: now(), ctx, keep: keep && ids.includes(2) }
  // 띠의 평소 주기(150ms)보다 촘촘히 그려야 스윕 · 빛이 끊기지 않는다. 움직임이 끝나면 이 타이머는 멈춘다.
  introTimer = $.clock.every(80, () => {
    if (!intro) return
    const lay = introLayout(intro.ids, now() - intro.start, intro.keep)
    if (lay.done) {
      endIntro($)
      return
    }
    if (!lay.moving && introTimer) {
      introTimer.cancel()
      introTimer = null
    }
    $.ui.invalidate('ui.render')
  })
  // 한도 값은 그릴 때마다 최신 값을 읽는다(띠 훅). 여기서는 빈 값을 채울 읽기만 걸어 둔다.
  seedUsageFromCache($).then(() => refreshUsage($))
  if (ids.includes(2) || ids.includes(3)) {
    readBoard($).then((board) => {
      ctx.board = board
      $.ui.invalidate('ui.render')
    })
  }
  $.ui.invalidate('ui.render')
}

function hasPaneData() {
  const t = now()
  if (flags.length) return true
  if ([...subs.values()].some((s) => subStatus(s, t) !== 'done')) return true
  if ([...mons.values()].some((m) => !m.ended)) return true
  if (fleet && fleetView(fleet.tasks, t).open.length) return true
  return leftList().length > 0
}

function animating() {
  if (busy) return true
  if ([...subs.values()].some((s) => !s.done)) return true
  return [...mons.values()].some((m) => !m.ended)
}

// statusLine 스크립트가 이 표식을 보면 화면 출력만 생략한다(한도 수집은 계속한다).
// 표식이 120초 넘게 갱신되지 않으면 statusLine 이 다시 그리므로, mod 가 멈추면 원래대로 돌아간다.
async function touchMarker($) {
  if (!sid) return
  try {
    await $.fs.write('/tmp/.claude-cockpit/' + sid, String(now()))
    // 마지막 활동 시각도 같이 남긴다 — mod 를 다시 읽어도 이 세션의 쉼 시계가 이어지게(restoreActive).
    if (lastActiveAt !== activeSaved) {
      activeSaved = lastActiveAt
      await $.fs.write('/tmp/.claude-cockpit/' + sid + '.active', String(lastActiveAt))
    }
  } catch (err) {
    $.ui.log('cockpit: 표식 쓰기 실패 ' + String(err), { to: 'debug' })
  }
}

async function refreshGit($) {
  try {
    const b = await $.process.run(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 5000 })
    branch = b.exitCode === 0 ? b.stdout.trim() : ''
    if (branch) {
      const s = await $.process.run(['git', 'status', '--porcelain'], { timeoutMs: 5000 })
      dirty = s.exitCode === 0 ? s.stdout.split('\n').filter((l) => l.trim()).length : 0
      // 미push 커밋 수. 올린 적 없는 브랜치(upstream 없음)는 0 으로 둔다.
      const u = await $.process.run(['git', 'rev-list', '--count', '@{u}..HEAD'], { timeoutMs: 5000 })
      unpushed = u.exitCode === 0 ? Number(u.stdout.trim()) || 0 : 0
    } else {
      dirty = 0
      unpushed = 0
    }
  } catch (err) {
    branch = ''
    dirty = 0
    unpushed = 0
  }
}

// 진행 중 이슈는 작업 대장의 이 세션 줄 파일에서 읽는다(설정의 issue.boardLineDir). 줄 파일 이름은 세션 id 앞 8자다.
// 부재 시 동작: 폴더가 설정에 없으면 이슈 키 없이 단계만 보인다.
async function refreshIssue($) {
  const lineDir = getConfig().issue.boardLineDir
  if (!lineDir || !sid) return
  try {
    const path = lineDir + '/' + sid.slice(0, 8) + '.json'
    if (!(await $.fs.exists(path))) return
    const line = JSON.parse(await $.fs.read(path))
    const key = Array.isArray(line.issues) && line.issues.length ? String(line.issues[line.issues.length - 1]) : ''
    wipLine = { name: String(line.name || ''), auto: line.name_auto !== false }
    if (key !== issue.key) {
      issue = { key, title: '', state: '' }
      issueFullTitle = ''
    }
  } catch (err) {
    $.ui.log('cockpit: 작업 대장 읽기 실패 ' + String(err), { to: 'debug' })
  }
}

// 이슈 제목 · 상태는 이슈 트래커 MCP 서버의 get_issue 로 읽는다(설정의 issue.mcpServer · 기본 linear). 실패하면 키만 보인다.
async function refreshLinear($, force) {
  const ic = getConfig().issue
  if (!ic.mcpServer || !issue.key || !ic.keyRe.test(issue.key)) return
  if (!force && issueFetchedKey === issue.key && now() - issueFetchedAt < poll.linear * 1000) return
  issueFetchedKey = issue.key
  issueFetchedAt = now()
  try {
    const r = await $.mcp.call(ic.mcpServer, 'get_issue', { id: issue.key })
    const block = (r.content || []).find((c) => c.type === 'text')
    if (!block) return
    const data = JSON.parse(block.text)
    const title = String(data.title || '').replace(/^\[[^\]]+\]\s*/, '')
    issueFullTitle = title
    issue = Object.assign({}, issue, {
      title: title.length > 26 ? title.slice(0, 25) + '…' : title,
      state: String(data.status || ''),
    })
  } catch (err) {
    $.ui.log('cockpit: 이슈 조회 실패 ' + String(err), { to: 'debug' })
  }
}

// 워커를 관리하는 세션이면 이 세션이 소유한 열린 배치 전부와 그 태스크(워커)를 읽는다.
async function refreshFleet($) {
  fleet = null
  if (!sid) return
  try {
    if (!(await $.fs.exists('/tmp/.claude-lane-fleet-' + sid))) return
    // 워커 기록은 세션 위치와 무관하게 한 곳(FLEET_ROOT 환경 변수 또는 설정의 fleetRoot)에 쌓인다.
    // 세션이 있는 폴더 기준으로 찾으면 다른 폴더에서 연 세션의 배치 보드가 비었다.
    const root = (await $.env.get('FLEET_ROOT')) || getConfig().fleetRoot
    if (!root) return
    const dir = root + '/fleet'
    const batches = await $.fs.list(dir + '/batches')
    const recent = batches.filter((b) => b.kind === 'file' && b.name.endsWith('.json') && now() - b.mtimeMs < 3 * 24 * 3600 * 1000)
    // 배치는 모든 태스크가 끝나도 대개 SEALED 로 남는다. 가장 새 배치 하나만 보면
    // 앞 배치의 작업중 워커가 가려지므로, 이 세션 소유 배치를 모두 모은다.
    const bids = new Set()
    let firstDate = ''
    for (const b of recent) {
      const j = JSON.parse(await $.fs.read(dir + '/batches/' + b.name))
      if (j.owner_sid !== sid || j.status === 'CLOSED') continue
      const bid = b.name.replace(/\.json$/, '')
      bids.add(bid)
      const date = bid.split('-')[1] || ''
      if (!firstDate || date < firstDate) firstDate = date
    }
    if (!bids.size) return
    // 태스크 번호는 만든 날짜로 시작한다(T-YYYYMMDD-NNNN). 가장 오래된 배치 날짜부터만 읽어 전체를 훑지 않는다.
    const taskDirs = (await $.fs.list(dir + '/tasks')).filter((d) => d.kind === 'dir' && d.name >= 'T-' + firstDate)
    const tasks = []
    for (const d of taskDirs) {
      const metaPath = dir + '/tasks/' + d.name + '/meta.json'
      if (!(await $.fs.exists(metaPath))) continue
      const meta = JSON.parse(await $.fs.read(metaPath))
      if (!bids.has(meta.batch)) continue
      const ts = meta.ts || {}
      tasks.push({
        id: meta.tid || d.name,
        status: meta.status || '',
        issue: meta.issue_key || '',
        acked: Date.parse(ts.acked || '') || 0,
        dispatched: Date.parse(ts.dispatched || '') || 0,
      })
    }
    fleet = { bids: [...bids], tasks }
  } catch (err) {
    $.ui.log('cockpit: 배치 읽기 실패 ' + String(err), { to: 'debug' })
  }
}

async function refreshPlan($) {
  if (!steps.planPath) return
  try {
    steps.plan = planProgress(await $.fs.read(steps.planPath))
  } catch (err) {
    steps.plan = null
  }
}

async function refreshDockers($) {
  if (!dockers.size) return
  try {
    const r = await $.process.run(['docker', 'ps', '--format', '{{.Names}}'], { timeoutMs: 10000 })
    if (r.exitCode !== 0) return
    const running = new Set(r.stdout.split('\n').map((s) => s.trim()).filter(Boolean))
    for (const d of [...dockers]) if (d !== 'compose' && d !== 'docker run' && !running.has(d)) dockers.delete(d)
  } catch (err) {
    $.ui.log('cockpit: docker 확인 실패 ' + String(err), { to: 'debug' })
  }
}

async function refreshFlags($) {
  const t = now()
  const found = []
  let dirty = false
  for (const f of alertFiles()) {
    try {
      if (!(await $.fs.exists(f.path))) {
        if (flagOwned.delete(f.label)) dirty = true
        continue
      }
      // 이 세션의 Bash 가 방금(20초 안) 그 파일을 만든 경우에만 「내 것」으로 잡는다.
      if (!flagOwned.has(f.label) && t - (flagTouched.get(f.label) || 0) < 20000) {
        flagOwned.add(f.label)
        dirty = true
      }
      if (flagOwned.has(f.label)) found.push(f.label)
    } catch (err) {
      $.ui.log('cockpit: 플래그 확인 실패 ' + String(err), { to: 'debug' })
    }
  }
  if (dirty) saveOwned($)
  const added = found.filter((x) => !flags.includes(x))
  const changed = added.length > 0 || found.length !== flags.length
  flags = found
  if (added.length) {
    const al = getConfig().alert
    $.ui.toast(al.title + ' 생성 · ' + added.join(', ') + (al.note ? ' · ' + al.note : ''), { timeoutMs: 8000 })
  }
  if (changed) $.ui.invalidate('ui.render')
}

async function refreshUsage($) {
  try {
    const u = await $.session.usage()
    applyUsage(u.context, u.rateLimits)
  } catch (err) {
    $.ui.log('cockpit: 사용량 읽기 실패 ' + String(err), { to: 'debug' })
  }
}

function applyUsage(context, rateLimits) {
  const pct = context && typeof context.percent === 'number' ? Math.round(context.percent) : null
  const h5 = rateOf(rateLimits, '5h')
  const d7 = rateOf(rateLimits, '7d')
  usage = {
    ctx: pct === null ? usage.ctx : pct,
    h5: h5 || usage.h5,
    d7: d7 || usage.d7,
  }
}

// 5시간 · 주간 한도는 계정 공통이라, 이 세션이 쉬는 동안에도 다른 세션이 쓰면 오른다.
// statusLine 스크립트가 남기는 최근 값이 2분 안의 것이면 그 값을 쓴다(파일 읽기 한 번).
async function refreshLimits($) {
  await refreshUsage($)
  try {
    const j = JSON.parse(await $.fs.read('/tmp/.claude-usage/current.json'))
    if (!j || now() / 1000 - Number(j.ts) > 120) return
    const pick = (w, cur) => (w && typeof w.used_percentage === 'number' ? { pct: Math.round(w.used_percentage), resetsAt: w.resets_at ? Number(w.resets_at) * 1000 : cur ? cur.resetsAt : null } : cur)
    usage = { ctx: usage.ctx, h5: pick(j.five_hour, usage.h5), d7: pick(j.seven_day, usage.d7) }
  } catch (err) {
    $.ui.log('cockpit: 최근 한도 값 읽기 실패 ' + String(err), { to: 'debug' })
  }
}

// 맥 자원(CPU · 메모리). 캐시를 읽고, 이번에 잴 차례면 잰다. 값은 Clawd 의 색 · 땀 · 김으로만 보인다.
// 부재 시 동작: 캐시가 1분 넘게 낡았으면(아무도 재지 않음) 평소 단계로 둔다.
async function tickSys($) {
  const path = '/tmp/.claude-cockpit/sys.json'
  let cache = null
  try {
    if (await $.fs.exists(path)) cache = JSON.parse(await $.fs.read(path))
  } catch (err) {
    cache = null
  }
  if (!sysBusy && shouldSample(cache, now(), sid, poll.sys)) {
    sysBusy = true
    try {
      const r = await $.process.run(['/bin/sh', '-c', SYS_CMD], { timeoutMs: 5000 })
      const s = r.exitCode === 0 ? parseSys(r.stdout) : null
      if (s) {
        cache = Object.assign({}, s, { ts: now(), by: sid })
        await $.fs.write(path, JSON.stringify(cache))
      }
    } catch (err) {
      $.ui.log('cockpit: 맥 자원 읽기 실패 ' + String(err), { to: 'debug' })
    } finally {
      sysBusy = false
    }
  }
  const t = now()
  // 값을 믿는 기한은 「지금 재는 주기」의 3배(적어도 60초)다. 잠든 세션은 주기를 늘려 재므로 기한도 같이 늘린다 —
  // 고정 60초로 두면 혼자 남은 잠든 세션에서 값이 주기 사이마다 「없음」으로 떨어진다.
  const sysLife = Math.max(60000, poll.sys * (idleNow >= 1 ? SLEEP_FACTOR : 1) * 3000)
  if (cache && t - Number(cache.ts) < sysLife) {
    // 같은 표본을 두 번 넣지 않는다(읽는 세션은 재는 세션보다 자주 읽을 수 있다).
    if (!sysHist.length || sysHist[sysHist.length - 1].ts !== cache.ts) {
      sysHist.push({ ts: Number(cache.ts), cpu: cache.cpu })
      sysCpu = smoothCpu(sysCpu, cache.cpu)
    }
    while (sysHist.length && t - sysHist[0].ts > 70000) sysHist.shift()
    heat = sysLevel(cache, sysCpu, sustain(sysHist, t))
  } else {
    sysCpu = null
    sysHist.length = 0
    heat = 0
  }
}

// 화면 안 꺼짐: caffeinate 가 화면 잠자기를 막는 동안만 모니터 표시를 띄운다. 맥 전체의 상태라 모든 세션 띠에 같이 보인다.
async function tickAwake($) {
  const path = '/tmp/.claude-cockpit/awake.json'
  let cache = null
  try {
    if (await $.fs.exists(path)) cache = JSON.parse(await $.fs.read(path))
  } catch (err) {
    cache = null
  }
  if (!awakeBusy && shouldSample(cache, now(), sid, poll.awake)) {
    awakeBusy = true
    try {
      const r = await $.process.run(['/usr/bin/pmset', '-g', 'assertions'], { timeoutMs: 5000 })
      if (r.exitCode === 0) {
        cache = { display: parseAwake(r.stdout), ts: now(), by: sid }
        await $.fs.write(path, JSON.stringify(cache))
      }
    } catch (err) {
      $.ui.log('cockpit: 화면 켜둠 읽기 실패 ' + String(err), { to: 'debug' })
    } finally {
      awakeBusy = false
    }
  }
  // 기한은 「지금 재는 주기」의 3배. 잠든 세션은 주기가 6배라 기한도 6배다(고정하면 혼자 남은 잠든 세션에서 표시가 깜빡인다).
  const next = !!(cache && cache.display && now() - Number(cache.ts) < poll.awake * (idleNow >= 1 ? SLEEP_FACTOR : 1) * 3000)
  if (next !== awake) {
    awake = next
    $.ui.invalidate('ui.render')
  }
}

// 이 세션의 상태 파일(~/.claude/sessions/<pid>.json)을 찾는다. pid 를 몰라 세션 id 로 한 번 찾아 두고 그 뒤로는 그 파일만 읽는다.
async function bridgeOn($) {
  if (!home || !sid) return false
  const dir = home + '/.claude/sessions'
  try {
    if (!sessionFile) {
      for (const f of await $.fs.list(dir)) {
        if (f.kind !== 'file' || !f.name.endsWith('.json')) continue
        try {
          if (JSON.parse(await $.fs.read(dir + '/' + f.name)).sessionId === sid) {
            sessionFile = dir + '/' + f.name
            break
          }
        } catch (err) {
          // 다른 세션이 쓰는 중인 파일은 건너뛴다.
        }
      }
    }
    if (!sessionFile) return false
    return !!JSON.parse(await $.fs.read(sessionFile)).bridgeSessionId
  } catch (err) {
    sessionFile = ''
    return false
  }
}

// 원격이 켜져 있는가 — Remote Control 을 켰거나(폰이 아직 안 붙어도), 터미널 말고 다른 화면이 붙어 있을 때.
// 붙고 떨어질 때 이벤트로 알고, 켜고 끄는 것은 5초마다 상태 파일로 맞춘다.
async function refreshSurfaces($) {
  try {
    const next = (await bridgeOn($)) || (await $.session.surfaces()).some((s) => s !== 'terminal')
    if (next !== remote) {
      remote = next
      $.ui.invalidate('ui.render')
    }
  } catch (err) {
    $.ui.log('cockpit: 원격 연결 읽기 실패 ' + String(err), { to: 'debug' })
  }
}

// 요소마다 주기가 다르다(poll.js). 1초에 한 번 불려, 때가 된 것만 돌린다. 잠든 세션은 주기를 늘린다.
function runPolls($, t) {
  const k = idleNow >= 1 ? SLEEP_FACTOR : 1
  const go = (key, factor) => {
    if (!due(t, lastRun[key], poll[key] * (factor || 1))) return false
    lastRun[key] = t
    return true
  }
  const redraw = () => $.ui.invalidate('ui.render')
  // 앞선 읽기가 아직 안 끝났으면 이번 차례는 건너뛴다(느린 git · 파일 읽기가 겹쳐 쌓이지 않게).
  const once = (key, fn) => {
    if (pollBusy[key]) return
    pollBusy[key] = true
    Promise.resolve()
      .then(fn)
      .catch((err) => $.ui.log('cockpit: ' + key + ' 읽기 실패 ' + String(err), { to: 'debug' }))
      .then(() => {
        pollBusy[key] = false
        redraw()
      })
  }
  if (go('sys', k)) tickSys($)
  if (go('awake', k)) tickAwake($)
  if (go('usage', k)) once('usage', () => refreshLimits($))
  // 경보 파일은 이 세션이 만든 것이 있거나 방금 만드는 명령을 돌렸을 때만 본다 — 평소에는 파일을 확인하지 않는다.
  const touched = [...flagTouched.values()].some((at) => t - at < 20000)
  if ((flagOwned.size || touched) && go('flags')) refreshFlags($)
  if (go('git', k)) once('git', () => refreshGit($).then(() => refreshDockers($)).then(() => refreshPlan($)))
  if (go('fleet', k)) once('fleet', () => refreshFleet($))
  // 원격 켜짐은 작은 파일 하나를 읽는 일이라 5초마다 본다(잠든 세션은 30초).
  if (due(t, lastRun.remote, 5 * k)) {
    lastRun.remote = t
    once('remote', () => refreshSurfaces($))
  }
  // 작업 대장 줄(이슈 키) · statusLine 표식은 30초 고정이다. 이슈 제목은 그 안에서 linear 주기로만 다시 읽는다.
  if (due(t, lastRun.board, 30)) {
    lastRun.board = t
    touchMarker($)
    once('board', () => refreshIssue($).then(() => refreshLinear($, false)))
  }
}

function blitArc($) {
  if (!bandId || !arcFits(bodyCols, clawdOn)) return
  const cells = arcNow()
  if (cells === arcShown) return
  arcShown = cells
  $.ui.blit({ requestId: bandId, key: 'arc', cells }).catch(() => {})
}

// 1초에 한 번: 쉼 단계 · 분이 바뀌었는지(반원 · 정각 · 정해진 시각) · 때가 된 폴링.
function everySecond($, t) {
  checkToasts($)
  syncPane($)
  if (busyGuess && t - spinAt > 3000) {
    busy = false
    busyGuess = false
    $.ui.invalidate('ui.render')
  }
  const working = work().working
  if (working) lastActiveAt = t
  const stage = idleStage(t, lastActiveAt, working, idleCfg)
  if (stage !== idleNow) {
    idleNow = stage
    $.ui.invalidate('ui.render')
  }
  const c = clockNow()
  if (c.min !== lastMinute) {
    const first = lastMinute < 0
    lastMinute = c.min
    // 모듈이 막 올라온 순간에는 울리지 않는다(다시 읽을 때마다 울리면 안 된다).
    if (!first) {
      const chime = chimeAt(c.min, c.dow, getConfig().bells)
      if (chime === 'bell') bellAt = t
      else if (chime === 'hour') flashAt = t
    }
    refreshSurfaces($)
    $.ui.invalidate('ui.render')
  }
  runPolls($, t)
}

// 패널은 보여 줄 것이 있을 때만 연다(/cockpit 으로 직접 연 뒤에는 비어 있어도 둔다).
// 스스로 여는 패널은 엔진이 144칸, 사용자가 한 번이라도 /cockpit 으로 연 뒤에는 110칸부터
// 그린다(손으로 닫기 전까지 다음 세션에도 유지). 그보다 좁으면 그리지 않고 기다리므로 자동으로 숨는다.
// 넓을 때 열린 뒤 좁아져 프롬프트 위로 내려오면 닫는다.
async function syncPane($) {
  const want = hasPaneData() || paneAsked
  if (!want) {
    paneUserClosed = false
    if (paneOpen) {
      paneOpen = false
      paneInline = false
      try {
        await $.ui.close({ id: PANE_ID })
      } catch (err) {
        $.ui.log('cockpit: 패널 닫기 실패 ' + String(err), { to: 'debug' })
      }
    }
    return
  }
  if (paneOpen && paneInline) {
    paneOpen = false
    paneInline = false
    try {
      await $.ui.close({ id: PANE_ID })
    } catch (err) {
      $.ui.log('cockpit: 패널 닫기 실패 ' + String(err), { to: 'debug' })
    }
    return
  }
  // 110칸 이상이면 일단 연다. 사용자가 아직 /cockpit 으로 연 적이 없으면 엔진이 144칸까지 그리지 않고 기다린다.
  if (!paneOpen && !paneUserClosed && (lastViewportCols === 0 || lastViewportCols >= 110)) {
    paneOpen = true
    try {
      await $.ui.open({ id: PANE_ID, title: '콕핏', columns: 28, rows: 2 })
    } catch (err) {
      paneOpen = false
      $.ui.log('cockpit: 패널 열기 실패 ' + String(err), { to: 'debug' })
    }
  }
}

function checkToasts($) {
  const t = now()
  for (const s of subs.values()) {
    if (!s.done && !s.stallToasted && subStatus(s, t) === 'stall') {
      s.stallToasted = true
      $.ui.toast('서브 정체 · ' + s.name + ' ' + Math.floor((t - s.last) / 60000) + '분째 요청 없음', { timeoutMs: 10000 })
    }
  }
  for (const m of mons.values()) {
    if (m.ended) continue
    const remain = monitorRemainMs(m, t)
    if (!m.warned && remain <= monitorWarnMs(m) && remain > 0) {
      m.warned = true
      $.ui.toast("감시 '" + m.desc + "' " + Math.ceil(remain / 60000) + '분 뒤 만료 · 다시 걸어야 함', { timeoutMs: 10000 })
    }
    if (remain <= 0) {
      m.ended = true
      if (m.events === 0) $.ui.toast("감시 '" + m.desc + "' 만료 · 이벤트 0건", { timeoutMs: 10000 })
    }
  }
  const view = viewSteps(steps)
  const cur = view.steps.findIndex((x) => x.state !== 'done' && x.state !== 'todo')
  const key = view.mode + ':' + (cur < 0 ? 'end' : cur)
  if (key !== lastStepKey) {
    const prev = lastStepKey
    lastStepKey = key
    if (prev && view.mode === 'impl') {
      if (cur < 0) {
        const n = leftList().length
        $.ui.toast('완료' + (lastDur ? ' ' + fmtDur(lastDur) : '') + (n ? ' · 띄운 것 ' + n + ' → /leftovers' : ''), { timeoutMs: 8000 })
      } else $.ui.toast(IMPL_STEPS[cur] + ' 단계', { timeoutMs: 4000 })
    }
  }
}

export function register(on) {
  on('session.start', async ($, e, next) => {
    // 시작 효과 판정을 가장 먼저 한다 — 뒤의 준비(툴 등록 등)를 기다리면 그동안 평소 띠가 먼저 보인다.
    try {
      cwd = e.cwd || (await $.session.cwd())
      home = (await $.env.get('HOME')) || ''
      await loadConfig($)
      family = repoFamily(cwd)
      repo = repoInfo(cwd)
      interactive = e.isInteractive === true && e.surface === 'terminal'
      introChoice = normalizeChoice(await $.store.get('intro'), INTRO_DEFAULT)
      clawdOn = (await $.store.get('clawd')) !== false
      const u = await $.session.usage()
      applyUsage(u.context, u.rateLimits)
      // 새로 연 대화형 세션에서만 재생한다. 이어 열기 · mod 다시 읽기는 시작 시각이 오래돼 대상이 아니다.
      if (interactive && introChoice.length && now() - u.startedAt < FRESH_MS) startIntro($, introChoice, true)
    } catch (err) {
      $.ui.log('cockpit: 시작 효과 준비 실패 ' + String(err), { to: 'debug' })
    } finally {
      booting = false
      $.ui.invalidate('ui.render')
    }
    sid = await $.session.id()
    // 쉼 시계는 세션마다 따로 간다. mod 를 다시 읽은 경우에만 이 세션이 남겨 둔 마지막 활동 시각을 되살린다.
    try {
      const base = '/tmp/.claude-cockpit/' + sid
      if ((await $.fs.exists(base)) && (await $.fs.exists(base + '.active'))) {
        lastActiveAt = restoreActive(now(), await $.fs.read(base), await $.fs.read(base + '.active'))
      }
    } catch (err) {
      $.ui.log('cockpit: 마지막 활동 시각 읽기 실패 ' + String(err), { to: 'debug' })
    }
    cwd = await $.session.cwd()
    model = modelLabel(await $.session.model())
    await loadOwned($)
    await $.tool.register({
      name: 'phase',
      description:
        '하네스 콕핏 띠에 지금 작업 단계를 알린다. 단계를 넘길 때 한 번 부른다. step: plan(플랜) · code(코드 범위) · impl(구현) · verify(검증) · done(완료) · research(조사) · organize(정리) · report(보고). detail 은 칩에 보일 짧은 진행 표시(예: E2E 3/8). state 는 active(기본) · wait(사용자 결정 대기) · fail(막힘).',
      inputSchema: {
        type: 'object',
        properties: {
          step: { type: 'string', enum: ['plan', 'code', 'impl', 'verify', 'done', 'research', 'organize', 'report'] },
          detail: { type: 'string' },
          state: { type: 'string', enum: ['active', 'wait', 'fail'] },
        },
        required: ['step'],
      },
    })
    await $.command.register({ name: 'leftovers', description: '이 세션이 띄운 것 목록 (세션을 닫기 전 확인)', immediate: true })
    await $.command.register({ name: 'cockpit', description: '콕핏 패널 열기 (워커 · 서브 · 감시 세로 목록)', immediate: true })
    await $.command.register({ name: 'fx', description: '새 세션 시작 효과 — 미리 보기 /fx 1 3 · 고르기 /fx use 1 3 · 끄기 /fx off', argumentHint: '[번호…|use 번호…|off]', immediate: true })
    await $.command.register({ name: 'clawd', description: '띠의 Clawd 켜기 · 끄기 (/clawd on|off, 인자 없으면 뒤집기)', argumentHint: '[on|off]', immediate: true })
    try {
      poll = normalizePoll(await $.store.get('poll'))
      skyOn = (await $.store.get('sky')) !== false
    } catch (err) {
      $.ui.log('cockpit: 폴링 주기 읽기 실패 ' + String(err), { to: 'debug' })
    }
    await $.command.register({ name: 'now', description: '지금까지 한 일 한눈에 — 모델을 부르지 않는다(토큰 0)', immediate: true })
    $.clock.every(150, () => {
      frame += 1
      const t = now()
      const fx = (bellAt && t - bellAt < 2600) || (flashAt && t - flashAt < 2250)
      // Clawd 는 띠를 다시 그리지 않고 그림 칸만 갈아 끼운다. 띠가 접혀 있으면 엔진이 거절하고 끝난다.
      // 잠든 세션은 1초에 한 번만 그린다(효과가 재생되는 동안은 평소 속도).
      if (clawdOn && bandId && (idleNow < 1 || fx || frame % 7 === 0 || moodNow() === 'party')) $.ui.blit({ requestId: bandId, key: 'clawd', cells: clawdNow() }).catch(() => {})
      // 반원: 정각 반짝임 동안은 매 프레임, 평소에는 1초에 한 번(가운데 점 깜빡임). 잠든 세션은 분이 바뀔 때만 달라진다.
      if (flashAt && t - flashAt < 2250) blitArc($)
      else if (frame % 7 === 0) blitArc($)
      if (frame % 7 === 0) everySecond($, t)
      // 띠 전체를 다시 그리는 것은 움직이는 것이 있을 때만: 작업 중(스피너 · 테두리 깜빡임) · 감시 중. 쉬는 동안은 5초에 한 번.
      if (animating() || work().working) $.ui.invalidate('ui.render')
      else if (frame % 35 === 0 && idleNow < 1) $.ui.invalidate('ui.render')
    })
    // 처음 한 번은 주기를 기다리지 않고 읽는다.
    refreshSurfaces($)
    if (flagOwned.size) refreshFlags($)
    everySecond($, now())
    return next(e)
  })

  on('session.attach', async ($, e, next) => {
    const r = await next(e)
    refreshSurfaces($)
    return r
  })

  on('session.detach', async ($, e, next) => {
    const r = await next(e)
    refreshSurfaces($)
    return r
  })

  on('turn.start', async ($, e, next) => {
    if (intro && intro.keep) endIntro($)
    busy = true
    busyGuess = false
    turnStart = now()
    lastActiveAt = turnStart
    turn = newTurn()
    turn.ctx0 = usage.ctx
    turn.h50 = usage.h5 ? usage.h5.pct : null
    toolLabel = ''
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    if (e.agentId) {
      const s = subs.get(e.agentId)
      if (s) {
        s.last = now()
        s.stallToasted = false
      }
    } else {
      if (e.model) model = modelLabel(e.model)
      if (e.effort !== undefined && e.effort !== null) effort = String(e.effort)
    }
    return yield* next(e)
  })

  on('turn.complete', async ($, e, next) => {
    if (e.agentId) {
      const s = subs.get(e.agentId)
      if (s) s.done = true
      lastActiveAt = now()
    } else {
      busy = false
      doneAt = now()
      lastActiveAt = doneAt
      lastDur = Math.round((e.durationMs || 0) / 1000)
      // 턴 영수증: 이 턴의 「Worked for …」 줄이 그려질 때 걸린 시간으로 찾아 붙인다.
      receipts.push({
        ms: e.durationMs || 0,
        id: '',
        text: fmtClock(doneAt) + ' · ' + receiptText({ tools: turn.tools, files: turn.files.size, fails: turn.fails, subs: turn.subs, mid: turn.mid, ctx0: turn.ctx0, ctx1: usage.ctx, h50: turn.h50, h51: usage.h5 ? usage.h5.pct : null }),
      })
      if (receipts.length > 40) receipts.shift()
      toolLabel = ''
      refreshPlan($)
      refreshGit($)
      lastRun.git = doneAt
    }
    $.ui.invalidate('ui.render')
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    applyUsage(e.context, e.rateLimits)
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r && r.agentId) {
      const t = now()
      subs.set(r.agentId, { name: e.subagentType || e.description || 'subagent', desc: e.description || '', start: t, last: t, done: false, stallToasted: false })
      turn.subs += 1
      if (e.tool_use_id) subByTool.set(e.tool_use_id, r.agentId)
      $.ui.invalidate('ui.render')
    }
    return r
  })

  on('tool.call', async ($, e, next) => {
    if (e.agentId) {
      const s = subs.get(e.agentId)
      if (s) {
        s.last = now()
        s.stallToasted = false
      }
    } else {
      const act = classifyTool(e.tool, e)
      if (act) {
        applyActivity(steps, act)
        if (act.kind === 'plan') refreshPlan($)
      }
      // 띠 밖: 이번 턴의 도구 수 · 고친 파일 · 지금 하는 일(스피너 줄 · /now · 턴 영수증에 쓴다). 단계 알림 툴은 세지 않는다.
      if (e.tool !== PHASE_TOOL) {
        turn.tools += 1
        const path = String(e.file_path || e.notebook_path || '')
        if (path && /^(Edit|Write|MultiEdit|NotebookEdit)$/.test(e.tool)) turn.files.add(path)
        const what = String(e.command || e.description || e.pattern || e.query || (path ? path.split('/').pop() : '') || '').split('\n')[0]
        toolLabel = (e.tool.startsWith('mcp__') ? e.tool.split('__').pop() : e.tool) + (what ? ' ' + what : '')
      }
      const scene = act ? ACT_SCENE[act.kind] : e.tool === 'Bash' ? 'run' : ''
      if (scene) {
        clawdAct = scene
        clawdActAt = now()
      }
    }
    if (e.tool === 'Monitor' && e.tool_use_id) {
      mons.set(e.tool_use_id, {
        desc: String(e.description || 'monitor'),
        timeoutMs: Math.min(Number(e.timeout_ms) || 300000, 3600000),
        start: now(),
        events: 0,
        last: '',
        lastAt: 0,
        ended: false,
        warned: false,
      })
    }
    // 이 세션의 툴 호출이 경보 파일을 만들면, 호출이 성공으로 끝난 직후 그 시각을 적고 바로 확인한다.
    // 다른 훅이 막았거나 실패한 호출은 만든 것이 아니다 — 그때 다른 세션의 플래그가 있어도 내 것으로 잡지 않는다.
    const madeFlags = flagsCreatedBy(e.tool, e)
    const afterFlags = (r) => {
      if (!madeFlags.length || !r || r.isError || r.deny) return
      const t = now()
      for (const label of madeFlags) flagTouched.set(label, t)
      refreshFlags($)
    }
    if (e.tool === 'Bash') {
      const name = dockerNameOf(e.command)
      if (name) dockers.add(name)
    }
    if (e.tool === 'mcp__playwright__browser_navigate') browserOpen = true
    if (e.tool === 'mcp__playwright__browser_close') browserOpen = false
    if (e.tool === 'AskUserQuestion') {
      asking += 1
      steps.waiting = true
      $.ui.invalidate('ui.render')
      try {
        return await next(e)
      } finally {
        asking = Math.max(0, asking - 1)
        steps.waiting = asking > 0
        $.ui.invalidate('ui.render')
      }
    }
    if (e.tool === 'Bash' && !e.agentId && !e.run_in_background) {
      clawdHold += 1
      try {
        const r = await next(e)
        const failed = !!(r && (r.isError || r.deny))
        noteBashResult(steps, e.command, failed)
        // Clawd: 실패하면 깜짝 놀라고, 커밋 · 푸시가 되면 동전을 먹는다.
        if (failed) turn.fails += 1
        if (failed) errAt = now()
        else if (/\bgit\s+(commit|push)\b/.test(String(e.command || ''))) coinAt = now()
        afterFlags(r)
        return r
      } finally {
        clawdHold = Math.max(0, clawdHold - 1)
        clawdActAt = now()
      }
    }
    if (madeFlags.length) {
      const r = await next(e)
      afterFlags(r)
      return r
    }
    return next(e)
  })

  // 이 mod 가 등록한 phase 툴. 띠의 단계 표시만 바꾸고 다른 동작은 하지 않는다.
  on('tool.call', { tool: PHASE_TOOL }, async ($, e) => {
    steps.override = { step: String(e.step || ''), detail: String(e.detail || ''), state: String(e.state || 'active') }
    $.ui.invalidate('ui.render')
    return { result: '띠 단계 표시를 ' + steps.override.step + (steps.override.detail ? ' · ' + steps.override.detail : '') + ' 로 바꿨다' }
  })

  on('tool.describe', { tool: PHASE_TOOL }, async ($, e) => {
    return { description: e.description, isDeferred: false }
  })

  // 백그라운드 작업 알림 · 다른 세션 메시지는 프롬프트로 들어온다(2.1.291 실측: session.receive 는
  // 이 경로에서 발생하지 않았다). 보기만 하고 내용은 바꾸지 않는다.
  on('prompt.submit', async ($, e, next) => {
    const text = String(e.text || '')
    if (!(e.origin && e.origin.kind === 'task-notification')) {
      submitAt = now()
      // 잠든 세션은 그림을 1초에 한 번만 갈아 끼운다. 엔터 효과가 잘리지 않게 바로 깨운다.
      if (idleNow !== 0) {
        idleNow = 0
        lastActiveAt = submitAt
        $.ui.invalidate('ui.render')
      }
    }
    // 사람이 보낸 프롬프트(터미널 · 원격)에 번호를 매긴다. 턴이 도는 중에 온 것은 「작업 도중」 으로 적는다.
    const kind = e.origin && e.origin.kind
    if ((kind === 'composer' || kind === 'bridge') && text.trim() && !text.trim().startsWith('/')) {
      promptSeq += 1
      prompts.push({ n: promptSeq, at: now(), mid: busy, text: text.trim().slice(0, 500) })
      if (prompts.length > 40) prompts.shift()
      if (busy) turn.mid += 1
      lastActiveAt = now()
    }
    if (/^\s*\[FLEET\/ROLLUP\]/.test(text)) rollupAt = now()
    if (e.origin && e.origin.kind === 'task-notification') {
      const n = parseTaskNotification(text)
      let m = n.toolUseId ? mons.get(n.toolUseId) : null
      if (!m && n.monitorDesc) m = [...mons.values()].find((x) => x.desc === n.monitorDesc && !x.ended) || null
      if (m) {
        if (n.event) {
          m.events += 1
          m.last = n.event.slice(0, 60)
          m.lastAt = now()
        }
        if (isEndStatus(n.status)) m.ended = true
        $.ui.invalidate('ui.render')
      }
    }
    return next(e)
  })

  // 턴이 끝날 때 엔진이 주는 진행 중 백그라운드 작업 목록으로 셸 · 감시를 맞춘다.
  on('classic.Stop', async ($, e, next) => {
    const tasks = Array.isArray(e.background_tasks) ? e.background_tasks : []
    // Monitor 도 셸 명령으로 돌아 목록에는 type shell 로 실린다(2.1.291 실측). 설명이 같은
    // 셸은 감시로 보고 띄운 것에서 뺀다 — 감시는 세션과 함께 끝나 닫기 전 정리 대상이 아니다.
    const monDescs = new Set([...mons.values()].map((m) => m.desc))
    shells = tasks
      .filter((x) => x.type === 'shell' && !monDescs.has(String(x.description || '')))
      .map((x) => String(x.description || x.command || x.id).slice(0, 40))
    const liveDescs = new Set(tasks.map((x) => String(x.description || '')))
    const t = now()
    for (const m of mons.values()) if (!m.ended && t - m.start > 5000 && !liveDescs.has(m.desc)) m.ended = true
    for (const [id, s] of subs) if (s.done && t - s.last > 60000) subs.delete(id)
    $.ui.invalidate('ui.render')
    return next(e)
  })

  // 세션 이름: 비어 있을 때만, 이미 있는 글자(손으로 지은 작업 대장 줄 이름 · 이슈 제목 앞 12자)로 한 번 붙인다.
  // /rename 과 같은 기록이 남는다(2026-10-08 실측). 손으로 붙인 이름은 건드리지 않는다.
  on('classic.UserPromptSubmit', async ($, e, next) => {
    sessionTitle = String(e.session_title || '')
    const r = await next(e)
    if (sessionTitle || titleTried || (e.source && e.source !== 'user')) return r
    const title = titleCandidate({ current: sessionTitle, issueTitle: issueFullTitle, lineName: wipLine.name, lineAuto: wipLine.auto })
    if (!title) return r
    titleTried = true
    return Object.assign({}, r || {}, { sessionTitle: title })
  })

  on('command.run', { command: 'leftovers' }, async ($) => {
    return { text: leftoversText(leftList()) }
  })

  // 띠 밖 ②: 모델을 부르지 않고 지금까지를 한눈에(토큰 0). 턴 도중에도 바로 답한다.
  on('command.run', { command: 'now' }, async ($) => {
    const t = now()
    const view = viewSteps(steps)
    const cur = view.steps.find((x) => x.state === 'active' || x.state === 'wait' || x.state === 'fail')
    return {
      text: nowText({
        issue: issue.key,
        step: cur ? cur.label : '',
        busy,
        turnSec: (t - turnStart) / 1000,
        subs: runningSubs(),
        mons: [...mons.values()].filter((m) => !m.ended).length,
        idle: idleNow >= 1 ? idleText(t, lastActiveAt) : '쉬는 중',
        turn: { tools: turn.tools, files: turn.files.size, fails: turn.fails, subs: turn.subs, mid: turn.mid, ctx0: turn.ctx0, ctx1: usage.ctx, h50: turn.h50, h51: usage.h5 ? usage.h5.pct : null },
        tool: busy ? toolLabel : '',
        left: { shells: shells.length, dockers: dockers.size, browser: browserOpen, unpushed },
        usage: { ctx: usage.ctx, h5: usage.h5 ? usage.h5.pct : null, d7: usage.d7 ? usage.d7.pct : null },
        prompts: prompts.slice(-8),
      }),
    }
  })

  on('command.run', { command: 'clawd' }, async ($, e) => {
    const arg = (e.args || '').trim()
    clawdOn = arg === 'on' ? true : arg === 'off' ? false : !clawdOn
    await $.store.set('clawd', clawdOn)
    $.ui.invalidate('ui.render')
    return { text: clawdOn ? 'Clawd 를 띠에 켰다' : 'Clawd 를 띠에서 껐다 — 다시 켜려면 /clawd on' }
  })

  on('command.run', { command: 'fx' }, async ($, e) => {
    const arg = (e.args || '').trim()
    const label = (ids) => (ids.length ? ids.map((id) => id + '. ' + FX[id].name).join(' + ') : '끔')
    if (arg === 'off' || /^use(\s|$)/.test(arg)) {
      const ids = arg === 'off' ? [] : parseIds(arg.slice(3))
      if (arg !== 'off' && !ids.length) return { text: '번호를 함께 적는다 — 예: /fx use 1 3' }
      introChoice = ids
      await $.store.set('intro', introChoice)
      return { text: ids.length ? '새 세션 시작 효과를 ' + label(ids) + ' 로 정했다 — 다음에 여는 세션부터 나온다' : '새 세션 시작 효과를 껐다 — 다시 켜려면 /fx use 1 3' }
    }
    if (arg === 'stop') {
      endIntro($)
      return { text: '멈췄다' }
    }
    const ids = parseIds(arg)
    if (!ids.length) {
      const list = Object.keys(FX).map((k) => '/fx ' + k + '  ' + FX[k].name + ' — ' + FX[k].note)
      return { text: ['지금 새 세션 시작 효과: ' + label(introChoice), ...list, '/fx 1 3  함께 미리 보기 · /fx use 1 3  새 세션에 쓸 효과 고르기 · /fx off  끄기'].join('\n') }
    }
    startIntro($, ids, false)
    return { text: label(ids) + ' 미리 보기' }
  })

  // 사용자의 명령으로 여는 패널은 폭과 상관없이 그려지고, 엔진이 「요청한 패널」로 기억해
  // 이후 스스로 여는 경우에도 110칸부터 그린다. 127칸 같은 창에서 워커 목록을 보려면 한 번 필요하다.
  on('command.run', { command: 'cockpit' }, async ($, e) => {
    const a = String(e.args || '').trim().split(/\s+/).filter(Boolean)
    // /cockpit config — 읽힌 설정 요약 · /cockpit config reload — 설정 파일을 다시 읽는다.
    if (a[0] === 'config') {
      if (a[1] === 'reload') {
        await loadConfig($)
        family = repoFamily(cwd)
        repo = repoInfo(cwd)
        sunDay = ''
        $.ui.invalidate('ui.render')
      }
      return { text: configText(getConfig(), configPath(), configFound) }
    }
    // /cockpit poll — 요소별 폴링 주기 보기 · 바꾸기(저장된다).
    if (a[0] === 'poll') {
      if (a.length < 3) return { text: pollText(poll) }
      const r = setPoll(poll, a[1], a[2])
      if (r.ok) {
        poll = r.poll
        await $.store.set('poll', poll)
      }
      return { text: r.msg }
    }
    // /cockpit sky on|off — Clawd 뒤 하늘을 켜고 끈다(저장된다).
    if (a[0] === 'sky') {
      // /cockpit sky morning|day|sunset|night — 그 시간대를 미리 본다 · /cockpit sky auto — 지금 시각으로 돌아간다.
      if (SKY_PHASES.includes(a[1]) || a[1] === 'auto') {
        skyForce = a[1] === 'auto' ? '' : a[1]
        skyOn = true
        $.ui.invalidate('ui.render')
        return { text: skyForce ? '하늘을 ' + skyForce + ' 로 미리 본다 — 돌아가려면 /cockpit sky auto' : '하늘이 지금 시각을 따른다' }
      }
      if (a[1] !== 'on' && a[1] !== 'off') return { text: '/cockpit sky on|off — 켜고 끄기(저장) · /cockpit sky morning|day|sunset|night — 미리 보기 · /cockpit sky auto — 지금 시각' }
      skyOn = a[1] === 'on'
      await $.store.set('sky', skyOn)
      $.ui.invalidate('ui.render')
      return { text: skyOn ? 'Clawd 뒤 하늘을 켰다' : 'Clawd 뒤 하늘을 껐다 — 다시 켜려면 /cockpit sky on' }
    }
    // /cockpit idle <잠 초> <흐림 초> — 쉼 기준을 이 세션에서만 줄여 본다(시험용 · 저장하지 않는다). 인자 없으면 되돌린다.
    if (a[0] === 'idle' && a.length === 1) {
      const t = now()
      const sec = Math.max(0, Math.floor((t - lastActiveAt) / 1000))
      const d = new Date(lastActiveAt)
      const two = (n) => String(n).padStart(2, '0')
      const c = Object.assign({ dozeMs: 5 * 60000, sleepMs: 15 * 60000, dimMs: 60 * 60000 }, idleCfg || {})
      return {
        text:
          '이 세션의 마지막 활동 ' + two(d.getHours()) + ':' + two(d.getMinutes()) + ':' + two(d.getSeconds()) + ' (' + Math.floor(sec / 60) + '분 ' + (sec % 60) + '초 전) · 쉼 단계 ' + idleNow + (isDozing(t, lastActiveAt, work().working, idleCfg) ? '(조는 중)' : '') +
          ' · 기준 ' + Math.round(c.dozeMs / 1000) + '초에 졸음 · ' + Math.round(c.sleepMs / 1000) + '초에 잠 · ' + Math.round(c.dimMs / 1000) + '초에 흐림\n쉼 시계는 세션마다 따로 갑니다. 기준 바꾸기(이 세션만 · 시험용): /cockpit idle <잠 초> <흐림 초> · 되돌리기: /cockpit idle reset',
      }
    }
    if (a[0] === 'idle') {
      const sleep = Number(a[1])
      const dim = Number(a[2])
      // 졸음 기준은 잠 기준의 3분의 1로 같이 줄인다(기본 5분 · 15분의 비율).
      idleCfg = sleep > 0 && dim > sleep ? { dozeMs: Math.round((sleep * 1000) / 3), sleepMs: sleep * 1000, dimMs: dim * 1000 } : null
      return { text: idleCfg ? '쉼 기준을 이 세션에서만 졸음 ' + Math.round(sleep / 3) + '초 · 잠 ' + sleep + '초 · 흐림 ' + dim + '초로 바꿨다' : '쉼 기준을 졸음 5분 · 잠 15분 · 흐림 60분으로 되돌렸다' }
    }
    // /cockpit fx bell|hour — 정해진 시각 · 정각 효과를 지금 한 번 재생한다.
    if (a[0] === 'fx') {
      if (a[1] === 'party' || a[1] === 'gloom') {
        moodForce = a[1]
        moodForceUntil = now() + 10000
        return { text: (a[1] === 'party' ? '퇴근 직전 기분(선글라스 · 춤)' : '퇴근이 늦어진 기분(우울)') + '을 10초 동안 미리 본다' }
      }
      if (a[1] === 'bell') bellAt = now()
      else if (a[1] === 'hour') flashAt = now()
      else return { text: '/cockpit fx bell — 정해진 시각 효과(Clawd 종) · /cockpit fx hour — 정각 효과(해 반짝) · /cockpit fx party — 퇴근 직전 · /cockpit fx gloom — 퇴근이 늦어질 때' }
      return { text: a[1] === 'bell' ? '정해진 시각 효과(Clawd 종) 재생' : '정각 효과(해 반짝) 재생' }
    }
    paneAsked = true
    paneUserClosed = false
    paneOpen = true
    try {
      const r = await $.ui.open({ id: PANE_ID, title: '콕핏', columns: 28, rows: 2 })
      return { text: r && r.isPlaced ? '콕핏 패널을 열었다 — 이제 110칸 이상이면 저절로 열린다(손으로 닫으면 다시 /cockpit)' : '콕핏 패널을 열지 못했다: ' + String((r && r.reason) || '') }
    } catch (err) {
      paneOpen = false
      return { text: '콕핏 패널을 열지 못했다: ' + String(err) }
    }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === PANE_ID) {
      paneOpen = false
      paneInline = false
      if (e.origin && e.origin.kind === 'person') {
        paneUserClosed = true
        paneAsked = false
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    if (e.viewport && e.viewport.columns) lastViewportCols = e.viewport.columns
    const E = $.ui.resolve(e)
    bandId = e.requestId || ''
    bodyCols = e.props.bodyColumns || 0
    if (booting && Date.now() - loadedAt < 3000) return bootCard(E, clawdOn)
    const snap = snapshot(e.props.bodyColumns)
    arcShown = snap.arc.cells
    const mine = band(E, snap, viewSteps(steps))
    if (!intro) return mine
    // 부팅 스윕(1)은 재생하는 동안 띠 자리를 대신하고, 나머지 효과는 그 위에 얹는다.
    // 띠 · 스윕 카드가 테두리까지 4줄을 쓰므로 그만큼 뺀 높이로 그림 크기를 고른다.
    const ms = now() - intro.start
    const lay = introLayout(intro.ids, ms, intro.keep)
    intro.ctx.usage = usageForFx()
    const cols = e.props.bodyColumns
    const bottom = lay.sweep ? draw(E, 1, intro.ctx, ms, cols, e.props.maxRows) : mine
    if (!lay.above.length) return bottom
    return E.Box({ flexDirection: 'column', children: [...lay.above.map((id) => draw(E, id, intro.ctx, ms, cols, e.props.maxRows - 4)), bottom] })
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE_ID) return next(e)
    paneInline = e.props.placement === 'inline'
    const E = $.ui.resolve(e)
    return pane(E, snapshot(e.props.bodyColumns))
  })

  on('ui.render', { component: 'ToolUse' }, async ($, e, next) => {
    if (e.props.tool !== 'Agent') return next(e)
    const agentId = subByTool.get(e.props.tool_use_id)
    const s = agentId ? subs.get(agentId) : null
    if (!s || s.done) return next(e)
    const E = $.ui.resolve(e)
    const theirs = await next(e)
    const t = now()
    return E.Box({ flexDirection: 'column', children: [theirs, agentStatus(E, Object.assign({}, s, { status: subStatus(s, t) }), t, frame)] })
  })

  on('ui.render', { component: 'UserMessage' }, async ($, e, next) => {
    const task = e.props.task
    if (!e.props.isExpanded && task && task.toolUseId) {
      const m = mons.get(task.toolUseId)
      if (m) {
        const E = $.ui.resolve(e)
        const n = parseTaskNotification(e.props.text)
        return monitorLine(E, m.desc, n.summary, m.lastAt || now())
      }
    }
    // 띠 밖 ⑤(프롬프트 번호와 시각)는 이 줄에 붙이지 못했다 — 훅은 불리지만 돌려준 글자 · 트리가 내 프롬프트 줄에는 그려지지 않았고
    // 거절 기록도 없었다(2.1.293 · 전체 화면 · focus 보기 실측 2026-10-08). 번호 · 시각 · 「작업 도중」 은 `/now` 의 프롬프트 목록으로 본다.
    return next(e)
  })

  // 띠 밖 ①: 스피너 줄 끝에 지금 단계 · 돌리는 일 · 몇 번째 도구인지. 도구 줄을 접어 둔 보기에서 턴 동안 보이는 유일한 진행 글자다.
  // 엔진이 낱말 바로 뒤에 그리는 꼬리(suffix)에 이어 적는다 — 줄의 나머지(경과 시간 · 토큰)는 엔진이 그대로 그린다.
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    // 스피너는 턴이 도는 동안에만 그려진다. mod 를 턴 도중에 다시 읽으면 busy 가 지워져 「완료」 로 보이므로, 스피너를 보고 되살린다.
    // 턴이 끝난 직후의 마지막 그리기에 속지 않게 끝난 뒤 2초는 보지 않고, 스피너가 3초 넘게 안 그려지면 everySecond 가 되돌린다.
    // 슬래시 명령도 잠깐 스피너를 그리므로, 2초 넘게 이어질 때만 턴으로 본다.
    const t = now()
    if (t - spinAt > 1000) spinFirst = t
    spinAt = t
    if (!busy && t - spinFirst >= 2000 && t - doneAt > 2000) {
      busy = true
      busyGuess = true
      turnStart = spinFirst
      $.ui.invalidate('ui.render')
    }
    if (!busy) return next(e)
    const view = viewSteps(steps)
    const cur = view.steps.find((x) => x.state === 'active' || x.state === 'wait' || x.state === 'fail')
    const tail = spinnerTail({ step: cur ? cur.label : '', tool: toolLabel, tools: turn.tools, mid: turn.mid })
    if (!tail) return next(e)
    return next(Object.assign({}, e, { props: Object.assign({}, e.props, { suffix: (e.props.suffix || '…') + ' ' + tail }) }))
  })

  // 띠 밖 ③: 턴이 끝난 줄(「Worked for …」) 끝에 그 턴의 영수증. 줄마다 한 번 정해지면 바뀌지 않는다.
  // 엔진 줄은 폭을 다 차지해 옆에 글자를 세울 자리가 없다(나란히 두면 눌리거나 화면 밖으로 밀린다 — 2026-10-08 실측).
  // 그래서 영수증이 있는 줄은 같은 모양의 한 줄을 직접 그린다(낱말 · 걸린 시간 · 끝난 시각 · 영수증). 영수증이 없는 옛 줄은 엔진 그림 그대로다.
  on('ui.render', { component: 'TurnDuration' }, async ($, e, next) => {
    const id = e.requestId || ''
    const ms = e.props.durationMs || 0
    let r = id ? receipts.find((x) => x.id === id) : null
    if (!r && id) {
      r = receipts.find((x) => !x.id && Math.abs(x.ms - ms) < 150) || null
      if (r) r.id = id
    }
    if (!r) return next(e)
    const E = $.ui.resolve(e)
    return E.Text({ color: 'inactive', wrap: 'truncate-end', children: ['✻ ' + e.props.word + ' for ' + fmtDur(ms / 1000) + ' · ' + r.text] })
  })

  // 띠 밖 ④: 입력칸 아래 줄 끝에 「남은 것」. 쉬는 동안, 남은 것이 있을 때만 붙는다(엔진이 흐리게 그린다).
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (e.props.isWorking || e.props.isDraft) return next(e)
    const tail = hintTail({ shells: shells.length, dockers: dockers.size, browser: browserOpen, unpushed })
    if (!tail) return next(e)
    return next(Object.assign({}, e, { props: Object.assign({}, e.props, { tail }) }))
  })
}
