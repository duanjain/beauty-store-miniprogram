const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { productId } = event;

  try {
    // 权限校验：检查是否是管理员
    const callerRes = await db.collection('users').doc(wxContext.OPENID).get().catch(() => ({ data: null }));
    const caller = callerRes.data;

    if (!caller || caller.role !== 'admin') {
      return {
        success: false,
        message: '权限不足，只有管理员可以删除商品'
      };
    }
    
    // 首先查询商品信息，获取图片URL列表用于删除
    const productResult = await db.collection('products').doc(productId).get();
    const product = productResult.data;
    
    // 如果商品有图片，从云存储中删除
    if (product.images && product.images.length > 0) {
      await cloud.deleteFile({
        fileList: product.images
      });
    }
    
    // 从数据库中删除商品
    const result = await db.collection('products').doc(productId).remove();

    return {
      success: true,
      message: '商品删除成功',
      data: result
    };
  } catch (e) {
    console.error(e);
    return {
      success: false,
      message: '商品删除失败',
      error: e
    };
  }
};
