const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

exports.main = async (event, context) => {
  const { userId } = event;
  
  if (!userId) {
    return {
      success: false,
      message: '缺少用户ID'
    };
  }

  try {
    // 1. 获取用户信息
    const userRes = await db.collection('users').doc(userId).get();
    const userInfo = userRes.data;

    if (!userInfo) {
      return {
        success: false,
        message: '用户不存在'
      };
    }

    // 优先使用 _openid，如果不存在则使用 docId (userId) 作为 openid
    // 因为在 login 云函数中，我们使用 openid 作为用户的 _id
    const targetOpenid = userInfo._openid || userInfo.openid || userId;

    if (!targetOpenid) {
      return {
        success: true,
        data: {
          userInfo,
          orders: [],
          appointments: []
        },
        message: '无法确定用户OpenID，无法获取关联数据'
      };
    }

    console.log('Querying orders for openid:', targetOpenid);

    // 2. 并行获取订单和预约记录
    const [ordersRes, appointmentsRes] = await Promise.all([
      db.collection('orders')
        .where({ userId: targetOpenid })
        .orderBy('createTime', 'desc')
        .limit(100) // 限制返回数量，防止数据过多
        .get(),
      db.collection('appointments')
        .where({ userId: targetOpenid })
        .orderBy('createTime', 'desc')
        .limit(100)
        .get()
    ]);

    return {
      success: true,
      data: {
        userInfo,
        orders: ordersRes.data,
        appointments: appointmentsRes.data
      }
    };

  } catch (err) {
    console.error('获取用户详情失败', err);
    return {
      success: false,
      message: '获取用户详情失败',
      error: err
    };
  }
};
