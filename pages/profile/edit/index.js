Page({
  data: {
    userInfo: {
      avatarUrl: '',
      nickname: ''
    },
    canSave: false
  },

  onLoad() {
    // 从全局获取用户信息
    const app = getApp();
    if (app.globalData.userInfo) {
      this.setData({
        userInfo: {
          avatarUrl: app.globalData.userInfo.avatarUrl || '',
          nickname: app.globalData.userInfo.nickname || ''
        }
      });
    }
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 选择头像
  chooseAvatar() {
    const that = this;
    
    // 选择图片
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success(res) {
        const tempFilePath = res.tempFilePaths[0];
        
        // 上传图片到云存储
        that.uploadAvatar(tempFilePath);
      },
      fail(err) {
        console.error('选择头像失败:', err);
      }
    });
  },

  // 上传头像
  uploadAvatar(tempFilePath) {
    wx.showLoading({
      title: '上传中...',
    });
    
    // 生成唯一文件名
    const fileName = `avatars/${Date.now()}-${Math.floor(Math.random() * 1000)}.jpg`;
    
    wx.cloud.uploadFile({
      cloudPath: fileName,
      filePath: tempFilePath,
      success: res => {
        console.log('上传成功:', res.fileID);
        
        // 更新用户头像
        this.setData({
          'userInfo.avatarUrl': res.fileID
        });
        this.checkCanSave();
      },
      fail: err => {
        console.error('上传失败:', err);
        wx.showToast({
          title: '上传失败',
          icon: 'none'
        });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },

  // 处理昵称输入
  onNicknameInput(e) {
    const nickname = e.detail.value;
    this.setData({
      'userInfo.nickname': nickname
    });
    this.checkCanSave();
  },

  // 检查是否可以保存
  checkCanSave() {
    const { userInfo } = this.data;
    const app = getApp();
    
    // 比较当前信息与原始信息是否有变化
    const hasChanges = 
      userInfo.avatarUrl !== (app.globalData.userInfo?.avatarUrl || '') ||
      userInfo.nickname !== (app.globalData.userInfo?.nickname || '');
    
    // 检查昵称是否为空
    const hasValidNickname = userInfo.nickname.trim().length > 0;
    
    this.setData({
      canSave: hasChanges && hasValidNickname
    });
  },

  // 保存个人资料
  saveProfile() {
    const { userInfo } = this.data;
    const app = getApp();
    
    wx.showLoading({
      title: '保存中...',
    });
    
    wx.cloud.callFunction({
      name: 'updateUserInfo',
      data: {
        avatarUrl: userInfo.avatarUrl,
        nickname: userInfo.nickname
      },
      success: res => {
        console.log('更新成功:', res);
        wx.showToast({
          title: '保存成功',
          icon: 'success'
        });
        
        // 更新全局用户信息
        if (app.globalData.userInfo) {
          app.globalData.userInfo.avatarUrl = userInfo.avatarUrl;
          app.globalData.userInfo.nickname = userInfo.nickname;
          app.updateUserInfo(app.globalData.userInfo);
        }
        
        // 延迟返回上一页
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      },
      fail: err => {
        console.error('更新失败:', err);
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