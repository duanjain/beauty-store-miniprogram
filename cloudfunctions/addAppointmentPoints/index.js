const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const { appointmentId, userId } = event
  
  console.log('addAppointmentPoints云函数调用 (DEPRECATED):', { appointmentId, userId })
  
  // ⛔ FEATURE DISABLED ⛔
  // 预约不再发放积分
  
  return {
    success: true,
    message: 'Feature disabled: No points added for appointments',
    pointsAdded: 0
  }
}