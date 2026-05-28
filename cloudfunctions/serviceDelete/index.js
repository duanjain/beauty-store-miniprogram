const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { id } = event;

  try {
    // 权限校验：检查是否是管理员
    const callerRes = await db.collection('users').doc(wxContext.OPENID).get().catch(() => ({ data: null }));
    const caller = callerRes.data;

    if (!caller || caller.role !== 'admin') {
      return {
        success: false,
        message: '权限不足，只有管理员可以删除服务'
      };
    }

    // 执行软删除，将isDeleted字段设置为true
    const result = await db.collection('services').doc(id).update({
      data: {
        isDeleted: true,
        updatedAt: db.serverDate()
      }
    });

    return {
      success: true,
      message: '服务删除成功',
      data: result
    };
  } catch (e) {
    console.error(e);
    return {
      success: false,
      message: '服务删除失败',
      error: e
    };
  }
};
