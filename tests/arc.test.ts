import { expect, test } from 'claude-code/testing'
import { ARC_COLS, ARC_ROWS, sunTimes, quitTimer, sunColor, orbit, arcWords, weekSpans, chimeAt, skyPhase, skyOf, sleepSky } from '../hooks/arc.js'

const near = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol

test('sunTimes: 적도 · 본초 자오선에서 춘분 · 하지의 일출 · 일몰이 알려진 값과 5분 안에서 맞는다', async () => {
  const eq = sunTimes(2026, 3, 20, 0, 0, 0)
  expect(near(eq.rise, 6 * 60 + 4, 5)).toBe(true)
  expect(near(eq.set, 18 * 60 + 11, 5)).toBe(true)
  // 북위 51.5도 · 하지: 낮이 16시간 반쯤.
  const jun = sunTimes(2026, 6, 21, 51.5, 0, 0)
  expect(near(jun.set - jun.rise, 16 * 60 + 38, 8)).toBe(true)
  // 시간대를 한 시간 옮기면 한 시간씩 밀린다.
  expect(sunTimes(2026, 3, 20, 0, 0, 1).rise - eq.rise).toBe(60)
})

test('quitTimer: 평일 18:00 기준 · 색 단계 · 깜빡임 · 주말 없음', async () => {
  expect(quitTimer(946, 4)).toEqual({ text: '2h14m', color: 0x3fae58, blink: false, done: false })
  expect(quitTimer(830, 4).color).toBe(0x7b8491)
  expect(quitTimer(1000, 4).color).toBe(0x74ad2c)
  expect(quitTimer(1038, 4).color).toBe(0xcf9400)
  expect(quitTimer(1062, 4).color).toBe(0xe0762b)
  expect(quitTimer(1074, 4)).toEqual({ text: '6m', color: 0xf0506e, blink: true, done: false })
  // 남은 시간은 길이로 적는다(시각처럼 보이지 않게). 한 시간이 안 남으면 분만.
  expect(quitTimer(1038, 4).text).toBe('42m')
  expect(quitTimer(600, 4).text).toBe('8h00m')
  // 퇴근 시각부터 10분은 0m 을 초록으로 깜빡이고, 그 뒤는 넘긴 시간을 보라색으로.
  expect(quitTimer(1084, 4)).toEqual({ text: '0m', color: 0x3fae58, blink: true, done: true })
  expect(quitTimer(1103, 4)).toEqual({ text: '+23m', color: 0x9b72e8, blink: false, done: true })
  expect(quitTimer(1400, 4)).toEqual({ off: true })
  expect(quitTimer(946, 6)).toEqual({ off: true })
  expect(quitTimer(946, 0)).toEqual({ off: true })
})

test('orbit · sunColor: 낮에는 해가 일출에서 일몰까지, 밤에는 달이 같은 길을 간다', async () => {
  expect(orbit(392, 392, 1086)).toEqual({ day: true, f: 0 })
  expect(near(orbit(739, 392, 1086).f * 100, 50, 1)).toBe(true)
  expect(orbit(1086, 392, 1086).day).toBe(false)
  expect(orbit(1086, 392, 1086).f).toBe(0)
  expect(orbit(100, 392, 1086).day).toBe(false)
  expect(sunColor(0.02)).toBe(0xff7d52)
  expect(sunColor(0.5)).toBe(0xe08a00)
  expect(sunColor(0.97)).toBe(0xff6336)
})

function rowsOf(w: Uint32Array) {
  const rows = []
  for (let r = 0; r < ARC_ROWS; r += 1) {
    let s = ''
    for (let c = 0; c < ARC_COLS; c += 1) s += String.fromCodePoint(w[(r * ARC_COLS + c) * 3])
    rows.push(s)
  }
  return rows
}

test('arcWords: 14 × 2칸 · 점자 반원 · 해 한 칸 · 둘째 줄 가운데에 퇴근 숫자', async () => {
  const w = arcWords({ min: 946, rise: 392, set: 1086, timer: quitTimer(946, 4), tick: 0, flash: 0 })
  expect(w.length).toBe(ARC_COLS * ARC_ROWS * 3)
  const rows = rowsOf(w)
  expect(rows[1].slice(4, 9)).toBe('2h14m')
  expect(rows.join('').includes('●')).toBe(true)
  // 반원은 양 끝이 둘째 줄, 꼭대기가 첫째 줄에 있다.
  expect(rows[1][0] !== ' ').toBe(true)
  expect(rows[0][6] !== ' ').toBe(true)
  // 밤에는 달.
  expect(rowsOf(arcWords({ min: 1290, rise: 392, set: 1086, timer: quitTimer(1290, 4), tick: 0, flash: 0 })).join('').includes('◗')).toBe(true)
  // 숫자 색은 단계 색, 바탕은 터미널 기본.
  const k = (1 * ARC_COLS + 4) * 3
  expect(w[k + 1]).toBe(0x3fae58)
  expect(w[k + 2]).toBe(0x01000000)
})

test('arcWords: 깜빡임 — 마지막 10분에만 숫자 전체가 꺼졌다 켜진다. 평소엔 가만히 있고, 주말엔 숫자가 없다', async () => {
  const base = { rise: 392, set: 1086, flash: 0 }
  const steady = rowsOf(arcWords(Object.assign({ min: 946, timer: quitTimer(946, 4), tick: 1 }, base)))
  expect(steady[1].slice(4, 9)).toBe('2h14m')
  const allOff = rowsOf(arcWords(Object.assign({ min: 1074, timer: quitTimer(1074, 4), tick: 1 }, base)))
  expect(allOff[1].trim().replace(/[\u2800-\u28ff●]/g, '').trim()).toBe('')
  const allOn = rowsOf(arcWords(Object.assign({ min: 1074, timer: quitTimer(1074, 4), tick: 2 }, base)))
  expect(allOn[1].slice(6, 8)).toBe('6m')
  const weekend = rowsOf(arcWords(Object.assign({ min: 946, timer: quitTimer(946, 6), tick: 0 }, base)))
  expect(/\d/.test(weekend[1])).toBe(false)
})

test('arcWords: 정각 반짝임 — 밝은 위상에서는 해가 겹고리로 커지고 길 전체가 켜진다(흰색은 쓰지 않는다)', async () => {
  const base = { min: 900, rise: 392, set: 1086, timer: quitTimer(900, 4), tick: 0 }
  const glyphs = (w: Uint32Array) => {
    const out = []
    for (let i = 0; i < ARC_COLS * ARC_ROWS; i += 1) out.push(w[i * 3])
    return out
  }
  const colors = (w: Uint32Array) => {
    const out = new Set<number>()
    for (let i = 0; i < ARC_COLS * ARC_ROWS; i += 1) if (w[i * 3] >= 0x2800 && w[i * 3] <= 0x28ff) out.add(w[i * 3 + 1])
    return [...out]
  }
  const on = arcWords(Object.assign({ flash: 1 }, base))
  const off = arcWords(Object.assign({ flash: 0 }, base))
  expect(glyphs(on).includes(0x25c9)).toBe(true)
  expect(glyphs(off).includes(0x25c9)).toBe(false)
  expect(glyphs(arcWords(Object.assign({ flash: 2 }, base))).includes(0x25c9)).toBe(false)
  // 평소엔 지나온 길 · 남은 길 두 색, 밝은 위상에선 한 색.
  expect(colors(off).length).toBe(2)
  expect(colors(on).length).toBe(1)
  for (const w of [on, off]) for (let i = 0; i < ARC_COLS * ARC_ROWS; i += 1) expect(w[i * 3 + 1] !== 0xffffff).toBe(true)
})

test('색: 그림 칸에 쓰는 색은 흰 바탕 · 어두운 바탕 모두에서 대비 2.4 이상이다', async () => {
  const lum = (c: number) => {
    const f = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)
    return 0.2126 * f(((c >> 16) & 255) / 255) + 0.7152 * f(((c >> 8) & 255) / 255) + 0.0722 * f((c & 255) / 255)
  }
  const cr = (a: number, b: number) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
  const used = new Set<number>()
  for (const min of [300, 400, 480, 600, 740, 900, 1000, 1040, 1062, 1074, 1084, 1103, 1290]) {
    for (const flash of [0, 1]) {
      const w = arcWords({ min, rise: 392, set: 1086, timer: quitTimer(min, 4), tick: 0, flash })
      for (let i = 0; i < ARC_COLS * ARC_ROWS; i += 1) if (w[i * 3] !== 0x20) used.add(w[i * 3 + 1])
    }
  }
  expect(used.size >= 8).toBe(true)
  for (const c of used) {
    expect(cr(c, 0xffffff) >= 2.4).toBe(true)
    expect(cr(c, 0x15171c) >= 2.4).toBe(true)
  }
})

test('weekSpans: 오늘 · 지난 날 · 남은 날 · 주말', async () => {
  expect(weekSpans(4).map((x) => x.text + ':' + x.kind)).toEqual(['월:past', '화:past', '수:past', '목:today', '금:future'])
  expect(weekSpans(1)[0]).toEqual({ text: '월', kind: 'today' })
  expect(weekSpans(6).map((x) => x.kind)).toEqual(['past', 'past', 'past', 'past', 'past', 'weekend'])
  expect(weekSpans(0)[5]).toEqual({ text: '일', kind: 'weekend' })
})

test('chimeAt: 평일 정해 둔 시각은 종, 정각은 해 반짝, 겹치면 종만', async () => {
  expect(chimeAt(930, 4, [930])).toBe('bell')
  expect(chimeAt(930, 4)).toBe('')
  expect(chimeAt(930, 6, [930])).toBe('')
  expect(chimeAt(900, 4)).toBe('hour')
  expect(chimeAt(900, 0)).toBe('hour')
  expect(chimeAt(901, 4)).toBe('')
  expect(chimeAt(900, 4, [900])).toBe('bell')
})

test('skyOf: 아침 · 낮 · 노을 · 밤', async () => {
  expect(skyPhase(300, 392, 1086)).toBe('night')
  expect(skyPhase(450, 392, 1086)).toBe('morning')
  expect(skyPhase(780, 392, 1086)).toBe('day')
  expect(skyPhase(1070, 392, 1086)).toBe('sunset')
  expect(skyPhase(1290, 392, 1086)).toBe('night')
  expect(skyOf(1290, 392, 1086).stars).toBe(true)
  expect(skyOf(780, 392, 1086).cloud).toBe(true)
  expect(skyOf(1070, 392, 1086).rows.length).toBe(3)
  expect(skyOf(1070, 392, 1086).glow).toBe(true)
  // 해는 낮에 맨 윗줄, 아침 일찍과 해 질 녘에는 아랫줄. 밤에는 달이 오른쪽 위.
  expect(skyOf(780, 392, 1086).orb.cy).toBe(0)
  expect(skyOf(450, 392, 1086).orb.cy).toBe(2)
  expect(skyOf(1070, 392, 1086).orb.cy).toBe(2)
  expect(skyOf(1290, 392, 1086).orb.ch).toBe('◗')
  expect(skyOf(392, 392, 1086).orb.cx).toBe(0)
  expect(skyOf(1086, 392, 1086).orb.cx).toBe(14)
})

test('sleepSky: 잠든 세션은 시각과 상관없이 밤하늘 + 왼쪽 위 달', async () => {
  const s = sleepSky()
  expect(s.phase).toBe('night')
  expect(s.rows).toEqual([0x0d1433, 0x141c44, 0x1b2452])
  expect(s.stars).toBe(true)
  expect(s.showOrb).toBe(true)
  expect(s.orb).toEqual({ cx: 1, cy: 0, ch: '◗', color: 0xffd23f })
})
