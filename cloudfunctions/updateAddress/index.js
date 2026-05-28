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
  const { id, name, phone, province, city, district, address, detail, isDefault } = event
  
  try {
    // === 内容安全检测开始 ===
    // 检测收货人姓名和详细地址
    if (name || detail) {
      try {
        // 如果只更新其中一个，可能需要从数据库获取另一个来拼接检测，或者只检测更新的部分
        // 这里简化处理，只检测提交上来的非空内容
        const checkContent = [name, detail].filter(item => item).join(' ');
        if (checkContent) {
          const msgRes = await cloud.openapi.security.msgSecCheck({
            content: checkContent
          })
          if (msgRes.errCode !== 0) {
            return { success: false, message: '收货人或详细地址包含违规内容，请修改' }
          }
        }
      } catch (err) {
        if (err.errCode === 87014) {
          return { success: false, message: '收货人或详细地址包含违规内容，请修改' }
        }
        console.error('内容安全检测失败 (忽略并放行):', err)
      }
    }
    // === 内容安全检测结束 ===

    // 微信云开发事务支持需要特定条件，为保证兼容性，改用非事务方式
    
    // 如果设置为默认地址，先取消其他地址的默认状态
    if (isDefault) {
      try {
        await db.collection('addresses')
          .where({
            userId: openid,
            isDefault: true,
            _id: _.neq(id) // 排除当前地址
          })
          .update({
            data: {
              isDefault: false
            }
          })
      } catch (err) {
        console.error('更新默认地址状态失败，但不影响更新:', err)
      }
    }
    
    // 更新地址
    await db.collection('addresses')
      .where({
        _id: id,
        userId: openid
      })
      .update({
        data: {
          name,
          phone,
          province,
          city,
          district,
          address,
          detail,
          isDefault,
          updateTime: new Date()
        }
      })
    
    return {
      success: true,
      message: '更新地址成功'
    }
  } catch (error) {
    console.error('更新地址失败:', error)
    return {
      success: false,
      message: '更新地址失败: ' + error.message
    }
  }
}
