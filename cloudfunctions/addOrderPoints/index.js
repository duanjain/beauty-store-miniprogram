const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { orderId } = event
  const wxContext = cloud.getWXContext()
  const userId = wxContext.OPENID
  
  console.log('addOrderPoints云函数调用:', { orderId, userId })
  
  try {
    const orderResult = await db.collection('orders').doc(orderId).get()
    
    if (!orderResult.data) {
      return {
        success: false,
        message: '订单不存在'
      }
    }
    
    const order = orderResult.data
    
    // 🛡️ Security Fixes
    // 1. Verify Order Owner: The points must go to the order owner
    if (order.userId !== userId) {
      return { success: false, message: '订单归属人不匹配' }
    }

    // 2. Verify Order Status: Must be paid
    if (order.status !== 'paid' && order.status !== 'completed') {
      return { success: false, message: '订单未支付，无法发放积分' }
    }

    // 3. Verify Idempotency: Points not already added
    if (order.pointsAdded) {
      return { success: false, message: '该订单已发放过积分' }
    }
    
    if (!order.totalAmount) {
      return {
        success: false,
        message: '订单金额无效'
      }
    }
    
    const userResult = await db.collection('users').doc(userId).get()
    
    if (!userResult.data) {
      return {
        success: false,
        message: '用户不存在'
      }
    }
    
    const user = userResult.data
    const currentPoints = user.points || 0 
    // Support decimal points (keep 2 decimal places)
    // Fix: Use finalAmount (paid amount) instead of totalAmount (original price)
    const amountForPoints = order.finalAmount !== undefined ? parseFloat(order.finalAmount) : parseFloat(order.totalAmount)
    const pointsToAdd = Number(amountForPoints.toFixed(2))
    
    if (isNaN(pointsToAdd) || pointsToAdd <= 0) {
      return {
        success: false,
        message: '无效的积分数值'
      }
    }

    console.log(`用户 ${userId} 增加积分: ${pointsToAdd}`)
    
    const _ = db.command
    
    // 使用原子操作更新积分
    const updateResult = await db.collection('users').doc(userId).update({
      data: {
        points: _.inc(pointsToAdd)
      }
    })
    
    // console.log('积分更新结果:', updateResult)
    
    // 4. Mark Order as Points Added (Prevent Double Counting)
    await db.collection('orders').doc(orderId).update({
      data: { pointsAdded: true }
    })

    await db.collection('pointsLogs').add({
      data: {
        userId: userId,
        source: 'order',
        orderId: orderId,
        change: pointsToAdd,
        beforePoints: currentPoints,
        afterPoints: currentPoints + pointsToAdd,
        createTime: db.serverDate()
      }
    })
    
    return {
      success: true,
      message: '积分发放成功',
      pointsAdded: pointsToAdd,
      newPoints: currentPoints + pointsToAdd
    }
  } catch (err) {
    console.error('addOrderPoints云函数错误:', err)
    return {
      success: false,
      message: '操作失败',
      error: err
    }
  }
}
