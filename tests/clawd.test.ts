import { expect, test } from 'claude-code/testing'
import { CLAWD_COLS, CLAWD_ROWS, CLAWD_SCENES, HEAT_COLORS, clawdRows, clawdWords, clawdRest, clawdScene, clawdFrameOf, clawdFrame, onSky } from '../hooks/clawd.js'

const QUIET = { asking: false, busy: false, activity: 'think', sinceDone: -1, sinceErr: -1, sinceSubmit: -1, sinceCoin: -1, hot: false }
const st = (over) => Object.assign({}, QUIET, over)

test('선 자세는 Claude Code 시작 화면의 Clawd 글자와 같다', async () => {
  const rows = clawdRows(clawdRest(0))
  expect(rows[0].trimEnd()).toBe(' ▐▛███▛█')
  expect(rows[1].trimEnd()).toBe('▝▜██████▀')
  expect(rows[2].trimEnd()).toBe(' ▝▝   ▝▝')
  expect(rows.every((r) => [...r].length === CLAWD_COLS)).toBe(true)
  // 반 칸 옮긴 자리(x 홀수)에서도 세 줄 안에 그려진다.
  expect(clawdRows(clawdRest(1)).join('').trim().length > 0).toBe(true)
})

test('칸 데이터: 몸은 Clawd 색, 눈이 있는 칸은 검은 바탕, 빈 칸은 터미널 기본색', async () => {
  const w = clawdWords(clawdRest(0))
  expect(w.length).toBe(CLAWD_COLS * CLAWD_ROWS * 3)
  expect(w[2 * 3]).toBe('▛'.codePointAt(0))
  expect(w[2 * 3 + 1]).toBe(0xd77757)
  expect(w[2 * 3 + 2]).toBe(0x000000)
  expect(w[0]).toBe(0x20)
  expect(w[1]).toBe(0x01000000)
})

test('장면 고르기: 질문 대기 > 실패 놀람 > 동전 > 작업(받자마자 넵 → 하는 일) > 방금 끝남 > 쉼', async () => {
  expect(clawdScene(st({ asking: true, busy: true, sinceErr: 10 }))).toBe('wait')
  expect(clawdScene(st({ busy: true, sinceErr: 10 }))).toBe('startle')
  expect(clawdScene(st({ busy: true, sinceCoin: 10 }))).toBe('coin')
  expect(clawdScene(st({ busy: true, sinceSubmit: 100 }))).toBe('salute')
  expect(clawdScene(st({ busy: true, sinceSubmit: 5000, activity: 'edit' }))).toBe('edit')
  expect(clawdScene(st({ busy: true, sinceSubmit: 5000, activity: 'run' }))).toBe('run')
  expect(clawdScene(st({ busy: true, sinceSubmit: 5000, activity: 'x' }))).toBe('think')
  expect(clawdScene(st({ sinceDone: 500 }))).toBe('cheer')
  expect(clawdScene(st({ sinceDone: 60000 }))).toBe('idle')
  expect(clawdScene(QUIET)).toBe('idle')
})

test('모든 장면: 줄 폭이 맞고, 엔진이 받는 글자만 쓰고, 0.45초 넘게 멈춰 있지 않는다', async () => {
  // z(잠) · ~(김) · ♪(종)는 2026-10-08 에 더했다. ♪ 는 실제 터미널에서 한 칸으로 그려지는 것을 확인한 뒤 넣는다.
  const allowed = new Set([...' ▗▖▄▝▐▞▟▘▚▌▙▀▜▛█⠂⠐+*.?!\'z~♪'])
  for (const name of Object.keys(CLAWD_SCENES)) {
    const frames = CLAWD_SCENES[name]
    let still = 0
    let longest = 0
    let prev = ''
    const seen = new Set()
    for (const f of frames) {
      const rows = clawdRows(f)
      expect(rows.length).toBe(CLAWD_ROWS)
      for (const r of rows) {
        expect([...r].length).toBe(CLAWD_COLS)
        for (const ch of r) expect(allowed.has(ch)).toBe(true)
      }
      const key = rows.join('/')
      seen.add(key)
      still = key === prev ? still + 1 : 0
      longest = Math.max(longest, still)
      prev = key
    }
    // 잠자는 장면은 1초에 한 장씩 넘겨 가만히 있는 것이 맞다(시각으로 고르고, 서로 다른 모습은 넷뿐이다).
    if (name !== 'sleep' && name !== 'doze' && name !== 'gloom') expect(longest <= 2).toBe(true)
    expect(seen.size >= 4).toBe(true)
  }
  // 쉬는 동안의 안무는 한 바퀴가 1분을 넘고 서로 다른 모습이 150가지를 넘는다.
  expect(CLAWD_SCENES.idle.length * 150 > 60000).toBe(true)
  expect(new Set(CLAWD_SCENES.idle.map((f) => clawdRows(f).join('/'))).size > 150).toBe(true)
})

test('한 번만 하는 동작은 끝 프레임에서 멈추지 않고 다음 장면으로 넘어간다 · 더우면 땀', async () => {
  const cheerMs = CLAWD_SCENES.cheer.length * 150
  expect(clawdScene(st({ sinceDone: cheerMs - 1 }))).toBe('cheer')
  expect(clawdScene(st({ sinceDone: cheerMs }))).toBe('idle')
  const hot = clawdFrameOf(st({ hot: true }), 0)
  expect(hot.fx.some((m) => m.ch === "'")).toBe(true)
  expect(clawdFrameOf(st({}), 0).fx.some((m) => m.ch === "'")).toBe(false)
  expect(typeof clawdFrame(QUIET, 0)).toBe('string')
})

test('자원 단계: 몸 색이 4단계로 바뀌고, 주의엔 땀 · 높음엔 김 · 위험엔 김 두 줄기와 떨림', async () => {
  const bodyOf = (heat: number) => {
    const w = clawdWords(clawdFrameOf(st({ heat }), 0))
    const colors = new Set<number>()
    for (let i = 0; i < CLAWD_COLS * CLAWD_ROWS; i += 1) if (w[i * 3] !== 0x20 && w[i * 3 + 1] !== 0x01000000 && ![0x2fa8e0, 0x9aa3b2, 0x8a8a8a, 0xe0a100, 0xf0506e].includes(w[i * 3 + 1])) colors.add(w[i * 3 + 1])
    return [...colors]
  }
  expect(bodyOf(0)).toEqual([HEAT_COLORS[0]])
  expect(bodyOf(1)).toEqual([HEAT_COLORS[1]])
  expect(bodyOf(2)).toEqual([HEAT_COLORS[2]])
  expect(bodyOf(3)).toEqual([HEAT_COLORS[3]])
  expect(new Set(HEAT_COLORS).size).toBe(4)
  const marks = (heat: number, ms: number) => clawdFrameOf(st({ heat }), ms).fx.map((m) => m.ch)
  // 가만히 선 프레임을 찾아 본다(쉬는 안무의 첫 프레임들은 y = 0 이다).
  const anyTick = (heat: number, ch: string) => [0, 150, 300, 450, 600, 750, 900, 1050].some((ms) => marks(heat, ms).includes(ch))
  expect(anyTick(1, "'")).toBe(true)
  expect(anyTick(1, '~')).toBe(false)
  expect(anyTick(2, '~')).toBe(true)
  expect([0, 150, 300, 450].some((ms) => marks(3, ms).filter((c) => c === '~').length === 2)).toBe(true)
  expect(anyTick(0, '~')).toBe(false)
  // 위험에서는 한 프레임씩 좌우로 흔들린다.
  const xs = new Set([0, 150, 300, 450].map((ms) => clawdFrameOf(st({ heat: 3, busy: true, activity: 'read' }), ms).x - clawdFrameOf(st({ heat: 0, busy: true, activity: 'read' }), ms).x))
  expect(xs.has(1) && xs.has(-1)).toBe(true)
})

test('오래 쉰 세션은 눈을 감고 자고, 정해진 시각에는 종을 친다. 글자는 없다', async () => {
  expect(clawdScene(st({ asleep: true }))).toBe('sleep')
  expect(clawdScene(st({ asleep: true, busy: true }))).toBe('think')
  expect(clawdScene(st({ asleep: true, sinceBell: 100 }))).toBe('bell')
  expect(clawdScene(st({ busy: true, sinceBell: 100 }))).toBe('bell')
  expect(clawdScene(st({ sinceBell: 60000 }))).toBe('idle')
  const z = [0, 1000, 2000, 3000].map((ms) => clawdFrameOf(st({ asleep: true }), ms).fx.map((m) => m.ch).join(''))
  expect(z).toEqual(['', 'z', 'zz', 'z'])
  // 자는 동안은 눈 칸(검은 바탕)이 없다.
  const w = clawdWords(clawdFrameOf(st({ asleep: true }), 0))
  let eyes = 0
  for (let i = 0; i < CLAWD_COLS * CLAWD_ROWS; i += 1) if (w[i * 3 + 2] === 0x000000) eyes += 1
  expect(eyes).toBe(0)
  const bell = CLAWD_SCENES.bell.flatMap((f) => f.fx.map((m) => m.ch))
  expect(bell.includes('♪')).toBe(true)
  expect(bell.every((c) => c === '♪')).toBe(true)
  expect(CLAWD_SCENES.bell.length * 150 >= 2000).toBe(true)
})

test('하늘: 줄마다 바탕색이 깔리고, 눈 칸은 검은 바탕 그대로, 밤엔 별 · 낮엔 구름이 빈 칸에만 놓인다', async () => {
  const day = { rows: [0x4a9be8, 0x6fb4f0, 0x9ccbf5], stars: false, cloud: true }
  const w = clawdWords(clawdRest(8), day)
  for (let r = 0; r < CLAWD_ROWS; r += 1) {
    for (let c = 0; c < CLAWD_COLS; c += 1) {
      const bg = w[(r * CLAWD_COLS + c) * 3 + 2]
      expect(bg === day.rows[r] || bg === 0x000000).toBe(true)
    }
  }
  let eyes = 0
  for (let i = 0; i < CLAWD_COLS * CLAWD_ROWS; i += 1) if (w[i * 3 + 2] === 0x000000) eyes += 1
  expect(eyes).toBe(2)
  const chars = (ww: Uint32Array) => Array.from({ length: CLAWD_COLS * CLAWD_ROWS }, (_, i) => String.fromCodePoint(ww[i * 3])).join('')
  expect(chars(w).includes('▃')).toBe(true)
  const night = clawdWords(clawdRest(8), { rows: [0x0d1433, 0x141c44, 0x1b2452], stars: true, cloud: false })
  expect(/[.*·]/.test(chars(night))).toBe(true)
  expect(chars(night).includes('▃')).toBe(false)
  // 하늘이 없으면 예전처럼 터미널 바탕.
  const plain = clawdWords(clawdRest(8))
  expect(plain[2]).toBe(0x01000000)
  // 몸이 지나가는 칸의 장식은 가려진다 — 구름 자리에 서면 구름 글자가 없다.
  expect(chars(clawdWords(clawdRest(0), day)).includes('▃')).toBe(false)
})

test('하늘: 노을은 아랫줄 빈 칸에 빛줄기, 해 · 달은 showOrb 일 때만, 효과 글자는 바탕과 대비 2 이상', async () => {
  const chars = (ww: Uint32Array) => Array.from({ length: CLAWD_COLS * CLAWD_ROWS }, (_, i) => String.fromCodePoint(ww[i * 3])).join('')
  const dusk = { rows: [0x2f2f6b, 0x5a3f80, 0x8a4577], stars: false, cloud: false, glow: true, orb: { cx: 14, cy: 1, ch: '●', color: 0xff6336 } }
  expect(chars(clawdWords(clawdRest(8), dusk)).includes('▁')).toBe(true)
  expect(chars(clawdWords(clawdRest(8), dusk)).includes('●')).toBe(false)
  expect(chars(clawdWords(clawdRest(8), Object.assign({ showOrb: true }, dusk))).includes('●')).toBe(true)
  const night = { rows: [0x0d1433, 0x141c44, 0x1b2452], stars: true, cloud: false, glow: false, showOrb: true, orb: { cx: 12, cy: 0, ch: '◗', color: 0xffd23f } }
  expect(chars(clawdWords(clawdRest(8), night)).includes('◗')).toBe(true)
  const lumOf = (c: number) => {
    const ch = (v: number) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : Math.pow((v / 255 + 0.055) / 1.055, 2.4))
    return 0.2126 * ch((c >> 16) & 255) + 0.7152 * ch((c >> 8) & 255) + 0.0722 * ch(c & 255)
  }
  const ratio = (a: number, b: number) => (Math.max(lumOf(a), lumOf(b)) + 0.05) / (Math.min(lumOf(a), lumOf(b)) + 0.05)
  for (const bg of [0x7fb2e8, 0xa9cdf0, 0xffd9a8, 0x4a9be8, 0x6fb4f0, 0x9ccbf5, 0x2f2f6b, 0x5a3f80, 0x8a4577, 0x0d1433, 0x141c44, 0x1b2452]) {
    for (const fg of [0xe0a100, 0xf0506e, 0x2fa8e0, 0x8a8a8a, 0x9aa3b2]) expect(ratio(onSky(fg, bg), bg) >= 2).toBe(true)
  }
})

test('잠든 Clawd + 밤하늘: 달이 보이고 z 가 달을 덮지 않는다', async () => {
  const sky = { rows: [0x0d1433, 0x141c44, 0x1b2452], stars: true, cloud: false, glow: false, showOrb: true, orb: { cx: 1, cy: 0, ch: '◗', color: 0xffd23f } }
  for (const ms of [0, 1000, 2000, 3000]) {
    const w = clawdWords(clawdFrameOf({ asleep: true, busy: false, heat: 0, sinceDone: -1, sinceErr: -1, sinceSubmit: -1, sinceCoin: -1, sinceBell: -1 }, ms), sky)
    expect(String.fromCodePoint(w[1 * 3])).toBe('◗')
    expect(w[1 * 3 + 1]).toBe(0xffd23f)
    expect(w[1 * 3 + 2]).toBe(0x0d1433)
  }
})

test('엔터 「넵」 은 턴 시작 전에도 나오고, 5분 쉬면 졸고 15분이면 잔다', async () => {
  const base = { asking: false, busy: false, activity: 'think', sinceDone: -1, sinceErr: -1, sinceSubmit: -1, sinceCoin: -1, sinceBell: -1, hot: false, heat: 0, asleep: false, dozing: false }
  // 프롬프트 훅이 늦어 아직 busy 가 아니어도 엔터 직후에는 넵.
  expect(clawdScene(Object.assign({}, base, { sinceSubmit: 100 }))).toBe('salute')
  expect(clawdScene(Object.assign({}, base, { sinceSubmit: 100, busy: true }))).toBe('salute')
  expect(clawdScene(Object.assign({}, base, { sinceSubmit: 100, asleep: true }))).toBe('salute')
  expect(CLAWD_SCENES.salute.length * 150 >= 1200).toBe(true)
  expect(clawdScene(Object.assign({}, base, { sinceSubmit: 5000, busy: true }))).toBe('think')
  // 졸기: 눈을 뜬 장과 감고 고개가 떨어진 장이 섞여 있고, z 는 없다.
  expect(clawdScene(Object.assign({}, base, { dozing: true }))).toBe('doze')
  expect(clawdScene(Object.assign({}, base, { dozing: true, asleep: true }))).toBe('sleep')
  expect(clawdScene(Object.assign({}, base, { dozing: true, busy: true }))).toBe('think')
  const rows = CLAWD_SCENES.doze.map((f) => clawdRows(f).join('|'))
  expect(new Set(rows).size >= 3).toBe(true)
  expect(CLAWD_SCENES.doze.every((f) => f.fx.length === 0)).toBe(true)
  expect(CLAWD_SCENES.doze.some((f) => f.y === 1)).toBe(true)
})

test('퇴근 무렵: 신날 때는 선글라스를 쓰고 춤추고(자던 세션도), 우울은 몸 색이 바뀌고 잠든 세션에는 걸지 않는다', async () => {
  const base = { asking: false, busy: false, activity: 'think', sinceDone: -1, sinceErr: -1, sinceSubmit: -1, sinceCoin: -1, sinceBell: -1, hot: false, heat: 0, asleep: false, dozing: false, mood: '' }
  const on = (o: object) => Object.assign({}, base, o)
  expect(clawdScene(on({ mood: 'party' }))).toBe('party')
  expect(clawdScene(on({ mood: 'party', asleep: true }))).toBe('party')
  expect(clawdScene(on({ mood: 'party', busy: true }))).toBe('think')
  expect(clawdScene(on({ mood: 'gloom' }))).toBe('gloom')
  expect(clawdScene(on({ mood: 'gloom', dozing: true }))).toBe('gloom')
  expect(clawdScene(on({ mood: 'gloom', asleep: true }))).toBe('sleep')
  expect(clawdScene(on({ mood: 'gloom', busy: true }))).toBe('think')
  // 검은 바탕(눈 · 선글라스) 칸 수: 평소 2칸, 선글라스는 그보다 많다.
  const dark = (w: Uint32Array) => Array.from({ length: CLAWD_COLS * CLAWD_ROWS }, (_, i) => w[i * 3 + 2]).filter((bg) => bg === 0x000000).length
  expect(dark(clawdWords(clawdRest(8)))).toBe(2)
  for (const ms of [0, 150, 300, 600, 900]) expect(dark(clawdWords(clawdFrameOf(on({ mood: 'party' }), ms))) >= 5).toBe(true)
  // 일하는 중에도 신나는 시간에는 선글라스를 쓴다(정면 자세일 때).
  expect(dark(clawdWords(clawdFrameOf(on({ mood: 'party', busy: true, activity: 'read' }), 0))) >= 5).toBe(true)
  expect(dark(clawdWords(clawdFrameOf(on({ busy: true, activity: 'read' }), 0)))).toBe(2)
  // 우울: 몸 색이 바뀌고(자원 단계가 평소일 때만), 선글라스는 없다.
  expect(clawdFrameOf(on({ mood: 'gloom' }), 0).body).toBe(0x8c98b3)
  expect(clawdFrameOf(on({ mood: 'gloom', heat: 2 }), 0).body).toBe(HEAT_COLORS[2])
  expect(dark(clawdWords(clawdFrameOf(on({ mood: 'gloom' }), 0))) <= 2).toBe(true)
  expect(CLAWD_SCENES.party.some((f) => f.fx.some((m) => m.ch === '♪'))).toBe(true)
})
