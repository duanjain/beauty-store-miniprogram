Page({
  data: {
    phone: '',
    canSave: false
  },

  onLoad() {
    // 从全局获取用户信息，查看当前电话
    const app = getApp();
    if (app.globalData.userInfo && app.globalData.userInfo.phone) {
      this.setData({
        phone: app.globalData.userInfo.phone
      });
    }
    this.checkCanSave();
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 处理电话输入
  onPhoneInput(e) {
    const phone = e.detail.value;
    this.setData({
      phone: phone
    });
    this.checkCanSave();
  },

  // 检查是否可以保存
  checkCanSave() {
    const { phone } = this.data;
    // 简单的手机号验证：11位数字
    const phoneRegex = /^1\d{10}$/;
    const canSave = phoneRegex.test(phone);
    this.setData({
      canSave: canSave
    });
  },

  // 保存电话
  savePhone() {
    const { phone } = this.data;
    const app = getApp();
    
    wx.showLoading({
      title: '保存中...',
    });
    
    // 调用云函数更新用户电话
    wx.cloud.callFunction({
      name: 'updateUserInfo',
      data: {
        phone: phone
      },
      success: res => {
        console.log('更新电话成功:', res);
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        });
        
        // 更新全局用户信息
        if (app.globalData.userInfo) {
          app.globalData.userInfo.phone = phone;
          app.updateUserInfo(app.globalData.userInfo);
        }
        
        // 延迟返回上一页
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      },
      fail: err => {
        console.error('更新电话失败:', err);
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  }
});