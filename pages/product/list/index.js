Page({
  data: {
    products: [], // 商品列表数据
    searchKeyword: '', // 搜索关键词
    pageSize: 10, // 每页数量
    pageNum: 0, // 当前页码
    hasMore: true, // 是否有更多数据
    loading: false, // 加载中状态
    activeNav: 'product' // 当前激活的导航项
  },

  // 页面加载时调用
  onLoad: function (options) {
    // 检查用户权限
    this.checkPermission();
    this.loadProducts();
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

  // 页面显示时调用（每次进入页面都会执行）
  onShow: function () {
    // 确保activeNav总是设置为product
    this.setData({ activeNav: 'product' });
    // 可以在这里刷新数据，确保每次进入页面都能看到最新数据
    this.resetPage();
    this.loadProducts();
  },

  // 重置分页参数
  resetPage() {
    this.setData({
      pageNum: 0,
      products: [],
      hasMore: true
    });
  },

  // 加载商品数据
  loadProducts(isLoadMore = false) {
    if (this.data.loading || !this.data.hasMore) return;

    const that = this;
    that.setData({ loading: true });

    const db = wx.cloud.database();
    let query = db.collection('products');

    // 如果有搜索关键词，添加搜索条件
    if (that.data.searchKeyword) {
      query = query.where({
        name: db.RegExp({
          regexp: that.data.searchKeyword,
          options: 'i' // 不区分大小写
        })
      });
    }

    // 分页查询
    query = query.skip(that.data.pageNum * that.data.pageSize).limit(that.data.pageSize);

    // 按创建时间倒序排列
    query = query.orderBy('createdAt', 'desc');

    query.get().then(res => {
      let newProducts = res.data;
      // 为每个商品项添加格式化的创建时间
      newProducts = newProducts.map(product => {
        return {
          ...product,
          formattedCreatedAt: that.formatDate(product.createdAt || product.createTime) || '未设置'
        };
      });
      const totalProducts = isLoadMore ? that.data.products.concat(newProducts) : newProducts;
      const hasMore = newProducts.length === that.data.pageSize;

      that.setData({
        products: totalProducts,
        hasMore: hasMore,
        loading: false,
        pageNum: that.data.pageNum + 1
      });
    }).catch(err => {
      console.error('获取商品列表失败', err);
      
      // 检查错误是否是因为集合不存在
      if (err.errCode === -502005 || err.errMsg.includes('collection not exists')) {
        // 如果集合不存在，显示空状态，不提示错误
        that.setData({
          products: [],
          loading: false,
          hasMore: false
        });
      } else {
        // 其他错误才显示提示
        wx.showToast({
          title: '获取商品失败',
          icon: 'none'
        });
        that.setData({ loading: false });
      }
    });
  },

  // 搜索输入处理
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    });
  },

  // 执行搜索
  onSearch() {
    this.resetPage();
    this.loadProducts();
  },

  // 加载更多
  loadMore() {
    this.loadProducts(true);
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    this.resetPage();
    this.loadProducts();
    wx.stopPullDownRefresh();
  },

  // 跳转到添加商品页面
  navigateToAdd() {
    wx.navigateTo({
      url: '/pages/product/add/index'
    });
  },

  // 跳转到分类管理页面
  navigateToCategoryList() {
    wx.navigateTo({
      url: '/pages/category/list/index'
    });
  },

  // 跳转到商品详情页面
  navigateToDetailProduct(e) {
    const productId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/product/admin-detail/index?id=${productId}`
    });
  },

  // 跳转到编辑商品页面
  navigateToEditProduct(e) {
    const productId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/product/edit/index?id=${productId}`
    });
  },

  // 删除商品
  onDeleteProduct(e) {
    const productId = e.currentTarget.dataset.id;
    const that = this;

    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个商品吗？',
      success(res) {
        if (res.confirm) {
          // 调用云函数删除商品
          wx.cloud.callFunction({
            name: 'productDelete',
            data: {
              productId: productId
            },
            success: res => {
              if (res.result.success) {
                wx.showToast({
                  title: '删除成功',
                  icon: 'success'
                });
                // 重新加载商品列表
                that.resetPage();
                that.loadProducts();
              } else {
                wx.showToast({
                  title: res.result.message || '删除失败',
                  icon: 'none'
                });
              }
            },
            fail: err => {
              console.error('删除商品失败', err);
              wx.showToast({
                title: '删除失败',
                icon: 'none'
              });
            }
          });
        }
      }
    });
  },

  // 格式化日期
  formatDate(date) {
    if (!date) return '';
    const d = new Date(date);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
  },

  // 切换商品状态（上架/下架）
  onToggleStatus(e) {
    const { id, status } = e.currentTarget.dataset;
    const newStatus = !status;
    const that = this;

    wx.showModal({
      title: newStatus ? '确认上架' : '确认下架',
      content: newStatus ? '确定要将该商品上架吗？' : '确定要将该商品下架吗？',
      success(res) {
        if (res.confirm) {
          wx.showLoading({
            title: newStatus ? '上架中...' : '下架中...'
          });

          // 调用云函数更新商品状态
          wx.cloud.callFunction({
            name: 'productUpdate',
            data: {
              productId: id,
              product: {
                status: newStatus
              }
            },
            success: res => {
              wx.hideLoading();
              if (res.result.success) {
                wx.showToast({
                  title: newStatus ? '上架成功' : '下架成功',
                  icon: 'success'
                });
                
                // 更新本地数据
                const newProducts = that.data.products.map(item => {
                  if (item._id === id) {
                    return {
                      ...item,
                      status: newStatus
                    };
                  }
                  return item;
                });
                that.setData({
                  products: newProducts
                });
              } else {
                wx.showToast({
                  title: res.result.message || '操作失败',
                  icon: 'none'
                });
              }
            },
            fail: err => {
              wx.hideLoading();
              console.error('更新商品状态失败', err);
              wx.showToast({
                title: '操作失败',
                icon: 'none'
              });
            }
          });
        }
      }
    });
  },

  onHide: function () {},
  onUnload: function () {},
  onReachBottom: function () {},
  // 切换导航
  switchNav(e) {
    const nav = e.currentTarget.dataset.nav;
    this.setData({ activeNav: nav });
    
    if (nav === 'service') {
      // 跳转到服务管理页面
      wx.navigateTo({
        url: '/pages/service/list/index'
      });
    } else if (nav === 'appointment') {
      // 跳转到预约管理页面（tabBar页面必须使用switchTab）
      wx.switchTab({
        url: '/pages/appointment/index'
      });
    } else if (nav === 'order') {
      // 跳转到订单管理页面
      wx.navigateTo({
        url: '/pages/order/list/index'
      });
    } else if (nav === 'user') {
      // 跳转到顾客管理页面
      wx.navigateTo({
        url: '/pages/user/list/index'
      });
    }
  },

  onShareAppMessage: function () {}
})
