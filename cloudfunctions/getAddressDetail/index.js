// 云函数入口文件
const cloud = require('wx-server-sdk')

// 使用固定的云环境ID，确保与小程序配置一致
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { id } = event
  
  try {
    // 获取地址详情
    const result = await db.collection('addresses')
      .where({
        _id: id,
        userId: openid
      })
      .get()
    
    return {
      success: true,
      data: result.data.length > 0 ? result.data[0] : null
    }
  } catch (error) {
    console.error('获取地址详情失败:', error)
    return {
      success: false,
      message: '获取地址详情失败: ' + error.message
    }
  }
}
