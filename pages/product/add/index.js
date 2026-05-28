Page({
  data: {
    product: {
      name: '',
      price: '',
      originalPrice: '',
      stock: '',
      description: '',
      images: [],
      categories: [], // Array for multiple categories
      status: true // 默认立即上架
    },
    // 可选的商品分类
    categories: [],
    showCategoryModal: false,
    selectedCategoriesText: '',
    tempFilePaths: [] // 保存临时文件路径
  },



  // 加载分类
  loadCategories() {
    wx.cloud.database().collection('categories').get().then(res => {
      const categories = res.data.map(c => ({...c, checked: false}));
      this.setData({
        categories: categories
      });
    }).catch(err => {
      console.error('加载分类失败', err);
      // 降级
      this.setData({
        categories: [{name: '分类一', checked: false}, {name: '分类二', checked: false}, {name: '分类三', checked: false}]
      });
    });
  },

  // 处理输入框和单选框变化
  onInputChange(e) {
    const { field } = e.currentTarget.dataset;
    let { value } = e.detail;
    
    // 如果是status字段，需要将字符串转换为布尔值
    if (field === 'status') {
      value = value === 'true';
    }
    
    this.setData({
      [`product.${field}`]: value
    });
  },

  // 选择图片
  chooseImage() {
    const that = this;
    wx.chooseMedia({
      count: 9 - that.data.product.images.length, // 还能再选几张图片
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
      const cloudPath = `product_images/${Date.now()}-${Math.floor(Math.random(0, 1) * 1000)}` + filePath.match(/\.[^.]+?$/)[0];
      return wx.cloud.uploadFile({
        cloudPath,
        filePath,
      });
    });

    Promise.all(uploadTasks).then(res => {
      wx.hideLoading();
      const newImageURLs = res.map(item => item.fileID);
      that.setData({
        'product.images': that.data.product.images.concat(newImageURLs),
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
    const { images, tempFilePaths } = this.data.product;
    
    const newImages = [...images];
    const newTempFilePaths = [...tempFilePaths];

    // 从云存储和本地预览中移除
    const removedImage = newImages.splice(index, 1)[0];
    // 如果有临时文件路径也一并删除
    if (tempFilePaths[index]) {
      newTempFilePaths.splice(index, 1);
    }

    this.setData({
      'product.images': newImages,
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
      current: this.data.product.images[index], // 当前显示图片的http链接
      urls: this.data.product.images // 需要预览的图片http链接列表
    });
  },

  // 打开分类选择弹窗
  openCategoryModal() {
    this.setData({ showCategoryModal: true });
  },

  // 关闭分类选择弹窗
  closeCategoryModal() {
    this.setData({ showCategoryModal: false });
  },

  // 确认分类选择
  confirmCategorySelection() {
    this.closeCategoryModal();
  },

  // 分类多选变化
  onCategoryCheckboxChange(e) {
    const selectedValues = e.detail.value;
    const categories = this.data.categories.map(item => {
      // Create a new object to avoid mutating data directly (good practice)
      return {
        ...item,
        checked: selectedValues.includes(item.name)
      };
    });
    
    this.setData({
      categories: categories,
      'product.categories': selectedValues,
      selectedCategoriesText: selectedValues.join(', ')
    });
  },

  // 提交表单
  submitForm() {
    const { product } = this.data;
    // 简单的表单验证
    if (!product.name || !product.price || !product.stock || product.images.length === 0 || !product.categories || product.categories.length === 0) {
      wx.showToast({
        title: '请填写所有必填项',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({
      title: '正在提交...',
    });

    const app = getApp();
    
    wx.cloud.callFunction({
      name: 'productAdd',
      data: {
        product: product,
        userInfo: app.globalData.userInfo
      },
      success: res => {
        wx.hideLoading();
        if (res.result.success) {
          wx.showToast({
            title: '商品发布成功',
            icon: 'success',
            duration: 2000,
            complete: () => {
              // 可以在这里跳转到商品列表页或重置表单
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

  onLoad: function (options) {
    // 检查用户权限
    if (this.checkPermission()) {
      this.loadCategories();
    }
  },
  
  // 检查用户权限
  checkPermission() {
    const app = getApp();
    if (!app.globalData.isLogin || app.globalData.role !== 'admin') {
      wx.showToast({
        title: '权限不足，只有管理员可以访问',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack({
          delta: 1
        });
      }, 1500);
      return false;
    }
    return true;
  },
  onShow: function () {},
  onHide: function () {},
  onUnload: function () {},
  onPullDownRefresh: function () {},
  onReachBottom: function () {},
  onShareAppMessage: function () {}
})
