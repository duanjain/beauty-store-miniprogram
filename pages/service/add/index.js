Page({
  data: {
    service: {
      serviceName: '',
      description: '',
      duration: '',
      price: '',
      timeSettings: {
        timeGranularity: 30, // 基础时间粒度，默认30分钟
        dailyStartTime: '09:00', // 每日开始时间
        dailyEndTime: '21:00', // 每日结束时间
        availableDays: [1, 2, 3, 4, 5], // 每周营业日，默认周一至周五
        maxCapacity: 1, // 每时段容量，默认1人
        specialDates: [] // 特殊日期设置
      },
      images: []
    },
    tempFilePaths: [], // 保存临时文件路径
    weekDays: [ // 星期列表
      { id: 1, name: '周一' },
      { id: 2, name: '周二' },
      { id: 3, name: '周三' },
      { id: 4, name: '周四' },
      { id: 5, name: '周五' },
      { id: 6, name: '周六' },
      { id: 7, name: '周日' }
    ],
    // 特殊日期模态框相关
    showSpecialDateModal: false,
    specialDate: {
      date: '',
      isClosed: true,
      startTime: '09:00',
      endTime: '21:00'
    }
  },

  onLoad: function () {
    // 初始化特殊日期为今天
    const today = this.getTodayDate();
    this.setData({
      'specialDate.date': today
    });
  },

  // 获取今天的日期，格式为YYYY-MM-DD
  getTodayDate() {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },

  // 处理输入框变化
  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    const { value } = e.detail;
    
    this.setData({
      [`service.${field}`]: value
    });
  },

  // 选择图片
  chooseImage() {
    const that = this;
    wx.chooseMedia({
      count: 9 - that.data.service.images.length, // 还能再选几张图片
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success(res) {
        const newTempFilePaths = that.data.tempFilePaths.concat(res.tempFiles.map(file => file.tempFilePath));
        that.setData({
          tempFilePaths: newTempFilePaths
        });
        that.uploadImages(res.tempFiles.map(file => file.tempFilePath));
      }
    });
  },

  // 上传图片到云存储
  uploadImages(filePaths) {
    const that = this;
    wx.showLoading({
      title: '上传中...',
    });

    const uploadTasks = filePaths.map(filePath => {
      const cloudPath = `service_images/${Date.now()}-${Math.floor(Math.random(0, 1) * 1000)}` + filePath.match(/\.[^.]+?$/)[0];
      return wx.cloud.uploadFile({
        cloudPath,
        filePath,
      });
    });

    Promise.all(uploadTasks).then(res => {
      wx.hideLoading();
      const newImageURLs = res.map(item => item.fileID);
      that.setData({
        'service.images': that.data.service.images.concat(newImageURLs),
        tempFilePaths: [] // 清空临时路径
      });
      wx.showToast({
        title: '上传成功',
        icon: 'success'
      });
    }).catch(error => {
      wx.hideLoading();
      wx.showToast({
        title: '上传失败',
        icon: 'none'
      });
      console.error("上传失败", error);
    });
  },

  // 移除图片
  removeImage(e) {
    const { index } = e.currentTarget.dataset;
    const { images } = this.data.service;
    
    const newImages = [...images];
    const newTempFilePaths = [...this.data.tempFilePaths];

    // 从云存储和本地预览中移除
    const removedImage = newImages.splice(index, 1)[0];
    // 如果有临时文件路径也一并删除
    if (this.data.tempFilePaths[index]) {
      newTempFilePaths.splice(index, 1);
    }

    this.setData({
      'service.images': newImages,
      tempFilePaths: newTempFilePaths
    });

    // 如果需要，从云存储中删除文件
    if (removedImage && removedImage.startsWith('cloud://')) {
      wx.cloud.deleteFile({
        fileList: [removedImage]
      }).then(res => {
        console.log('成功删除云存储中的图片', res.fileList);
      }).catch(error => {
        console.error('删除云存储图片失败', error);
      });
    }
  },

  // 预览图片
  previewImage(e) {
    const { index } = e.currentTarget.dataset;
    wx.previewImage({
      current: this.data.service.images[index], // 当前显示图片的http链接
      urls: this.data.service.images // 需要预览的图片http链接列表
    });
  },

  // 每日开始时间变化
  onDailyStartTimeChange(e) {
    this.setData({
      'service.timeSettings.dailyStartTime': e.detail.value
    });
  },

  // 每日结束时间变化
  onDailyEndTimeChange(e) {
    this.setData({
      'service.timeSettings.dailyEndTime': e.detail.value
    });
  },

  // 每周营业日变化
  onWeekDayChange(e) {
    const { value } = e.detail;
    // 将字符串转换为数字
    const availableDays = value.map(day => parseInt(day));
    this.setData({
      'service.timeSettings.availableDays': availableDays
    });
  },

  // 打开特殊日期模态框
  openSpecialDateModal() {
    this.setData({
      showSpecialDateModal: true
    });
  },

  // 关闭特殊日期模态框
  closeSpecialDateModal() {
    this.setData({
      showSpecialDateModal: false
    });
  },

  // 特殊日期变化
  onSpecialDateChange(e) {
    this.setData({
      'specialDate.date': e.detail.value
    });
  },

  // 特殊日期是否休息变化
  onSpecialDateIsClosedChange(e) {
    this.setData({
      'specialDate.isClosed': e.detail.value.includes('isClosed')
    });
  },

  // 特殊日期开始时间变化
  onSpecialDateStartTimeChange(e) {
    this.setData({
      'specialDate.startTime': e.detail.value
    });
  },

  // 特殊日期结束时间变化
  onSpecialDateEndTimeChange(e) {
    this.setData({
      'specialDate.endTime': e.detail.value
    });
  },

  // 添加特殊日期
  addSpecialDate() {
    const { specialDate } = this.data;
    const { specialDates } = this.data.service.timeSettings;
    
    // 验证时间是否合法（如果不是休息）
    if (!specialDate.isClosed && specialDate.startTime >= specialDate.endTime) {
      wx.showToast({
        title: '结束时间必须晚于开始时间',
        icon: 'none'
      });
      return;
    }
    
    // 检查是否已存在相同日期
    const exists = specialDates.some(date => date.date === specialDate.date);
    if (exists) {
      wx.showToast({
        title: '该日期已存在',
        icon: 'none'
      });
      return;
    }
    
    // 添加到特殊日期列表
    const updatedSpecialDates = [...specialDates, { ...specialDate }];
    this.setData({
      'service.timeSettings.specialDates': updatedSpecialDates
    });
    
    // 关闭模态框
    this.closeSpecialDateModal();
  },

  // 移除特殊日期
  removeSpecialDate(e) {
    const { index } = e.currentTarget.dataset;
    const { specialDates } = this.data.service.timeSettings;
    
    // 移除指定索引的特殊日期
    const updatedSpecialDates = specialDates.filter((_, i) => i !== index);
    this.setData({
      'service.timeSettings.specialDates': updatedSpecialDates
    });
  },

  // 提交表单
  submitForm() {
    const { service } = this.data;
    // 简单的表单验证
    if (!service.serviceName || !service.description || !service.duration || !service.price || service.images.length === 0) {
      wx.showToast({
        title: '请填写所有必填项',
        icon: 'none'
      });
      return;
    }
    
    // 时间设置验证
    const timeSettings = service.timeSettings;
    
    // 基础时间粒度验证
    if (!timeSettings.timeGranularity || timeSettings.timeGranularity <= 0) {
      wx.showToast({
        title: '请设置有效的基础时间粒度',
        icon: 'none'
      });
      return;
    }
    
    // 每日营业时间验证
    if (timeSettings.dailyStartTime >= timeSettings.dailyEndTime) {
      wx.showToast({
        title: '结束时间必须晚于开始时间',
        icon: 'none'
      });
      return;
    }
    
    // 每周营业日验证
    if (!timeSettings.availableDays || timeSettings.availableDays.length === 0) {
      wx.showToast({
        title: '请至少选择一天营业日',
        icon: 'none'
      });
      return;
    }
    
    // 每时段容量验证
    if (!timeSettings.maxCapacity || timeSettings.maxCapacity <= 0) {
      wx.showToast({
        title: '请设置有效的每时段容量',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({
      title: '正在提交...',
    });

    wx.cloud.callFunction({
      name: 'serviceAdd',
      data: {
        service: service
      },
      success: res => {
        wx.hideLoading();
        if (res.result.success) {
          wx.showToast({
            title: '服务发布成功',
            icon: 'success',
            duration: 2000,
            complete: () => {
              // 可以在这里跳转到服务列表页或重置表单
              setTimeout(() => {
                wx.navigateBack();
              }, 2000);
            }
          });
        } else {
          wx.showToast({
            title: res.result.message || '发布失败',
            icon: 'none'
          });
        }
      },
      fail: err => {
        wx.hideLoading();
        wx.showToast({
          title: '调用云函数失败',
          icon: 'none'
        });
        console.error('调用云函数失败', err);
      }
    });
  },

  onLoad: function (options) {},
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {}
})
