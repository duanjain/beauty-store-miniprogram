const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { product } = event;
  const { userInfo } = event;

  try {
    // 权限校验：检查是否是管理员
    const callerRes = await db.collection('users').doc(wxContext.OPENID).get().catch(() => ({ data: null }));
    const caller = callerRes.data;

    if (!caller || caller.role !== 'admin') {
      return {
        success: false,
        message: '权限不足，只有管理员可以添加商品'
      };
    }
    
    // 确保价格、库存等字段转换为数字类型
    const formattedProduct = {
      ...product,
      price: parseFloat(product.price) || 0,
      originalPrice: parseFloat(product.originalPrice) || null,
      stock: parseInt(product.stock) || 0,
      _openid: wxContext.OPENID, // 记录创建者的 openid
      createdAt: db.serverDate(), // 记录创建时间
      updatedAt: db.serverDate(), // 记录更新时间
      isDeleted: false // 软删除标记
    };
    
    const result = await db.collection('products').add({
      data: formattedProduct
    });

    return {
      success: true,
      message: '商品添加成功',
      data: result._id
    };
  } catch (e) {
    console.error(e);
    return {
      success: false,
      message: '商品添加失败',
      error: e
    };
  }
};
