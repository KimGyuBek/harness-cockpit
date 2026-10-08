// 요소별 폴링 주기와, 폴링으로 읽은 글자를 값으로 바꾸는 순수 로직. `$` 를 받지 않는다.
// 이벤트로 알 수 있는 것(턴 · 툴 · 서브에이전트 · 프롬프트 · 원격 연결)은 폴링하지 않는다. 여기 있는 것은 밖에서 바뀌어 물어봐야만 아는 값이다.

// 초 단위. 자주 바뀌고 싸게 읽히는 것은 촘촘히, 느리게 바뀌거나 비싼 것은 듬성듬성.
export const POLL_DEFAULT = { sys: 5, awake: 30, usage: 60, flags: 5, git: 60, fleet: 30, linear: 600 }
// 이보다 촘촘하게는 받지 않는다(맥 자원 한 번 읽기에 1초가 걸린다).
export const POLL_MIN = { sys: 2, awake: 10, usage: 15, flags: 2, git: 15, fleet: 10, linear: 60 }
export const POLL_LABEL = {
  sys: '맥 자원(CPU · 메모리) — 한 세션만 재고 나머지는 그 값을 읽는다',
  awake: '화면 안 꺼짐(caffeinate) — 한 세션만 잰다',
  usage: '토큰 한도(5h · 7d) — 컨텍스트는 턴마다 이벤트로 받는다',
  flags: '경보 파일 — 이 세션이 만든 것이 있을 때만',
  git: '브랜치 · 변경 수 · 미push — 턴이 끝날 때도 읽는다',
  fleet: '워커 — 워커 기록이 있는 세션일 때만',
  linear: '이슈 제목 — 이슈가 바뀌면 바로 읽는다',
}
// 잠든 세션(오래 쉰 세션)은 주기를 이만큼 늘린다. 경보 파일 확인은 늘리지 않는다.
export const SLEEP_FACTOR = 6

// 저장된 값(없거나 깨진 값 포함)을 기본값 위에 얹고 하한으로 자른다.
export function normalizePoll(saved) {
  const out = Object.assign({}, POLL_DEFAULT)
  if (saved && typeof saved === 'object') {
    for (const k of Object.keys(POLL_DEFAULT)) {
      const v = Number(saved[k])
      if (Number.isFinite(v) && v > 0) out[k] = Math.max(POLL_MIN[k], Math.round(v))
    }
  }
  return out
}

// `/cockpit poll <요소> <초>` 의 한 건. 모르는 요소 · 숫자가 아닌 값은 바꾸지 않고 이유를 돌려준다.
export function setPoll(cur, key, value) {
  if (!(key in POLL_DEFAULT)) return { ok: false, poll: cur, msg: '모르는 요소: ' + key + ' — ' + Object.keys(POLL_DEFAULT).join(' · ') + ' 중에서 고른다' }
  if (value === 'reset' || value === '기본') return { ok: true, poll: Object.assign({}, cur, { [key]: POLL_DEFAULT[key] }), msg: key + ' 를 기본값 ' + POLL_DEFAULT[key] + '초로 되돌렸다' }
  const v = Number(value)
  if (!Number.isFinite(v) || v <= 0) return { ok: false, poll: cur, msg: '초는 0보다 큰 숫자로 적는다 — 예: /cockpit poll sys 3' }
  const sec = Math.max(POLL_MIN[key], Math.round(v))
  const note = sec !== Math.round(v) ? ' (하한 ' + POLL_MIN[key] + '초로 맞춤)' : ''
  return { ok: true, poll: Object.assign({}, cur, { [key]: sec }), msg: key + ' 주기를 ' + sec + '초로 바꿨다' + note }
}

export function pollText(poll) {
  const lines = ['요소별 폴링 주기 — 바꾸기: /cockpit poll <요소> <초> · 되돌리기: /cockpit poll <요소> reset']
  for (const k of Object.keys(POLL_DEFAULT)) lines.push('  ' + k.padEnd(7) + String(poll[k]).padStart(4) + '초' + (poll[k] !== POLL_DEFAULT[k] ? ' (기본 ' + POLL_DEFAULT[k] + ')' : '') + '  ' + POLL_LABEL[k])
  lines.push('폴링하지 않는 것: 작업 중 · 단계 · 도구 수 · 서브에이전트 · 컨텍스트 · 원격 연결 · 세션 이름(이벤트) · 반원 · 퇴근 숫자 · 정각 효과(분이 바뀔 때)')
  return lines.join('\n')
}

export function due(now, last, sec) {
  return !last || now - last >= sec * 1000
}

// 맥 자원을 읽는 명령. iostat 는 1초 동안의 실제 CPU 사용률을, memory_pressure 는 여유 메모리 비율을, sysctl 은 커널의 메모리 압력 단계를 준다.
// ps · top 보다 싸다(한 번에 CPU 13ms쯤 · 실측 2026-10-08).
export const SYS_CMD = '/usr/sbin/iostat -c 2 -w 1 | /usr/bin/tail -1; /usr/bin/memory_pressure -Q | /usr/bin/tail -1; /usr/sbin/sysctl -n kern.memorystatus_vm_pressure_level'

// SYS_CMD 출력 → { cpu(%), memUsed(%), pressure(1 정상 · 2 경고 · 4 위험) }. 읽지 못하면 null.
export function parseSys(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length < 2) return null
  // iostat 마지막 줄: … us sy id 1m 5m 15m — 디스크 수에 따라 앞 열 개수가 달라 뒤에서 센다.
  const io = lines[0].split(/\s+/).map(Number)
  if (io.length < 6 || io.some((n) => !Number.isFinite(n))) return null
  const idle = io[io.length - 4]
  const m = /free percentage:\s*(\d+)%/.exec(lines[1])
  if (!m || idle < 0 || idle > 100) return null
  const pressure = lines[2] && /^\d+$/.test(lines[2]) ? Number(lines[2]) : 1
  return { cpu: Math.round(100 - idle), memUsed: 100 - Number(m[1]), pressure }
}

// CPU 는 순간값이 튀므로 직전 값과 반씩 섞어 쓴다(두세 번 연속으로 높아야 단계가 오른다).
export function smoothCpu(prev, cpu) {
  return prev === null || prev === undefined ? cpu : Math.round(prev * 0.5 + cpu * 0.5)
}

// CPU 는 세션을 여는 순간처럼 몇 초씩 튄다. 높음은 80% 이상이 30초, 위험은 95% 이상이 60초 이어질 때만 인정한다.
// hist: 최근 표본 [{ ts, cpu }] (오래된 것부터). 창의 8할 이상을 덮는 표본이 모두 기준을 넘어야 한다.
export function sustain(hist, now) {
  const over = (ms, th) => {
    const w = (hist || []).filter((h) => now - h.ts <= ms)
    return w.length >= 2 && now - w[0].ts >= ms * 0.8 && w.every((h) => h.cpu >= th)
  }
  return { hi: over(30000, 80), crit: over(60000, 95) }
}

// 0 평소 · 1 주의 · 2 높음 · 3 위험. 기준은 확정 시안의 안(案)이다.
// 주의: CPU 50%(직전 값과 섞은 값) 또는 메모리 75% · 높음: CPU 80% 가 30초 또는 메모리 85% 또는 압력 경고 · 위험: CPU 95% 가 60초 또는 메모리 93% 또는 압력 위험.
export function sysLevel(s, cpu, held) {
  if (!s) return 0
  const c = cpu === null || cpu === undefined ? s.cpu : cpu
  const h = held || { hi: false, crit: false }
  if (h.crit || s.memUsed >= 93 || s.pressure >= 4) return 3
  if (h.hi || s.memUsed >= 85 || s.pressure >= 2) return 2
  if (c >= 50 || s.memUsed >= 75) return 1
  return 0
}

// `pmset -g assertions` 출력에서 caffeinate 가 화면 잠자기를 막고 있는지 본다.
// 턴이 도는 동안 Claude Code 가 거는 caffeinate 는 시스템 잠자기만 막으므로(화면은 꺼진다) 여기에 잡히지 않는다.
export function parseAwake(text) {
  return /pid \d+\(caffeinate\):.*PreventUserIdleDisplaySleep/.test(String(text || ''))
}

// 여러 세션이 같은 값을 따로 재지 않게, 캐시 파일을 보고 「이번에는 내가 잰다」를 정한다.
// 마지막으로 잰 세션이 계속 재고, 그 세션이 사라져 값이 주기의 2.2배보다 낡으면 먼저 본 세션이 이어받는다.
export function shouldSample(cache, now, sid, sec) {
  if (!cache || !Number.isFinite(Number(cache.ts))) return true
  const age = now - Number(cache.ts)
  // 재는 데 1초쯤 걸리고 값은 다 잰 뒤에 적히므로, 재던 세션은 주기의 6할만 지나도 다시 잰다(주기를 꽉 채우길 기다리면 간격이 두 배가 된다).
  if (cache.by === sid) return age >= sec * 600
  return age >= sec * 2200
}
