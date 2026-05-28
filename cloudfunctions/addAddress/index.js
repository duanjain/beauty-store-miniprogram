// 云函数入口文件
const cloud = require('wx-server-sdk')

// 使用固定的云环境ID，确保与小程序配置一致
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { name, phone, province, city, district, address, detail, isDefault } = event
  
  try {
    // === 内容安全检测开始 ===
    // 检测收货人姓名和详细地址
    try {
      // 拼接需要检测的文本
      const checkContent = `${name} ${detail}`;
      const msgRes = await cloud.openapi.security.msgSecCheck({
        content: checkContent
      })
      if (msgRes.errCode !== 0) {
        return { success: false, message: '收货人或详细地址包含违规内容，请修改' }
      }
    } catch (err) {
      if (err.errCode === 87014) {
        return { success: false, message: '收货人或详细地址包含违规内容，请修改' }
      }
      console.error('内容安全检测失败 (忽略并放行):', err)
    }
    // === 内容安全检测结束 ===

    // 微信云开发事务支持需要特定条件，为保证兼容性，改用非事务方式
    
    // 如果设置为默认地址，先取消其他地址的默认状态
    if (isDefault) {
      try {
        await db.collection('addresses')
          .where({
            userId: openid,
            isDefault: true
          })
          .update({
            data: {
              isDefault: false
            }
          })
      } catch (err) {
        console.error('更新默认地址状态失败，但不影响添加:', err)
      }
    }
    
    // 添加新地址
    const result = await db.collection('addresses').add({
      data: {
        userId: openid,
        name,
        phone,
        province,
        city,
        district,
        address,
        detail,
        isDefault,
        createTime: new Date(),
        updateTime: new Date()
      }
    })
    
    return {
      success: true,
      message: '添加地址成功',
      addressId: result._id
    }
  } catch (error) {
    console.error('添加地址失败:', error)
    return {
      success: false,
      message: '添加地址失败: ' + error.message
    }
  }
}
