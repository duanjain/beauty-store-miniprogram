Page({
  data: {
    userInfo: null,
    role: 'user',
    isLogin: false
  },

  onLoad() {
    this.checkLoginStatus();
  },

  onShow() {
    this.checkLoginStatus();
    // 每次显示页面时尝试刷新最新用户信息（积分等）
    const app = getApp();
    if (app.globalData.isLogin) {
      app.refreshUserInfo().then(userInfo => {
        if (userInfo) {
          this.setData({
            userInfo: userInfo,
            role: userInfo.role || 'user'
          });
        }
      });
    }
  },

  // 刷新用户信息（从服务器获取最新数据）
  refreshUserInfo() {
    const app = getApp();
    if (!app.globalData.isLogin) return;

    const db = wx.cloud.database();
    db.collection('users').where({
      _openid: app.globalData.openid
    }).get().then(res => {
      if (res.data.length > 0) {
        const userInfo = res.data[0];
        // 更新全局数据
        app.globalData.userInfo = userInfo;
        // 更新页面数据
        this.setData({
          userInfo: userInfo,
          role: userInfo.role || 'user'
        });
      }
    }).catch(err => {
      console.error('刷新用户信息失败', err);
    });
  },

  // 检查登录状态
  checkLoginStatus() {
    const app = getApp();
    this.setData({
      userInfo: app.globalData.userInfo,
      role: app.globalData.role || 'user',
      isLogin: app.globalData.isLogin
    });
  },

  // 查看积分流水
  viewPoints() {
    wx.navigateTo({
      url: '/pages/user/points/index'
    });
  },

  // 查看订单
  viewOrders(e) {
    const type = e.currentTarget.dataset.type || 'all';
    wx.navigateTo({
      url: `/pages/order/list/index?status=${type}`
    });
  },

  // 查看预约
  viewAppointments() {
    wx.navigateTo({
      url: '/pages/profile/appointment/index'
    });
  },

  // 查看购物车
  viewCart() {
    wx.switchTab({
      url: '/pages/cart/index'
    });
  },

  // 查看地址
  viewAddress() {
    wx.navigateTo({
      url: '/pages/profile/address/index'
    });
  },

  // 管理员后台
  goToAdmin() {
    wx.navigateTo({
      url: '/pages/product/list/index' // 假设这是管理员入口
    });
  },

  // 查看设置
  viewSettings() {
    wx.navigateTo({
      url: '/pages/profile/edit/index'
    });
  },

  // 退出登录
  logout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          const app = getApp();
          app.logout();
          this.setData({
            userInfo: null,
            role: 'user',
            isLogin: false
          });
          wx.showToast({
            title: '已退出登录',
            icon: 'success'
          });
        }
      }
    });
  }
});