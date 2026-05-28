// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

async function generateInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  for (;;) {
    let code = ''
    for (let i = 0; i < 6; i++) {
      const idx = Math.floor(Math.random() * chars.length)
      code += chars[idx]
    }
    const res = await db.collection('users').where({ inviteCode: code }).limit(1).get()
    if (!res.data || res.data.length === 0) {
      return code
    }
  }
}

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, userInfo: inputUserInfo, inviterId, inviteCode } = event
  
  // 获取管理员列表
  // 优先级：1. 环境变量 ADMIN_OPENIDS  2. 代码中硬编码的列表 (方便无环境变量配置权限)
  const adminEnv = process.env.ADMIN_OPENIDS || ''
  const envAdminList = adminEnv.split(',').map(id => id.trim()).filter(id => id)
  
  // ⚠️ 请在此处填入管理员的 OpenID，如果是多个，用逗号分隔
  // 例如: const HARDCODED_ADMINS = ['oOp6G5...', 'oOp6G5...']
  // const HARDCODED_ADMINS = [] 
  
  const ADMIN_OPENIDS = [...new Set([...envAdminList])]

  // 判断当前用户是否在管理员白名单中
  const isAdmin = ADMIN_OPENIDS.includes(openid)

  console.log('登录云函数调用:', { action, openid, isAdmin })
  
  // 1. 检查模式 (仅获取OpenID和检查注册状态)
  if (action === 'check') {
    try {
      const userResult = await db.collection('users').doc(openid).get()
      return {
        success: true,
        registered: true,
        openid: openid,
        userInfo: userResult.data,
        isAdmin: isAdmin, // 告诉前端，根据环境变量，此人是否为管理员
        message: '用户已注册'
      }
    } catch (e) {
      return {
        success: true,
        registered: false,
        openid: openid,
        userInfo: null,
        isAdmin: isAdmin, // 即使未注册，也返回管理员身份标记
        message: '用户未注册'
      }
    }
  }

  // 2. 登录/注册模式
  try {
    // === 内容安全检测开始 ===
    if (inputUserInfo) {
      const nicknameToCheck = inputUserInfo.nickName;
      const avatarToCheck = inputUserInfo.avatarUrl;

      // 1. 文本安全检测 (昵称)
      if (nicknameToCheck) {
        try {
          const msgRes = await cloud.openapi.security.msgSecCheck({
            content: nicknameToCheck
          });
          if (msgRes.errCode !== 0) {
            return { success: false, message: '昵称包含违规内容，请修改' };
          }
        } catch (err) {
          if (err.errCode === 87014) {
            return { success: false, message: '昵称包含违规内容，请修改' };
          }
          console.error('文本安全检测失败 (忽略并放行):', err);
          // 仅在开发/演示环境下建议放行系统错误，生产环境应根据需求决定是否阻断
          // return { success: false, message: '内容安全检测服务异常，请稍后重试' };
        }
      }

      // 2. 图片安全检测 (头像)
      if (avatarToCheck && avatarToCheck.startsWith('cloud://')) {
        try {
          const fileRes = await cloud.downloadFile({ fileID: avatarToCheck });
          const fileBuffer = fileRes.fileContent;
          const imgRes = await cloud.openapi.security.imgSecCheck({
            media: {
              contentType: 'image/png',
              value: fileBuffer
            }
          });
          if (imgRes.errCode !== 0) {
            return { success: false, message: '头像包含违规内容，请更换' };
          }
        } catch (err) {
          if (err.errCode === 87014) {
            return { success: false, message: '头像包含违规内容，请更换' };
          }
          console.error('图片安全检测失败 (忽略并放行):', err);
          // return { success: false, message: '图片安全检测失败，请重试或更换图片' };
        }
      }
    }
    // === 内容安全检测结束 ===

    // 确定目标角色
    const targetRole = ADMIN_OPENIDS.includes(openid) ? 'admin' : 'user'
    
    // 检查用户是否存在
    const userResult = await db.collection('users').doc(openid).get().catch(() => ({ data: null }))
    const currentUser = userResult.data
    
    if (currentUser) {
      const updateData = {
        updateTime: new Date(),
        role: targetRole
      }
      
      if (inputUserInfo) {
        updateData.nickname = inputUserInfo.nickName || currentUser.nickname
        updateData.avatarUrl = inputUserInfo.avatarUrl || currentUser.avatarUrl
      }

      if (!currentUser.inviteCode) {
        const code = await generateInviteCode()
        updateData.inviteCode = code
      }
      
      await db.collection('users').doc(openid).update({
        data: updateData
      })
      
      return {
        success: true,
        userInfo: {
          ...currentUser,
          ...updateData,
          openid: openid
        },
        message: '登录成功'
      }
    } else {
      const newUser = {
        _id: openid,
        _openid: openid,
        nickname: inputUserInfo?.nickName || '微信用户',
        avatarUrl: inputUserInfo?.avatarUrl || '',
        registerDate: new Date(),
        updateTime: new Date(),
        role: targetRole,
        points: 0
      }

      const selfUserId = openid
      let finalInviterId = null

      if (inviteCode) {
        try {
          const inviterRes = await db.collection('users').where({ inviteCode }).limit(1).get()
          if (inviterRes.data && inviterRes.data.length > 0) {
            const inviterDoc = inviterRes.data[0]
            finalInviterId = inviterDoc._id || inviterDoc._openid || null
          }
        } catch (e) {
          finalInviterId = null
        }
      } else if (inviterId && inviterId !== selfUserId) {
        finalInviterId = inviterId
      }

      if (finalInviterId && finalInviterId !== selfUserId) {
        newUser.inviterId = finalInviterId
      }

      const newInviteCode = await generateInviteCode()
      newUser.inviteCode = newInviteCode
      
      await db.collection('users').add({
        data: newUser
      })
      
      return {
        success: true,
        userInfo: newUser,
        message: '注册成功'
      }
    }
  } catch (err) {
    console.error('登录流程异常:', err)
    return {
      success: false,
      message: '系统繁忙，请重试',
      error: err
    }
  }
}
