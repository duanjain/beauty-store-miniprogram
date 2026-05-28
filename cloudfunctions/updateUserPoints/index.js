const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { userId, points, operation } = event
  
  console.log('updateUserPoints云函数调用:', { userId, points, operation })
  
  try {
    // 权限校验：检查是否是管理员
    const callerRes = await db.collection('users').doc(wxContext.OPENID).get().catch(() => ({ data: null }));
    const caller = callerRes.data;

    if (!caller || caller.role !== 'admin') {
      return {
        success: false,
        message: '权限不足，只有管理员可以修改用户积分'
      };
    }

    const userResult = await db.collection('users').doc(userId).get()
    
    if (!userResult.data) {
      return {
        success: false,
        message: '用户不存在'
      }
    }
    
    const user = userResult.data
    // 修复现有数据中可能存在的浮点数精度问题
    const currentPoints = parseFloat((user.points || 0).toFixed(2))
    
    let newPoints
    if (operation === 'add') {
      newPoints = parseFloat((currentPoints + points).toFixed(2))
      console.log(`用户 ${userId} 积分增加: ${currentPoints} + ${points} = ${newPoints}`)
    } else if (operation === 'deduct') {
      if (points > currentPoints) {
        return {
          success: false,
          message: '积分不足'
        }
      }
      newPoints = parseFloat((currentPoints - points).toFixed(2))
      console.log(`用户 ${userId} 积分扣除: ${currentPoints} - ${points} = ${newPoints}`)
    } else {
      return {
        success: false,
        message: '无效的操作类型'
      }
    }
    
    const updateResult = await db.collection('users').doc(userId).update({
      data: {
        points: newPoints
      }
    })
    
    console.log('积分更新结果:', updateResult)
    
    const change = operation === 'add' ? points : -points
    await db.collection('pointsLogs').add({
      data: {
        userId: userId,
        source: 'manual',
        change: change,
        beforePoints: currentPoints,
        afterPoints: newPoints,
        createTime: db.serverDate()
      }
    })
    
    return {
      success: true,
      message: operation === 'add' ? '积分增加成功' : '积分扣除成功',
      newPoints: newPoints
    }
  } catch (err) {
    console.error('updateUserPoints云函数错误:', err)
    return {
      success: false,
      message: '操作失败',
      error: err
    }
  }
}
