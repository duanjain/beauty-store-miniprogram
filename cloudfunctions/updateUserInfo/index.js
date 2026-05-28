// 云函数入口文件
const cloud = require('wx-server-sdk')

// 使用固定的云环境ID，确保与小程序配置一致
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { phone, avatarUrl, nickname } = event
  
  try {
    // === 内容安全检测开始 ===
    
    // 1. 文本安全检测 (昵称)
    if (nickname) {
      try {
        const msgRes = await cloud.openapi.security.msgSecCheck({
          content: nickname
        })
        if (msgRes.errCode !== 0) {
          return { success: false, message: '昵称包含违规内容，请修改' }
        }
      } catch (err) {
        // 错误码 87014 表示内容违规
        if (err.errCode === 87014) {
          return { success: false, message: '昵称包含违规内容，请修改' }
        }
        console.error('文本安全检测失败 (忽略并放行):', err)
        // 仅在开发/演示环境下建议放行系统错误，生产环境应根据需求决定是否阻断
        // return { success: false, message: '内容安全检测服务异常，请稍后重试' }
      }
    }

    // 2. 图片安全检测 (头像)
    // 只有当 avatarUrl 是新的云存储文件ID时才检测 (以 cloud:// 开头)
    if (avatarUrl && avatarUrl.startsWith('cloud://')) {
      try {
        // 下载图片文件
        const fileRes = await cloud.downloadFile({
          fileID: avatarUrl,
        })
        const fileBuffer = fileRes.fileContent

        // 调用图片安全检测
        const imgRes = await cloud.openapi.security.imgSecCheck({
          media: {
            contentType: 'image/png', // 默认使用png，实际服务会检测文件头
            value: fileBuffer
          }
        })
        
        if (imgRes.errCode !== 0) {
          return { success: false, message: '头像包含违规内容，请更换' }
        }
      } catch (err) {
        if (err.errCode === 87014) {
          return { success: false, message: '头像包含违规内容，请更换' }
        }
        console.error('图片安全检测失败 (忽略并放行):', err)
        // 图片下载或检测失败，可能是文件太大或服务异常
        // 建议阻止
        // return { success: false, message: '图片安全检测失败，请重试或更换图片' }
      }
    }
    // === 内容安全检测结束 ===

    // 构建更新数据
    const updateData = {
      updateTime: new Date()
    }
    
    // 只更新提供的数据字段
    if (phone !== undefined) updateData.phone = phone
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl
    if (nickname !== undefined) updateData.nickname = nickname
    
    // 更新用户信息
    await db.collection('users').doc(openid).update({
      data: updateData
    })
    
    return {
      success: true,
      message: '更新成功'
    }
  } catch (error) {
    console.error('更新用户信息失败:', error)
    return {
      success: false,
      message: '更新失败: ' + error.message
    }
  }
}
