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
    // 查询服务详情
    const result = await db.collection('services')
      .doc(id)
      .get();

    return {
      success: true,
      message: '获取服务详情成功',
      data: result.data
    };
  } catch (e) {
    console.error(e);
    return {
      success: false,
      message: '获取服务详情失败',
      error: e
    };
  }
};
