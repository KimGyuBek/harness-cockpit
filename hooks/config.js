// 쓰는 사람의 환경에 맞추는 값. `~/.claude/harness-cockpit.json` 을 register.js 가 읽어 setConfig 로 넘긴다.
// 순수 로직 — `$` 를 받지 않는다. 부재 시 동작: 파일이 없으면 아래 기본값으로 돌고, 해당 기능(레포 이름표 · 경보 · 작업 대장 · 워커)만 빠진다.

const DEFAULT_BRANCH_KEY = '[A-Z][A-Z0-9]+-[0-9]+'
const DEFAULT_ISSUE_KEY = '^[A-Z][A-Z0-9]*-[0-9]+$'

function compile(src, flags) {
  if (typeof src !== 'string' || !src) return null
  try {
    return new RegExp(src, flags || '')
  } catch {
    return null
  }
}

function expand(path, home) {
  const p = String(path || '')
  return p.startsWith('~/') ? String(home || '') + p.slice(1) : p
}

const str = (v) => (typeof v === 'string' ? v : '')

// 깨진 항목(정규식 오류 · 빠진 값)은 그 항목만 버린다 — 설정 파일 한 줄 때문에 띠 전체가 멈추면 안 된다.
export function normalizeConfig(raw, home) {
  const r = raw && typeof raw === 'object' ? raw : {}
  const repos = []
  for (const x of Array.isArray(r.repos) ? r.repos : []) {
    const re = compile(x && x.match)
    if (!re) continue
    const family = x.family === 'red' || x.family === 'blue' ? x.family : ''
    repos.push({ re, name: str(x.name), color: str(x.color), family, brand: str(x.brand), word: str(x.word) })
  }
  const alertFiles = []
  for (const x of Array.isArray(r.alertFiles) ? r.alertFiles : []) {
    if (x && typeof x.path === 'string' && x.path.startsWith('/') && str(x.label)) alertFiles.push({ path: x.path, label: x.label })
  }
  const a = r.alert && typeof r.alert === 'object' ? r.alert : {}
  const i = r.issue && typeof r.issue === 'object' ? r.issue : {}
  const cmd = Array.isArray(i.boardCommand) && i.boardCommand.length && i.boardCommand.every((s) => typeof s === 'string' && s) ? i.boardCommand.map((s) => expand(s, home)) : null
  const w = r.serviceWindow && typeof r.serviceWindow === 'object' ? r.serviceWindow : null
  const hour = (v) => (Number.isInteger(v) && v >= 0 && v <= 24 ? v : null)
  const serviceWindow = w && str(w.label) && hour(w.startHour) !== null && hour(w.endHour) !== null && w.startHour < w.endHour ? { label: w.label, start: w.startHour, end: w.endHour } : null
  // "HH:MM" → 자정부터의 분. 틀린 값은 null.
  const hm = (v) => {
    const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(str(v))
    return m ? Number(m[1]) * 60 + Number(m[2]) : null
  }
  const loc = r.location && typeof r.location === 'object' ? r.location : null
  const num = (v, lo, hi) => (typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : null)
  const location = loc && num(loc.lat, -66, 66) !== null && num(loc.lon, -180, 180) !== null ? { lat: loc.lat, lon: loc.lon } : null
  const tx = r.texts && typeof r.texts === 'object' ? r.texts : {}
  return {
    repos,
    alertFiles,
    // 글귀 몇 개는 쓰는 사람의 말버릇에 맞출 수 있다. 없으면 아래 기본 글귀다.
    texts: {
      leftClear: str(tx.leftClear) || '띄운 것 없음 — 세션을 닫아도 된다',
      leftBusy: str(tx.leftBusy) || '닫기 전에 정리한다',
      leftPane: str(tx.leftPane) || '닫기 전 정리 필요',
      boardHint: str(tx.boardHint),
    },
    // 일출 · 일몰을 계산할 위치(위도 · 경도). 없으면 06:00 · 18:00 으로 고정한다.
    location,
    // 퇴근 시각(자정부터의 분)과 종을 칠 시각들(평일). 종은 기본으로 없다.
    quitMin: hm(r.quitTime) === null ? 18 * 60 : hm(r.quitTime),
    bells: (Array.isArray(r.bells) ? r.bells : []).map(hm).filter((v) => v !== null),
    // 「검증」 단계로 볼 명령을 더한다(정규식). 기본 목록(jest · vitest · npm test 등)에 얹는다.
    verifyRe: compile(str(r.verifyCommand)),
    // 평일 정해진 시간대에만 켜지는 것(예: 개발 서버)의 이름과 시간. 시작 효과의 브리핑 카드에 한 줄로 나온다. 없으면 그 줄이 빠진다.
    serviceWindow,
    alert: { title: str(a.title) || '경보 파일', note: str(a.note) },
    branchKeyRe: compile(str(r.branchKey) || DEFAULT_BRANCH_KEY, str(r.branchKey) ? str(r.branchKeyFlags) : '') || compile(DEFAULT_BRANCH_KEY),
    issue: {
      boardCommand: cmd,
      boardLineDir: expand(str(i.boardLineDir), home),
      mcpServer: i.mcpServer === undefined ? 'linear' : str(i.mcpServer),
      keyRe: compile(str(i.keyPattern) || DEFAULT_ISSUE_KEY) || compile(DEFAULT_ISSUE_KEY),
    },
    fleetRoot: expand(str(r.fleetRoot), home),
  }
}

let cfg = normalizeConfig(null, '')

export function setConfig(raw, home) {
  cfg = normalizeConfig(raw, home)
  return cfg
}

export function getConfig() {
  return cfg
}

// `/cockpit config` 가 찍는 한 줄 요약.
export function configText(c, path, found) {
  const n = (list, pick) => list.filter(pick).length
  return [
    '설정 파일 ' + path + (found ? '' : ' — 없음(기본값으로 동작)'),
    '  레포 이름표 ' + n(c.repos, (x) => x.name) + ' · 계열 색 ' + n(c.repos, (x) => x.family) + ' · 시작 효과 이름 ' + n(c.repos, (x) => x.brand || x.word) + ' · 경보 파일 ' + c.alertFiles.length + ' · 가동 시간대 ' + (c.serviceWindow ? c.serviceWindow.label : '없음'),
    '  위치 ' + (c.location ? '설정됨' : '없음(일출 06:00 · 일몰 18:00 고정)') + ' · 퇴근 ' + String(Math.floor(c.quitMin / 60)).padStart(2, '0') + ':' + String(c.quitMin % 60).padStart(2, '0') + ' · 종 ' + (c.bells.length ? c.bells.length + '개' : '없음'),
    '  브랜치 키 /' + c.branchKeyRe.source + '/' + c.branchKeyRe.flags + ' · 작업 대장 명령 ' + (c.issue.boardCommand ? '있음' : '없음') + ' · 이슈 조회 MCP ' + (c.issue.mcpServer || '없음') + ' · 워커 기록 ' + (c.fleetRoot ? '있음' : '없음'),
    '고친 뒤 다시 읽기: /cockpit config reload',
  ].join('\n')
}
