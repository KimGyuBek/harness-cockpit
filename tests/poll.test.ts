import { expect, test } from 'claude-code/testing'
import { POLL_DEFAULT, POLL_MIN, normalizePoll, setPoll, pollText, due, parseSys, smoothCpu, sustain, sysLevel, parseAwake, shouldSample } from '../hooks/poll.js'

test('normalizePoll: 저장값이 없거나 깨져도 기본값 · 하한 아래는 하한으로', async () => {
  expect(normalizePoll(null)).toEqual(POLL_DEFAULT)
  expect(normalizePoll('x')).toEqual(POLL_DEFAULT)
  expect(normalizePoll({ sys: 3, usage: 'abc', git: -1 }).sys).toBe(3)
  expect(normalizePoll({ sys: 3, usage: 'abc', git: -1 }).usage).toBe(POLL_DEFAULT.usage)
  expect(normalizePoll({ sys: 0.5 }).sys).toBe(POLL_MIN.sys)
  expect(normalizePoll({ nope: 1 })).toEqual(POLL_DEFAULT)
})

test('setPoll: 요소별로 바꾸기 · 하한 · 되돌리기 · 잘못된 입력', async () => {
  const a = setPoll(POLL_DEFAULT, 'sys', '3')
  expect(a.ok).toBe(true)
  expect(a.poll.sys).toBe(3)
  expect(a.poll.usage).toBe(POLL_DEFAULT.usage)
  const low = setPoll(POLL_DEFAULT, 'sys', '1')
  expect(low.poll.sys).toBe(POLL_MIN.sys)
  expect(low.msg.includes('하한')).toBe(true)
  expect(setPoll(a.poll, 'sys', 'reset').poll.sys).toBe(POLL_DEFAULT.sys)
  expect(setPoll(POLL_DEFAULT, 'cpu', '3').ok).toBe(false)
  expect(setPoll(POLL_DEFAULT, 'sys', 'abc').ok).toBe(false)
  const text = pollText(a.poll)
  expect(text.includes('sys')).toBe(true)
  expect(text.includes('(기본 5)')).toBe(true)
  expect(text.split('\n').length).toBe(Object.keys(POLL_DEFAULT).length + 2)
})

test('due: 처음이거나 주기가 지났을 때만', async () => {
  expect(due(1000, 0, 5)).toBe(true)
  expect(due(10000, 6000, 5)).toBe(false)
  expect(due(11000, 6000, 5)).toBe(true)
})

test('parseSys: iostat 마지막 줄 · 메모리 여유 비율 · 압력 단계', async () => {
  const out = '   20.69   53  1.07   5  9 86  2.56 2.49 2.41\nSystem-wide memory free percentage: 59%\n1\n'
  expect(parseSys(out)).toEqual({ cpu: 14, memUsed: 41, pressure: 1 })
  // 디스크가 둘이면 앞 열이 늘어난다 — 뒤에서 세므로 그대로 읽힌다.
  const two = '   20.69   53  1.07    4.00    1  0.00  40 55  5  9.10 7.20 5.00\nSystem-wide memory free percentage: 8%\n4\n'
  expect(parseSys(two)).toEqual({ cpu: 95, memUsed: 92, pressure: 4 })
  expect(parseSys('')).toBe(null)
  expect(parseSys('garbage\nmore')).toBe(null)
  expect(parseSys('1 2 3 4 5 6\nno memory line')).toBe(null)
})

test('sysLevel · smoothCpu: 주의 · 높음 · 위험 기준과 CPU 섞기', async () => {
  expect(sysLevel({ cpu: 10, memUsed: 41, pressure: 1 })).toBe(0)
  expect(sysLevel({ cpu: 55, memUsed: 41, pressure: 1 })).toBe(1)
  expect(sysLevel({ cpu: 10, memUsed: 76, pressure: 1 })).toBe(1)
  // CPU 가 한 번 80% 를 넘은 것만으로는 높음이 아니다 — 30초 이어져야 한다.
  expect(sysLevel({ cpu: 82, memUsed: 41, pressure: 1 })).toBe(1)
  expect(sysLevel({ cpu: 82, memUsed: 41, pressure: 1 }, 82, { hi: true, crit: false })).toBe(2)
  expect(sysLevel({ cpu: 10, memUsed: 41, pressure: 2 })).toBe(2)
  expect(sysLevel({ cpu: 96, memUsed: 41, pressure: 1 }, 96, { hi: true, crit: false })).toBe(2)
  expect(sysLevel({ cpu: 96, memUsed: 41, pressure: 1 }, 96, { hi: true, crit: true })).toBe(3)
  expect(sysLevel({ cpu: 10, memUsed: 94, pressure: 1 })).toBe(3)
  expect(sysLevel({ cpu: 10, memUsed: 41, pressure: 4 })).toBe(3)
  expect(sysLevel(null)).toBe(0)
  // 한 번 튄 값은 반만 반영된다.
  expect(smoothCpu(null, 90)).toBe(90)
  expect(smoothCpu(10, 90)).toBe(50)
  expect(sysLevel({ cpu: 90, memUsed: 41, pressure: 1 }, smoothCpu(10, 90))).toBe(1)
})

test('sustain: 높음은 80% 가 30초, 위험은 95% 가 60초 이어질 때만', async () => {
  const t = 1_000_000
  const hist = (cpus: number[], step = 5000) => cpus.map((cpu, i) => ({ ts: t - (cpus.length - 1 - i) * step, cpu }))
  expect(sustain([], t)).toEqual({ hi: false, crit: false })
  // 세션을 여는 순간의 한두 번 튐.
  expect(sustain(hist([20, 85, 88]), t).hi).toBe(false)
  // 30초(표본 7개) 내내 80% 이상.
  expect(sustain(hist([85, 82, 90, 88, 84, 81, 86]), t).hi).toBe(true)
  // 중간에 한 번 내려갔으면 아니다.
  expect(sustain(hist([85, 82, 60, 88, 84, 81, 86]), t).hi).toBe(false)
  expect(sustain(hist(new Array(13).fill(97)), t)).toEqual({ hi: true, crit: true })
  expect(sustain(hist(new Array(7).fill(97)), t).crit).toBe(false)
  // 표본이 창의 8할을 못 덮으면(방금 켠 세션) 아직 판단하지 않는다.
  expect(sustain(hist([90, 90, 90]), t).hi).toBe(false)
})

test('parseAwake: caffeinate 가 화면 잠자기를 막을 때만', async () => {
  const on = '   pid 64397(caffeinate): [0x1] 00:03:26 PreventUserIdleDisplaySleep named: "caffeinate command-line tool"\n   pid 78315(caffeinate): [0x2] 00:02:57 PreventUserIdleSystemSleep named: "caffeinate command-line tool"'
  expect(parseAwake(on)).toBe(true)
  // 턴 동안 Claude Code 가 거는 것은 시스템 잠자기만 막는다.
  expect(parseAwake('   pid 78315(caffeinate): [0x2] 00:02:57 PreventUserIdleSystemSleep named: "caffeinate command-line tool"')).toBe(false)
  // 다른 프로그램(동영상 재생 등)이 화면을 켜 둔 것은 세지 않는다.
  expect(parseAwake('   pid 900(Google Chrome): [0x3] 00:00:10 PreventUserIdleDisplaySleep named: "Playing video"')).toBe(false)
  expect(parseAwake('')).toBe(false)
})

test('shouldSample: 마지막으로 잰 세션이 계속 재고, 사라지면 2.2배 뒤에 이어받는다', async () => {
  expect(shouldSample(null, 100000, 'a', 5)).toBe(true)
  expect(shouldSample({ ts: 98000, by: 'a' }, 100000, 'a', 5)).toBe(false)
  // 재던 세션은 주기의 6할(3초)이 지나면 다시 잰다 — 재는 데 걸리는 1초를 빼고도 5초 간격이 나온다.
  expect(shouldSample({ ts: 96000, by: 'a' }, 100000, 'a', 5)).toBe(true)
  expect(shouldSample({ ts: 96000, by: 'a' }, 100000, 'b', 5)).toBe(false)
  expect(shouldSample({ ts: 94000, by: 'a' }, 100000, 'a', 5)).toBe(true)
  expect(shouldSample({ ts: 94000, by: 'a' }, 100000, 'b', 5)).toBe(false)
  expect(shouldSample({ ts: 88000, by: 'a' }, 100000, 'b', 5)).toBe(true)
  expect(shouldSample({ ts: 'x', by: 'a' }, 100000, 'b', 5)).toBe(true)
})
