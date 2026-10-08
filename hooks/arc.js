// 띠 오른쪽의 반원(해 · 달이 지나는 길)과 그 안의 퇴근 숫자, 아래 주간 띠. 순수 로직 — `$` 를 받지 않는다.
// 반원은 점자 글자(한 칸에 점 2 × 4)로 찍고, 숫자는 그림 칸에 한글이 못 들어가서 ASCII 만 쓴다.

export const ARC_COLS = 14
export const ARC_ROWS = 2
// 퇴근 시각(자정부터의 분)의 기본값. 평일만 센다. 설정의 quitTime 으로 바꾼다.
export const QUIT_MIN = 18 * 60
// 정해진 시각 효과(Clawd 종)의 기본값 — 없음. 설정의 bells 로 넣는다(평일에만 울린다).
export const BELLS_DEFAULT = []
// 위치가 설정에 없을 때 쓰는 일출 · 일몰.
export const SUN_FIXED = { rise: 6 * 60, set: 18 * 60 }
export const DAY_KO = ['일', '월', '화', '수', '목', '금', '토']

const DEF = 0x01000000
const BRL = [
  [0x01, 0x08],
  [0x02, 0x10],
  [0x04, 0x20],
  [0x40, 0x80],
]
// 그림 칸의 색은 테마를 따라가지 못한다(숫자 색만 받는다). 그래서 밝은 바탕 · 어두운 바탕 어디서나 읽히는 중간 밝기만 쓴다
// (흰 바탕 · 어두운 바탕 모두에서 대비 2.4 이상).
const TC = { dim: 0x7b8491, green: 0x3fae58, lime: 0x74ad2c, yellow: 0xcf9400, orange: 0xe0762b, red: 0xf0506e, purple: 0x9b72e8 }
const MOON = 0x8f9bd9
const REST = 0x7b8491
const FLASH = 0xff6b00

// 그날의 일출 · 일몰(자정부터의 분). 위도 · 경도 · 시간대(UTC 와의 차 · 시간)를 받는다. NOAA 간이식이라 2~3분쯤 어긋날 수 있다.
export function sunTimes(year, month, day, lat, lon, tzHours) {
  const n = Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / 86400000)
  const g = ((2 * Math.PI) / 365) * (n - 1)
  const eq = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g))
  const decl =
    0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g)
  const rad = Math.PI / 180
  const cosH = Math.cos(90.833 * rad) / (Math.cos(lat * rad) * Math.cos(decl)) - Math.tan(lat * rad) * Math.tan(decl)
  const ha = Math.acos(Math.max(-1, Math.min(1, cosH))) / rad
  const noon = 720 - 4 * lon - eq + tzHours * 60
  return { rise: Math.round(noon - 4 * ha), set: Math.round(noon + 4 * ha) }
}

// 퇴근까지 남은 시간. 주말과 퇴근 5시간 뒤부터는 표시하지 않는다(off).
// 색은 가까울수록 회색 → 초록 → 연두 → 노랑 → 주황 → 빨강. 마지막 10분과 퇴근 직후 10분은 깜빡인다.
// 남은 시간은 「4h20m」 · 「42m」 처럼 길이로 적는다 — 「4:20」 으로 적으면 지금 시각처럼 읽힌다.
// 그림 칸에 한글이 못 들어가서 퇴근 시각에는 「0m」 을 초록으로 깜빡이고, 그 뒤에는 넘긴 시간을 보라색으로 보인다.
export function quitTimer(min, dow, end = QUIT_MIN) {
  if (dow === 0 || dow === 6) return { off: true }
  const fmt = (m) => (m >= 60 ? Math.floor(m / 60) + 'h' + String(Math.floor(m % 60)).padStart(2, '0') + 'm' : Math.floor(m) + 'm')
  const rem = end - min
  if (rem <= 0) {
    const over = -rem
    if (over > 300) return { off: true }
    return over < 10 ? { text: '0m', color: TC.green, blink: true, done: true } : { text: '+' + fmt(over), color: TC.purple, blink: false, done: true }
  }
  const color = rem > 240 ? TC.dim : rem > 120 ? TC.green : rem > 60 ? TC.lime : rem > 30 ? TC.yellow : rem > 10 ? TC.orange : TC.red
  return { text: fmt(rem), color, blink: rem <= 10, done: false }
}

// 해 색: 뜰 때 주홍 → 오전 귤빛 → 한낮 호박빛 → 오후 주황 → 질 때 붉은 주황. 노랑 · 흰빛은 밝은 바탕에서 안 보여 쓰지 않는다.
export function sunColor(f) {
  return f < 0.07 ? 0xff7d52 : f < 0.22 ? 0xf08a24 : f < 0.62 ? 0xe08a00 : f < 0.8 ? 0xe8801a : f < 0.93 ? 0xf07030 : 0xff6336
}

// 반원 위에서 해(낮) · 달(밤)이 지금 어디쯤인지(0 왼쪽 끝 ~ 1 오른쪽 끝).
export function orbit(min, rise, set) {
  const day = min >= rise && min < set
  const span = day ? set - rise : 1440 - (set - rise)
  const f = day ? (min - rise) / span : ((min - set + 1440) % 1440) / span
  return { day, f: Math.max(0, Math.min(1, f)) }
}

// o: { min, rise, set, timer(quitTimer 결과 또는 없음), tick(초 단위 위상 — 홀수일 때 깜빡임이 꺼진 쪽), flash(정각 반짝임 위상 — 홀수일 때 밝음) }
// 돌려주는 값은 Raster cells 에 넣을 [글자, 글자색, 바탕색] u32 배열(14 × 2칸).
export function arcWords(o) {
  const cols = ARC_COLS
  const rows = ARC_ROWS
  const W = cols * 2
  const H = rows * 4
  const { day, f } = orbit(o.min, o.rise, o.set)
  const bright = (o.flash || 0) % 2 === 1
  const orb = day ? sunColor(f) : MOON
  const bits = new Array(cols * rows).fill(0)
  const lit = new Array(cols * rows).fill(false)
  const at = (g) => [Math.round(1 + g * (W - 3)), Math.round(H - 1 - Math.sin(Math.PI * g) * (H - 1))]
  for (let i = 0; i <= 80; i += 1) {
    const g = i / 80
    const [x, y] = at(g)
    const k = (y >> 2) * cols + (x >> 1)
    bits[k] |= BRL[y & 3][x & 1]
    if (g <= f) lit[k] = true
  }
  const words = new Uint32Array(cols * rows * 3)
  const put = (c, r, cp, fg) => {
    const k = (r * cols + c) * 3
    words[k] = cp
    words[k + 1] = fg
    words[k + 2] = DEF
  }
  // 지나온 길은 해 · 달 색, 남은 길은 회색. 정각 반짝임의 밝은 위상에서는 길 전체가 켜지고 해가 겹고리(◉)로 커진다
  // (흰색으로 번쩍이면 밝은 바탕에서 안 보인다).
  for (let k = 0; k < cols * rows; k += 1) put(k % cols, Math.floor(k / cols), bits[k] ? 0x2800 + bits[k] : 0x20, lit[k] || bright ? orb : REST)
  const [sx, sy] = at(f)
  put(Math.max(0, Math.min(cols - 1, sx >> 1)), sy >> 2, bright ? 0x25c9 : day ? 0x25cf : 0x25d7, bright ? FLASH : orb)
  const tm = o.timer
  if (tm && !tm.off && tm.text) {
    const odd = (o.tick || 0) % 2 === 1
    const start = Math.floor((cols - tm.text.length) / 2)
    for (let i = 0; i < tm.text.length; i += 1) {
      const ch = tm.text[i]
      // 깜빡임은 마지막 10분(과 퇴근 직후 10분)에만 — 숫자 전체가 꺼졌다 켜진다.
      // 평소에 가운데 점을 매초 깜빡이면 쉬는 세션마다 1초에 한 번씩 그림을 갈아 끼우게 되어 뺐다(부하 실측 2026-10-08).
      const off = odd && tm.blink
      put(start + i, 1, off ? 0x20 : ch.charCodeAt(0), tm.color)
    }
  }
  return words
}

export function arcCells(o) {
  return new Uint8Array(arcWords(o).buffer).toBase64()
}

// Clawd 뒤 하늘. 그림 칸 세 줄의 바탕색 — 위에서 아래로.
// 아침은 아래가 복숭앗빛, 낮은 파랑, 밤은 남색에 달과 별.
// 노을은 처음 그린 안과 다르다 — 그 안의 아래 두 줄(자주 · 주황)은 주황색 Clawd 와 밝기가 같아 몸이 묻혀서, 남보라로 어둡게 깔고 주황은 땅끝 빛줄기(glow)로 옮겼다.
export const SKY = {
  morning: [0x7fb2e8, 0xa9cdf0, 0xffd9a8],
  day: [0x4a9be8, 0x6fb4f0, 0x9ccbf5],
  sunset: [0x2f2f6b, 0x5a3f80, 0x8a4577],
  night: [0x0d1433, 0x141c44, 0x1b2452],
}
export const SKY_PHASES = ['morning', 'day', 'sunset', 'night']
export function skyPhase(min, rise, set) {
  if (min < rise - 30 || min >= set + 55) return 'night'
  if (min < 600) return 'morning'
  return min < set - 80 ? 'day' : 'sunset'
}
// 하늘 위의 해 색. 반원의 해와 달리 바탕이 늘 하늘색이라 밝은 노랑 · 흰빛을 쓸 수 있다.
export function skySunColor(f) {
  return f < 0.07 ? 0xff7d52 : f < 0.22 ? 0xffb84d : f < 0.38 ? 0xffe27a : f < 0.62 ? 0xfff6c2 : f < 0.8 ? 0xffd75f : f < 0.93 ? 0xffa53d : 0xff6336
}
// 돌려주는 값: { phase, rows(줄마다의 바탕색), stars, cloud, glow(노을의 땅끝 빛줄기), orb(해 · 달의 칸 — 반원이 안 보일 때만 그린다) }
export function skyOf(min, rise, set, cols = 15) {
  const phase = skyPhase(min, rise, set)
  let orb
  if (phase === 'night') orb = { cx: cols - 3, cy: 0, ch: '◗', color: 0xffd23f }
  else {
    const f = Math.max(0, Math.min(1, (min - rise) / (set - rise)))
    const cy = phase === 'day' ? 0 : phase === 'morning' ? (min < 480 ? 2 : 1) : min < set - 30 ? 1 : 2
    orb = { cx: Math.round(f * (cols - 1)), cy, ch: '●', color: skySunColor(f) }
  }
  return { phase, rows: SKY[phase], stars: phase === 'night', cloud: phase === 'day' || phase === 'morning', glow: phase === 'sunset', orb }
}

// 잠든 세션(오래 쉰 세션)의 하늘: 시각과 상관없이 밤이고, 반원이 보여도 달을 그린다.
// 달은 왼쪽 위에 둔다 — 오른쪽 위는 잠든 Clawd 의 z 가 올라가는 자리다.
// 달 글자는 노란 반달(◗)이다 — 처음 쓴 반쯤 찬 원 글자는 눈알처럼 보였다. 반원의 달도 같은 글자로 맞췄다(색은 밝은 바탕에서도 읽히는 연보라 그대로).
export function sleepSky() {
  return { phase: 'night', rows: SKY.night, stars: true, cloud: false, glow: false, showOrb: true, orb: { cx: 1, cy: 0, ch: '◗', color: 0xffd23f } }
}

// 주간 띠: 평일 다섯 글자. 오늘은 밝게, 지난 날은 흐리게, 남은 날은 더 흐리게. 주말에는 그 요일을 끝에 붙인다.
export function weekSpans(dow) {
  const weekend = dow === 0 || dow === 6
  const out = []
  for (let i = 1; i <= 5; i += 1) out.push({ text: DAY_KO[i], kind: i === dow ? 'today' : i < dow || weekend ? 'past' : 'future' })
  if (weekend) out.push({ text: DAY_KO[dow], kind: 'weekend' })
  return out
}

// 분이 바뀐 순간에 울릴 효과. 정해진 시각(평일)이 정각과 겹치면 종만 친다.
export function chimeAt(min, dow, bells = BELLS_DEFAULT) {
  if (dow >= 1 && dow <= 5 && bells.includes(min)) return 'bell'
  return min % 60 === 0 ? 'hour' : ''
}
