const express = require('express')
const axios = require('axios')
const sharp = require('sharp')
const ort = require('onnxruntime-node')
const fs = require('fs')
const path = require('path')

const PORT = Number.parseInt(process.env.PORT || '80', 10)
const INPUT_SIZE = Number.parseInt(process.env.INPUT_SIZE || '640', 10)
const CONF_THRESHOLD = Number.parseFloat(process.env.CONF_THRESHOLD || '0.25')
const IOU_THRESHOLD = Number.parseFloat(process.env.IOU_THRESHOLD || '0.45')
const MODEL_PATH = process.env.MODEL_PATH || path.join(__dirname, 'model', 'best.onnx')

function readJsonArray(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const classNames = readJsonArray(path.join(__dirname, 'classes.json'))

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value))
}

function iou(a, b) {
  const x1 = Math.max(a.x1, b.x1)
  const y1 = Math.max(a.y1, b.y1)
  const x2 = Math.min(a.x2, b.x2)
  const y2 = Math.min(a.y2, b.y2)
  const interW = Math.max(0, x2 - x1)
  const interH = Math.max(0, y2 - y1)
  const inter = interW * interH
  const areaA = Math.max(0, a.x2 - a.x1) * Math.max(0, a.y2 - a.y1)
  const areaB = Math.max(0, b.x2 - b.x1) * Math.max(0, b.y2 - b.y1)
  const union = areaA + areaB - inter
  return union <= 0 ? 0 : inter / union
}

function nms(detections, iouThreshold) {
  const sorted = [...detections].sort((a, b) => b.score - a.score)
  const selected = []
  for (const det of sorted) {
    let keep = true
    for (const picked of selected) {
      if (iou(det.box, picked.box) > iouThreshold) {
        keep = false
        break
      }
    }
    if (keep) selected.push(det)
  }
  return selected
}

async function fetchImageBuffer(imageUrl) {
  const res = await axios.get(imageUrl, { responseType: 'arraybuffer', timeout: 20000 })
  return Buffer.from(res.data)
}

async function letterboxToSquare(buffer, size) {
  const image = sharp(buffer).removeAlpha().toColourspace('srgb')
  const meta = await image.metadata()
  const originalWidth = meta.width || 0
  const originalHeight = meta.height || 0
  if (!originalWidth || !originalHeight) {
    throw new Error('Invalid image')
  }

  const r = Math.min(size / originalWidth, size / originalHeight)
  const newW = Math.max(1, Math.round(originalWidth * r))
  const newH = Math.max(1, Math.round(originalHeight * r))
  const padW = size - newW
  const padH = size - newH
  const padLeft = Math.floor(padW / 2)
  const padTop = Math.floor(padH / 2)

  const resized = await image.resize(newW, newH, { fit: 'fill' }).toBuffer()
  const raw = await sharp({
    create: { width: size, height: size, channels: 3, background: { r: 114, g: 114, b: 114 } }
  })
    .composite([{ input: resized, left: padLeft, top: padTop }])
    .raw()
    .toBuffer()

  return {
    raw,
    meta: {
      originalWidth,
      originalHeight,
      r,
      padLeft,
      padTop
    }
  }
}

function rawRgbToChwFloat32(raw, size) {
  const hw = size * size
  const out = new Float32Array(3 * hw)
  for (let i = 0; i < hw; i++) {
    const base = i * 3
    out[i] = raw[base] / 255
    out[hw + i] = raw[base + 1] / 255
    out[2 * hw + i] = raw[base + 2] / 255
  }
  return out
}

function readValue(data, layout, channels, numBoxes, c, b) {
  if (layout === 'CHW') return data[c * numBoxes + b]
  return data[b * channels + c]
}

function decodeYoloOutput(outTensor, letterboxMeta) {
  const dims = outTensor.dims
  const data = outTensor.data
  let channels = 0
  let numBoxes = 0
  let layout = 'CHW'

  if (dims.length === 3) {
    if (dims[1] < dims[2]) {
      channels = dims[1]
      numBoxes = dims[2]
      layout = 'CHW'
    } else {
      numBoxes = dims[1]
      channels = dims[2]
      layout = 'NCH'
    }
  } else if (dims.length === 2) {
    numBoxes = dims[0]
    channels = dims[1]
    layout = 'NCH'
  } else {
    throw new Error(`Unsupported output dims: ${dims.join(',')}`)
  }

  let hasObj = false
  let numClasses = Math.max(0, channels - 4)
  if (classNames.length > 0) {
    if (channels === 5 + classNames.length) {
      hasObj = true
      numClasses = classNames.length
    } else if (channels === 4 + classNames.length) {
      hasObj = false
      numClasses = classNames.length
    }
  }

  const detections = []
  const { originalWidth, originalHeight, r, padLeft, padTop } = letterboxMeta
  const cStart = hasObj ? 5 : 4

  for (let b = 0; b < numBoxes; b++) {
    const x = readValue(data, layout, channels, numBoxes, 0, b)
    const y = readValue(data, layout, channels, numBoxes, 1, b)
    const w = readValue(data, layout, channels, numBoxes, 2, b)
    const h = readValue(data, layout, channels, numBoxes, 3, b)
    const obj = hasObj ? readValue(data, layout, channels, numBoxes, 4, b) : 1

    let bestClass = -1
    let bestScore = 0
    for (let c = 0; c < numClasses; c++) {
      const score = readValue(data, layout, channels, numBoxes, cStart + c, b)
      if (score > bestScore) {
        bestScore = score
        bestClass = c
      }
    }

    const conf = obj * bestScore
    if (conf < CONF_THRESHOLD) continue

    const x1 = (x - w / 2 - padLeft) / r
    const y1 = (y - h / 2 - padTop) / r
    const x2 = (x + w / 2 - padLeft) / r
    const y2 = (y + h / 2 - padTop) / r

    const box = {
      x1: clamp(x1, 0, originalWidth),
      y1: clamp(y1, 0, originalHeight),
      x2: clamp(x2, 0, originalWidth),
      y2: clamp(y2, 0, originalHeight)
    }

    detections.push({
      classId: bestClass,
      className: classNames[bestClass] || String(bestClass),
      score: conf,
      box
    })
  }

  return nms(detections, IOU_THRESHOLD)
}

let sessionPromise = null

async function getSession() {
  if (!sessionPromise) {
    sessionPromise = ort.InferenceSession.create(MODEL_PATH, {
      executionProviders: ['cpu']
    })
  }
  return sessionPromise
}

const app = express()
app.use(express.json({ limit: '12mb' }))

app.get('/health', (req, res) => {
  res.json({ ok: true })
})

app.post('/infer', async (req, res) => {
  try {
    const { imageUrl } = req.body || {}
    if (!imageUrl || typeof imageUrl !== 'string') {
      res.status(400).json({ ok: false, message: 'imageUrl is required' })
      return
    }

    const buffer = await fetchImageBuffer(imageUrl)
    const { raw, meta } = await letterboxToSquare(buffer, INPUT_SIZE)
    const inputData = rawRgbToChwFloat32(raw, INPUT_SIZE)
    const session = await getSession()
    const inputName = session.inputNames[0]
    const feeds = {}
    feeds[inputName] = new ort.Tensor('float32', inputData, [1, 3, INPUT_SIZE, INPUT_SIZE])
    const results = await session.run(feeds)
    const outName = session.outputNames[0]
    const outTensor = results[outName]

    const detections = decodeYoloOutput(outTensor, meta)
    res.json({
      ok: true,
      model: {
        inputSize: INPUT_SIZE,
        classes: classNames
      },
      image: {
        width: meta.originalWidth,
        height: meta.originalHeight
      },
      detections
    })
  } catch (e) {
    res.status(500).json({ ok: false, message: e && e.message ? e.message : String(e) })
  }
})

app.listen(PORT, () => {
  process.stdout.write(`listening on ${PORT}\n`)
})
