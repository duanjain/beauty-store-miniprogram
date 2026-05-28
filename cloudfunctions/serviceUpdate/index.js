const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { id, service } = event;

  try {
    // 权限校验：检查是否是管理员
    const callerRes = await db.collection('users').doc(wxContext.OPENID).get().catch(() => ({ data: null }));
    const caller = callerRes.data;

    if (!caller || caller.role !== 'admin') {
      return {
        success: false,
        message: '权限不足，只有管理员可以更新服务'
      };
    }

    // 更新所有必要的字段，确保数据类型正确
    const updateData = {
      serviceName: service.serviceName,
      description: service.description,
      duration: Number(service.duration), // 确保是数字类型
      price: Number(service.price), // 确保是数字类型
      images: service.images,
      timeSettings: {
        timeGranularity: Number(service.timeSettings.timeGranularity),
        dailyStartTime: service.timeSettings.dailyStartTime,
        dailyEndTime: service.timeSettings.dailyEndTime,
        availableDays: service.timeSettings.availableDays,
        maxCapacity: Number(service.timeSettings.maxCapacity),
        specialDates: service.timeSettings.specialDates
      },
      updatedAt: db.serverDate() // 更新时间
    };
    
    // 更新服务信息
    const result = await db.collection('services').doc(id).update({
      data: updateData
    });

    return {
      success: true,
      message: '服务更新成功',
      data: result
    };
  } catch (e) {
    console.error('serviceUpdate云函数错误:', e);
    return {
      success: false,
      message: '服务更新失败',
      error: e
    };
  }
};
