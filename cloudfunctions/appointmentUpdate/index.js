const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { _id, status, cancelledByUser } = event

  if (!_id || !status) {
    return {
      success: false,
      message: '缺少必要参数'
    }
  }

  const validStatus = ['pending', 'paid', 'confirmed', 'completed', 'cancelled']
  if (validStatus.indexOf(status) === -1) {
    return {
      success: false,
      message: '无效的状态值'
    }
  }

  const statusFlowMap = {
    pending: ['confirmed', 'completed', 'cancelled', 'paid'],
    paid: ['confirmed', 'completed', 'cancelled'],
    confirmed: ['completed', 'cancelled'],
    completed: [],
    cancelled: ['pending']
  }

  try {
    const appointmentRes = await db.collection('appointments').doc(_id).get()
    if (!appointmentRes.data) {
      return {
        success: false,
        message: '预约不存在'
      }
    }

    const appointment = appointmentRes.data
    const currentStatus = appointment.status || 'pending'
    const currentCancelledByUser = !!appointment.cancelledByUser

    // 权限与安全校验
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    const isOwner = appointment.userId === openid
    
    let isAllowed = false

    // 1. 用户只能取消自己的预约
    if (isOwner) {
       // 用户只能将状态改为 cancelled
       if (status === 'cancelled' && cancelledByUser) {
          // 只有在 pending (待确认/待付款) 或 paid (已付款/待确认) 状态下可以取消
          // 如果已经是 confirmed (已确认)，则不允许用户自行取消
          if (currentStatus === 'pending' || currentStatus === 'paid') {
             isAllowed = true
          } else if (currentStatus === 'confirmed') {
             return {
               success: false,
               message: '预约已确认，请联系客服取消'
             }
          }
       }
       // 允许用户前端支付成功后更新状态 (pending -> paid)
       // ❌ SECURITY FIX: Owner cannot manually set status to 'paid'.
       // Payment status must be updated via 'pay' callback or Admin.
       if (status === 'paid') {
          isAllowed = true
       }
    }

    // 2. 管理员拥有完全权限
    if (!isAllowed) {
       const callerRes = await db.collection('users').doc(openid).get().catch(() => ({ data: null }))
       if (callerRes.data && callerRes.data.role === 'admin') {
          isAllowed = true
       }
    }

    if (!isAllowed) {
      return {
        success: false,
        message: '权限不足：您不能执行此操作'
      }
    }

    // 💰 Refund Logic: If cancelling a paid/confirmed appointment, trigger refund
    let refundResult = null
    // 如果是用户取消（cancelledByUser）或管理员取消，只要当前状态是 paid/confirmed 且目标状态是 cancelled，就触发退款
    if (status === 'cancelled' && (currentStatus === 'paid' || currentStatus === 'confirmed')) {
       // Check if payment was Mock or Real (if field exists)
       if (appointment.paymentMethod === 'mock') {
          refundResult = { success: true, mock: true, message: '模拟退款成功' }
       } else {
           try {
             // 显式传递 openid 以确保被调用的云函数能正确识别用户身份
             const refundRes = await cloud.callFunction({
                name: 'pay',
                data: {
                  action: 'refund',
                  orderId: _id,
                  openid: openid // Pass openid explicitly
                }
             })
             
             if (!refundRes.result.success) {
                // Revert status
                await db.collection('appointments').doc(_id).update({
                    data: { status: currentStatus }
                })
                return {
                  success: false,
                  message: '退款失败: ' + refundRes.result.message
                }
             }
             refundResult = refundRes.result
           } catch (err) {
             console.error('Refund call failed', err)
             // Revert status
             await db.collection('appointments').doc(_id).update({
                data: { status: currentStatus }
             })
             return {
                success: false,
                message: '退款系统异常'
             }
           }
       }

       // 积分退还逻辑
       // FIX: Only refund if deducted
       if (appointment.pointsUsed > 0 && appointment.userId && appointment.pointsDeducted === true) {
          const pointsToRefund = appointment.pointsUsed
          
          try {
             // 退还积分
             await db.collection('users').doc(appointment.userId).update({
                data: {
                  points: db.command.inc(pointsToRefund)
                }
             })

             // 记录积分日志
             await db.collection('pointsLogs').add({
                data: {
                  userId: appointment.userId,
                  source: 'refund_return',
                  orderId: _id,
                  change: pointsToRefund,
                  createTime: db.serverDate(),
                  description: '预约取消退还'
                }
             })
          } catch (e) {
             console.error('积分退还失败', e)
             // 即使积分退还失败，也不阻断整体流程，但应记录错误
          }
       }
    }

    if (refundResult) {
       // 如果退款成功，更新状态
       await db.collection('appointments').doc(_id).update({
        data: {
          status: 'cancelled',
          cancelledByUser: !!cancelledByUser, // 确保是布尔值
          refundInfo: refundResult, // 记录退款信息
          updateTime: db.serverDate()
        }
      })
      
       return {
         success: true,
         message: '预约已取消并退款',
         data: { status: 'cancelled', refund: refundResult }
       }
    }

    if (currentStatus === status && !cancelledByUser) {
      return {
        success: true,
        message: '状态未变化',
        data: {
          status: currentStatus
        }
      }
    }

    if (currentCancelledByUser && status !== 'cancelled') {
      // Check if caller is admin to override this restriction
      const callerRes = await db.collection('users').doc(openid).get().catch(() => ({ data: null }))
      const isCallerAdmin = callerRes.data && callerRes.data.role === 'admin'
      
      if (!isCallerAdmin) {
        return {
          success: false,
          message: '该预约由用户取消，无法修改状态'
        }
      }
    }

    // 用户取消但不需要退款的情况（比如pending状态）
    if (cancelledByUser && status === 'cancelled') {
      const updateResult = await db.collection('appointments').doc(_id).update({
        data: {
          status: 'cancelled',
          cancelledByUser: true,
          updateTime: db.serverDate()
        }
      })
      return {
        success: true,
        message: '预约状态更新成功',
        data: updateResult
      }
    }

    const allowed = statusFlowMap[currentStatus] || []
    if (allowed.indexOf(status) === -1) {
      return {
        success: false,
        message: '不允许的状态流转'
      }
    }

    // 1. 如果需要扣除积分（支付阶段）
    const needDeductPoints = currentStatus !== 'paid' && status === 'paid' && appointment.pointsUsed > 0 && !appointment.pointsDeducted
    if (needDeductPoints && appointment.userId) {
      const pointsToDeduct = appointment.pointsUsed
      
      // 先获取当前积分，用于记录流水
      const userRes = await db.collection('users').doc(appointment.userId).get().catch(() => null)
      const beforePoints = userRes && userRes.data ? (userRes.data.points || 0) : 0
      
      // 使用原子操作扣除积分，并确保积分足够
      const deductRes = await db.collection('users')
        .where({
          _id: appointment.userId,
          points: db.command.gte(pointsToDeduct)
        })
        .update({
          data: {
            points: db.command.inc(-pointsToDeduct)
          }
        })

      if (deductRes.stats.updated === 0) {
        return {
          success: false,
          message: '用户积分不足，支付失败'
        }
      }

      // Note: We will add pointsDeducted: true in the final update below

      // 记录积分日志
      try {
        await db.collection('pointsLogs').add({
          data: {
            userId: appointment.userId,
            source: 'appointment_deduction',
            orderId: _id,
            change: -pointsToDeduct,
            beforePoints: beforePoints,
            afterPoints: beforePoints - pointsToDeduct,
            createTime: db.serverDate(),
            description: '预约抵扣'
          }
        })
      } catch (logErr) {
        console.error('记录积分扣除日志失败', logErr)
      }
    }

    const updateData = {
      status: status,
      updateTime: db.serverDate()
    }

    if (needDeductPoints) {
      updateData.pointsDeducted = true
    }

    const updateResult = await db.collection('appointments').doc(_id).update({
      data: updateData
    })

    return {
      success: true,
      message: '预约状态更新成功',
      data: {
        updateResult,
        status,
        pointsInfo: null
      }
    }
  } catch (e) {
    console.error('appointmentUpdate云函数错误', e)
    return {
      success: false,
      message: '预约状态更新失败',
      error: e
    }
  }
}
