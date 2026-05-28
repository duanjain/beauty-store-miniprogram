const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { orderId } = event

  if (!orderId) {
    return {
      success: false,
      message: '订单ID不能为空'
    }
  }

  // 1. Check user role
  let isAdmin = false
  try {
    const userRes = await db.collection('users').doc(openid).get()
    if (userRes.data && userRes.data.role === 'admin') {
      isAdmin = true
    }
  } catch (e) {
    // console.error('Check role failed', e)
  }

  // 2. Fetch Order
  try {
    let orderRes = await db.collection('orders').doc(orderId).get().catch(() => null)
    
    // If not found in orders, try appointments
    if (!orderRes || !orderRes.data) {
      orderRes = await db.collection('appointments').doc(orderId).get().catch(() => null)
    }

    if (!orderRes || !orderRes.data) {
      return {
        success: false,
        message: '订单不存在'
      }
    }

    const order = orderRes.data

    // 3. Permission Check
    if (!isAdmin && order.userId !== openid && order._openid !== openid) {
      return {
        success: false,
        message: '无权访问此订单'
      }
    }

    // 4. Fetch Product Images if needed
    if (order.items && order.items.length > 0) {
       const productIds = order.items.map(item => item.productId).filter(id => id)
       if (productIds.length > 0) {
         try {
            const productsRes = await db.collection('products').where({
              _id: db.command.in(productIds)
            }).get()
            const products = productsRes.data
            const productMap = {}
            products.forEach(p => {
              productMap[p._id] = p
            })
            
            order.items = order.items.map(item => {
              const product = productMap[item.productId]
              let imageUrl = item.imageUrl
              const isDefaultImage = !imageUrl || imageUrl === '/images/tabbar/home.png'
              
              if (isDefaultImage && product && product.images && product.images.length > 0) {
                imageUrl = product.images[0]
              }
              return {
                ...item,
                imageUrl: imageUrl
              }
            })
         } catch (e) {
           console.error('Fetch products failed', e)
         }
       }
    }

    // 5. Exchange TempFileURLs for images
    try {
      const fileList = []
      const fileMap = {} // map fileID -> array of locations

      // Collect URLs from items
      if (order.items && Array.isArray(order.items)) {
        order.items.forEach((item, idx) => {
          if (item.imageUrl && typeof item.imageUrl === 'string' && item.imageUrl.startsWith('cloud://')) {
             fileList.push(item.imageUrl)
             if (!fileMap[item.imageUrl]) fileMap[item.imageUrl] = []
             fileMap[item.imageUrl].push({ type: 'item', idx })
          }
        })
      }

      // Collect URLs from appointment specific fields (if any)
      // If it's an appointment, it might have a service snapshot with images
      if (order.serviceSnapshot && order.serviceSnapshot.images && Array.isArray(order.serviceSnapshot.images)) {
         order.serviceSnapshot.images.forEach((img, idx) => {
            if (img && typeof img === 'string' && img.startsWith('cloud://')) {
              fileList.push(img)
              if (!fileMap[img]) fileMap[img] = []
              fileMap[img].push({ type: 'service', idx })
            }
         })
      }

      if (fileList.length > 0) {
        const urlResult = await cloud.getTempFileURL({ fileList })
        if (urlResult.fileList) {
          urlResult.fileList.forEach(f => {
            if (f.tempFileURL && fileMap[f.fileID]) {
              fileMap[f.fileID].forEach(loc => {
                if (loc.type === 'item') {
                  order.items[loc.idx].imageUrl = f.tempFileURL
                } else if (loc.type === 'service') {
                  order.serviceSnapshot.images[loc.idx] = f.tempFileURL
                }
              })
            }
          })
        }
      }
    } catch (e) {
      console.error('Exchange Temp URL failed', e)
    }

    return {
      success: true,
      data: order,
      isAdmin: isAdmin
    }

  } catch (e) {
    console.error('Get order detail failed', e)
    return {
      success: false,
      message: '获取订单详情失败',
      error: e
    }
  }
}