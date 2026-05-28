const cloud = require('wx-server-sdk');

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext();
  const { page = 1, pageSize = 10, keyword = '' } = event;
  console.log('serviceList云函数调用，参数:', event);

  try {
    // 计算跳过的记录数
    const skip = (page - 1) * pageSize;
    
    // 构建查询条件
    let whereCondition = {
      isDeleted: db.command.or(
        db.command.eq(false),
        db.command.exists(false) // 包含isDeleted字段不存在的记录，这些也视为未删除
      )
    };
    
    // 如果有搜索关键词，添加模糊查询条件
    if (keyword.trim()) {
      whereCondition.serviceName = db.RegExp({
        regexp: keyword,
        options: 'i' // i表示忽略大小写
      });
    }
    
    let query = db.collection('services').where(whereCondition);
    
    // 查询服务列表，按创建时间倒序排列
    const result = await query
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get();
      
    console.log('serviceList云函数查询结果:', result);

    const services = result.data;
    // 批量换取临时链接 (Skip if no services)
    if (services.length > 0) {
      const fileList = [];
      const fileMap = {}; // map fileID -> array of {serviceIndex, imageIndex}

      services.forEach((s, sIdx) => {
        if (s.images && Array.isArray(s.images)) {
          s.images.forEach((img, imgIdx) => {
            if (typeof img === 'string' && img.startsWith('cloud://')) {
              fileList.push(img);
              if (!fileMap[img]) {
                fileMap[img] = [];
              }
              fileMap[img].push({ sIdx, imgIdx });
            }
          });
        }
      });

      // Only call getTempFileURL if we have cloud paths
      if (fileList.length > 0) {
        try {
          // Chunk requests if too many images
          const chunkSize = 50;
          for (let i = 0; i < fileList.length; i += chunkSize) {
            const chunk = fileList.slice(i, i + chunkSize);
            const urlResult = await cloud.getTempFileURL({
              fileList: chunk
            });
            
            if (urlResult.fileList) {
              urlResult.fileList.forEach(fileItem => {
                if (fileItem.tempFileURL && fileMap[fileItem.fileID]) {
                  fileMap[fileItem.fileID].forEach(loc => {
                    services[loc.sIdx].images[loc.imgIdx] = fileItem.tempFileURL;
                  });
                }
              });
            }
          }
        } catch (e) {
          console.error('Error exchanging tempFileURL for services:', e);
          // Continue without temp URLs if failed
        }
      }
    }

    return {
      success: true,
      message: '获取服务列表成功',
      data: services
    };
  } catch (e) {
    console.error('serviceList云函数错误:', e);
    return {
      success: false,
      message: '获取服务列表失败',
      error: e
    };
  }
};
