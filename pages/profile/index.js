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

  // 检查登录状态
  checkLoginStatus() {
    const app = getApp();
    this.setData({
      userInfo: app.globalData.userInfo,
      role: app.globalData.role || 'user',
      isLogin: app.globalData.isLogin
    });
  },

  // 统一登录检查辅助函数
  ensureLogin() {
    if (!this.data.isLogin) {
      wx.showModal({
        title: '提示',
        content: '请先登录后再进行操作',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/login/index'
            });
          }
        }
      });
      return false;
    }
    return true;
  },

  // 查看订单
  viewOrders() {
    if (!this.ensureLogin()) return;
    wx.navigateTo({
      url: '/pages/order/list/index'
    });
  },

  // 查看预约
  viewAppointments() {
    if (!this.ensureLogin()) return;
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
    if (!this.ensureLogin()) return;
    wx.navigateTo({
      url: '/pages/profile/address/index'
    });
  },

  viewSkinAnalyze() {
    wx.navigateTo({
      url: '/pages/skin-analyze/index'
    });
  },

  // 查看联系电话
  viewPhone() {
    if (!this.ensureLogin()) return;
    wx.navigateTo({
      url: '/pages/profile/phone/index'
    });
  },

  // 查看注意事项
  viewNotice() {
    // 注意事项通常不需要登录也能看，但如果包含个人相关信息则需要
    // 假设是通用注意事项，允许未登录查看
    wx.navigateTo({
      url: '/pages/profile/notice/index'
    });
  },

  // 联系管理员
  contactAdmin() {
    wx.showModal({
      title: '联系管理员',
      content: '是否拨打电话联系管理员？\n电话：请在发布前配置客服电话',
      confirmText: '拨打',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({
            title: '请先配置客服电话',
            icon: 'none'
          });
        }
      }
    });
  },

  // 编辑个人资料
  editProfile() {
    if (!this.ensureLogin()) return;
    wx.navigateTo({
      url: '/pages/profile/edit/index'
    });
  },

  // 查看积分记录
  viewPointsLog() {
    if (!this.ensureLogin()) return;
    wx.navigateTo({
      url: '/pages/user/points-log/index'
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
