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
    // 删除地址
    await db.collection('addresses')
      .where({
        _id: id,
        userId: openid
      })
      .remove()
    
    return {
      success: true,
      message: '删除地址成功'
    }
  } catch (error) {
    console.error('删除地址失败:', error)
    return {
      success: false,
      message: '删除地址失败: ' + error.message
    }
  }
}
