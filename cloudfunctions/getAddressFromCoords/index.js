// 云函数入口文件
const cloud = require('wx-server-sdk')
const https = require('https')

// 使用固定的云环境ID，确保与小程序配置一致
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

// 云函数入口函数
exports.main = async (event, context) => {
  const { latitude, longitude } = event
  const tencentMapKey = process.env.TENCENT_MAP_KEY
  
  if (!tencentMapKey) {
    return {
      success: false,
      message: '缺少腾讯地图 Key，请在云函数环境变量中配置 TENCENT_MAP_KEY'
    }
  }

  // 构建请求URL
  const url = `https://apis.map.qq.com/ws/geocoder/v1/?location=${latitude},${longitude}&key=${tencentMapKey}&get_poi=1`
  
  // 封装https.get为Promise
  const request = (url) => {
    return new Promise((resolve, reject) => {
      https.get(url, (res) => {
        let data = ''
        res.on('data', (chunk) => {
          data += chunk
        })
        res.on('end', () => {
          try {
            resolve(JSON.parse(data))
          } catch (e) {
            reject(new Error('JSON解析失败'))
          }
        })
      }).on('error', (err) => {
        reject(err)
      })
    })
  }
  
  try {
    // 调用腾讯地图API进行逆地址解析
    const result = await request(url)
    
    return {
      success: true,
      data: result
    }
  } catch (error) {
    console.error('调用腾讯地图API失败:', error)
    return {
      success: false,
      message: '调用地图API失败: ' + (error.message || error.toString())
    }
  }
}
