const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { service } = event;

  try {
    // 权限校验：检查是否是管理员
    const callerRes = await db.collection('users').doc(wxContext.OPENID).get().catch(() => ({ data: null }));
    const caller = callerRes.data;

    if (!caller || caller.role !== 'admin') {
      return {
        success: false,
        message: '权限不足，只有管理员可以添加服务'
      };
    }

    const result = await db.collection('services').add({
      data: {
        ...service,
        _openid: wxContext.OPENID,
        createdAt: db.serverDate(),
        updatedAt: db.serverDate(),
        isDeleted: false
      }
    });

    return {
      success: true,
      message: '服务添加成功',
      data: result._id
    };
  } catch (e) {
    console.error(e);
    return {
      success: false,
      message: '服务添加失败',
      error: e
    };
  }
};
