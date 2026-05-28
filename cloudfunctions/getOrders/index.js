const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  const { 
    page = 0, 
    pageSize = 10, 
    status = 'all',
    search = ''
  } = event

  // 1. Check user role
  let isAdmin = false
  let debugInfo = {
    openid: openid,
    roleCheck: 'none',
    foundUser: null
  }

  try {
    // 尝试直接通过 doc(openid) 获取
    try {
      const userRes = await db.collection('users').doc(openid).get()
      if (userRes.data) {
        debugInfo.foundUser = userRes.data
        debugInfo.roleCheck = 'doc'
        const role = userRes.data.role || ''
        if (role.toLowerCase() === 'admin') {
          isAdmin = true
        }
      }
    } catch (e) {
      console.log('User doc not found by openid, trying where query...')
    }

    // 如果第一次没找到或者不是admin，尝试通过 _openid 查询
    if (!isAdmin) {
      try {
        const userQuery = await db.collection('users').where({ _openid: openid }).get()
        if (userQuery.data && userQuery.data.length > 0) {
          const user = userQuery.data[0]
          debugInfo.foundUser = user
          debugInfo.roleCheck = 'where'
          const role = user.role || ''
          if (role.toLowerCase() === 'admin') {
            isAdmin = true
          }
        }
      } catch (e) {
        console.error('User query by _openid failed', e)
      }
    }
  } catch (e) {
    console.error('Check role failed', e)
    debugInfo.error = e.message
  }

  console.log('Current user:', openid, 'Is Admin:', isAdmin, 'Debug:', debugInfo)

  // 2. Build query
  let match = {}
  
  // Permission check: Admin sees all, User sees own
  if (!isAdmin) {
    match.userId = openid
  }
  
  // Status filter
  if (status && status !== 'all') {
    let dbStatus = status
    if (status === 'pending_pay') dbStatus = 'pending'
    else if (status === 'pending_ship') dbStatus = 'paid'
    
    match.status = dbStatus
  }
  
  // Search filter
  let queryCondition = match
  if (search) {
    const searchRegex = db.RegExp({
      regexp: search,
      options: 'i'
    })
    queryCondition = _.and([
      match,
      _.or([
        { 'address.userName': searchRegex },
        { 'address.telNumber': searchRegex },
        { 'address.name': searchRegex },
        { 'address.phone': searchRegex },
        { 'userName': searchRegex },
        { 'phone': searchRegex }
      ])
    ])
  }

  try {
    const countResult = await db.collection('orders').where(queryCondition).count()
    const total = countResult.total

    const res = await db.collection('orders')
      .where(queryCondition)
      .orderBy('createTime', 'desc')
      .skip(page * pageSize)
      .limit(pageSize)
      .get()

    return {
      success: true,
      data: res.data,
      total: total,
      isAdmin: isAdmin,
      debug: debugInfo
    }
  } catch (e) {
    console.error('Get orders failed', e)
    return {
      success: false,
      message: '获取订单失败',
      error: e
    }
  }
}
