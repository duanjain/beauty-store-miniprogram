// 云函数入口文件
const cloud = require('wx-server-sdk')

// 使用固定的云环境ID
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})
const db = cloud.database()
const _ = db.command

// 云函数入口函数
exports.main = async (event, context) => {
  const { filter = {}, page = 1, pageSize = 10 } = event
  console.log('获取商品参数:', event)
  console.log('筛选条件:', filter)
  
  try {
    // 计算分页偏移量
    const skip = (page - 1) * pageSize
    
    // 构建查询条件
    let query = db.collection('products')
    
    // 应用筛选条件
    if (filter) {
      // 暂时注释状态筛选，调试分类问题
      // if (filter.status !== undefined) {
      //   console.log('添加状态筛选:', filter.status)
      //   query = query.where({ status: filter.status })
      // }
      if (filter.categoryId || filter.category) {
        const categoryValue = filter.categoryId || filter.category
        console.log('添加分类筛选:', categoryValue)
        // 兼容旧的category字段(字符串)和新的categories字段(数组)
        query = query.where(_.or([
          { category: categoryValue },
          { categories: categoryValue }
        ]))
      }
      if (filter.name) {
        console.log('添加名称筛选:', filter.name)
        query = query.where({ name: filter.name })
      }
    }
    
    // 获取商品总数
    const countResult = await query.count()
    const total = countResult.total
    console.log('商品总数:', total)
    
    // 查询商品列表
    const queryResult = await query
      .orderBy('createdAt', 'desc') // 按创建时间倒序
      .skip(skip)
      .limit(pageSize)
      .get()
    
    const products = queryResult.data
    console.log('查询到的商品:', products)
    
    // 格式化商品数据
    const formattedProducts = products.map(product => ({
      ...product,
      description: product.description !== undefined && product.description !== 'undefined' ? product.description : '',
      formattedCreatedAt: formatDate(product.createdAt)
    }))

    // 批量换取临时链接 (Skip if no products)
    if (formattedProducts.length > 0) {
      const fileList = []
      const fileMap = {} // map fileID -> array of {productIndex, imageIndex}

      formattedProducts.forEach((p, pIdx) => {
        if (p.images && Array.isArray(p.images)) {
          p.images.forEach((img, imgIdx) => {
            if (typeof img === 'string' && img.startsWith('cloud://')) {
              fileList.push(img)
              if (!fileMap[img]) {
                fileMap[img] = []
              }
              fileMap[img].push({ pIdx, imgIdx })
            }
          })
        }
      })

      // Only call getTempFileURL if we have cloud paths
      if (fileList.length > 0) {
        try {
          // Chunk requests if too many images (limit is usually 50-100 per call, doing 50 to be safe)
          const chunkSize = 50
          for (let i = 0; i < fileList.length; i += chunkSize) {
            const chunk = fileList.slice(i, i + chunkSize)
            const result = await cloud.getTempFileURL({
              fileList: chunk
            })
            
            if (result.fileList) {
              result.fileList.forEach(fileItem => {
                if (fileItem.tempFileURL && fileMap[fileItem.fileID]) {
                  fileMap[fileItem.fileID].forEach(loc => {
                    formattedProducts[loc.pIdx].images[loc.imgIdx] = fileItem.tempFileURL
                  })
                }
              })
            }
          }
        } catch (e) {
          console.error('Error exchanging tempFileURL:', e)
          // Continue without temp URLs if failed, fallback to original cloud:// paths
        }
      }
    }
    
    console.log('返回商品数据:', formattedProducts)
    return {
      success: true,
      products: formattedProducts,
      total: total,
      page: page,
      pageSize: pageSize,
      hasMore: skip + formattedProducts.length < total
    }
  } catch (error) {
    console.error('获取商品失败:', error)
    return {
      success: false,
      message: '获取商品失败',
      error: error.message
    }
  }
}

// 格式化日期
function formatDate(date) {
  if (!date) return ''
  
  // 如果是字符串，转换为Date对象
  const d = typeof date === 'string' ? new Date(date) : date
  
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  
  return `${year}-${month}-${day} ${hours}:${minutes}`
}
