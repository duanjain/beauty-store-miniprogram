// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();

  try {
    // 权限校验：检查是否是管理员
    const callerRes = await db.collection('users').doc(wxContext.OPENID).get().catch(() => ({ data: null }));
    const caller = callerRes.data;

    if (!caller || caller.role !== 'admin') {
      return {
        success: false,
        message: '权限不足，只有管理员可以查看用户列表'
      };
    }

    const result = await db.collection('users').get()
    
    // 为没有积分的老用户添加points字段（只执行一次）
    const users = result.data
    for (const user of users) {
      if (user.points === undefined || user.points === null) {
        try {
          await db.collection('users').doc(user._id).update({
            data: {
              points: 0
            }
          })
          console.log(`为用户 ${user._id} 添加points字段`)
        } catch (err) {
          console.error(`更新用户 ${user._id} 积分失败:`, err)
        }
      }
    }
    
    return {
      success: true,
      data: users
    }
  } catch (err) {
    console.error('userList云函数错误:', err)
    return {
      success: false,
      error: err
    }
  }
}
