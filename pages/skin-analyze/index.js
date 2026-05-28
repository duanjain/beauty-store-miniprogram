const config = require('../../config')

let containerCloud = null

async function getContainerCloud() {
  if (containerCloud) return containerCloud
  const resourceEnv = config && config.cloudHosting ? config.cloudHosting.resourceEnv : ''
  const resourceAppid = config && config.cloudHosting ? config.cloudHosting.resourceAppid : ''
  if (resourceEnv && wx.cloud && wx.cloud.Cloud) {
    const c = new wx.cloud.Cloud({
      resourceEnv,
      ...(resourceAppid ? { resourceAppid } : {})
    })
    await c.init({ traceUser: true })
    containerCloud = c
    return containerCloud
  }
  containerCloud = wx.cloud
  return containerCloud
}

function uniq(arr) {
  const set = new Set()
  for (const item of arr) {
    if (item && typeof item === 'string') set.add(item)
  }
  return Array.from(set)
}

const ISSUE_LABEL_BY_INDEX = {
  0: '痘痘/粉刺',
  1: '黑头/闭口',
  2: '毛孔粗大',
  3: '暗沉/色斑',
  4: '敏感/泛红',
  5: '干燥缺水',
  6: '出油/油皮',
  7: '细纹/抗老',
  8: '黑眼圈/眼部问题',
  9: '粗糙/屏障受损'
}

function normalizeIssueName(name) {
  const text = String(name || '').trim()
  if (!text) return ''
  const m = text.match(/^(?:类别)?\s*(\d+)$/)
  if (m) {
    const idx = Number(m[1])
    return ISSUE_LABEL_BY_INDEX[idx] ? ISSUE_LABEL_BY_INDEX[idx] : `类别${m[1]}`
  }
  return text
}

function guessIssuesFromDetections(detections) {
  if (!Array.isArray(detections)) return []
  const issues = []
  for (const det of detections) {
    const name = det && det.className ? String(det.className) : ''
    if (!name) continue
    const lower = name.toLowerCase()
    if (lower.includes('face') || lower.includes('skin')) continue
    const normalized = normalizeIssueName(name)
    if (normalized) issues.push(normalized)
  }
  return uniq(issues)
}

Page({
  data: {
    tempImagePath: '',
    fileID: '',
    tempUrl: '',
    analyzing: false,
    detections: [],
    issues: [],
    recommendations: [],
    hasAnalyzed: false,
    stage: '',
    errorText: '',
    detectionCount: 0
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      success: (res) => {
        const path = res && res.tempFiles && res.tempFiles[0] ? res.tempFiles[0].tempFilePath : ''
        if (!path) return
        this.setData({
          tempImagePath: path,
          fileID: '',
          tempUrl: '',
          detections: [],
          issues: [],
          recommendations: [],
          hasAnalyzed: false,
          stage: '',
          errorText: '',
          detectionCount: 0
        })
      }
    })
  },

  async analyze() {
    if (!this.data.tempImagePath) return
    this.setData({
      analyzing: true,
      detections: [],
      issues: [],
      recommendations: [],
      hasAnalyzed: false,
      stage: '上传图片...',
      errorText: '',
      detectionCount: 0
    })
    try {
      const fileID = await this.uploadImage(this.data.tempImagePath)
      this.setData({ stage: '获取图片链接...' })
      const tempUrl = await this.getTempUrl(fileID)
      this.setData({ stage: '模型识别...' })
      const detections = await this.callInfer(tempUrl)
      const issues = guessIssuesFromDetections(detections)
      this.setData({
        fileID,
        tempUrl,
        detections,
        issues,
        detectionCount: Array.isArray(detections) ? detections.length : 0
      })
      if (issues.length) {
        this.setData({ stage: '匹配商品...' })
        const rec = await this.fetchRecommendations(issues)
        this.setData({ recommendations: rec })
      }
      this.setData({ hasAnalyzed: true, stage: '' })
    } catch (e) {
      this.setData({
        hasAnalyzed: true,
        stage: '',
        errorText: e && e.message ? String(e.message) : '检测失败'
      })
      wx.showToast({
        title: e && e.message ? e.message : '检测失败',
        icon: 'none'
      })
    } finally {
      this.setData({ analyzing: false })
    }
  },

  uploadImage(tempFilePath) {
    return new Promise((resolve, reject) => {
      const ext = (tempFilePath.match(/\.[^.]+?$/) || ['.jpg'])[0]
      const cloudPath = `skin_analyze/${Date.now()}_${Math.floor(Math.random() * 100000)}${ext}`
      wx.cloud.uploadFile({
        cloudPath,
        filePath: tempFilePath,
        success: (res) => resolve(res.fileID),
        fail: (err) => reject(err)
      })
    })
  },

  getTempUrl(fileID) {
    return new Promise((resolve, reject) => {
      wx.cloud.getTempFileURL({
        fileList: [fileID],
        success: (res) => {
          const url = res && res.fileList && res.fileList[0] ? res.fileList[0].tempFileURL : ''
          if (!url) reject(new Error('获取图片链接失败'))
          else resolve(url)
        },
        fail: (err) => reject(err)
      })
    })
  },

  callInfer(imageUrl) {
    return new Promise((resolve, reject) => {
      getContainerCloud()
        .then((cloud) => {
          cloud.callContainer({
            ...(cloud === wx.cloud ? { config: { env: config.cloudEnvId } } : {}),
            path: config.cloudHosting.skinInferPath,
            method: 'POST',
            timeout: 15000,
            header: {
              'X-WX-SERVICE': config.cloudHosting.skinInferService,
              'content-type': 'application/json'
            },
            data: { imageUrl },
            success: (res) => {
              const data = res && res.data ? res.data : null
              if (!data || !data.ok) {
                reject(new Error((data && data.message) || '推理失败'))
                return
              }
              resolve(Array.isArray(data.detections) ? data.detections : [])
            },
            fail: (err) => {
              const msg = err && err.errMsg ? String(err.errMsg) : ''
              if (msg.includes('Invalid host')) {
                reject(new Error('云托管调用失败：请配置云托管环境ID/资源复用'))
                return
              }
              reject(err)
            }
          })
        })
        .catch((err) => reject(err))
    })
  },

  fetchRecommendations(issues) {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'skinRecommend',
        data: { issues },
        success: (res) => {
          const result = res && res.result ? res.result : null
          if (!result || !result.success) {
            reject(new Error((result && result.message) || '获取推荐失败'))
            return
          }
          resolve(Array.isArray(result.products) ? result.products : [])
        },
        fail: (err) => reject(err)
      })
    })
  },

  openProduct(e) {
    const id = e && e.currentTarget && e.currentTarget.dataset ? e.currentTarget.dataset.id : ''
    if (!id) return
    wx.navigateTo({
      url: `/pages/product/detail/index?id=${id}`
    })
  }
})
