const app = getApp();

Page({
  data: {
    product: {},
    formattedCreateTime: '',
    formattedUpdateTime: ''
  },

  onLoad: function (options) {
    const { id } = options;
    if (!id) {
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      });
      wx.navigateBack();
      return;
    }
    this.loadProductDetail(id);
  },

  onShow: function () {
    // If we have an ID, reload to get latest updates
    if (this.data.product._id) {
      this.loadProductDetail(this.data.product._id);
    }
  },

  loadProductDetail(id) {
    const that = this;
    wx.showLoading({ title: '加载中' });

    wx.cloud.database().collection('products').doc(id).get().then(res => {
      wx.hideLoading();
      const product = res.data;
      
      // Format dates
      const createTime = that.formatDate(product.createdAt || product.createTime);
      const updateTime = that.formatDate(product.updatedAt || product.updateTime);

      that.setData({
        product: product,
        formattedCreateTime: createTime,
        formattedUpdateTime: updateTime
      });
    }).catch(err => {
      wx.hideLoading();
      console.error('获取商品详情失败', err);
      wx.showToast({
        title: '获取商品详情失败',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateBack();
      }, 1500);
    });
  },

  formatDate(date) {
    if (!date) return '未知';
    let d;
    if (date instanceof Date) {
      d = date;
    } else {
      d = new Date(date);
    }
    if (isNaN(d.getTime())) return '无效日期';
    
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  },

  onImageError(e) {
    const index = e.currentTarget.dataset.index;
    const product = this.data.product;
    if (product && product.images && product.images[index]) {
      const key = `product.images[${index}]`;
      this.setData({
        [key]: '' // Replace with placeholder logic if needed
      });
    }
  },

  // 预览图片
  previewImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.product.images;
    if (images && images.length > 0) {
      wx.previewImage({
        current: images[index], // 当前显示图片的http链接
        urls: images // 需要预览的图片http链接列表
      });
    }
  },

  navigateBack() {
    wx.navigateBack();
  },

  navigateToEdit() {
    wx.navigateTo({
      url: `/pages/product/edit/index?id=${this.data.product._id}`
    });
  },

  toggleStatus() {
    const that = this;
    const newStatus = !this.data.product.status;
    const action = newStatus ? '上架' : '下架';

    wx.showModal({
      title: `确认${action}`,
      content: `确定要${action}这个商品吗？`,
      success(res) {
        if (res.confirm) {
          wx.showLoading({ title: '处理中' });
          wx.cloud.callFunction({
            name: 'productUpdate', // Assuming there's a general update function or use direct DB update
            data: {
              productId: that.data.product._id,
              product: {
                status: newStatus
              }
            },
            success: res => {
              wx.hideLoading();
              if (res.result.success) {
                wx.showToast({
                  title: `${action}成功`,
                  icon: 'success'
                });
                that.loadProductDetail(that.data.product._id);
              } else {
                wx.showToast({
                  title: res.result.message || `${action}失败`,
                  icon: 'none'
                });
              }
            },
            fail: err => {
              wx.hideLoading();
              console.error(err);
              wx.showToast({
                title: '调用失败',
                icon: 'none'
              });
            }
          });
        }
      }
    });
  },

  deleteProduct() {
    const that = this;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个商品吗？此操作不可恢复。',
      confirmColor: '#ff4d4f',
      success(res) {
        if (res.confirm) {
          wx.showLoading({ title: '删除中' });
          wx.cloud.callFunction({
            name: 'productDelete',
            data: {
              productId: that.data.product._id
            },
            success: res => {
              wx.hideLoading();
              if (res.result.success) {
                wx.showToast({
                  title: '删除成功',
                  icon: 'success'
                });
                setTimeout(() => {
                  wx.navigateBack();
                }, 1500);
              } else {
                wx.showToast({
                  title: res.result.message || '删除失败',
                  icon: 'none'
                });
              }
            },
            fail: err => {
              wx.hideLoading();
              console.error(err);
              wx.showToast({
                title: '调用失败',
                icon: 'none'
              });
            }
          });
        }
      }
    });
  }
});
