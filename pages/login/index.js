Page({
  data: {
    loading: false,
    avatarUrl: '',
    nickName: '',
    defaultAvatarUrl: '',
    inviteCode: ''
  },

  onLoad() {
    const app = getApp();
    
    // 如果是用户主动退出，不再进行自动登录检查
    if (app.globalData.isLogout) {
      // 重置退出标记，以免影响后续操作
      app.globalData.isLogout = false; 
      this.setData({ loading: false });
      return;
    }

    // 如果已经在登录检查中或已登录，先显示loading
    // if (!app.globalData.isLogin) {
    //   wx.showLoading({ title: '检查登录状态...', mask: true });
    // }

    // 定义登录检查回调
    app.loginCheckCallback = (res) => {
      wx.hideLoading();
      if (res.registered) {
        // 已注册/已登录，会在app.js中跳转，这里只需确保不显示登录页内容或显示跳转中
        console.log('自动登录成功，正在跳转...');
      } else {
        // 未注册，显示登录界面
        console.log('用户未注册，显示登录页');
        this.setData({ loading: false });
      }
    };

    // 检查是否已经登录 (如果是从后台切回或者页面栈返回)
    if (app.globalData.isLogin) {
      wx.hideLoading();
      this.redirectUser(app.globalData.role);
    }
  },

  // 处理头像选择
  onChooseAvatar(e) {
    const { avatarUrl } = e.detail;
    
    this.setData({ loading: true });
    wx.showLoading({ title: '上传头像中...' });

    // 上传头像到云存储
    const cloudPath = `avatars/temp_${Date.now()}_${Math.floor(Math.random() * 1000)}.jpg`;
    
    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: avatarUrl,
      success: res => {
        console.log('头像上传成功', res.fileID);
        this.setData({ 
          avatarUrl: res.fileID,
          loading: false
        });
        wx.hideLoading();
      },
      fail: err => {
        console.error('头像上传失败', err);
        wx.hideLoading();
        this.setData({ loading: false });
        wx.showToast({
          title: '头像上传失败',
          icon: 'none'
        });
      }
    });
  },

  // 处理昵称输入
  onNicknameChange(e) {
    this.setData({
      nickName: e.detail.value
    });
  },

  onInviteCodeChange(e) {
    this.setData({
      inviteCode: e.detail.value.trim()
    });
  },

  // 提交登录/注册
  handleUserLogin() {
    const { avatarUrl, nickName, inviteCode } = this.data;
    
    if (!avatarUrl || !nickName) {
      wx.showToast({
        title: '请完善头像和昵称',
        icon: 'none'
      });
      return;
    }

    const app = getApp();
    this.setData({ loading: true });
    wx.showLoading({ title: '登录中...' });

    wx.cloud.callFunction({
      name: 'login',
      data: {
        inviteCode: inviteCode || '',
        userInfo: {
          avatarUrl: avatarUrl,
          nickName: nickName
        }
      },
      success: res => {
        console.log('云函数返回结果:', res);
        wx.hideLoading();
        const result = res.result;
        
        if (result.success) {
          wx.showToast({
            title: '登录成功',
            icon: 'success'
          });
          
          // 更新全局用户信息
          app.updateUserInfo(result.userInfo);

          // 跳转
          this.redirectUser(result.userInfo.role);
        } else {
          this.setData({ loading: false });
          wx.showToast({
            title: result.message || '登录失败',
            icon: 'none'
          });
        }
      },
      fail: err => {
        console.error('登录失败', err);
        wx.hideLoading();
        this.setData({ loading: false });
        wx.showToast({
          title: '登录失败，请重试',
          icon: 'none'
        });
      }
    });
  },

  // 封装跳转逻辑
  redirectUser(role) {
    if (role === 'admin') {
      wx.redirectTo({
        url: '/pages/product/list/index',
      });
    } else {
      // 跳转逻辑：如果有上一页则返回，否则去首页
      setTimeout(() => {
        const pages = getCurrentPages();
        if (pages.length > 1) {
          wx.navigateBack();
        } else {
          wx.switchTab({
            url: '/pages/index/index',
            fail: function() {
              wx.redirectTo({
                url: '/pages/index/index',
              });
            }
          });
        }
      }, 1000);
    }
  }
});
