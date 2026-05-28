Page({
  data: {
    products: [],
    categories: [],
    activeCategory: 'all',
    searchKeyword: '',
    page: 1,
    pageSize: 10,
    hasMore: true
  },

  onLoad() {
    this.loadCategories();
    this.loadProducts();
  },

  // 加载商品分类
  loadCategories() {
    wx.cloud.callFunction({
      name: 'getCategories',
      success: res => {
        if (res.result.success) {
          this.setData({
            categories: res.result.categories
          });
        }
      },
      fail: err => {
        console.error('加载分类失败', err);
      }
    });
  },

  // 加载商品数据
  loadProducts() {
    wx.showLoading({
      title: '加载中...',
    });

    const filter = {};
    if (this.data.activeCategory !== 'all') {
      filter.categoryId = this.data.activeCategory;
    }
    if (this.data.searchKeyword) {
      filter.name = db.RegExp({
        regexp: this.data.searchKeyword,
        options: 'i'
      });
    }

    wx.cloud.callFunction({
      name: 'getProducts',
      data: {
        filter: filter,
        page: this.data.page,
        pageSize: this.data.pageSize
      },
      success: res => {
        const products = res.result.products || [];
        this.setData({
          products: this.data.page === 1 ? products : [...this.data.products, ...products],
          hasMore: products.length === this.data.pageSize
        });
      },
      fail: err => {
        console.error('加载商品失败', err);
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },

  // 切换分类
  switchCategory(e) {
    const category = e.currentTarget.dataset.category;
    this.setData({
      activeCategory: category,
      page: 1
    });
    this.loadProducts();
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    });
  },

  // 清空搜索
  onClearSearch() {
    this.setData({
      searchKeyword: '',
      page: 1
    });
    this.loadProducts();
  },

  // 点击搜索
  onSearch() {
    this.setData({
      page: 1
    });
    this.loadProducts();
  },

  // 查看商品详情
  viewProductDetail(e) {
    const productId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/product/detail/index?id=${productId}`
    });
  },

  // 加入购物车
  addToCart(e) {
    e.stopPropagation(); // 阻止冒泡
    const product = e.currentTarget.dataset.product;
    
    // 检查库存
    if (product.stock <= 0) {
      wx.showToast({
        title: '库存不足',
        icon: 'none'
      });
      return;
    }

    wx.cloud.callFunction({
      name: 'addToCart',
      data: {
        productId: product._id,
        quantity: 1
      },
      success: res => {
        if (res.result.success) {
          wx.showToast({
            title: '已加入购物车',
            icon: 'success'
          });
        } else {
          wx.showToast({
            title: res.result.message || '加入失败',
            icon: 'none'
          });
        }
      },
      fail: err => {
        console.error('加入购物车失败', err);
        wx.showToast({
          title: '加入失败',
          icon: 'none'
        });
      }
    });
  },

  // 立即购买
  buyNow(e) {
    e.stopPropagation(); // 阻止冒泡
    const product = e.currentTarget.dataset.product;
    
    // 检查库存
    if (product.stock <= 0) {
      wx.showToast({
        title: '库存不足',
        icon: 'none'
      });
      return;
    }

    // 跳转到订单确认页面
    wx.navigateTo({
      url: `/pages/order/confirm/index?productId=${product._id}&quantity=1`
    });
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.setData({
      page: 1,
      hasMore: true
    });
    this.loadProducts().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  // 上拉加载更多
  onReachBottom() {
    if (this.data.hasMore) {
      this.setData({
        page: this.data.page + 1
      });
      this.loadProducts();
    }
  }
});