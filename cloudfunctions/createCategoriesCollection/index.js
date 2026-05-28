// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    await db.createCollection('categories')
    // 初始化一些分类数据
    await db.collection('categories').add({data: {name: '护肤', createTime: new Date()}})
    await db.collection('categories').add({data: {name: '彩妆', createTime: new Date()}})
    await db.collection('categories').add({data: {name: '香氛', createTime: new Date()}})
    
    return {
      success: true,
      message: '集合创建成功'
    }
  } catch (e) {
    return {
      success: true,
      message: '集合已存在或创建失败: ' + e.message
    }
  }
}