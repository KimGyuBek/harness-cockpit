// 띠 왼쪽에 사는 작은 Clawd(Claude Code 마스코트). `$` 를 받지 않는다 — 상태와 시각(ms)만으로 한 프레임을 만든다.
// 모양은 Claude Code 시작 화면의 Clawd 를 반 칸 단위 점(가로 18 × 세로 6)으로 옮긴 것이다. 점 그림을 다시
// 사분면 블록 글자(▛ ▜ ▝ …)로 묶어 그리므로 반 칸씩 옮겨도 모양이 깨지지 않는다(종종걸음 · 반 줄 깡충 · 화면 밖으로 나가기).
// 가만히 선 자세(x 짝수 · y 0)는 시작 화면의 글자와 똑같이 나온다. 돌아서는 모습은 시작 화면 애니메이션의 글자를 그대로 쓴다.

export const CLAWD_COLS = 15
export const CLAWD_ROWS = 3
export const CLAWD_TICK_MS = 150

const W = CLAWD_COLS * 2
const H = CLAWD_ROWS * 2
const SW = 18
const SH = 6
// 다 보이는 채로 설 수 있는 x 범위(반 칸 단위).
const X_MAX = W - SW
const X_MID = X_MAX / 2
// Claude Code 테마의 clawd_body · clawd_background 값.
const BODY = 0xd77757
const EYE = 0x000000
const DEF = 0x01000000
// 주변 효과의 색. 그림 칸은 테마를 따라가지 못하므로 밝은 바탕 · 어두운 바탕 어디서나 읽히는 중간 밝기만 쓴다(2026-10-08).
const YELLOW = 0xe0a100
const RED = 0xf0506e
const CYAN = 0x2fa8e0
const GRAY = 0x8a8a8a
const STEAM = 0x9aa3b2
// 맥 자원 단계별 몸 색: 평소 → 주의 → 높음 → 위험. 잠들면 조금 가라앉은 색.
export const HEAT_COLORS = [BODY, 0xe2643c, 0xee4b2b, 0xc22a1e]
const SLEEP_BODY = 0xa85f48
// 한 칸의 네 점(왼위 8 · 오른위 4 · 왼아래 2 · 오른아래 1) → 사분면 블록 글자.
const QUAD = [' ', '▗', '▖', '▄', '▝', '▐', '▞', '▟', '▘', '▚', '▌', '▙', '▀', '▜', '▛', '█']
const UNQUAD = new Map(QUAD.map((ch, bits) => [ch, bits]))

// ── 모양 ────────────────────────────────────────────────────────────────────────
// 머리 두 줄에서 양옆이 몸으로 막힌 빈 점을 눈으로 본다(검은 바탕으로 칠할 자리).
function withEyes(on) {
  const eye = new Uint8Array(SW * SH)
  for (const y of [0, 1]) {
    let first = -1
    let last = -1
    for (let x = 0; x < SW; x += 1) {
      if (on[y * SW + x]) {
        if (first < 0) first = x
        last = x
      }
    }
    for (let x = first + 1; x < last; x += 1) if (!on[y * SW + x]) eye[y * SW + x] = 1
  }
  return { s: on, e: eye }
}

const poseCache = new Map()

// eyes: -1 왼쪽 0 정면 1 오른쪽 · eyeUp: 위를 봄 · blink: 두 눈 감음 · wink: 'L' | 'R' 한쪽만 감음
// armL / armR: 'down' | 'up' · legs: 0 | 1 (번갈아 쓰면 종종걸음)
function pose(over) {
  const p = Object.assign({ eyes: 0, eyeUp: false, blink: false, wink: '', armL: 'down', armR: 'down', legs: 0 }, over || {})
  const key = JSON.stringify(p)
  if (poseCache.has(key)) return poseCache.get(key)
  const on = new Uint8Array(SW * SH)
  const put = (x, y) => {
    on[y * SW + x] = 1
  }
  for (let x = 3; x <= 15; x += 1) for (const y of [0, 1, 2, 3]) put(x, y)
  const ey = p.eyeUp ? 0 : 1
  if (!p.blink && p.wink !== 'L') on[ey * SW + 5 + p.eyes] = 0
  if (!p.blink && p.wink !== 'R') on[ey * SW + 13 + p.eyes] = 0
  // 팔: 내리면 몸통 줄에서 옆으로, 올리면 한 줄 위로 꺾인다.
  for (const [x, y] of p.armL === 'up' ? [[1, 1], [2, 1], [2, 2]] : [[1, 2], [2, 2]]) put(x, y)
  for (const [x, y] of p.armR === 'up' ? [[16, 1], [17, 1], [16, 2]] : [[16, 2], [17, 2]]) put(x, y)
  for (const x of p.legs ? [4, 6, 12, 14] : [3, 5, 13, 15]) put(x, 4)
  const sp = withEyes(on)
  poseCache.set(key, sp)
  return sp
}

// 시작 화면 애니메이션의 「돌아서는」 글자들(Claude Code 2.1.293 에서 옮김).
const TURN_GLYPHS = {
  r12: [' ▐█▜██▛█ ', '▝▜██████▀', ' ▝▝   ▝▝ '],
  r30: ['  █▛██▛▌ ', ' ▝█████▛ ', '  ▘▘  ▘▘ '],
  r55: ['  ▐█▛█▜  ', '  ▐████  ', '  ▝▝ ▝▝  '],
  r75: ['   ██▛▌  ', '   ███▌  ', '   ▘  ▘  '],
  edge: ['   ▐██   ', '   ▐██   ', '   ▝ ▝   '],
  b105: ['   ███▌  ', '   ███▌  ', '   ▘  ▘  '],
  b125: ['  ▐████  ', '  ▐████  ', '  ▝▝ ▝▝  '],
  b150: ['  █████▌ ', ' ▝█████▛ ', '  ▘▘  ▘▘ '],
  back: [' ▐██████ ', '▝▜██████▀', ' ▝▝   ▝▝ '],
  l75: ['   ▛██▌  ', '   ███▌  ', '   ▘  ▘  '],
  l55: ['  ▐▜▛██  ', '  ▐████  ', '  ▝▝ ▝▝  '],
  l30: ['  ▛██▛█▌ ', ' ▝█████▛ ', '  ▘▘  ▘▘ '],
  l12: [' ▐▛███▜█ ', '▝▜██████▀', ' ▝▝   ▝▝ '],
}
// 한 바퀴. 뒤돌아선 뒤 반대쪽으로 도는 구간은 같은 그림을 좌우로 뒤집어 쓴다.
const SPIN = [['r12'], ['r30'], ['r55'], ['r75'], ['edge'], ['b105'], ['b125'], ['b150'], ['back'], ['b150', true], ['b125', true], ['b105', true], ['edge', true], ['l75'], ['l55'], ['l30'], ['l12']]

const turnCache = new Map()

function turn(name, flip) {
  const key = name + (flip ? '~' : '')
  if (turnCache.has(key)) return turnCache.get(key)
  const on = new Uint8Array(SW * SH)
  TURN_GLYPHS[name].forEach((row, cy) => {
    ;[...row].forEach((ch, cx) => {
      const bits = UNQUAD.get(ch) || 0
      const set = (dx, dy) => {
        const x = cx * 2 + dx
        on[(cy * 2 + dy) * SW + (flip ? SW - 1 - x : x)] = 1
      }
      if (bits & 8) set(0, 0)
      if (bits & 4) set(1, 0)
      if (bits & 2) set(0, 1)
      if (bits & 1) set(1, 1)
    })
  })
  const sp = withEyes(on)
  turnCache.set(key, sp)
  return sp
}

// 한 프레임 = 모양(s · e) + 자리(x: 반 칸 좌우, y: 반 줄 아래로) + 주변 효과(fx: 빈 칸에만 그리는 글자).
function fr(x, y, over, fx) {
  const sp = pose(over)
  return { s: sp.s, e: sp.e, x, y, fx: fx || [] }
}

function tf(name, flip, x) {
  const sp = turn(name, flip)
  return { s: sp.s, e: sp.e, x, y: 0, fx: [] }
}

// 몸 바로 오른쪽 · 왼쪽 빈 칸의 열 번호.
function right(x) {
  return Math.floor((x + SW) / 2)
}
function left(x) {
  return Math.floor((x + 1) / 2) - 1
}
function mark(cx, cy, ch, color) {
  return { cx, cy, ch, color }
}

// ── 동작 조각 ────────────────────────────────────────────────────────────────────
function repeat(n, frames) {
  const out = []
  for (let i = 0; i < n; i += 1) out.push(...frames)
  return out
}
const clampX = (x) => Math.max(0, Math.min(X_MAX, x))

const look = (x) => [fr(x, 0, { eyes: -1 }), fr(x, 0, { eyes: -1 }), fr(x, 0, { eyes: 1 }), fr(x, 0, { eyes: 1 }), fr(x, 0, { eyeUp: true }), fr(x, 0)]
const hop = (x, n) => repeat(n, [fr(x, 1), fr(x, 0, { armL: 'up', armR: 'up' })])
const wave = (x) => repeat(3, [fr(x, 0, { armR: 'up' }), fr(x, 0, { armL: 'up' })])
const stomp = (x) => repeat(3, [fr(x, 0, { legs: 1 }), fr(x, 0)])
const blink = (x) => [fr(x, 0, { blink: true }), fr(x, 0), fr(x, 0, { blink: true }), fr(x, 0)]
const wink = (x) => [fr(x, 0, { wink: 'R' }), fr(x, 0, { wink: 'R', armR: 'up' }), fr(x, 0)]
const spin = (x) => SPIN.map(([name, flip]) => tf(name, flip, x))
const shiver = (x) => repeat(3, [fr(clampX(x - 1), 0, { blink: true }), fr(clampX(x + 1), 0, { blink: true })])
const dance = (x) =>
  repeat(2, [
    fr(clampX(x - 1), 0, { armL: 'up', legs: 1, eyes: -1 }),
    fr(clampX(x - 1), 1, { armL: 'up' }),
    fr(clampX(x + 1), 0, { armR: 'up', legs: 1, eyes: 1 }),
    fr(clampX(x + 1), 1, { armR: 'up' }),
  ])

// 한 발짝씩 종종걸음.
function walk(from, to) {
  const out = []
  const dir = to > from ? 1 : -1
  for (let x = from + dir, i = 0; dir > 0 ? x <= to : x >= to; x += dir, i += 1) out.push(fr(x, 0, { eyes: dir, legs: i % 2 }))
  return out
}

// 먼지를 날리며 내달린다. 화면 밖 좌표까지 갈 수 있다(잘려 보인다).
function dash(from, to) {
  const out = []
  const dir = to > from ? 1 : -1
  for (let x = from + dir * 3, i = 0; dir > 0 ? x <= to : x >= to; x += dir * 3, i += 1) {
    const behind = dir > 0 ? left(x) : right(x)
    out.push(fr(x, i % 2, { eyes: dir, legs: i % 2, armL: i % 2 ? 'up' : 'down', armR: i % 2 ? 'down' : 'up' }, [mark(behind, 2, i % 2 ? '⠐' : '⠂', GRAY)]))
  }
  out.push(fr(to, 0, { eyes: dir }))
  return out
}

// 아래로 쏙 숨었다가 까꿍.
const peekaboo = (x) => [
  fr(x, 1),
  fr(x, 3),
  fr(x, 5),
  fr(x, 7),
  fr(x, 7),
  fr(x, 7),
  fr(x, 4, { armL: 'up', armR: 'up' }),
  fr(x, 0, { armL: 'up', armR: 'up' }, [mark(right(x), 0, '*', YELLOW)]),
  fr(x, 1, { armL: 'up', armR: 'up' }),
  fr(x, 0),
]

// 오른쪽 밖으로 뛰쳐나갔다가 왼쪽에서 다시 들어온다.
const lap = (x) => [...dash(x, W + 2), ...dash(-SW - 2, X_MID)]

// 반짝이를 뿌리며 만세.
function sparkle(x, n) {
  const out = []
  for (let i = 0; i < n; i += 1) {
    const fx = [mark(i % 2 ? right(x) : left(x), i % 3, i % 2 ? '*' : '+', YELLOW), mark(i % 2 ? left(x) : right(x), (i + 1) % 3, '.', YELLOW)]
    out.push(fr(x, i % 2, { armL: 'up', armR: 'up', legs: i % 2 }, fx))
  }
  return out
}

// 동전을 보고 달려가 폴짝 뛰어 먹는다.
function coin(x) {
  const stop = X_MAX - 4
  const cx = right(stop)
  const c = [mark(cx, 1, '▄', YELLOW)]
  const out = [fr(x, 0, { eyes: 1 }, c), fr(x, 0, { eyes: 1, eyeUp: false, armL: 'up' }, c)]
  for (const f of walk(x, stop)) out.push(Object.assign({}, f, { fx: c }))
  out.push(fr(stop, 1, { eyes: 1 }, c), fr(stop, 0, { eyes: 1, armR: 'up' }, [mark(cx, 0, '+', YELLOW)]), fr(stop, 0, { armL: 'up', armR: 'up' }, [mark(cx, 0, '*', YELLOW)]), fr(stop, 1), fr(stop, 0))
  return out
}

// ── 안무 ────────────────────────────────────────────────────────────────────────
// 쉬는 동안: 동작 조각을 정해진 씨앗으로 섞어 길게 잇는다(같은 순서가 금방 되풀이되지 않게). 조각 사이는 걸어서 옮긴다.
function idlePlaylist() {
  let seed = 20261008
  const rnd = (n) => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed % n
  }
  const bits = [look, (x) => hop(x, 2), wave, stomp, blink, wink, spin, shiver, dance, peekaboo, (x) => sparkle(x, 4), coin, lap, (x) => hop(x, 1)]
  const out = []
  let x = X_MID
  for (let round = 0; round < 3; round += 1) {
    const order = bits.map((b, i) => i)
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = rnd(i + 1)
      ;[order[i], order[j]] = [order[j], order[i]]
    }
    for (const i of order) {
      const frames = bits[i](x)
      out.push(...frames)
      x = clampX(frames[frames.length - 1].x)
      // 다음 조각을 할 자리로 걸어간다.
      const next = rnd(X_MAX + 1)
      out.push(...walk(x, next))
      x = next
    }
  }
  out.push(...walk(x, X_MID))
  return out
}

const HOME = X_MID

const IDLE = idlePlaylist()

// 턴이 도는 동안 — 지금 하는 일에 따라 다르게 논다.
const LOOPS = {
  // 생각 중(툴 없음): 왔다 갔다 서성인다.
  think: [...walk(HOME, X_MAX), ...look(X_MAX), ...walk(X_MAX, 0), ...look(0), ...walk(0, HOME), ...hop(HOME, 1)],
  // 읽는 중: 눈으로 줄을 훑고, 가끔 갸웃(?).
  read: [
    fr(HOME, 0, { eyes: -1 }),
    fr(HOME, 0, { eyes: -1 }),
    fr(HOME, 0),
    fr(HOME, 0, { eyes: 1 }),
    fr(HOME, 1, { eyes: 1 }),
    fr(HOME, 0, { eyes: -1 }),
    fr(HOME, 0),
    fr(HOME, 0, { eyes: 1 }),
    fr(HOME, 0, { eyeUp: true }, [mark(right(HOME), 0, '?', CYAN)]),
    fr(HOME, 0, { eyeUp: true }, [mark(right(HOME), 0, '?', CYAN)]),
    fr(HOME, 1, { blink: true }),
    fr(HOME, 0),
  ],
  // 고치는 중: 오른팔로 뚝딱뚝딱, 내려칠 때 불꽃.
  edit: [
    fr(HOME, 0, { armR: 'up', eyes: 1 }),
    fr(HOME, 1, { eyes: 1 }, [mark(right(HOME), 2, '*', YELLOW)]),
    fr(HOME, 0, { armR: 'up', eyes: 1 }),
    fr(HOME, 1, { eyes: 1 }, [mark(right(HOME), 1, '.', YELLOW)]),
    fr(HOME, 0, { armR: 'up', eyes: 1, legs: 1 }),
    fr(HOME, 1, { eyes: 1 }, [mark(right(HOME), 2, '+', YELLOW)]),
    fr(HOME, 0, { armR: 'up', blink: true }),
    fr(HOME, 1, { eyes: 1 }, [mark(right(HOME), 2, '*', YELLOW)]),
  ],
  // 명령 · 테스트 실행 중: 제자리 전력 질주.
  run: [
    fr(HOME, 0, { legs: 0, armL: 'up', eyes: 1 }, [mark(left(HOME), 2, '⠐', GRAY)]),
    fr(HOME + 1, 1, { legs: 1, armR: 'up', eyes: 1 }, [mark(left(HOME + 1), 2, '⠂', GRAY)]),
    fr(HOME, 0, { legs: 0, armL: 'up', eyes: 1 }, [mark(left(HOME) - 1, 2, '⠐', GRAY)]),
    fr(HOME - 1, 1, { legs: 1, armR: 'up', eyes: 1 }, [mark(left(HOME - 1), 2, '⠂', GRAY)]),
  ],
  // 사용자 답을 기다리는 중: 두 팔 들고 뛰며 빨간 느낌표를 깜빡인다.
  wait: [
    fr(HOME, 0, { armL: 'up', armR: 'up' }, [mark(right(HOME), 0, '!', RED)]),
    fr(HOME, 1, {}, [mark(right(HOME), 0, '!', RED)]),
    fr(HOME, 0, { armL: 'up', armR: 'up' }),
    fr(HOME, 1, { blink: true }),
  ],
}

// 한 번만 하는 동작. since(그 일이 일어난 뒤 지난 시간)로 프레임을 고른다.
const ONCE = {
  // 턴이 막 끝남: 반짝이 만세 → 한 바퀴.
  cheer: [...sparkle(HOME, 8), ...spin(HOME), ...hop(HOME, 1)],
  // 명령이 실패함: 깜짝 놀라 부르르.
  startle: [
    fr(HOME, 0, { armL: 'up', armR: 'up', eyeUp: true }, [mark(right(HOME), 0, '!', RED)]),
    fr(HOME, 0, { armL: 'up', armR: 'up', eyeUp: true }, [mark(right(HOME), 0, '!', RED)]),
    ...shiver(HOME).map((f) => Object.assign({}, f, { fx: [mark(right(f.x), 0, '!', RED)] })),
    fr(HOME, 1, { blink: true }),
    fr(HOME, 0),
  ],
  // 프롬프트를 받음: 「넵!」 하고 폴짝.
  // 1.35초. 처음에는 0.75초였는데 짧아서 눈에 안 띄었다.
  salute: [
    fr(HOME, 1),
    fr(HOME, 0, { armR: 'up' }),
    fr(HOME, 0, { armR: 'up' }),
    fr(HOME, 1, { armR: 'up' }),
    fr(HOME, 0, { armR: 'up' }),
    fr(HOME, 0, { armR: 'up' }),
    fr(HOME, 1, { armR: 'up', blink: true }),
    fr(HOME, 0, { armR: 'up' }),
    fr(HOME, 0),
  ],
  // 커밋 · 푸시 성공: 동전 먹기.
  coin: coin(2),
  // 정해진 시각(설정의 bells · 평일): 두 팔을 번갈아 들며 좌우로 흔들고 음표를 날린다. 글자는 띄우지 않는다.
  bell: repeat(4, [
    fr(HOME - 1, 0, { armL: 'up', eyes: -1 }, [mark(left(HOME - 1), 0, '♪', YELLOW)]),
    fr(HOME, 0, { armL: 'up', armR: 'up' }),
    fr(HOME + 1, 0, { armR: 'up', eyes: 1 }, [mark(right(HOME + 1), 0, '♪', YELLOW)]),
    fr(HOME, 1, { armL: 'up', armR: 'up', blink: true }),
  ]),
}

// 오래 쉰 세션: 눈을 감고 반 줄 내려앉아 잔다. 1초에 한 장씩만 넘긴다(잠든 세션은 그림도 1초에 한 번 그린다).
const SLEEP = [
  fr(HOME, 1, { blink: true }),
  fr(HOME, 1, { blink: true }, [mark(right(HOME), 1, 'z', GRAY)]),
  fr(HOME, 1, { blink: true }, [mark(right(HOME), 1, 'z', GRAY), mark(right(HOME) + 1, 0, 'z', GRAY)]),
  fr(HOME, 1, { blink: true }, [mark(right(HOME) + 1, 0, 'z', GRAY)]),
]

// 조는 중(5분 넘게 쉼): 눈이 감기며 고개가 떨어졌다가 화들짝 깬다. 한 장에 0.45초씩 천천히 넘긴다.
export const DOZE_TICK_MS = 450
const DOZE = [
  fr(HOME, 0),
  fr(HOME, 0),
  fr(HOME, 0, { blink: true }),
  fr(HOME, 1, { blink: true }),
  fr(HOME, 1, { blink: true }),
  fr(HOME, 1, { blink: true }),
  fr(HOME, 0, { eyeUp: true }),
  fr(HOME, 0),
  fr(HOME, 0, { blink: true }),
  fr(HOME, 1, { blink: true }),
  fr(HOME, 1, { blink: true }),
  fr(HOME, 1, { blink: true }),
  fr(HOME, 1, { blink: true }),
  fr(HOME, 0, { eyes: -1 }),
  fr(HOME, 0, { eyes: 1 }),
]

const within = (since, frames) => since >= 0 && since < frames.length * CLAWD_TICK_MS
const at = (frames, since) => frames[Math.min(frames.length - 1, Math.floor(since / CLAWD_TICK_MS))]

// st: { asking, busy, activity: 'think' | 'read' | 'edit' | 'run', sinceDone, sinceErr, sinceSubmit, sinceCoin, sinceBell, hot, heat, asleep }
// since* 는 그 일이 일어난 뒤 지난 ms(없었으면 -1). hot 은 컨텍스트나 5시간 한도가 85% 이상일 때 — 땀을 흘린다.
// heat 는 맥 자원 단계(0 평소 · 1 주의 · 2 높음 · 3 위험) — 몸 색과 땀 · 김 · 떨림으로 보인다. asleep 은 오래 쉰 세션.
export function clawdScene(st) {
  if (st.asking) return 'wait'
  if (within(st.sinceErr, ONCE.startle)) return 'startle'
  if (within(st.sinceCoin, ONCE.coin)) return 'coin'
  if (within(st.sinceBell, ONCE.bell)) return 'bell'
  // 엔터 「넵」 은 턴이 시작됐는지와 상관없이 재생한다 — 프롬프트 훅이 오래 걸리면 턴 시작이 1초 넘게 늦어,
  // 「작업 중일 때만」 으로 걸어 두면 재생 창이 지난 뒤라 한 번도 보이지 않았다.
  if (within(st.sinceSubmit, ONCE.salute)) return 'salute'
  if (st.busy) return LOOPS[st.activity] ? st.activity : 'think'
  if (within(st.sinceDone, ONCE.cheer)) return 'cheer'
  if (st.asleep) return 'sleep'
  if (st.dozing) return 'doze'
  return 'idle'
}

const SINCE = { startle: 'sinceErr', coin: 'sinceCoin', salute: 'sinceSubmit', cheer: 'sinceDone', bell: 'sinceBell' }

export function clawdFrameOf(st, ms) {
  const scene = clawdScene(st)
  const tick = Math.floor(Math.max(0, ms) / CLAWD_TICK_MS)
  let f
  if (scene === 'idle') f = IDLE[tick % IDLE.length]
  else if (scene === 'sleep') f = SLEEP[Math.floor(Math.max(0, ms) / 1000) % SLEEP.length]
  else if (scene === 'doze') f = DOZE[Math.floor(Math.max(0, ms) / DOZE_TICK_MS) % DOZE.length]
  else if (ONCE[scene]) f = at(ONCE[scene], st[SINCE[scene]])
  else f = LOOPS[scene][tick % LOOPS[scene].length]
  const heat = Math.max(0, Math.min(3, st.heat || 0))
  // 위험: 좌우로 떤다(자는 동안은 떨지 않는다).
  if (heat >= 3 && scene !== 'sleep') f = Object.assign({}, f, { x: clampX(f.x + (tick % 2 ? 1 : -1)) })
  const fx = [...f.fx]
  const free = (cx, cy) => !fx.some((m) => m.cx === cx && m.cy === cy)
  // 땀: 한도 85% 이상이거나 자원이 주의 · 높음일 때 머리 옆에 한 방울.
  if ((st.hot || heat === 1 || heat === 2) && tick % 8 < 4 && f.y === 0 && free(right(f.x), 0)) fx.push(mark(right(f.x), 0, "'", CYAN))
  // 김: 높음이면 한 줄기, 위험이면 양쪽 두 줄기. 위아래로 번갈아 놓아 피어오르는 것처럼 보인다.
  if (heat >= 2 && scene !== 'sleep') {
    const up = tick % 6 < 3 ? 0 : 1
    if (free(left(f.x), up)) fx.push(mark(left(f.x), up, '~', STEAM))
    if (heat >= 3 && free(right(f.x) + 1, 1 - up)) fx.push(mark(right(f.x) + 1, 1 - up, '~', STEAM))
  }
  return Object.assign({}, f, { fx, body: scene === 'sleep' && heat === 0 ? SLEEP_BODY : HEAT_COLORS[heat] })
}

// ── 그리기 ──────────────────────────────────────────────────────────────────────
// 프레임 → 화면 점 그림. 화면 밖으로 나간 점은 잘린다.
function compose(f) {
  const on = new Uint8Array(W * H)
  const eye = new Uint8Array(W * H)
  for (let sy = 0; sy < SH; sy += 1) {
    const y = sy + f.y
    if (y < 0 || y >= H) continue
    for (let sx = 0; sx < SW; sx += 1) {
      const x = sx + f.x
      if (x < 0 || x >= W) continue
      if (f.s[sy * SW + sx]) on[y * W + x] = 1
      if (f.e[sy * SW + sx]) eye[y * W + x] = 1
    }
  }
  return { on, eye }
}

// 하늘 장식: 빈 칸에만 놓는다. 밤에는 별, 아침 · 낮에는 작은 구름.
const STARS = [
  [1, 0, '.'],
  [6, 0, '·'],
  [14, 1, '*'],
  [10, 1, '.'],
  [3, 2, '·'],
  [13, 2, '.'],
]
const CLOUD = [
  [1, 1, '▂'],
  [2, 1, '▃'],
  [3, 1, '▂'],
]

// 하늘 바탕 위에서 주변 효과 글자가 묻히지 않게 한다 — 대비가 2 에 못 미치면 밝은 바탕에서는 남색, 어두운 바탕에서는 흰색으로 바꾼다.
function lum(c) {
  const ch = (v) => (v / 255 <= 0.03928 ? v / 255 / 12.92 : Math.pow((v / 255 + 0.055) / 1.055, 2.4))
  return 0.2126 * ch((c >> 16) & 255) + 0.7152 * ch((c >> 8) & 255) + 0.0722 * ch(c & 255)
}
export function onSky(color, bg) {
  const a = lum(color)
  const b = lum(bg)
  const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  if (ratio >= 2) return color
  return b > 0.25 ? 0x1b2452 : 0xffffff
}

// 프레임 → 칸마다 { ch, fg, bg }. sky: skyOf 의 결과에 showOrb(해 · 달도 그릴지)를 얹은 것 — 없으면 터미널 바탕 그대로.
function cellsOf(f, sky) {
  const { on, eye } = compose(f)
  const cells = []
  const back = (cy) => (sky ? sky.rows[cy] : DEF)
  for (let cy = 0; cy < CLAWD_ROWS; cy += 1) {
    for (let cx = 0; cx < CLAWD_COLS; cx += 1) {
      const i = (dx, dy) => (cy * 2 + dy) * W + cx * 2 + dx
      const bits = on[i(0, 0)] * 8 + on[i(1, 0)] * 4 + on[i(0, 1)] * 2 + on[i(1, 1)]
      const hasEye = eye[i(0, 0)] || eye[i(1, 0)] || eye[i(0, 1)] || eye[i(1, 1)]
      cells.push({ ch: QUAD[bits], fg: bits ? f.body || BODY : DEF, bg: hasEye && bits ? EYE : back(cy), empty: bits === 0 && !hasEye })
    }
  }
  if (sky) {
    // 노을: 맨 아랫줄 빈 칸에 주황 빛줄기.
    if (sky.glow) {
      for (let cx = 0; cx < CLAWD_COLS; cx += 1) {
        const c = cells[(CLAWD_ROWS - 1) * CLAWD_COLS + cx]
        if (c.empty) Object.assign(c, { ch: '▁', fg: 0xf0a35a })
      }
    }
    for (const [cx, cy, ch] of sky.stars ? STARS : sky.cloud ? CLOUD : []) {
      const c = cells[cy * CLAWD_COLS + cx]
      if (c.empty) Object.assign(c, { ch, fg: 0xffffff })
    }
    // 해 · 달은 반원이 같은 것을 보여 주므로, 반원이 안 보이는 좁은 폭에서만 그린다.
    if (sky.showOrb && sky.orb) {
      const c = cells[sky.orb.cy * CLAWD_COLS + Math.max(0, Math.min(CLAWD_COLS - 1, sky.orb.cx))]
      if (c.empty) Object.assign(c, { ch: sky.orb.ch, fg: sky.orb.color })
    }
  }
  // 주변 효과는 몸이 없는 칸에만 그린다(하늘 장식 위에 덮어쓴다).
  for (const m of f.fx) {
    if (m.cx < 0 || m.cx >= CLAWD_COLS || m.cy < 0 || m.cy >= CLAWD_ROWS) continue
    const c = cells[m.cy * CLAWD_COLS + m.cx]
    if (c.empty) Object.assign(c, { ch: m.ch, fg: sky ? onSky(m.color, back(m.cy)) : m.color, bg: back(m.cy) })
  }
  return cells
}

// 줄마다의 글자(시험 · 눈으로 확인용).
export function clawdRows(f) {
  const cells = cellsOf(f)
  const rows = []
  for (let cy = 0; cy < CLAWD_ROWS; cy += 1) rows.push(cells.slice(cy * CLAWD_COLS, (cy + 1) * CLAWD_COLS).map((c) => c.ch).join(''))
  return rows
}

// Raster cells 에 넣을 [글자, 글자색, 바탕색] u32 배열.
export function clawdWords(f, sky) {
  const cells = cellsOf(f, sky)
  const words = new Uint32Array(cells.length * 3)
  cells.forEach((c, i) => {
    words[i * 3] = c.ch.codePointAt(0)
    words[i * 3 + 1] = c.fg
    words[i * 3 + 2] = c.bg
  })
  return words
}

export function clawdFrame(st, ms) {
  return new Uint8Array(clawdWords(clawdFrameOf(st, ms), st.sky || null).buffer).toBase64()
}

// 시험용: 가만히 선 자세와 장면별 프레임 묶음.
export function clawdRest(x) {
  return fr(x, 0)
}
export const CLAWD_SCENES = Object.assign({ idle: IDLE, sleep: SLEEP, doze: DOZE }, LOOPS, ONCE)
