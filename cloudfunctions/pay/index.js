const cloud = require('wx-server-sdk')
const https = require('https')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const url = require('url')
const xml2js = require('xml2js')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

const builder = new xml2js.Builder({
  rootName: 'xml',
  headless: true,
  cdata: false
})

let merchantCert = null
let merchantKey = null

// Helper: 获取证书内容 (支持本地文件或云存储下载)
async function getCertificate() {
  if (merchantCert && merchantKey) {
    return { cert: merchantCert, key: merchantKey };
  }

  try {
    // 1. 尝试读取本地文件
    merchantCert = fs.readFileSync(path.join(__dirname, 'apiclient_cert.pem'));
    merchantKey = fs.readFileSync(path.join(__dirname, 'apiclient_key.pem'));
    // console.log('Using local certificates.');
  } catch (e) {
    // console.log('Local certificates not found, checking Cloud Storage...');
    
    // 2. 尝试从云存储下载 (如果配置了环境变量)
    const certFileID = process.env.WX_PAY_CERT_FILEID;
    const keyFileID = process.env.WX_PAY_KEY_FILEID;

    if (certFileID && keyFileID) {
      try {
        // console.log('Downloading certificates from Cloud Storage...');
        const certRes = await cloud.downloadFile({ fileID: certFileID });
        const keyRes = await cloud.downloadFile({ fileID: keyFileID });
        
        merchantCert = certRes.fileContent;
        merchantKey = keyRes.fileContent;
        // console.log('Certificates downloaded successfully.');
      } catch (downloadErr) {
        console.error('Failed to download certificates from Cloud Storage');
      }
    } else {
      console.warn('Certificate FileIDs not configured in environment variables.');
    }
  }

  return { cert: merchantCert, key: merchantKey };
}

const payConfig = {
  appid: process.env.WX_APPID,
  mchId: process.env.WX_MCH_ID,
  key: process.env.WX_PAY_KEY,
  notifyUrl: process.env.WX_NOTIFY_URL,
  refundNotifyUrl: process.env.WX_REFUND_NOTIFY_URL || 'https://api.mch.weixin.qq.com/pay/notify'
}

// 检查关键配置是否存在
if (!payConfig.appid || !payConfig.mchId || !payConfig.key) {
  console.warn('⚠️ 支付配置缺失！请在云函数控制台配置环境变量 WX_APPID, WX_MCH_ID, WX_PAY_KEY')
} else {
  // 如果 notifyUrl 为空，使用默认占位符，避免统一下单报错
  // 注意：使用占位符意味着无法接收微信支付的主动回调，必须依赖前端主动查询或轮询
  if (!payConfig.notifyUrl) {
    console.log('未配置 WX_NOTIFY_URL，使用默认占位符。请确保使用主动查询模式确认订单状态。')
    payConfig.notifyUrl = 'https://api.mch.weixin.qq.com/pay/notify'
  }
}


const INTERNAL_SECRET = process.env.INTERNAL_SECRET

if (!INTERNAL_SECRET) {
  console.warn('⚠️ INTERNAL_SECRET environment variable is not set. System-level operations relying on this secret will fail.')
}


// 🛡️ Helper: Verify User Role
async function isAdmin(openid) {
  try {
    const userRes = await db.collection('users').doc(openid).get()
    return userRes.data && userRes.data.role === 'admin'
  } catch (e) {
    return false
  }
}

// 🛡️ Helper: Calculate Order Amount from Database
async function calculateRealAmount(type, orderData) {
  let calculatedAmount = 0
  
  if (type === 'order') {
    if (!orderData.items || !Array.isArray(orderData.items)) {
      throw new Error('订单缺少商品列表')
    }
    
    // Fetch all products involved
    const productIds = orderData.items.map(item => item.productId)
    const productsRes = await db.collection('products')
      .where({
        _id: db.command.in(productIds)
      })
      .get()
      
    const productMap = {}
    productsRes.data.forEach(p => {
      productMap[p._id] = p
    })
    
    for (const item of orderData.items) {
      const product = productMap[item.productId]
      if (!product) {
        throw new Error(`商品 ${item.productId} 不存在或已下架`)
      }
      const price = Number(product.price)
      const quantity = Number(item.quantity)
      calculatedAmount += price * quantity
    }
    
  } else if (type === 'appointment') {
    if (!orderData.serviceId) {
      throw new Error('预约缺少服务ID')
    }
    const serviceRes = await db.collection('services').doc(orderData.serviceId).get()
    if (!serviceRes.data) {
       throw new Error('服务不存在')
    }
    calculatedAmount = Number(serviceRes.data.price)
  }
  
  return calculatedAmount
}

function createNonceStr(length = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let str = ''
  for (let i = 0; i < length; i++) {
    str += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return str
}

function createTimestamp() {
  return Math.floor(Date.now() / 1000)
}

function buildSignParams(params) {
  const keys = Object.keys(params).filter(k => params[k] !== undefined && params[k] !== null && params[k] !== '').sort()
  const stringA = keys.map(k => `${k}=${params[k]}`).join('&')
  const stringSignTemp = `${stringA}&key=${payConfig.key}`
  return crypto.createHash('md5').update(stringSignTemp, 'utf8').digest('hex').toUpperCase()
}

function buildXML(obj) {
  return builder.buildObject(obj)
}

function parseXML(xml) {
  return new Promise((resolve, reject) => {
    xml2js.parseString(xml, { trim: true, explicitArray: true }, (err, result) => {
      if (err) {
        reject(err)
      } else {
        resolve(result)
      }
    })
  })
}

async function postXML(apiUrl, data, useCert = false) {
  // 获取证书 (如果是退款等需要证书的操作)
  if (useCert) {
    const { cert, key } = await getCertificate();
    if (!cert || !key) {
       throw new Error('Certificates missing. Cannot perform operation requiring auth.');
    }
    merchantCert = cert;
    merchantKey = key;
  }

  return new Promise((resolve, reject) => {
    const parsedUrl = url.parse(apiUrl)
    const options = {
      hostname: parsedUrl.hostname,
      port: 443,
      path: parsedUrl.path,
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml',
        'Content-Length': Buffer.byteLength(data, 'utf8')
      }
    }
    if (useCert && merchantCert && merchantKey) {
      options.cert = merchantCert
      options.key = merchantKey
    }
    const req = https.request(options, res => {
      let chunks = []
      res.on('data', chunk => {
        chunks.push(chunk)
      })
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8')
        resolve(body)
      })
    })
    req.on('error', err => {
      reject(err)
    })
    req.write(data, 'utf8')
    req.end()
  })
}

async function createUnifiedOrder(event, wxContext) {
  const openid = wxContext.OPENID || event.openid
  if (!openid) {
    return {
      success: false,
      message: '缺少openid'
    }
  }
  const type = event.type || 'order'
  const orderData = event.orderData || {}
  
  // 检查积分是否足够（预检）
  if (orderData.pointsUsed > 0) {
    try {
      const userRes = await db.collection('users').where({ _openid: openid }).get()
      if (userRes.data && userRes.data.length > 0) {
        const user = userRes.data[0]
        if ((user.points || 0) < orderData.pointsUsed) {
          return {
            success: false,
            message: '积分不足，无法下单'
          }
        }
      }
    } catch (e) {
      console.error('积分预检失败', e)
      // 预检失败可以选择放行，由后续原子操作兜底，或者直接拦截
      // 这里选择拦截，确保安全
      return {
        success: false,
        message: '系统繁忙，请重试'
      }
    }
  }

  // 确保金额是有效的数字，并且保留两位小数的精度（通过乘100取整）
  // 🛡️ Security Check: Validate Amount & Points Logic
  let calculatedFinalAmount = 0
  
  try {
     const realTotalAmount = await calculateRealAmount(type, orderData)
     const clientTotalAmount = Number(orderData.totalAmount || 0)
     
     // Allow small float difference (e.g. 0.01)
     if (Math.abs(realTotalAmount - clientTotalAmount) > 0.01) {
       console.error('Price tampering detected!')
       return {
         success: false,
         message: '订单金额校验失败，请刷新重试'
       }
     }

     // Validate Points Deduction
     // Rule: 20 points = 1 CNY
     const POINTS_RATE = 20
     const pointsUsed = Number(orderData.pointsUsed || 0)
     const clientPointsDeduction = Number(orderData.pointsDeduction || 0)
     const serverPointsDeduction = pointsUsed / POINTS_RATE
     
     // 放宽校验规则：允许客户端传入的抵扣金额小于理论值（因为前端可能强制限制了最大抵扣额）
     // 但绝不允许大于理论值（防止薅羊毛）
     // 同时，如果积分被使用，抵扣金额应该合理。
     
     // 1. 防止客户端多报抵扣金额 (Security)
     if (clientPointsDeduction > serverPointsDeduction + 0.01) {
        console.error('Points deduction tampering!')
        return {
          success: false,
          message: '积分抵扣金额异常'
        }
     }

     // 2. 验证前端计算的准确性 (Consistency)
     // 前端现在会强制保留 0.01 元，导致实际抵扣金额可能小于 pointsUsed / 20
     // 例如：总价 1.00，积分 20 (价值1.00)。前端限制抵扣 0.99 (保留0.01)。
     // 此时 clientPointsDeduction (0.99) < serverPointsDeduction (1.00)
     // 这是合法的。
     
     // 3. 验证是否匹配 (Optional but good)
     // 如果 clientPointsDeduction 明显小于 serverPointsDeduction，可能是用户只用了一部分积分？
     // 不，pointsUsed 是用户输入的积分数。serverPointsDeduction 是这些积分理论上能抵扣的钱。
     // 前端逻辑：deduction = points / 20。然后如果 total - deduction < 0.01，deduction = total - 0.01。
     // 所以 clientPointsDeduction <= serverPointsDeduction 是预期的。
     
     // 唯一的校验是：pointsUsed 对应的抵扣金额是否足以覆盖 clientPointsDeduction
     // 上面的检查 1 已经涵盖了。
     
     /* 
     // OLD STRICT CHECK - REMOVED
     if (Math.abs(serverPointsDeduction - clientPointsDeduction) > 0.01) {
        // ...
     }
     */
     
     // Calculate Final Amount Server-side
     // 注意：这里不能简单用 realTotalAmount - serverPointsDeduction，
     // 因为 serverPointsDeduction 可能是全额抵扣，但前端只抵扣了一部分。
     // 我们应该信任前端传来的 pointsDeduction (只要它不超过 pointsUsed/20) 吗？
     // 为了安全，我们应该重新计算“应该”抵扣多少。
     
     // Server-side recalculate logic based on new rule: min payment 0.01
     let calculatedDeduction = serverPointsDeduction;
     // Max deductible is total - 0.01
     const maxDeductible = realTotalAmount - 0.01;
     if (calculatedDeduction > maxDeductible) {
         calculatedDeduction = maxDeductible;
     }
     if (calculatedDeduction < 0) calculatedDeduction = 0;
     
     // 允许微小误差
     if (Math.abs(calculatedDeduction - clientPointsDeduction) > 0.05) {
          console.warn('Deduction mismatch.')
          // 如果前端传的抵扣额比服务端算的还少（比如用户主动不想抵完？不对，逻辑是算出 deduction），可能是计算逻辑差异。
          // 既然前端已经改了逻辑，服务端也必须同步这个逻辑：保留 0.01。
          
          // 如果差异过大，拒绝
          return {
             success: false,
             message: '积分抵扣计算不一致，请重试'
          }
     }
     
     calculatedFinalAmount = realTotalAmount - clientPointsDeduction // Trust client deduction after validation? 
     // Better: Use server calculated deduction
     calculatedFinalAmount = realTotalAmount - calculatedDeduction
     if (calculatedFinalAmount < 0.01) calculatedFinalAmount = 0.01 // Force min 0.01 server side too
     
     // Compare with client final amount to ensure transparency (optional but good for debugging)
     const clientFinalAmount = Number(orderData.finalAmount !== undefined ? orderData.finalAmount : orderData.totalAmount)
     if (Math.abs(calculatedFinalAmount - clientFinalAmount) > 0.01) {
        console.warn('Client final amount mismatch. Using server calculated amount.')
     }

  } catch (err) {
    console.error('Price validation error:', err)
    return {
      success: false,
      message: '无法校验订单金额: ' + err.message
    }
  }

  const finalAmount = calculatedFinalAmount
  
  if (finalAmount < 0) {
    return {
      success: false,
      message: '支付金额无效'
    }
  }
  let recordId = ''
  let outTradeNo = ''
  if (type === 'order') {
    const data = Object.assign({}, orderData, {
      userId: openid,
      status: 'pending',
      paymentMethod: 'wechat', // Default to wechat, will be updated to 'mock' if mock payment
      createTime: new Date()
    })
    const res = await db.collection('orders').add({
      data
    })
    recordId = res._id
    outTradeNo = recordId
    await db.collection('orders').doc(recordId).update({
      data: {
        outTradeNo
      }
    })

    // 🛒 Cart Cleanup Logic
    // If order is created successfully and contains cartItemIds, remove them from cart
    if (orderData.cartItemIds && Array.isArray(orderData.cartItemIds) && orderData.cartItemIds.length > 0) {
      try {
        await db.collection('cart').where({
          _id: db.command.in(orderData.cartItemIds)
        }).remove()
        console.log(`Removed ${orderData.cartItemIds.length} items from cart.`)
      } catch (err) {
        console.error('Failed to remove items from cart:', err)
        // Non-blocking error, order is still valid
      }
    }
  } else if (type === 'appointment') {
    const data = Object.assign({}, orderData, {
      userId: openid,
      status: 'pending',
      paymentMethod: 'wechat', // Default to wechat, will be updated to 'mock' if mock payment
      createTime: new Date(),
      finalAmount: calculatedFinalAmount // Ensure calculated amount (e.g. min 0.01) is saved
    })
    const res = await db.collection('appointments').add({
      data
    })
    recordId = res._id
    outTradeNo = recordId
    await db.collection('appointments').doc(recordId).update({
      data: {
        outTradeNo
      }
    })
  } else {
    return {
      success: false,
      message: '未知的支付类型'
    }
  }

  // 💰 Mock Payment Mode (Enabled by User Request)
  // Force all payments to be mock payments to bypass real WeChat Pay API
  if (finalAmount === 0) {
    // Update DB to mark as mock payment
    const collectionName = type === 'order' ? 'orders' : 'appointments'
    await db.collection(collectionName).doc(recordId).update({
        data: {
            paymentMethod: 'mock'
        }
    })

    return {
      success: true,
      data: {
        mock: true, // 标记为模拟支付
        recordId,
        type
      }
    }
  }

  const totalFee = Math.round(finalAmount * 100)
  const nonceStr = createNonceStr()
  const body = event.body || (type === 'order' ? '商品订单支付' : '服务预约支付')
  const params = {
    appid: payConfig.appid,
    mch_id: payConfig.mchId,
    nonce_str: nonceStr,
    body,
    out_trade_no: outTradeNo,
    total_fee: String(totalFee),
    spbill_create_ip: '127.0.0.1',
    notify_url: payConfig.notifyUrl,
    trade_type: 'JSAPI',
    openid
  }
  params.sign = buildSignParams(params)
  const xml = buildXML(params)
  let responseXML
  try {
    responseXML = await postXML('https://api.mch.weixin.qq.com/pay/unifiedorder', xml, false)
  } catch (e) {
    console.error('unifiedorder request error', e)
    return {
      success: false,
      message: '微信统一下单请求失败'
    }
  }
  let response
  try {
    response = await parseXML(responseXML)
  } catch (e) {
    console.error('unifiedorder parse xml error', e)
    return {
      success: false,
      message: '微信统一下单响应解析失败'
    }
  }
  const result = response.xml || {}
  if (!result.return_code || result.return_code[0] !== 'SUCCESS') {
    return {
      success: false,
      message: (result.return_msg && result.return_msg[0]) || '微信统一下单失败'
    }
  }
  if (!result.result_code || result.result_code[0] !== 'SUCCESS') {
    return {
      success: false,
      message: (result.err_code_des && result.err_code_des[0]) || '微信统一下单业务失败'
    }
  }
  const prepayId = result.prepay_id && result.prepay_id[0]
  if (!prepayId) {
    return {
      success: false,
      message: '未获取到预支付交易会话标识'
    }
  }
  const timeStamp = String(createTimestamp())
  const payNonceStr = createNonceStr()
  const payParams = {
    appId: payConfig.appid,
    timeStamp,
    nonceStr: payNonceStr,
    package: `prepay_id=${prepayId}`,
    signType: 'MD5'
  }
  const paySign = buildSignParams(payParams)
  return {
    success: true,
    data: {
      payment: {
        timeStamp,
        nonceStr: payNonceStr,
        package: `prepay_id=${prepayId}`,
        signType: 'MD5',
        paySign
      },
      recordId,
      type
    }
  }
}

async function refundOrder(event, wxContext) {
  const openid = wxContext.OPENID
  const orderId = event.orderId
  const internalSecret = event.internalSecret
  if (!orderId) {
    return { success: false, message: '缺少订单ID' }
  }

  // Fetch Order
  let order
  let collectionName = 'orders'
  try {
    const res = await db.collection('orders').doc(orderId).get()
    order = res.data
  } catch (e) {
    try {
      const res = await db.collection('appointments').doc(orderId).get()
      order = res.data
      collectionName = 'appointments'
    } catch (e2) {
      return { success: false, message: '订单不存在' }
    }
  }

  // 🛡️ Security Check
  // 确保能从多种途径获取 OpenID，兼容云函数互调场景
  const realOpenId = openid || event.userInfo?.openId || event.openid
  const isOwner = order.userId === realOpenId
  const isAdminUser = await isAdmin(realOpenId)
  
  // Logic: 
  // 1. Admin can refund anytime (if paid)
  // 2. Owner can refund ONLY IF status is 'paid' or 'confirmed' (not shipped/completed)
  // 3. Internal System Call (trusted via Env Var)
  
  const envSecret = process.env.INTERNAL_SECRET
  
  let isAllowed = false
  
  // 1. 环境变量密钥验证 (最高优先级，用于系统级调用)
  if (envSecret && internalSecret === envSecret) {
    isAllowed = true
  }
  // 2. 管理员权限
  else if (isAdminUser) {
    isAllowed = true
  } 
  // 3. 拥有者权限 (无需密钥，仅需验证身份和状态)
  else if (isOwner) {
    // Owner can refund only if status is NOT shipped/completed
    if (['paid', 'confirmed'].includes(order.status)) {
       isAllowed = true
    }
  }

  if (!isAllowed) {
    return {
      success: false,
      message: '权限不足：无法退款'
    }
  }

  if (order.status !== 'paid' && order.status !== 'confirmed') {
    return {
      success: false,
      message: '订单未支付或已处理'
    }
  }

  // Use finalAmount (actual paid amount) for refund if available
  // Fallback to totalAmount for legacy orders or full price orders
  let refundAmount = 0
  if (order.finalAmount !== undefined && order.finalAmount !== null) {
      refundAmount = Number(order.finalAmount)
  } else {
      refundAmount = Number(order.totalAmount || order.price || order.servicePrice || 0)
  }

  if (!(refundAmount > 0)) {
    // If amount is 0 (e.g. fully paid by points), we just mark as refunded locally
    if (refundAmount === 0) {
        await db.collection(collectionName).doc(orderId).update({
            data: {
              status: 'cancelled',
              refundStatus: 'success',
              refundTime: new Date(),
              outRefundNo: `refund_${orderId}`
            }
          })
          return {
            success: true,
            data: {
              orderId,
              outRefundNo: `refund_${orderId}`
            }
          }
    }
    return {
      success: false,
      message: '订单金额无效'
    }
  }
  const totalFee = Math.round(refundAmount * 100)
  const refundFee = totalFee
  const nonceStr = createNonceStr()
  const outTradeNo = order.outTradeNo || orderId
  const outRefundNo = `refund_${orderId}`
  const params = {
    appid: payConfig.appid,
    mch_id: payConfig.mchId,
    nonce_str: nonceStr,
    out_trade_no: outTradeNo,
    out_refund_no: outRefundNo,
    total_fee: String(totalFee),
    refund_fee: String(refundFee),
    notify_url: payConfig.refundNotifyUrl
  }
  // 💰 Mock Refund Mode
  // Bypass real WeChat Pay Refund API
  /*
  params.sign = buildSignParams(params)
  const xml = buildXML(params)
  // ... (real api calls commented out or skipped)
  
  await db.collection(collectionName).doc(orderId).update({
    data: {
      status: 'cancelled',
      refundStatus: 'success',
      refundTime: new Date(),
      outRefundNo
    }
  })
  return {
    success: true,
    data: {
      orderId,
      outRefundNo
    }
  }
  */

  // Real Refund Logic Enabled
  params.sign = buildSignParams(params)
  const xml = buildXML(params)
  let responseXML
  try {
    responseXML = await postXML('https://api.mch.weixin.qq.com/secapi/pay/refund', xml, true)
  } catch (e) {
    console.error('refund request error', e)
    return {
      success: false,
      message: '微信退款请求失败'
    }
  }
  let response
  try {
    response = await parseXML(responseXML)
  } catch (e) {
    console.error('refund parse xml error', e)
    return {
      success: false,
      message: '微信退款响应解析失败'
    }
  }
  const result = response.xml || {}
  if (!result.return_code || result.return_code[0] !== 'SUCCESS') {
    return {
      success: false,
      message: (result.return_msg && result.return_msg[0]) || '微信退款失败'
    }
  }
  if (!result.result_code || result.result_code[0] !== 'SUCCESS') {
    return {
      success: false,
      message: (result.err_code_des && result.err_code_des[0]) || '微信退款业务失败'
    }
  }
  await db.collection(collectionName).doc(orderId).update({
    data: {
      status: 'cancelled',
      refundStatus: 'success',
      refundTime: new Date(),
      outRefundNo
    }
  })
  return {
    success: true,
    data: {
      orderId,
      outRefundNo
    }
  }
}

// 🛡️ Helper: Query Order from WeChat Pay
async function queryWeChatOrder(outTradeNo) {
  const nonceStr = createNonceStr()
  const params = {
    appid: payConfig.appid,
    mch_id: payConfig.mchId,
    out_trade_no: outTradeNo,
    nonce_str: nonceStr
  }
  params.sign = buildSignParams(params)
  const xml = buildXML(params)
  
  try {
    const responseXML = await postXML('https://api.mch.weixin.qq.com/pay/orderquery', xml, false)
    const response = await parseXML(responseXML)
    const result = response.xml || {}
    
    if (result.return_code && result.return_code[0] === 'SUCCESS' && 
        result.result_code && result.result_code[0] === 'SUCCESS') {
      return result
    }
    return null
  } catch (e) {
    console.error('query order error', e)
    return null
  }
}

// Query Order Status from WeChat Pay or Local DB (for Mock)
async function queryOrder(event, wxContext) {
  const openid = wxContext.OPENID || event.openid
  const { orderId, type, outTradeNo } = event
  
  if (!orderId) {
    return { success: false, message: '缺少订单ID' }
  }
  
  const collectionName = type === 'appointment' ? 'appointments' : 'orders'
  
  try {
    const docRes = await db.collection(collectionName).doc(orderId).get()
    const order = docRes.data
    
    // Security check: only owner or admin can query/update
    const isOwner = order.userId === openid
    const isAdminUser = await isAdmin(openid)
    
    if (!isOwner && !isAdminUser) {
       return { success: false, message: '无权查询此订单' }
    }
    
    if (order.status === 'paid') {
       return { success: true, message: '订单已支付', data: { status: 'paid' } }
    }
    
    // Real WeChat Pay Query
    const nonceStr = createNonceStr()
    const params = {
        appid: payConfig.appid,
        mch_id: payConfig.mchId,
        out_trade_no: outTradeNo || order.outTradeNo || orderId,
        nonce_str: nonceStr
    }
    params.sign = buildSignParams(params)
    const xml = buildXML(params)
    
    let responseXML
    try {
        responseXML = await postXML('https://api.mch.weixin.qq.com/pay/orderquery', xml, false)
    } catch (e) {
        console.error('orderquery request error', e)
        return { success: false, message: '查询请求失败' }
    }
    
    const response = await parseXML(responseXML)
    const result = response.xml || {}
    
    if (result.return_code && result.return_code[0] === 'SUCCESS' && 
        result.result_code && result.result_code[0] === 'SUCCESS') {
            
        const tradeState = result.trade_state && result.trade_state[0]
        if (tradeState === 'SUCCESS') {
            const updates = {
                status: 'paid',
                transactionId: result.transaction_id ? result.transaction_id[0] : '',
                payTime: result.time_end ? result.time_end[0] : null,
                updateTime: db.serverDate()
            }

            // 1. Deduct points if used (Idempotent)
            let pointsDeducted = order.pointsDeducted || false
            if (order.pointsUsed > 0 && order.userId && !pointsDeducted) {
              try {
                // Check if already deducted in logs to prevent double deduction
                const deductLogCount = await db.collection('pointsLogs').where({
                    orderId: orderId,
                    source: collectionName === 'appointments' ? 'appointment_deduction' : 'order_deduction'
                }).count()

                if (deductLogCount.total > 0) {
                    console.log(`[Pay] Points deduction log exists for ${orderId}, skipping.`)
                    pointsDeducted = true
                } else {
                    const pointsToDeduct = order.pointsUsed
                    
                    // Get current points for log
                    const userRes = await db.collection('users').doc(order.userId).get().catch(() => null)
                    const beforePoints = userRes && userRes.data ? (userRes.data.points || 0) : 0
                    
                    // Force deduct points
                    await db.collection('users').doc(order.userId).update({
                      data: {
                        points: db.command.inc(-pointsToDeduct)
                      }
                    })
                    
                    // Log deduction
                    await db.collection('pointsLogs').add({
                      data: {
                        userId: order.userId,
                        source: collectionName === 'appointments' ? 'appointment_deduction' : 'order_deduction',
                        orderId: orderId,
                        change: -pointsToDeduct,
                        beforePoints: beforePoints,
                        afterPoints: beforePoints - pointsToDeduct,
                        createTime: db.serverDate(),
                        description: collectionName === 'appointments' ? '预约抵扣' : '购物抵扣'
                      }
                    })
                    pointsDeducted = true
                    console.log(`[Pay] Points deducted: ${pointsToDeduct} for order ${orderId}`)
                }
              } catch (deductErr) {
                console.error('[Pay] Failed to deduct points:', deductErr)
              }
            }
            updates.pointsDeducted = pointsDeducted

            // 2. Add Points for Orders - REMOVED per user request (points only on 'confirmed' status)
            // Points will be added in orderUpdate cloud function when admin confirms the order.
            
            // Update DB with all changes
            await db.collection(collectionName).doc(orderId).update({
                data: updates
            })
            
            return { success: true, message: '支付成功', data: { status: 'paid' } }
        } else {
             return { success: false, message: '未支付或支付失败', data: { status: tradeState } }
        }
    } else {
        return { 
            success: false, 
            message: (result.err_code_des && result.err_code_des[0]) || '查询失败'
        }
    }
    
  } catch (e) {
    console.error('queryOrder error', e)
    return { success: false, message: '查询异常: ' + e.message }
  }
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { action } = event

  switch (action) {
    case 'unifiedOrder':
      return await createUnifiedOrder(event, wxContext)
    case 'queryOrder':
      return await queryOrder(event, wxContext)
    case 'refund':
      return await refundOrder(event, wxContext)
    default:
      return {
        success: false,
        message: '未知的动作'
      }
  }
}
