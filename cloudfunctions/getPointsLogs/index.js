const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const currentUserId = wxContext.OPENID
  
  // 如果是管理员调用（传入了 userId），则使用传入的 userId；
  // 如果是普通用户调用（未传入 userId），则查询自己的记录。
  // 注意：实际项目中应增加管理员权限校验，这里假设前端已做区分。
  let { userId, page = 1, pageSize = 20 } = event
  
  // 如果没有传入 userId，则默认查询当前用户的记录
  if (!userId) {
    userId = currentUserId
  } else {
    // 如果传入了 userId，检查是否为管理员
    // 🛡️ Security Fix: Enforce Admin Check
    if (userId !== currentUserId) {
      try {
        const adminRes = await db.collection('users').doc(currentUserId).get()
        const isAdmin = adminRes.data && adminRes.data.role === 'admin'
        if (!isAdmin) {
          // If not admin, force query for own logs only
          console.warn(`User ${currentUserId} attempted to access logs of ${userId} without admin privileges.`)
          userId = currentUserId
        }
      } catch (e) {
         // Error checking admin, default to safe mode
         userId = currentUserId
      }
    }
  }

  try {
    const countResult = await db.collection('pointsLogs')
      .where({ userId })
      .count()
    
    const total = countResult.total
    
    const logsResult = await db.collection('pointsLogs')
      .where({ userId })
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()

    return {
      success: true,
      data: logsResult.data,
      total: total,
      page: page,
      pageSize: pageSize
    }
  } catch (err) {
    console.error('getPointsLogs云函数错误:', err)
    return {
      success: false,
      message: '获取积分记录失败',
      error: err
    }
  }
}
