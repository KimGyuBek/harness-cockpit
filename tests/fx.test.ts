import { expect, test } from 'claude-code/testing'
import { FX, draw, bootCard, parseBoard, devWindow, dateTexts, repoOf, wordGrid, wordmarkWords, sweepWords, cellWidth, normalizeChoice, parseIds, introLayout } from '../hooks/fx.js'
import { setConfig, normalizeConfig, getConfig, configText } from '../hooks/config.js'

// 시험용 환경 설정. 실제 쓰는 값은 ~/.claude/harness-cockpit.json 에 둔다.
const FIXTURE = {
  repos: [
    { match: '/redshop(/|$)|/redapp', family: 'red' },
    { match: '/redshop/worktree-fe/', name: 'RedApp-Web', color: '#4D9BFF' },
    { match: '/acme/bluedesk', name: 'BlueDesk', color: '#39C5BB' },
    { match: '/redshop(/|$)', family: 'red', brand: 'RedShop', word: 'REDSHOP' },
    { match: '/bluedesk(/|$)', family: 'blue', brand: 'BlueDesk', word: 'BLUEDESK' },
  ],
  alertFiles: [
    { path: '/tmp/.alert-alpha', label: 'alpha' },
    { path: '/tmp/.alert-beta', label: 'beta' },
    { path: '/tmp/.alert-delta', label: 'delta' },
    { path: '/tmp/.alert-gamma', label: 'gamma' },
  ],
  alert: { title: '승인 플래그', note: '다음 1건이 통과된다' },
  texts: { leftClear: '띄운 것 없음 — 닫아도 된다', leftBusy: '닫기 불가 — 정리 후 다시 확인한다', leftPane: '닫기 불가', boardHint: '→ 이어받기' },
  branchKey: '(xy|abc)-[0-9]+',
  branchKeyFlags: 'i',
  serviceWindow: { label: '시험 서버', startHour: 9, endHour: 21 },
}
setConfig(FIXTURE, '/home/x')

const E = {
  Box: (p) => ({ type: 'Box', props: p }),
  Text: (p) => ({ type: 'Text', props: p }),
  Raster: (p) => ({ type: 'Raster', props: p }),
}

function textOf(node) {
  if (node === null || node === undefined || node === false) return ''
  if (typeof node === 'string') return node
  if (Array.isArray(node)) return node.map(textOf).join('')
  const ch = node.props && node.props.children
  return Array.isArray(ch) ? ch.map(textOf).join('') : textOf(ch)
}

function find(node, type, out = []) {
  if (!node || typeof node !== 'object') return out
  if (Array.isArray(node)) {
    for (const n of node) find(n, type, out)
    return out
  }
  if (node.type === type) out.push(node)
  find(node.props && node.props.children, type, out)
  return out
}

const ctx = {
  family: 'blue',
  name: 'BlueDesk',
  word: 'BLUEDESK',
  dateText: '10-07 (수) 13:40',
  dateLong: '10월 7일 (수) 13:40',
  usage: { ctx: 40, h5: 60, d7: 90, h5Reset: '18:50' },
  board: { resume: 16, wait: 1, recent: [{ task: '문서 정리', issue: 'ABC-201' }] },
  dev: { label: '시험 서버', open: true, text: '평일 09–21시 · 정지까지 7시간 20분' },
}

test('parseBoard: 요약 숫자와 위쪽 작업 3개', async () => {
  const out = [
    '**작업 대장** · 이어받을 것 **16** · 대기 **1** · 다른 세션 진행 4',
    '',
    '| # | 상태 | 작업 | 이슈 | 비고 |',
    '|:-:|:-:|---|---|---|',
    '| 1 | **중단** | 문서 정리 | ABC-201 | 정리 안 됨 |',
    '| 2 | **보류** | 화면 개선 | ABC-228, ABC-230 | x |',
    '| 3 | **중단** | 아주 긴 작업 이름이 여기에 길게 이어져서 줄임표가 붙는 경우 | - | x |',
    '| 4 | 대기 | 넷째 | - | x |',
    '|  | 진행 중 | 화면 작업 | - | x |',
  ].join('\n')
  const b = parseBoard(out)
  expect(b.resume).toBe(16)
  expect(b.wait).toBe(1)
  expect(b.recent.length).toBe(3)
  expect(b.recent[0]).toEqual({ task: '문서 정리', issue: 'ABC-201' })
  expect(b.recent[1].issue).toBe('ABC-228')
  expect(b.recent[2].issue).toBe('')
  expect(b.recent[2].task.endsWith('…')).toBe(true)
  expect(parseBoard('아무것도 아님')).toBe(null)
})

test('devWindow · dateTexts · repoOf · cellWidth', async () => {
  expect(devWindow(new Date(2026, 9, 7, 13, 40)).open).toBe(true)
  expect(devWindow(new Date(2026, 9, 7, 13, 40)).text.includes('7시간 20분')).toBe(true)
  expect(devWindow(new Date(2026, 9, 7, 23, 0)).text.includes('내일 09:00')).toBe(true)
  expect(devWindow(new Date(2026, 9, 9, 23, 0)).text.includes('월요일 09:00')).toBe(true)
  expect(devWindow(new Date(2026, 9, 10, 12, 0)).open).toBe(false)
  expect(devWindow(new Date(2026, 9, 7, 7, 0)).text.includes('오늘 09:00')).toBe(true)
  // 설정에 가동 시간대가 없으면 줄 자체가 없다.
  expect(devWindow(new Date(2026, 9, 7, 13, 40), null)).toBe(null)
  expect(devWindow(new Date(2026, 9, 7, 13, 40), { label: 'x', start: 9, end: 18 }).text.includes('평일 09–18시 · 정지까지 4시간 20분')).toBe(true)
  expect(dateTexts(new Date(2026, 9, 7, 9, 5)).dateText).toBe('10-07 (수) 09:05')
  expect(repoOf('/Users/x/workspace/acme/redshop/worktree/xy-1').family).toBe('red')
  expect(repoOf('/Users/x/workspace/acme/bluedesk').word).toBe('BLUEDESK')
  expect(repoOf('/tmp/my-proj').word).toBe('MY-PROJ')
  expect(cellWidth('작업 대장')).toBe(9)
  expect(cellWidth('dev 서버')).toBe(8)
})

test('워드마크: 글자 수에 맞는 크기 · 처음엔 비어 있다가 다 켜진다', async () => {
  expect(wordGrid('BLUEDESK', 2).cols).toBe((8 * 4 - 1) * 2)
  const start = wordmarkWords('BLUEDESK', 2, 0, 0x4d9bff)
  const end = wordmarkWords('BLUEDESK', 2, 2800, 0x4d9bff)
  const lit = (w) => [...w.words].filter((v, i) => i % 3 === 0 && v === 0x2588).length
  expect(start.words.length).toBe(start.cols * 5 * 3)
  expect(lit(start)).toBe(0)
  expect(lit(end) > 100).toBe(true)
})

test('스윕: 머리가 지나간 칸만 켜진다', async () => {
  const w = sweepWords(20, 10, 0x4d9bff)
  expect(w[0]).toBe(0x2501)
  expect(w[19 * 3]).toBe(0x2500)
  expect(w[1]).toBe(0x4d9bff)
})

test('draw: 네 효과 모두 처음 · 중간 · 끝 프레임을 그린다', async () => {
  for (const id of [1, 2, 3, 4]) {
    for (const ms of [0, Math.floor(FX[id].ms / 2), FX[id].ms]) {
      const tree = draw(E, id, ctx, ms, 120, 40)
      expect(tree.type).toBe('Box')
    }
  }
  expect(find(draw(E, 1, ctx, 300, 120, 40), 'Raster').length).toBe(1)
  expect(textOf(draw(E, 1, ctx, 2600, 120, 40)).includes('BlueDesk 세션 시작')).toBe(true)
  expect(textOf(draw(E, 1, ctx, 2600, 120, 40)).includes('90%')).toBe(true)
  expect(draw(E, 2, ctx, 0, 120, 40).props.children.length).toBe(1)
  expect(draw(E, 2, ctx, 2000, 120, 40).props.children.length).toBe(5)
  expect(textOf(draw(E, 2, ctx, 2000, 120, 40)).includes('이어받을 것 16')).toBe(true)
  expect(find(draw(E, 3, ctx, 2000, 120, 40), 'Raster')[0].props.rows).toBe(18)
  expect(find(draw(E, 3, ctx, 2000, 120, 20), 'Raster')[0].props.rows).toBe(15)
  expect(textOf(draw(E, 3, ctx, 2000, 120, 40)).includes('안녕하세요!')).toBe(true)
  expect(find(draw(E, 4, ctx, 100, 50, 40), 'Raster')[0].props.columns).toBe(31)
})

test('normalizeChoice · parseIds: 저장 값과 명령 인자를 효과 번호 배열로', async () => {
  expect(normalizeChoice(undefined, [1, 3])).toEqual([1, 3])
  expect(normalizeChoice(2, [1, 3])).toEqual([2])
  expect(normalizeChoice(0, [1, 3])).toEqual([])
  expect(normalizeChoice([], [1, 3])).toEqual([])
  expect(normalizeChoice([3, 1, 3, 9], [2])).toEqual([3, 1])
  expect(normalizeChoice('x', [1, 3])).toEqual([1, 3])
  expect(normalizeChoice([9], [1, 3])).toEqual([1, 3])
  expect(parseIds('1 3')).toEqual([1, 3])
  expect(parseIds('1,3')).toEqual([1, 3])
  expect(parseIds('13')).toEqual([1, 3])
  expect(parseIds(' use')).toEqual([])
})

test('introLayout: 1 + 3 은 스윕이 띠 자리에서, 캐릭터가 그 위에서 함께 재생된다', async () => {
  const a = introLayout([1, 3], 500, true)
  expect(a.above).toEqual([3])
  expect(a.sweep).toBe(true)
  expect(a.moving).toBe(true)
  const b = introLayout([1, 3], FX[1].ms + 100, true)
  expect(b.sweep).toBe(false)
  expect(b.above).toEqual([3])
  const c = introLayout([1, 3], FX[3].ms + 100, true)
  expect(c.done).toBe(true)
  // 브리핑은 새 세션 시작 재생이면 남고(움직임만 멈춤), 미리 보기면 정해진 길이 뒤에 끝난다.
  const keep = introLayout([2], 60000, true)
  expect(keep.above).toEqual([2])
  expect(keep.moving).toBe(false)
  expect(keep.done).toBe(false)
  expect(introLayout([2], FX[2].ms + 1, false).done).toBe(true)
  expect(introLayout([4, 2, 3], 100, false).above).toEqual([3, 4, 2])
})

test('bootCard: 띠와 같은 2줄 꺼진 카드', async () => {
  const c = bootCard(E)
  expect(c.props.borderStyle).toBe('round')
  expect(c.props.children.length).toBe(2)
  expect(bootCard(E, true).props.children.length).toBe(3)
  // Clawd 가 있는 3줄 띠에서는 스윕 카드도 3줄이다.
  expect(draw(E, 1, Object.assign({}, ctx, { tall: true }), 300, 120, 40).props.children.length).toBe(3)
  expect(draw(E, 1, Object.assign({}, ctx, { tall: true }), 2000, 120, 40).props.children.length).toBe(3)
})
