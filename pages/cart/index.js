Page({
  data: {
    cartItems: [], // 购物车商品列表
    selectAll: false, // 是否全选
    totalPrice: 0, // 总价格
    selectedCount: 0 // 选中商品数量
  },

  // 页面显示时调用
  onShow: function () {
    this.loadCartItems();
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.loadCartItems();
  },

  // 加载购物车商品数据
  loadCartItems: function () {
    const app = getApp();
    
    // 检查用户是否登录
    if (!app.globalData.isLogin) {
      this.setData({
        cartItems: [],
        selectAll: false,
        totalPrice: 0,
        selectedCount: 0
      });
      return;
    }
    
    const userId = app.globalData.userInfo._id;
    const db = wx.cloud.database();
    
    // 获取购物车列表
    db.collection('cart').where({
      userId: userId
    }).get().then(res => {
      const cartItems = res.data;
      
      if (cartItems.length === 0) {
        this.setData({
          cartItems: [],
          selectAll: false,
          totalPrice: 0,
          selectedCount: 0
        });
        wx.stopPullDownRefresh();
        return;
      }
      
      // 获取所有商品ID
      const productIds = cartItems.map(item => item.productId);
      
      // 批量获取商品详情
      db.collection('products').where({
        _id: db.command.in(productIds)
      }).get().then(productRes => {
        console.log('获取到的商品详情:', productRes.data);
        const products = productRes.data;
        
        // 将商品详情合并到购物车项中
        const mergedItems = cartItems.map(cartItem => {
          const product = products.find(p => p._id === cartItem.productId) || {};
          console.log('购物车项', cartItem.productId, '对应的商品详情:', product);
          
          // 确保商品信息完整，特别是价格和库存字段
          // 重点：将价格字符串转换为数字
          let price = 0;
          if (product.price !== undefined && product.price !== null) {
            // 尝试多种方式转换价格为数字
            price = typeof product.price === 'number' ? product.price : parseFloat(product.price) || 0;
          }
          
          // 处理库存
          let stock = 100;
          if (product.stock !== undefined && product.stock !== null) {
            stock = typeof product.stock === 'number' ? product.stock : parseInt(product.stock) || 100;
          }
          
          const safeProduct = {
            ...product,
            price: price,
            stock: stock,
            images: Array.isArray(product.images) ? product.images : []
          };
          
          return {
            ...cartItem,
            product: safeProduct,
            checked: false // 默认不选中
          };
        });
        
        // 过滤掉已下架或不存在的商品
        const validItems = mergedItems.filter(item => {
          return item.product && item.product.status === true;
        });
        
        this.setData({
          cartItems: validItems,
          selectAll: false
        });
        
        // 计算总价和选中数量
        this.calculateTotal();
        wx.stopPullDownRefresh();
      }).catch(err => {
        console.error('获取商品详情失败', err);
        wx.showToast({
          title: '加载购物车失败',
          icon: 'none'
        });
        wx.stopPullDownRefresh();
      });
    }).catch(err => {
      console.error('获取购物车失败', err);
      wx.showToast({
        title: '加载购物车失败',
        icon: 'none'
      });
      wx.stopPullDownRefresh();
    });
  },

  // 计算总价和选中数量
  calculateTotal: function () {
    const cartItems = this.data.cartItems;
    let totalPrice = 0;
    let selectedCount = 0;
    
    // 先计算总价和选中数量
    for (let item of cartItems) {
      if (item.checked) {
        // 确保价格和数量都是数字类型
        const price = parseFloat(item.product.price) || 0;
        const quantity = parseInt(item.quantity) || 1;
        totalPrice += price * quantity;
        selectedCount++;
      }
    }
    
    // 计算全选状态：如果有商品且所有商品都选中，则全选
    const selectAll = cartItems.length > 0 && selectedCount === cartItems.length;
    
    this.setData({
      totalPrice: totalPrice,
      selectedCount: selectedCount,
      selectAll: selectAll
    });
  },

  // 切换商品选中状态
  toggleItem: function (e) {
    const id = e.currentTarget.dataset.id;
    const cartItems = [...this.data.cartItems];
    
    for (let i = 0; i < cartItems.length; i++) {
      if (cartItems[i]._id === id) {
        cartItems[i].checked = !cartItems[i].checked;
        break;
      }
    }
    
    this.setData({
      cartItems: cartItems
    }, () => {
      // 确保数据更新后再计算
      this.calculateTotal();
    });
  },

  // 切换全选状态
  toggleSelectAll: function (e) {
    const selectAll = !this.data.selectAll;
    const cartItems = [...this.data.cartItems];
    
    for (let i = 0; i < cartItems.length; i++) {
      cartItems[i].checked = selectAll;
    }
    
    this.setData({
      cartItems: cartItems,
      selectAll: selectAll
    }, () => {
      // 确保数据更新后再计算
      this.calculateTotal();
    });
  },

  // 减少商品数量
  decreaseQuantity: function (e) {
    const id = e.currentTarget.dataset.id;
    const cartItems = this.data.cartItems;
    
    for (let item of cartItems) {
      if (item._id === id && item.quantity > 1) {
        item.quantity--;
        this.updateCartItem(item);
        break;
      }
    }
  },

  // 增加商品数量
  increaseQuantity: function (e) {
    const id = e.currentTarget.dataset.id;
    const cartItems = this.data.cartItems;
    
    for (let item of cartItems) {
      if (item._id === id && item.quantity < item.product.stock) {
        item.quantity++;
        this.updateCartItem(item);
        break;
      }
    }
  },

  // 手动修改数量
  onQuantityChange: function (e) {
    const id = e.currentTarget.dataset.id;
    let quantity = parseInt(e.detail.value);
    const cartItems = this.data.cartItems;
    
    for (let item of cartItems) {
      if (item._id === id) {
        // 确保数量在有效范围内
        quantity = Math.max(1, Math.min(quantity, item.product.stock));
        item.quantity = quantity;
        this.updateCartItem(item);
        break;
      }
    }
  },

  // 更新购物车商品数量
  updateCartItem: function (cartItem) {
    const db = wx.cloud.database();
    
    db.collection('cart').doc(cartItem._id).update({
      data: {
        quantity: cartItem.quantity
      }
    }).then(() => {
      this.setData({
        cartItems: this.data.cartItems
      });
      
      // 重新计算总价和选中数量
      this.calculateTotal();
    }).catch(err => {
      console.error('更新购物车失败', err);
      wx.showToast({
        title: '更新购物车失败',
        icon: 'none'
      });
    });
  },

  // 删除购物车商品
  deleteItem: function (e) {
    const id = e.currentTarget.dataset.id;
    const that = this;
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个商品吗？',
      success: function (res) {
        if (res.confirm) {
          const db = wx.cloud.database();
          
          db.collection('cart').doc(id).remove().then(() => {
            // 重新加载购物车数据
            that.loadCartItems();
          }).catch(err => {
            console.error('删除购物车商品失败', err);
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          });
        }
      }
    });
  },

  // 去购物
  goShopping: function () {
    wx.switchTab({
      url: '/pages/index/index'
    });
  },

  // 结算订单
  settleOrder: function () {
    const selectedItems = this.data.cartItems.filter(item => item.checked);
    
    if (selectedItems.length === 0) {
      wx.showToast({
        title: '请选择要结算的商品',
        icon: 'none'
      });
      return;
    }
    
    // 检查库存
    for (let item of selectedItems) {
      if (item.quantity > item.product.stock) {
        wx.showToast({
          title: `${item.product.name}库存不足`,
          icon: 'none'
        });
        return;
      }
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
      confirmText: '继续结算',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          const totalPrice = this.data.totalPrice;
          app.globalData.pendingOrder = {
            source: 'cart',
            items: selectedItems,
            totalAmount: totalPrice
          };

          wx.navigateTo({
            url: '/pages/pay/index?type=order'
          });
        }
      }
    });
  },

  // 图片加载错误处理
  onImageError: function (e) {
    const index = e.currentTarget.dataset.index;
    const cartItems = this.data.cartItems;
    if (cartItems[index] && cartItems[index].product && cartItems[index].product.images) {
      cartItems[index].product.images[0] = '';
      this.setData({
        cartItems: cartItems
      });
    }
  },

  // 批量删除选中商品
  deleteSelectedItems: function () {
    const selectedItems = this.data.cartItems.filter(item => item.checked);
    
    if (selectedItems.length === 0) {
      wx.showToast({
        title: '请选择要删除的商品',
        icon: 'none'
      });
      return;
    }
    
    const that = this;
    wx.showModal({
      title: '确认删除',
      content: `确定要删除选中的${selectedItems.length}个商品吗？`,
      success: function (res) {
        if (res.confirm) {
          const db = wx.cloud.database();
          const batchDelete = db.command;
          
          // 获取所有选中商品的ID
          const ids = selectedItems.map(item => item._id);
          
          // 批量删除商品
          db.collection('cart').where({
            _id: batchDelete.in(ids)
          }).remove().then(() => {
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            });
            // 重新加载购物车数据
            that.loadCartItems();
          }).catch(err => {
            console.error('批量删除失败', err);
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          });
        }
      }
    });
  }
})
