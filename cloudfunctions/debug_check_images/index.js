const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()

exports.main = async (event, context) => {
  try {
    const products = await db.collection('products').limit(5).get()
    const services = await db.collection('services').limit(5).get()
    
    return {
      success: true,
      products: products.data.map(p => ({
        id: p._id,
        name: p.name,
        images: p.images
      })),
      services: services.data.map(s => ({
        id: s._id,
        name: s.serviceName,
        images: s.images
      }))
    }
  } catch (e) {
    return {
      success: false,
      error: e
    }
  }
}
