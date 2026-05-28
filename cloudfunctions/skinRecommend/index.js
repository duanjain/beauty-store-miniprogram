const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

function normalizeText(text) {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function uniqStrings(arr) {
  const set = new Set()
  for (const item of arr || []) {
    const v = String(item || '').trim()
    if (v) set.add(v)
  }
  return Array.from(set)
}

function issueKeywords(issue) {
  const x = normalizeText(issue)
  const map = [
    { keys: ['acne', 'pimple', '痘', '痘痘', '粉刺', '闭口', '痘印'], words: ['祛痘', '粉刺', '闭口', '痘印', '净痘', '消炎'] },
    { keys: ['blackhead', '黑头'], words: ['黑头', '去黑头', '清洁', '毛孔'] },
    { keys: ['pore', '毛孔'], words: ['毛孔', '收缩毛孔', '细致', '紧致'] },
    { keys: ['dry', 'dryness', '干', '干燥'], words: ['补水', '保湿', '滋润', '干燥', '修护'] },
    { keys: ['oil', 'oily', '出油', '油'], words: ['控油', '清爽', '去油', '油皮', '平衡'] },
    { keys: ['sensitive', '敏感', '泛红'], words: ['敏感', '舒缓', '修护', '泛红', '温和'] },
    { keys: ['wrinkle', 'fine line', '细纹', '皱纹'], words: ['抗老', '抗皱', '紧致', '淡纹', '胶原'] },
    { keys: ['dull', 'dark', '暗沉', '色斑'], words: ['提亮', '美白', '淡斑', '暗沉', '焕亮'] }
  ]

  for (const item of map) {
    for (const k of item.keys) {
      if (x.includes(normalizeText(k))) return uniqStrings([issue, ...item.words])
    }
  }
  return uniqStrings([issue])
}

function expandIssueByIndex(issue) {
  const raw = String(issue || '').trim()
  const m = raw.match(/^(?:类别)?\s*(\d+)$/)
  if (!m) return null
  const idx = Number(m[1])
  const table = {
    0: ['痘痘', '粉刺', '闭口', '痘印', '祛痘', '净痘', '消炎', 'acne'],
    1: ['黑头', '闭口', '去黑头', '清洁', 'blackhead'],
    2: ['毛孔', '毛孔粗大', '收缩毛孔', '清洁毛孔', 'pore'],
    3: ['色斑', '暗沉', '美白', '淡斑', '提亮', 'dull'],
    4: ['敏感', '红血丝', '泛红', '舒缓', '修护', 'sensitive'],
    5: ['干燥', '缺水', '补水', '保湿', '滋润', 'dry'],
    6: ['出油', '油皮', '控油', '清爽', '油脂', 'oily'],
    7: ['细纹', '皱纹', '松弛', '抗老', '紧致', 'wrinkle'],
    8: ['黑眼圈', '眼袋', '淡纹', '提拉', '眼部'],
    9: ['粗糙', '角质', '修护', '舒缓', '屏障']
  }
  return uniqStrings([raw, ...(table[idx] || [])])
}

function scoreProduct(product, issues) {
  const name = normalizeText(product.name)
  const desc = normalizeText(product.description)
  const text = `${name} ${desc}`.trim()
  if (!text) return { score: 0, reasons: [] }

  let score = 0
  const reasons = []

  for (const issue of issues) {
    const expanded = expandIssueByIndex(issue)
    const words = expanded ? expanded : issueKeywords(issue)
    for (const w of words) {
      const ww = normalizeText(w)
      if (!ww) continue
      if (text.includes(ww)) {
        const base = ww === normalizeText(issue) ? 3 : 2
        score += base
        reasons.push(w)
      }
    }
  }

  return { score, reasons: uniqStrings(reasons).slice(0, 6) }
}

exports.main = async (event, context) => {
  try {
    const issues = uniqStrings(event && event.issues ? event.issues : [])
    if (!issues.length) {
      return { success: true, products: [] }
    }

    const res = await db.collection('products').where({ status: true }).limit(200).get()
    const products = Array.isArray(res.data) ? res.data : []

    const scored = products
      .map((p) => {
        const s = scoreProduct(p, issues)
        return {
          ...p,
          _matchScore: s.score,
          _matchReasons: s.reasons
        }
      })
      .filter((p) => p._matchScore > 0)
      .sort((a, b) => b._matchScore - a._matchScore)
      .slice(0, 10)

    return {
      success: true,
      products: scored
    }
  } catch (e) {
    return {
      success: false,
      message: e && e.message ? e.message : String(e)
    }
  }
}
