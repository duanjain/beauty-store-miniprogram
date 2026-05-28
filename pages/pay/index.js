const app = getApp();
const db = wx.cloud.database();

Page({
  data: {
    type: 'order', // 'order' | 'appointment'
    loading: false,
    orderInfo: {},
    totalAmount: 0,
    finalAmount: 0, // 实际支付金额
    items: [], // For order type
    serviceName: '', // For appointment type
    
    // New fields
    address: null,
    userPoints: 0,
    usePoints: false,
    inputPoints: 0, // 用户输入的积分数量
    maxUsePoints: 0, // 本单最大可用积分
    pointsDeduction: 0
  },

  onLoad(options) {
    let type = options.type;
    // Safety check for 'undefined' string or empty value
    if (!type || type === 'undefined') {
      type = 'order';
    }
    console.log('Payment page loaded with type:', type);
    
    this.setData({ type });
    
    // Ensure data initialization uses the correct type
    this.initData(type);
    this.loadUserPoints();
    
    // 如果是商品订单，尝试自动加载默认地址
    if (type === 'order') {
      this.loadDefaultAddress();
    }
  },

  onShow() {
    // 每次显示页面都刷新积分，确保准确
    this.loadUserPoints();
  },

  initData(type) {
    // Use the passed type or fallback to data.type
    const currentType = type || this.data.type;
    
    if (currentType === 'order') {
      const pendingOrder = app.globalData.pendingOrder;
      if (!pendingOrder) {
        wx.showToast({ title: '订单数据丢失', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 1500);
        return;
      }
      this.setData({
        orderInfo: pendingOrder,
        totalAmount: pendingOrder.totalAmount,
        finalAmount: pendingOrder.totalAmount, // 初始 finalAmount = totalAmount
        items: pendingOrder.items
      });
    } else if (type === 'appointment') {
      const pendingAppointment = app.globalData.pendingAppointment;
      if (!pendingAppointment) {
         wx.showToast({ title: '预约数据丢失', icon: 'none' });
         setTimeout(() => wx.navigateBack(), 1500);
         return;
      }
      this.setData({
        orderInfo: pendingAppointment,
        totalAmount: pendingAppointment.price,
        finalAmount: pendingAppointment.price,
        serviceName: pendingAppointment.serviceName
      });
    }
    
    this.calculateFinalAmount();
  },

  // 加载用户积分
  loadUserPoints() {
    if (!app.globalData.isLogin) return;
    
    db.collection('users').doc(app.globalData.userInfo._id || app.globalData.openid).get()
      .then(res => {
        this.setData({
          userPoints: res.data.points || 0
        });
        // 如果积分变动导致当前抵扣不合法（如积分被消费了），重新计算
        this.calculateFinalAmount();
      })
      .catch(console.error);
  },

  // 加载默认地址
  loadDefaultAddress() {
    // 如果已经有地址了，就不加载默认的
    if (this.data.address) return;

    wx.cloud.callFunction({
      name: 'getAddressList',
      success: res => {
        const list = res.result.data || [];
        if (list.length > 0) {
          // 优先找默认地址
          const defaultAddr = list.find(item => item.isDefault);
          this.setData({
            address: defaultAddr || list[0]
          });
        }
      }
    });
  },

  // 选择地址
  chooseAddress() {
    wx.navigateTo({
      url: '/pages/profile/address/index?select=true'
    });
  },

  // 地址选择回调 (由 address 页面调用)
  onSelectAddress(address) {
    this.setData({ address });
  },

  // 切换积分使用
  togglePoints(e) {
    const usePoints = e.detail.value;
    
    if (usePoints) {
      // 开启时，计算最大可用积分，并默认填充
      // 直接在此处计算，确保数据实时性
      const { totalAmount, userPoints } = this.data;
      const maxDeductible = Math.max(0, totalAmount - 0.01);
      const maxPointsByAmount = Math.floor(maxDeductible * 20);
      const maxUsePoints = Math.min(userPoints, maxPointsByAmount);
      
      this.setData({ 
        maxUsePoints,
        usePoints,
        inputPoints: maxUsePoints 
      });
    } else {
      // 关闭时，清空输入
      this.setData({ 
        usePoints,
        inputPoints: 0
      });
    }
    this.calculateFinalAmount();
  },

  // 计算本单最大可用积分
  calculateMaxPoints() {
    const { totalAmount, userPoints } = this.data;
    // 规则：20积分 = 1元
    // 最大可抵扣金额 = 总金额 - 0.01 (至少支付0.01)
    const maxDeductible = Math.max(0, totalAmount - 0.01);
    
    // 按金额计算最大可用积分 (向上取整确保覆盖，但在使用时会限制)
    // 这里的逻辑：20积分=1元，所以 1元需要20积分。
    // maxDeductible * 20 = 最大需要的积分
    const maxPointsByAmount = Math.floor(maxDeductible * 20);
    
    // 实际最大可用 = min(用户持有, 本单上限)
    const maxUsePoints = Math.min(userPoints, maxPointsByAmount);
    
    this.setData({ maxUsePoints });
  },

  // 积分输入
  onPointsInput(e) {
    let val = parseInt(e.detail.value);
    if (isNaN(val)) val = 0;
    
    // 限制输入范围
    const { maxUsePoints } = this.data;
    if (val > maxUsePoints) {
      val = maxUsePoints;
      // 可以提示用户
      // wx.showToast({ title: `最多可用${maxUsePoints}积分`, icon: 'none' });
    }
    if (val < 0) val = 0;
    
    this.setData({ inputPoints: val });
    this.calculateFinalAmount();
    
    // 返回修正后的值给输入框
    return val;
  },

  // 计算最终金额
  calculateFinalAmount() {
    const { totalAmount, usePoints, inputPoints } = this.data;
    let finalAmount = totalAmount;
    let pointsDeduction = 0;

    if (usePoints) {
      // 计算抵扣金额
      // 规则：20积分 = 1元
      pointsDeduction = inputPoints / 20;
      
      // 保留两位小数向下取整
      pointsDeduction = Math.floor(pointsDeduction * 100) / 100;
      
      finalAmount = totalAmount - pointsDeduction;
    }

    // 确保金额格式正确
    this.setData({
      pointsDeduction: parseFloat(pointsDeduction.toFixed(2)),
      finalAmount: parseFloat(finalAmount.toFixed(2))
    });
  },

  handlePay() {
    if (this.data.loading) return;
    
    console.log('handlePay triggered. Type:', this.data.type);
    console.log('Current Data:', {
      items: this.data.items,
      totalAmount: this.data.totalAmount,
      address: this.data.address,
      orderInfo: this.data.orderInfo
    });

    // 校验
    // 优先使用 this.data.items 检查 (这是在 initData 中显式设置的)
    if (this.data.type === 'order' && (!this.data.items || this.data.items.length === 0)) {
      console.error('Order items missing!');
      wx.showToast({
        title: '订单数据异常，请重新下单',
        icon: 'none'
      });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    
    if (this.data.type === 'order' && !this.data.address) {
      wx.showToast({
        title: '请选择收货地址',
        icon: 'none'
      });
      return;
    }
    
    this.setData({ loading: true });
    wx.showLoading({ title: '正在发起支付...' });

    const { type, orderInfo, address, usePoints, inputPoints, pointsDeduction, finalAmount, items, totalAmount } = this.data;
    let orderData = {};

    if (type === 'order') {
      // 构造商品订单数据
      orderData = {
        items: items.map(item => ({
          productId: item.productId || item.product._id,
          quantity: item.quantity,
          price: item.product ? item.product.price : item.price,
          name: item.product ? item.product.name : item.name,
          image: item.product && item.product.images ? item.product.images[0] : ''
        })),
        totalAmount: totalAmount,
        finalAmount: finalAmount,
        pointsUsed: usePoints ? inputPoints : 0, // 使用实际输入的积分
        pointsDeduction: pointsDeduction,
        // 地址信息
        address: address,
        userName: address.name,
        phone: address.phone
      };

      // 如果是从购物车下单，传递购物车项ID以便删除
      // 优化逻辑：优先信任 source 字段，如果 source 为 'cart'，则 items 中的 _id 必为购物车ID
      if (orderInfo.source === 'cart') {
        const cartItemIds = items
          .filter(item => item._id)
          .map(item => item._id);
          
        if (cartItemIds.length > 0) {
          orderData.cartItemIds = cartItemIds;
        }
      } else if (items.length > 0 && items[0]._id && items[0].productId) {
        // Fallback: 如果 source 丢失，通过字段特征判断 (heuristic)
        const cartItemIds = items
          .filter(item => item._id && item.productId)
          .map(item => item._id);
          
        if (cartItemIds.length > 0) {
          orderData.cartItemIds = cartItemIds;
        }
      }
    } else {
      // 构造预约订单数据
      orderData = {
        serviceId: orderInfo.serviceId,
        serviceName: orderInfo.serviceName,
        appointmentTime: orderInfo.appointmentTime,
        timeSlot: orderInfo.timeSlot,
        userName: orderInfo.userName,
        phone: orderInfo.phone,
        totalAmount: orderInfo.price,
        finalAmount: orderInfo.price // 预约暂时不支持积分抵扣
      };
    }

    // 调用支付云函数
    wx.cloud.callFunction({
      name: 'pay',
      data: {
        action: 'unifiedOrder',
        type: type,
        orderData: orderData
      },
      success: res => {
        console.log('支付云函数返回:', res);
        const result = res.result;
        
        if (!result.success) {
          wx.hideLoading();
          this.setData({ loading: false });
          wx.showToast({
            title: result.message || '支付请求失败',
            icon: 'none'
          });
          return;
        }

        // 处理模拟支付 (如果金额为0或特定配置)
        if (result.data && result.data.mock) {
          this.handlePaySuccess(result.data.recordId);
          return;
        }

        // 发起微信支付
        const payment = result.data.payment;
        
        wx.requestPayment({
          timeStamp: payment.timeStamp,
          nonceStr: payment.nonceStr,
          package: payment.package,
          signType: 'MD5',
          paySign: payment.paySign,
          success: (payRes) => {
            console.log('支付成功', payRes);
            this.handlePaySuccess(result.data.recordId);
          },
          fail: (err) => {
            console.error('支付取消或失败', err);
            wx.hideLoading();
            this.setData({ loading: false });
            if (err.errMsg.indexOf('cancel') > -1) {
              wx.showToast({ title: '支付已取消', icon: 'none' });
            } else {
              wx.showToast({ title: '支付失败', icon: 'none' });
            }
          }
        });
      },
      fail: err => {
        console.error('调用支付云函数失败', err);
        wx.hideLoading();
        this.setData({ loading: false });
        wx.showToast({
          title: '系统繁忙，请重试',
          icon: 'none'
        });
      }
    });
  },

  handlePaySuccess(orderId) {
    // 支付成功后，主动调用 queryOrder 更新后端订单状态
    wx.showLoading({ title: '确认订单状态...', mask: true });

    wx.cloud.callFunction({
      name: 'pay',
      data: {
        action: 'queryOrder',
        orderId: orderId,
        type: this.data.type
      },
      success: (res) => {
        console.log('订单状态同步成功:', res);
      },
      fail: (err) => {
        console.error('订单状态同步失败:', err);
      },
      complete: () => {
        wx.hideLoading();
        this.setData({ loading: false });
        
        wx.showToast({
          title: '支付成功',
          icon: 'success',
          duration: 2000
        });

        // 清空全局 pending 数据
        if (this.data.type === 'order') {
          app.globalData.pendingOrder = null;
        } else {
          app.globalData.pendingAppointment = null;
        }

        // 延迟跳转
        setTimeout(() => {
          if (this.data.type === 'order') {
            wx.redirectTo({
              url: `/pages/order/detail/index?id=${orderId}`
            });
          } else {
            // 预约成功跳转
             wx.redirectTo({
              url: '/pages/profile/appointment/index'
            });
          }
        }, 2000);
      }
    });
  }
});
