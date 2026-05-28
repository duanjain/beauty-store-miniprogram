Page({
  data: {
    product: {}, // 商品详情数据
    quantity: 1  // 购买数量
  },

  // 页面加载时调用
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

  // 加载商品详情数据
  loadProductDetail(id) {
    const that = this;

    wx.cloud.database().collection('products').doc(id).get().then(res => {
      console.log('获取到的商品数据:', res.data);
      
      let productData = res.data;
      
      // 检查商品状态，如果是下架状态则不显示
      if (productData.status === false) {
        wx.showToast({
          title: '该商品已下架',
          icon: 'none'
        });
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
        return;
      }
      
      // 确保商品数据的基本字段存在
      if (!productData.images) {
        productData.images = [];
      }
      
      that.setData({
        product: productData
      });
    }).catch(err => {
      console.error('获取商品详情失败', err);
      wx.showToast({
        title: '获取商品详情失败',
        icon: 'none'
      });
      wx.navigateBack();
    });
  },

  // 格式化日期
  formatDate(date) {
    console.log('格式化日期:', date, '类型:', typeof date);
    if (!date) return '';
    
    let d;
    // 确保date是Date对象
    if (typeof date === 'object' && date instanceof Date) {
      d = date;
    } else if (typeof date === 'string') {
      d = new Date(date);
    } else {
      console.error('无效的日期类型:', date);
      return '';
    }
    
    // 检查日期是否有效
    if (isNaN(d.getTime())) {
      console.error('无效的日期:', date);
      return '';
    }
    
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    
    // 使用传统方式格式化月份和日期，确保两位数显示
    const formattedMonth = month < 10 ? '0' + month : month;
    const formattedDay = day < 10 ? '0' + day : day;
    
    const result = `${year}-${formattedMonth}-${formattedDay}`;
    console.log('格式化结果:', result);
    return result;
  },

  // 图片加载错误处理
  onImageError(e) {
    const index = e.currentTarget.dataset.index;
    const product = this.data.product;
    if (product && product.images && product.images[index]) {
      // 图片加载失败时，将其替换为空字符串或占位符
      const key = `product.images[${index}]`;
      this.setData({
        [key]: '' // 或者设置一个默认的错误图片
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

  // 增加数量
  increaseQuantity() {
    const current = this.data.quantity;
    const stock = this.data.product.stock || 0;
    
    if (current >= stock) {
      wx.showToast({
        title: '库存不足',
        icon: 'none'
      });
      return;
    }
    
    this.setData({
      quantity: current + 1
    });
  },

  // 减少数量
  decreaseQuantity() {
    const current = this.data.quantity;
    if (current > 1) {
      this.setData({
        quantity: current - 1
      });
    }
  },

  // 输入数量
  onQuantityInput(e) {
    let value = parseInt(e.detail.value);
    const stock = this.data.product.stock || 0;
    
    if (isNaN(value) || value < 1) {
      value = 1;
    } else if (value > stock) {
      value = stock;
      wx.showToast({
        title: '库存不足',
        icon: 'none'
      });
    }
    
    this.setData({
      quantity: value
    });
  },

  // 直接购买
  buyNow() {
    const product = this.data.product;
    if (!product || !product._id) {
      wx.showToast({
        title: '商品信息异常',
        icon: 'none'
      });
      return;
    }

    const app = getApp();
    if (!app.globalData.isLogin || !app.globalData.openid) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      wx.navigateTo({
        url: '/pages/login/index'
      });
      return;
    }

    wx.showModal({
      title: '配送提示',
      content: '上门配送仅支持甘肃省武威市凉州区内，其余地方需快递配送。',
      confirmText: '继续购买',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          const price = typeof product.price === 'number' ? product.price : parseFloat(product.price) || 0;

          const item = {
            productId: product._id,
            quantity: this.data.quantity,
            product: {
              _id: product._id,
              name: product.name,
              price: price,
              images: Array.isArray(product.images) ? product.images : []
            }
          };

          app.globalData.pendingOrder = {
            source: 'buy-now',
            items: [item],
            totalAmount: price * this.data.quantity
          };

          wx.navigateTo({
            url: '/pages/pay/index?type=order'
          });
        }
      }
    });
  },

  // 加入购物车
  addToCart() {
    const product = this.data.product;
    const app = getApp();
    
    // 检查用户是否登录
    if (!app.globalData.isLogin) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      wx.navigateTo({
        url: '/pages/login/index'
      });
      return;
    }
    
    const userId = app.globalData.userInfo._id;
    const productId = product._id;
    
    // 检查购物车中是否已存在该商品
    wx.cloud.database().collection('cart').where({
      userId: userId,
      productId: productId
    }).get().then(res => {
      const db = wx.cloud.database();
      if (res.data && res.data.length > 0) {
        // 商品已存在，更新数量
        const cartItem = res.data[0];
        db.collection('cart').doc(cartItem._id).update({
          data: {
            quantity: db.command.inc(this.data.quantity),
            addTime: new Date()
          }
        }).then(() => {
          wx.showToast({
            title: '已加入购物车',
            icon: 'success'
          });
        }).catch(err => {
          console.error('更新购物车失败', err);
          wx.showToast({
            title: '加入购物车失败',
            icon: 'none'
          });
        });
      } else {
        // 商品不存在，添加新记录
        db.collection('cart').add({
          data: {
            userId: userId,
            productId: productId,
            quantity: this.data.quantity,
            addTime: new Date()
          }
        }).then(() => {
          wx.showToast({
            title: '已加入购物车',
            icon: 'success'
          });
        }).catch(err => {
          console.error('添加购物车失败', err);
          wx.showToast({
            title: '加入购物车失败',
            icon: 'none'
          });
        });
      }
    }).catch(err => {
      console.error('查询购物车失败', err);
      wx.showToast({
        title: '加入购物车失败',
        icon: 'none'
      });
    });
  },

  // 返回上一页
  navigateBack() {
    wx.navigateBack();
  },

  onShareAppMessage() {
    const app = getApp();
    const inviterId = app.globalData.openid || ''; // 当前用户作为邀请人
    const product = this.data.product || {};
    return {
      title: product.name || '为您推荐一款超赞的商品',
      path: `/pages/product/detail/index?id=${product._id}&inviterId=${inviterId}`,
      imageUrl: (product.images && product.images.length > 0) ? product.images[0] : ''
    };
  }
})
