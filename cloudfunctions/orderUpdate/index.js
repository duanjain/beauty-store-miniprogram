const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { orderId, status } = event

  if (!orderId || !status) {
    return {
      success: false,
      message: '缺少必要参数'
    }
  }

  const validStatus = ['pending', 'paid', 'confirmed', 'shipped', 'completed', 'cancelled']
  if (validStatus.indexOf(status) === -1) {
    return {
      success: false,
      message: '无效的状态值'
    }
  }

  const statusFlowMap = {
    pending: ['paid', 'confirmed', 'cancelled'],
    paid: ['confirmed', 'cancelled'],
    confirmed: ['shipped', 'completed', 'cancelled'],
    shipped: ['completed'],
    completed: [],
    cancelled: []
  }

  try {
    let collectionName = 'orders'
    let orderRes = await db.collection('orders').doc(orderId).get().catch(() => null)
    
    if (!orderRes || !orderRes.data) {
      // 尝试在预约集合中查找
      orderRes = await db.collection('appointments').doc(orderId).get().catch(() => null)
      if (orderRes && orderRes.data) {
        collectionName = 'appointments'
      }
    }

    if (!orderRes || !orderRes.data) {
      return {
        success: false,
        message: '订单/预约不存在'
      }
    }

    const order = orderRes.data
    const currentStatus = order.status || 'pending'

    // 权限与安全校验
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    const isOwner = order.userId === openid
    
    // 默认禁止，需满足特定条件才允许
    let isAllowed = false

    // 1. 如果是订单拥有者，仅允许取消订单
    if (isOwner) {
       // 允许取消 pending, paid (未发货前) 状态的订单
       if (status === 'cancelled') {
         if (['pending', 'paid'].includes(currentStatus)) {
           isAllowed = true
         } else if (currentStatus === 'confirmed') {
           return { success: false, message: '订单已确认，请联系客服取消' }
         } else if (currentStatus === 'shipped') {
           return { success: false, message: '订单已发货，无法取消' }
         }
       }
       // ❌ REMOVED: Owner cannot manually set status to 'paid'. 
       // Payment status must be updated via 'pay' cloud function (queryOrder) or by Admin.
    }

    // 2. 如果尚未获权，检查是否为管理员
    if (!isAllowed) {
       const callerRes = await db.collection('users').doc(openid).get().catch(() => ({ data: null }))
       if (callerRes.data && callerRes.data.role === 'admin') {
          isAllowed = true
       }
    }

    if (!isAllowed) {
      return {
        success: false,
        message: `权限不足: 无法执行此操作 (Role: ${isOwner ? 'Owner' : 'Other'}, Status: ${currentStatus} -> ${status})`
      }
    }

    if (currentStatus === status) {
      return {
        success: true,
        message: '状态未变化',
        data: {
          status: currentStatus
        }
      }
    }

    const allowed = statusFlowMap[currentStatus] || []
    if (allowed.indexOf(status) === -1) {
      return {
        success: false,
        message: `不允许的状态流转: ${currentStatus} -> ${status}`
      }
    }

    const needDeductPoints = currentStatus !== 'paid' && status === 'paid' && order.pointsUsed > 0
    // Fix: Add points when status becomes 'confirmed' (Admin action), not 'completed'.
    // And ensure we don't add points if already added.
    const needAddPoints = currentStatus !== 'confirmed' && status === 'confirmed' && !order.pointsAdded

    // 1. 如果需要扣除积分（支付阶段）
    if (needDeductPoints && order.userId) {
      const pointsToDeduct = order.pointsUsed
      
      // 先获取当前积分，用于记录流水（虽然原子操作更安全，但为了流水准确，先读后写）
      const userRes = await db.collection('users').doc(order.userId).get().catch(() => null)
      const beforePoints = userRes && userRes.data ? (userRes.data.points || 0) : 0
      
      // 使用原子操作扣除积分，并确保积分足够
      const deductRes = await db.collection('users')
        .where({
          _id: order.userId,
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

      // Mark as deducted locally for next update
      // Note: We need to update the order with pointsDeducted: true
      // We can do it in the final status update or separately.
      // Better to do it in the final update to avoid extra DB calls, 
      // but 'needDeductPoints' logic is separate from status update logic.
      // Wait, 'updateResult' below (line 317) updates the status.
      // We should include pointsDeducted there.
      // Or we can add it here if we want to be safe.
      // Let's add it to the final update data object.


      // 记录积分日志
      try {
        await db.collection('pointsLogs').add({
          data: {
            userId: order.userId,
            source: 'order_deduction',
            orderId: orderId,
            change: -pointsToDeduct,
            beforePoints: beforePoints,
            afterPoints: beforePoints - pointsToDeduct,
            createTime: db.serverDate(),
            description: '购物抵扣'
          }
        })
      } catch (logErr) {
        console.error('记录积分扣除日志失败', logErr)
      }
    }

    // 💰 Refund Logic: If cancelling a paid/confirmed order, trigger refund
    let refundResult = null
    if (status === 'cancelled' && (currentStatus === 'paid' || currentStatus === 'confirmed')) {
       // 1. Revoke Awarded Points (if any)
       // If points were awarded (e.g. on 'paid' status via addOrderPoints or previous logic), we must revoke them.
       if (order.pointsAdded && order.userId) {
          // Calculate points to revoke based on what was likely awarded
          // We assume the same logic: floor(finalAmount || totalAmount)
          const amountForPoints = order.finalAmount !== undefined ? parseFloat(order.finalAmount) : parseFloat(order.totalAmount)
          // Consistent with addition logic: keep 2 decimal places
          const pointsToRevoke = Number(amountForPoints.toFixed(2))
          
          if (pointsToRevoke > 0) {
             try {
                // Get current points for log
                const userRes = await db.collection('users').doc(order.userId).get().catch(() => null)
                const userData = userRes && userRes.data ? userRes.data : {}
                const beforePoints = userData.points || 0
                
                // Atomic deduct
                await db.collection('users').doc(order.userId).update({
                   data: {
                     points: db.command.inc(-pointsToRevoke)
                   }
                })
                
                // Log
                await db.collection('pointsLogs').add({
                   data: {
                     userId: order.userId,
                     source: 'revoke_award',
                     orderId: orderId,
                     change: -pointsToRevoke,
                     beforePoints: beforePoints,
                     afterPoints: beforePoints - pointsToRevoke,
                     createTime: db.serverDate(),
                     description: '订单取消回收'
                   }
                })

                // 🔄 Referral Refund Logic: Revoke points from inviter if exists
                if (userData.inviterId) {
                  try {
                    console.log(`处理分销退款: 回收邀请人 ${userData.inviterId} 的奖励积分 ${pointsToRevoke}`)
                    
                    const inviterRes = await db.collection('users').doc(userData.inviterId).get().catch(() => null)
                    const inviterData = inviterRes && inviterRes.data ? inviterRes.data : {}
                    const inviterBeforePoints = inviterData.points || 0

                    await db.collection('users').doc(userData.inviterId).update({
                      data: {
                        points: db.command.inc(-pointsToRevoke)
                      }
                    })

                    await db.collection('pointsLogs').add({
                      data: {
                        userId: userData.inviterId,
                        source: 'referral_refund',
                        orderId: orderId,
                        change: -pointsToRevoke,
                        beforePoints: inviterBeforePoints,
                        afterPoints: inviterBeforePoints - pointsToRevoke,
                        createTime: db.serverDate(),
                        description: '下线订单退款回收'
                      }
                    })
                  } catch (referralErr) {
                    console.error('分销退款回收失败', referralErr)
                  }
                }
                
                // Reset flag
                await db.collection(collectionName).doc(orderId).update({
                   data: { pointsAdded: false }
                })
             } catch (e) {
                console.error('回收积分失败', e)
             }
          }
       }

       // 2. Process Money Refund
       // Check if payment was Mock or Real (if field exists), otherwise try Real
       // If order.paymentMethod is 'mock', skip real refund
       if (order.paymentMethod === 'mock') {
          refundResult = { success: true, mock: true, message: '模拟退款成功' }
       } else {
         // Call 'pay' cloud function to process refund
         try {
           // 显式传递 openid 以确保被调用的云函数能正确识别用户身份
           const refundRes = await cloud.callFunction({
              name: 'pay',
              data: {
                action: 'refund',
                orderId: orderId,
                openid: openid // Pass openid explicitly
              }
           })
           
           if (!refundRes.result.success) {
              // Revert status if refund failed
              await db.collection(collectionName).doc(orderId).update({
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
           // Revert status if refund failed
           await db.collection(collectionName).doc(orderId).update({
               data: { status: currentStatus }
           })
           return {
              success: false,
              message: '退款系统异常: ' + (err.message || err)
           }
         }
       }

       // 3. Return Used Points (if any)
       // FIX: Only refund points if they were actually deducted (pointsDeducted flag is true)
       // This prevents "free points" when deduction failed or was skipped (e.g. legacy queryOrder bug)
       if (order.pointsUsed > 0 && order.userId && order.pointsDeducted === true) {
          const pointsToRefund = order.pointsUsed
          
          try {
             // Get current points for log
             const userRes = await db.collection('users').doc(order.userId).get().catch(() => null)
             const beforePoints = userRes && userRes.data ? (userRes.data.points || 0) : 0
             
             // 退还积分
             await db.collection('users').doc(order.userId).update({
                data: {
                  points: db.command.inc(pointsToRefund)
                }
             })

             // 记录积分日志
             await db.collection('pointsLogs').add({
                data: {
                  userId: order.userId,
                  source: 'refund_return',
                  orderId: orderId,
                  change: pointsToRefund,
                  beforePoints: beforePoints,
                  afterPoints: beforePoints + pointsToRefund,
                  createTime: db.serverDate(),
                  description: '订单取消退还'
                }
             })
          } catch (e) {
             console.error('积分退还失败', e)
             // 即使积分退还失败，也不阻断整体流程，但应记录错误
          }
       }
    }

    // If refund successful (or not needed), update status
    // Note: 'pay' function's refundOrder ALREADY updates status to 'cancelled'.
    // So if we refunded, we might not need to update again, but it's safe to ensure consistent state.
    // However, refundOrder updates status, refundStatus, refundTime.
    
    if (refundResult) {
       // Refund function already updated the order. Return success.
       // But if it was Mock refund, we might need to update status manually here?
       if (refundResult.mock) {
          await db.collection(collectionName).doc(orderId).update({
            data: {
              status: 'cancelled',
              refundInfo: refundResult,
              updateTime: db.serverDate()
            }
          })
       }

       return {
         success: true,
         message: '订单已取消并退款',
         data: { status: 'cancelled', refund: refundResult }
       }
    }

    // 2. 更新订单状态
    const updateData = {
      status: status,
      updateTime: db.serverDate()
    }
    
    // 如果刚才执行了积分扣除，记录标志位
    if (needDeductPoints) {
      updateData.pointsDeducted = true
    }

    const updateResult = await db.collection(collectionName).doc(orderId).update({
      data: updateData
    })
    
    // 3. 扣减库存逻辑
    // 定义视为“已扣库存”的状态
    const stockDeductedStates = ['paid', 'confirmed', 'shipped', 'completed'];
    const isTargetStockDeducted = stockDeductedStates.includes(status);
    const isCurrentStockDeducted = stockDeductedStates.includes(currentStatus);

    // 只有当目标状态意味着“已扣库存”，且当前状态意味着“未扣库存”时，才执行扣减
    // 这样涵盖了 pending -> paid, pending -> confirmed 等情况，且避免 paid -> confirmed 重复扣减
    if (isTargetStockDeducted && !isCurrentStockDeducted && order.items && order.items.length > 0) {
      try {
        const tasks = order.items.map(item => {
          if (item.productId && item.quantity) {
            return db.collection('products').doc(item.productId).update({
              data: {
                stock: db.command.inc(-item.quantity),
                sales: db.command.inc(item.quantity)
              }
            }).catch(err => {
              console.error(`扣减商品 ${item.productId} 库存失败`, err)
              // 吞掉单个商品扣减失败，避免影响整体订单状态
              return null
            })
          }
          return Promise.resolve()
        })
        await Promise.all(tasks)
      } catch (stockErr) {
        console.error('批量扣减库存失败', stockErr)
        // 吞掉错误，不影响主流程返回成功
      }
    }

    let pointsInfo = null

    // 4. 如果需要增加积分（确认阶段）
    if (needAddPoints) {
      try {
        const userRes = await db.collection('users').doc(order.userId).get().catch(() => ({ data: null }))
        if (userRes.data) {
          const user = userRes.data
          const currentPoints = user.points || 0
          
          // 计算积分：基于实付金额 (finalAmount) 而不是总金额 (totalAmount)
          // 如果没有 finalAmount (旧订单)，则回退到 totalAmount
          const amountForPoints = order.finalAmount !== undefined ? parseFloat(order.finalAmount) : parseFloat(order.totalAmount)
          // Support decimal points (keep 2 decimal places)
          const pointsToAdd = Number(amountForPoints.toFixed(2))
          
          if (pointsToAdd > 0) {
            // 使用原子操作增加积分
            await db.collection('users').doc(order.userId).update({
              data: {
                points: db.command.inc(pointsToAdd)
              }
            }).catch(e => console.error('增加用户积分失败', e))
            
            // 记录积分日志
            try {
              await db.collection('pointsLogs').add({
                data: {
                  userId: order.userId,
                  source: 'order',
                  orderId: orderId,
                  change: pointsToAdd,
                  // 估算前后积分，虽然并发下不一定100%准确，但比不显示好
                  beforePoints: currentPoints,
                  afterPoints: currentPoints + pointsToAdd,
                  description: '购物奖励',
                  createTime: db.serverDate()
                }
              })
            } catch (logErr) {
               console.error('记录积分日志失败', logErr)
            }

            // 🔄 Referral Reward Logic: Award points to inviter if exists
            if (user.inviterId) {
              try {
                console.log(`处理分销奖励: 给邀请人 ${user.inviterId} 发放同等积分 ${pointsToAdd}`)
                
                const inviterRes = await db.collection('users').doc(user.inviterId).get().catch(() => null)
                const inviterData = inviterRes && inviterRes.data ? inviterRes.data : {}
                const inviterBeforePoints = inviterData.points || 0

                await db.collection('users').doc(user.inviterId).update({
                  data: {
                    points: db.command.inc(pointsToAdd)
                  }
                })

                await db.collection('pointsLogs').add({
                  data: {
                    userId: user.inviterId,
                    source: 'referral_reward',
                    orderId: orderId,
                    change: pointsToAdd,
                    beforePoints: inviterBeforePoints,
                    afterPoints: inviterBeforePoints + pointsToAdd,
                    createTime: db.serverDate(),
                    description: '下线消费奖励'
                  }
                })
              } catch (referralErr) {
                console.error('分销奖励发放失败', referralErr)
              }
            }

            // Fix: Mark order as points added to prevent double counting
            await db.collection(collectionName).doc(orderId).update({
              data: { pointsAdded: true }
            })
            
            pointsInfo = {
              pointsAdded: pointsToAdd
            }
          }
        }
      } catch (e) {
        console.error('发放订单积分失败', e)
        // 吞掉错误，不影响主流程
      }
    }

    return {
      success: true,
      message: '订单状态更新成功',
      data: {
        updateResult,
        status,
        pointsInfo
      }
    }
  } catch (e) {
    console.error('orderUpdate云函数错误', e)
    return {
      success: false,
      message: '订单状态更新失败: ' + (e.message || e),
      error: e
    }
  }
}

