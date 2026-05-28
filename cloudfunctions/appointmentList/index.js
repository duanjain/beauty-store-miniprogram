const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { page = 1, pageSize = 10, keyword = '', status = '' } = event;
  console.log('appointmentList云函数调用，参数:', event);

  try {
    // 权限校验：获取当前用户信息
    const callerRes = await db.collection('users').doc(wxContext.OPENID).get().catch(() => ({ data: null }));
    const isAdmin = callerRes.data && callerRes.data.role === 'admin';

    // 计算跳过的记录数
    const skip = (page - 1) * pageSize;
    
    // 构建查询条件数组
    let conditions = [];

    // 安全控制：非管理员只能查看自己的预约
    if (!isAdmin) {
      conditions.push({
        userId: wxContext.OPENID
      });
    }
    
    // 如果有状态筛选，添加状态条件
    if (status.trim()) {
      conditions.push({
        status: status
      });
    }
    
    // 如果有搜索关键词，添加模糊查询条件
    if (keyword.trim()) {
      conditions.push(db.command.or([
        { userName: db.RegExp({ regexp: keyword, options: 'i' }) },
        { phone: db.RegExp({ regexp: keyword, options: 'i' }) },
        { serviceName: db.RegExp({ regexp: keyword, options: 'i' }) },
        { userId: db.RegExp({ regexp: keyword, options: 'i' }) }
      ]));
    }
    
    // 组合所有条件
    let whereCondition = {};
    if (conditions.length > 0) {
      whereCondition = db.command.and(conditions);
    }
    
    let query = db.collection('appointments').where(whereCondition);
    
    // 查询预约列表，按创建时间倒序排列
    const result = await query
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get();
      
    console.log('appointmentList云函数查询结果:', result);

    return {
      success: true,
      message: '获取预约列表成功',
      data: result.data
    };
  } catch (e) {
    console.error('appointmentList云函数错误:', e);
    return {
      success: false,
      message: '获取预约列表失败',
      error: e
    };
  }
};