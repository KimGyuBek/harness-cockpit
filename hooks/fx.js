// 새 세션 시작 효과 4종의 프레임 그리기. `$` 를 받지 않는다 — 요소 생성자(E) · 재료(ctx) ·
// 경과 시간(ms)만으로 트리를 만든다. 같은 입력이면 같은 프레임이 나온다.
// register.js 가 그린다 — 1번(부팅 스윕)은 띠 자리에서, 나머지는 띠 위에 얹어서. 여러 개를 함께 재생할 수 있다.
// 고르는 법: /fx use 1 4 (기본 1 · /fx off 는 끔).
import { MASCOT } from './mascot.js'
import { getConfig } from './config.js'

// ms 는 미리 보기(/fx N) 재생 길이다. 2번(브리핑)은 새 세션 시작 때는 첫 턴이 시작될 때까지 남는다.
export const FX = {
  1: { name: '부팅 스윕', ms: 2600, note: '띠가 왼쪽부터 켜지고 한도 게이지가 0 에서 차오른다 · 2줄' },
  2: { name: '브리핑 카드', ms: 9000, note: '작업 대장 · 최근 작업 · 가동 시간대(설정했을 때) · 한도를 한 장으로 · 첫 프롬프트에 접힘' },
  3: { name: '캐릭터 인사', ms: 3600, note: '샘플 캐릭터가 통통 튀며 인사 · 3초 뒤 사라짐' },
  4: { name: '워드마크', ms: 2800, note: '레포 이름을 큰 글자로 · 빛이 한 번 지나감 · 레포 색(파랑 / 빨강)' },
}

const DEF = 0x01000000
const DIM = 'inactive'
const ACCENT = { blue: 0x4d9bff, red: 0xff6b80 }
const LEVEL_COLORS = ['success', '#8CC63F', 'warning', '#E8833A', 'error']

function t(E, text, props) {
  return E.Text(Object.assign({ children: [text] }, props || {}))
}

function clamp(x) {
  return Math.max(0, Math.min(1, x))
}

// 빠르게 시작해 천천히 멈추는 곡선.
function ease(x) {
  return 1 - Math.pow(1 - clamp(x), 3)
}

export function mix(a, b, k) {
  const c = (shift) => Math.round(((a >> shift) & 255) + (((b >> shift) & 255) - ((a >> shift) & 255)) * clamp(k))
  return (c(16) << 16) | (c(8) << 8) | c(0)
}

export function hex(n) {
  return '#' + n.toString(16).padStart(6, '0')
}

function toBase64(words) {
  return new Uint8Array(words.buffer).toBase64()
}

function levelColor(p) {
  if (p === null || p === undefined) return DIM
  return LEVEL_COLORS[p >= 85 ? 4 : p >= 70 ? 3 : p >= 50 ? 2 : p >= 30 ? 1 : 0]
}

function gauge(E, label, p, n, k) {
  const shown = p === null || p === undefined ? null : Math.round(p * k)
  const filled = shown === null ? 0 : Math.round((shown / 100) * n)
  const out = [t(E, label + ' ', { color: DIM })]
  for (let i = 0; i < n; i += 1) {
    const at = Math.round(((i + 0.5) / n) * 100)
    out.push(t(E, '▊', { color: i < filled ? levelColor(at) : 'subtle' }))
  }
  out.push(t(E, shown === null ? ' —' : ' ' + shown + '%', { color: levelColor(shown), bold: true }))
  return out
}

// 한글 · 한자 등 넓은 글자는 2칸으로 센다(줄 맞춤용).
export function cellWidth(s) {
  let n = 0
  for (const ch of String(s)) n += ch.codePointAt(0) >= 0x1100 ? 2 : 1
  return n
}

function card(E, color, children) {
  return E.Box({ flexDirection: 'column', borderStyle: 'round', borderColor: color, paddingX: 1, children })
}

function line(E, children) {
  return E.Text({ wrap: 'truncate-end', children })
}

// ── 1. 부팅 스윕 ────────────────────────────────────────────────────────────────
// 앞 0.9초: 빛나는 머리가 왼쪽에서 오른쪽으로 지나가며 선을 켠다. 뒤: 글자가 찍히고 게이지가 차오른다.
export function sweepWords(width, pos, accent) {
  const words = new Uint32Array(width * 3)
  for (let i = 0; i < width; i += 1) {
    const lit = i < pos
    const head = lit && i >= pos - 4
    words[i * 3] = lit ? 0x2501 : 0x2500
    words[i * 3 + 1] = head ? mix(accent, 0xffffff, 0.3 + 0.7 * ((i - (pos - 4)) / 4)) : lit ? accent : 0x3a3a3a
    words[i * 3 + 2] = DEF
  }
  return words
}

function sweep(E, ctx, ms, cols) {
  const accent = ACCENT[ctx.family]
  const width = Math.max(10, Math.min(cols - 4, 110))
  const border = hex(mix(0x3a3a3a, accent, ease(ms / 700)))
  if (ms < 900) {
    const pos = Math.round(ease(ms / 900) * width)
    return card(E, border, [E.Raster({ key: 'fx-sweep', columns: width, rows: 1, cells: toBase64(sweepWords(width, pos, accent)) }), t(E, ' '), ...(ctx.tall ? [t(E, ' ')] : [])])
  }
  const full = '● ' + ctx.name + ' 세션 시작 · ' + ctx.dateText
  const typed = full.slice(0, Math.floor((ms - 900) / 35))
  const k = ease((ms - 900) / 1100)
  const u = ctx.usage
  return card(E, border, [
    line(E, [t(E, typed.slice(0, 1), { color: hex(accent) }), t(E, typed.slice(1), { bold: true })]),
    line(E, [...gauge(E, 'ctx', u.ctx, 8, k), t(E, '   '), ...gauge(E, '5h', u.h5, 6, k), t(E, '   '), ...gauge(E, '7d', u.d7, 6, k)]),
    ...(ctx.tall ? [t(E, ' ')] : []),
  ])
}

// ── 2. 브리핑 카드 ──────────────────────────────────────────────────────────────
// 줄이 0.13초 간격으로 하나씩 펼쳐진다.
function briefing(E, ctx, ms) {
  const accent = hex(ACCENT[ctx.family])
  const b = ctx.board
  const label = (s) => t(E, s + ' '.repeat(Math.max(0, 10 - cellWidth(s))) + ' ', { color: DIM })
  const rows = [
    line(E, [t(E, '세션 브리핑', { bold: true, color: accent }), t(E, '  ' + ctx.dateLong + ' · ' + ctx.name, { color: DIM })]),
    line(E, [
      label('작업 대장'),
      ...(b
        ? [t(E, '이어받을 것 '), t(E, String(b.resume), { bold: true, color: accent }), t(E, ' · 대기 '), t(E, String(b.wait), { bold: true }), ...(getConfig().texts.boardHint ? [t(E, '   ' + getConfig().texts.boardHint, { color: DIM })] : [])]
        : [t(E, '읽지 못함', { color: DIM })]),
    ]),
    line(E, [label('최근 작업'), t(E, b && b.recent.length ? b.recent.map((r) => r.task + (r.issue ? ' (' + r.issue + ')' : '')).join(' · ') : '없음')]),
    ...(ctx.dev ? [line(E, [label(ctx.dev.label), t(E, ctx.dev.open ? '가동 시간대' : '정지 시간대', { color: ctx.dev.open ? 'success' : 'warning', bold: true }), t(E, ' · ' + ctx.dev.text, { color: DIM })])] : []),
    line(E, [label('한도'), ...gauge(E, '5h', ctx.usage.h5, 8, 1), t(E, ctx.usage.h5Reset ? ' ↻' + ctx.usage.h5Reset : '', { color: DIM }), t(E, '   '), ...gauge(E, '7d', ctx.usage.d7, 8, 1)]),
  ]
  return card(E, accent, rows.slice(0, Math.min(rows.length, Math.floor(ms / 130) + 1)))
}

// ── 3. 캐릭터 인사 ──────────────────────────────────────────────────────────────
// 그림 높이 + 1줄을 고정해 두고 빈 줄을 위 · 아래로 옮겨 튀는 모양을 낸다(띠 높이가 흔들리지 않는다).
function mascot(E, ctx, ms, cols, maxRows) {
  const m = maxRows >= 24 ? MASCOT[36] : MASCOT[30]
  const accent = hex(ACCENT[ctx.family])
  const up = Math.floor(ms / 320) % 2 === 0
  const slide = Math.max(0, 14 - Math.floor(ms / 30))
  const pic = E.Raster({ key: 'fx-mascot', columns: m.cols, rows: m.rows, cells: m.cells })
  const hello = '안녕하세요!'.slice(0, Math.floor(ms / 70))
  const words = [t(E, hello, { bold: true, color: accent })]
  if (ms > 1000) words.push(t(E, ctx.dateLong + ' · ' + ctx.name))
  if (ms > 1500 && ctx.board) words.push(t(E, '이어받을 것 ' + ctx.board.resume + ' · 대기 ' + ctx.board.wait, { color: DIM }))
  const pad = []
  for (let i = 0; i < Math.floor(m.rows / 2) - 1; i += 1) pad.push(t(E, ' '))
  return E.Box({
    flexDirection: 'row',
    columnGap: 3,
    paddingLeft: slide,
    children: [
      E.Box({ flexDirection: 'column', flexShrink: 0, children: up ? [pic, t(E, ' ')] : [t(E, ' '), pic] }),
      cols - slide - m.cols >= 24 ? E.Box({ flexDirection: 'column', children: [...pad, ...words] }) : null,
    ],
  })
}

// ── 4. 워드마크 ────────────────────────────────────────────────────────────────
// 3×5 점 글꼴. 점 하나를 2칸(██)으로 그려 5줄짜리 큰 글자를 만든다.
const FONT = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110', E: '111100110100111',
  F: '111100110100100', G: '011100101101011', H: '101101111101101', I: '111010010010111', J: '001001001101010',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101', O: '111101101101111',
  P: '110101110100100', Q: '010101101111011', R: '110101110101101', S: '111100111001111', T: '111010010010010',
  U: '101101101101111', V: '101101101101010', W: '101101111111101', X: '101101010101101', Y: '101101010010010',
  Z: '111001010100111', '-': '000000111000000',
}

// 반환: { cols, rows: 5, on(x, y) } — 글자 사이 한 점 띄움, 점 하나는 scale 칸.
export function wordGrid(text, scale) {
  const letters = [...text.toUpperCase()].filter((c) => FONT[c])
  const dots = Math.max(0, letters.length * 4 - 1)
  return {
    cols: dots * scale,
    rows: 5,
    on(x, y) {
      const dx = Math.floor(x / scale)
      const li = Math.floor(dx / 4)
      const cx = dx % 4
      if (cx === 3 || li >= letters.length) return false
      return FONT[letters[li]][y * 3 + cx] === '1'
    },
  }
}

export function wordmarkWords(text, scale, ms, accent) {
  const g = wordGrid(text, scale)
  const words = new Uint32Array(g.cols * g.rows * 3)
  const shown = ease(ms / 700) * g.cols
  const span = g.cols + 24
  const center = -12 + span * clamp((ms - 500) / 1500)
  for (let y = 0; y < g.rows; y += 1) {
    for (let x = 0; x < g.cols; x += 1) {
      const w = (y * g.cols + x) * 3
      const lit = g.on(x, y) && x < shown
      // 빛은 오른쪽 위에서 왼쪽 아래로 기울어 지나간다.
      const glow = clamp(1 - Math.abs(x + y * 1.5 - center) / 9)
      words[w] = lit ? 0x2588 : 0x20
      words[w + 1] = lit ? mix(accent, 0xffffff, glow * 0.9) : DEF
      words[w + 2] = DEF
    }
  }
  return { cols: g.cols, rows: g.rows, words }
}

function wordmark(E, ctx, ms, cols) {
  const accent = ACCENT[ctx.family]
  const scale = wordGrid(ctx.word, 2).cols <= cols - 2 ? 2 : 1
  const r = wordmarkWords(ctx.word, scale, ms, accent)
  const sub = ms > 800 ? '세션 시작 · ' + ctx.dateText : ' '
  return E.Box({
    flexDirection: 'column',
    paddingLeft: 1,
    children: [E.Raster({ key: 'fx-word', columns: r.cols, rows: r.rows, cells: toBase64(r.words) }), t(E, sub, { color: DIM })],
  })
}

// 저장된 값(숫자 하나 · 배열 · 없음)을 효과 번호 배열로 고른다. 0 과 빈 배열은 「끔」이다.
// 부재 시 동작: 값이 없거나 알 수 없는 모양이면 fallback 을 쓴다.
export function normalizeChoice(value, fallback) {
  if (value === 0) return []
  const list = Array.isArray(value) ? value : typeof value === 'number' ? [value] : null
  if (!list) return fallback.slice()
  const out = []
  for (const v of list) if (FX[v] && !out.includes(v)) out.push(v)
  return out.length || list.length === 0 ? out : fallback.slice()
}

// 명령 인자에서 효과 번호를 뽑는다. "1 3" · "1,3" · "13" 모두 [1, 3].
export function parseIds(text) {
  const out = []
  for (const ch of String(text || '')) {
    const n = Number(ch)
    if (FX[n] && !out.includes(n)) out.push(n)
  }
  return out
}

// 여러 효과를 함께 재생할 때 지금 무엇을 그릴지 정한다.
// keep: 새 세션 시작 재생 — 브리핑(2)은 첫 턴이 시작될 때까지 남는다. 미리 보기는 각자 정해진 길이만 재생한다.
// 반환: above = 띠 위에 얹을 효과(위에서 아래 순서) · sweep = 띠 자리에서 부팅 스윕을 그릴지 ·
//       moving = 아직 움직이는 중인지 · done = 더 그릴 것이 없는지
export function introLayout(ids, ms, keep) {
  const on = (id) => ids.includes(id) && (ms < FX[id].ms || (id === 2 && keep))
  const above = [3, 4, 2].filter(on)
  const sweep = on(1)
  const moving = ids.some((id) => ms < (id === 2 && keep ? 1200 : FX[id].ms))
  return { above, sweep, moving, done: !sweep && above.length === 0 }
}

// 아직 켜지지 않은 띠. 새 세션인지 정해지기 전 잠깐 그린다(부팅 스윕의 0초 모습과 같은 크기).
// tall: 띠에 Clawd 가 있어 3줄일 때.
export function bootCard(E, tall) {
  return card(E, 'subtle', tall ? [t(E, ' '), t(E, ' '), t(E, ' ')] : [t(E, ' '), t(E, ' ')])
}

export function draw(E, id, ctx, ms, cols, maxRows) {
  if (id === 1) return sweep(E, ctx, ms, cols)
  if (id === 2) return briefing(E, ctx, ms)
  if (id === 3) return mascot(E, ctx, ms, cols, maxRows)
  return wordmark(E, ctx, ms, cols)
}

// ── 재료 만들기(순수) ───────────────────────────────────────────────────────────
// `wip` 명령의 출력에서 요약 숫자와 위쪽 작업 3개를 뽑는다. 형식이 다르면 null.
export function parseBoard(text) {
  const m = /이어받을 것\s*\**(\d+)\**\s*·\s*대기\s*\**(\d+)/.exec(text || '')
  if (!m) return null
  const recent = []
  for (const row of String(text).split('\n')) {
    if (!/^\|\s*\d+\s*\|/.test(row)) continue
    const c = row.split('|').map((s) => s.trim())
    const task = (c[3] || '').replace(/\*\*/g, '')
    const issue = (c[4] || '').replace(/^-$/, '')
    if (task) recent.push({ task: task.length > 22 ? task.slice(0, 21) + '…' : task, issue: issue.split(',')[0].trim() })
    if (recent.length === 3) break
  }
  return { resume: Number(m[1]), wait: Number(m[2]), recent }
}

// 평일 정해진 시간대에만 켜져 있는 것(설정의 serviceWindow — 예: 개발 서버)이 지금 가동 시간대인지. 실제 응답 여부가 아니라 시간대만 말한다.
// 부재 시 동작: 설정이 없으면 null 이고 브리핑 카드에서 그 줄이 빠진다.
export function devWindow(d, win) {
  const w = win === undefined ? getConfig().serviceWindow : win
  if (!w) return null
  const p = (n) => String(n).padStart(2, '0')
  const span = '평일 ' + p(w.start) + '–' + w.end + '시'
  const day = d.getDay()
  const h = d.getHours()
  const weekday = day >= 1 && day <= 5
  if (weekday && h >= w.start && h < w.end) {
    const left = (w.end - h) * 60 - d.getMinutes()
    return { label: w.label, open: true, text: span + ' · 정지까지 ' + Math.floor(left / 60) + '시간 ' + (left % 60) + '분' }
  }
  const next = weekday && h < w.start ? '오늘' : day >= 1 && day <= 4 ? '내일' : '월요일'
  return { label: w.label, open: false, text: span + ' · 다음 가동 ' + next + ' ' + p(w.start) + ':00' }
}

const DAYS = ['일', '월', '화', '수', '목', '금', '토']

export function dateTexts(d) {
  const p = (n) => String(n).padStart(2, '0')
  const hm = p(d.getHours()) + ':' + p(d.getMinutes())
  return {
    dateText: p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' (' + DAYS[d.getDay()] + ') ' + hm,
    dateLong: d.getMonth() + 1 + '월 ' + d.getDate() + '일 (' + DAYS[d.getDay()] + ') ' + hm,
  }
}

// 시작 효과(워드마크 · 인사)에 쓰는 이름. 설정의 repos 중 brand · word 가 있는 첫 항목을 따르고, 없으면 폴더 이름이다.
export function repoOf(cwd) {
  const c = String(cwd || '')
  for (const x of getConfig().repos) {
    if ((x.brand || x.word) && x.re.test(c)) return { family: x.family || 'blue', name: x.brand || x.word, word: x.word || x.brand.toUpperCase() }
  }
  const base = c.split('/').filter(Boolean).pop() || 'CLAUDE'
  return { family: 'blue', name: base, word: base.toUpperCase().replace(/[^A-Z-]/g, '').slice(0, 12) || 'CLAUDE' }
}
