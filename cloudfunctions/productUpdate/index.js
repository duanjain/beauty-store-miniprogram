const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { productId, product } = event;

  try {
    // 权限校验：检查是否是管理员
    const callerRes = await db.collection('users').doc(wxContext.OPENID).get().catch(() => ({ data: null }));
    const caller = callerRes.data;

    if (!caller || caller.role !== 'admin') {
      return {
        success: false,
        message: '权限不足，只有管理员可以更新商品'
      };
    }

    // 确保价格、库存等字段转换为数字类型
    const updateData = {
      ...product,
      updatedAt: db.serverDate()
    };
    
    // 转换价格字段为数字
    if (updateData.price !== undefined) {
      updateData.price = parseFloat(updateData.price) || 0;
    }
    if (updateData.originalPrice !== undefined) {
      updateData.originalPrice = parseFloat(updateData.originalPrice) || null;
    }
    if (updateData.stock !== undefined) {
      updateData.stock = parseInt(updateData.stock) || 0;
    }
    
    const result = await db.collection('products').doc(productId).update({
      data: updateData
    });

    return {
      success: true,
      message: '商品更新成功',
      data: result
    };
  } catch (e) {
    console.error(e);
    return {
      success: false,
      message: '商品更新失败',
      error: e
    };
  }
};
