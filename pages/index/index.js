Page({
  data: {
    // 导航栏高度数据
    navHeight: 0,
    statusBarHeight: 0,
    
    role: 'user', // 默认普通用户
    isLogin: false,
    userInfo: null,
    featuredProducts: [], // 精选商品列表
    categories: [], // 商品分类列表
    categoryNames: [{ name: '全部' }], // 分类名称数组，用于picker组件
    searchKeyword: '',
    page: 1,
    pageSize: 20,
    categoryIndex: 0, // 当前选中的分类索引
    selectedCategory: '', // 选中的分类ID，空字符串表示全部
    selectedCategoryName: '全部', // 当前选中的分类名称
    hasMore: true, // 是否有更多数据
    bannerImages: [
      'https://images.unsplash.com/photo-1522335789203-aabd1fc54bc9?w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1526045478516-99145907023c?w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1528825871115-3581a5387919?w=1200&auto=format&fit=crop'
    ]
  },
  
  onLoad: function (options) {
    // 获取导航栏高度
    const app = getApp()
    this.setData({
      navHeight: app.globalData.navBarHeight,
      statusBarHeight: app.globalData.statusBarHeight
    })

    this.checkLoginStatus();
    this.loadCategories();
    this.loadFeaturedProducts();
  },
  
  onShow: function () {
    this.checkLoginStatus();
  },
  
  // 预览Banner图片
  previewBannerImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.bannerImages;
    wx.previewImage({
      current: images[index],
      urls: images
    });
  },

  // 检查登录状态
  checkLoginStatus() {
    const app = getApp();
    this.setData({
      role: app.globalData.role || 'user',
      isLogin: app.globalData.isLogin,
      userInfo: app.globalData.userInfo
    });
  },
  
  // 加载商品分类
  loadCategories() {
    wx.cloud.database().collection('categories').get().then(res => {
      const categories = res.data;
      const categoryNames = [{ name: '全部' }].concat(categories);
      
      this.setData({
        categories: categories,
        categoryNames: categoryNames
      });
    }).catch(err => {
      console.error('加载分类失败', err);
      // 降级处理
      const hardcodedCategories = ['分类一', '分类二', '分类三'];
      const categories = hardcodedCategories.map(c => ({ name: c, _id: c }));
      const categoryNames = [{ name: '全部' }].concat(categories);
      this.setData({
        categories: categories,
        categoryNames: categoryNames
      });
    });
  },

  // 加载精选商品
  loadFeaturedProducts(isLoadMore = false) {
    if (this.data.loading) return;
    if (isLoadMore && !this.data.hasMore) return;
    
    this.setData({ loading: true });
    
    const db = wx.cloud.database();
    const filter = { status: true };
    
    // 根据分类筛选
    if (this.data.selectedCategory) {
      filter.category = this.data.selectedCategory;
    }
    
    if (this.data.searchKeyword) {
      filter.name = db.RegExp({
        regexp: this.data.searchKeyword,
        options: 'i'
      });
    }

    // 使用云函数获取商品列表，支持分页
    wx.cloud.callFunction({
      name: 'getProducts',
      data: {
        page: this.data.page,
        pageSize: this.data.pageSize,
        filter: filter
      }
    }).then(res => {
      const result = res.result;
      if (result && result.success) {
        // 数据预处理
        const rawProducts = result.products || [];
        const processedProducts = rawProducts.map(product => ({
            ...product,
            name: product.name || '未知商品',
            description: typeof product.description === 'string' ? product.description : '品质美妆，值得信赖',
            price: parseFloat(product.price) || 0,
            originalPrice: parseFloat(product.originalPrice) || null,
            images: product.images || []
        }));

        // 判断是否还有更多数据
        const hasMore = (this.data.page * this.data.pageSize) < result.total;
        
        let products = [];
        if (isLoadMore) {
          products = this.data.featuredProducts.concat(processedProducts);
        } else {
          products = processedProducts;
        }
        
        this.setData({
          featuredProducts: products,
          hasMore: hasMore,
          loading: false,
          page: this.data.page + 1
        });
      } else {
        console.error('加载商品失败', result ? result.message : '未知错误');
        this.setData({ loading: false });
        wx.showToast({
          title: '加载商品失败',
          icon: 'none'
        });
      }
    }).catch(err => {
      console.error('调用getProducts云函数失败', err);
      this.setData({ loading: false });
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      });
    });
  },
  
  // 页面触底事件，加载更多
  onReachBottom() {
    if (this.data.hasMore) {
      this.loadFeaturedProducts(true);
    }
  },
  
  // 分类点击事件
  onCategoryTap(e) {
    const index = e.currentTarget.dataset.index;
    
    // 如果点击的是当前已选中的分类，则不做任何操作
    if (index === this.data.categoryIndex) return;
    
    let selectedCategory = '';
    let selectedCategoryName = '全部';
    
    if (index > 0 && this.data.categoryNames && this.data.categoryNames[index]) {
      const category = this.data.categoryNames[index];
      selectedCategory = category.name || '';
      selectedCategoryName = category.name || '全部';
    }
    
    this.setData({
      categoryIndex: index,
      selectedCategory: selectedCategory,
      selectedCategoryName: selectedCategoryName,
      page: 1,
      hasMore: true,
      featuredProducts: [] // 清空现有列表
    });
    
    this.loadFeaturedProducts();
  },

  // 分类选择变化处理（Picker用，暂时保留）
  onCategoryChange(e) {
    const index = e.detail.value;
    let selectedCategory = '';
    let selectedCategoryName = '全部';
    
    if (index > 0 && this.data.categoryNames && this.data.categoryNames[index]) {
      // 选中了具体分类
      const category = this.data.categoryNames[index];
      // 使用分类名称作为筛选条件，因为商品数据中存储的是分类名称
      selectedCategory = category.name || '';
      selectedCategoryName = category.name || '全部';
    }
    
    this.setData({
      categoryIndex: index,
      selectedCategory: selectedCategory,
      selectedCategoryName: selectedCategoryName,
      page: 1,
      hasMore: true,
      featuredProducts: [] // 清空现有列表
    });
    
    this.loadFeaturedProducts();
  },
  
  // 加入购物车
  addToCart(e) {
    const productId = e.currentTarget.dataset.id;
    const app = getApp();
    
    // 检查用户是否登录
    if (!app.globalData.isLogin) {
      wx.showModal({
        title: '提示',
        content: '请先登录后再进行操作',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/login/index',
            });
          }
        }
      });
      return;
    }
    
    const userId = app.globalData.userInfo._id;
    const db = wx.cloud.database();
    
    // 检查购物车中是否已存在该商品
    db.collection('cart').where({
      userId: userId,
      productId: productId
    }).get().then(res => {
      const product = this.data.featuredProducts.find(p => p._id === productId);
      
      if (res.data && res.data.length > 0) {
        // 商品已存在，更新数量
        const cartItem = res.data[0];
        db.collection('cart').doc(cartItem._id).update({
          data: {
            quantity: db.command.inc(1),
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
      } else if (product) {
        // 商品不存在，添加新记录
        db.collection('cart').add({
          data: {
            userId: userId,
            productId: productId,
            quantity: 1,
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
      } else {
        wx.showToast({
          title: '商品不存在',
          icon: 'none'
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

  // 直接购买
  buyNow(e) {
    const productId = e.currentTarget.dataset.id;
    // 这里需要实现直接购买的逻辑
    wx.showToast({
      title: '购买功能开发中',
      icon: 'none'
    });
  },
  
  
  // 管理员功能跳转
  goToProductList() {
    wx.navigateTo({
      url: '/pages/product/list/index'
    });
  },
  
  goToServiceList() {
    wx.navigateTo({
      url: '/pages/service/list/index'
    });
  },
  
  goToOrderList() {
    wx.navigateTo({
      url: '/pages/order/list/index'
    });
  },

  goToUserList() {
    wx.navigateTo({
      url: '/pages/user/list/index'
    });
  },

  goToCategoryList() {
    wx.navigateTo({
      url: '/pages/category/list/index'
    });
  },
  
  // 普通用户功能跳转
  viewProducts() {
    wx.navigateTo({
      url: '/pages/product/browse/index'
    });
  },
  
  makeAppointment() {
    wx.navigateTo({
      url: '/pages/appointment/index'
    });
  },

  viewCart() {
    wx.navigateTo({
      url: '/pages/cart/index'
    });
  },

  viewUserCenter() {
    wx.navigateTo({
      url: '/pages/user/index'
    });
  },

  viewAllProducts() {
    wx.navigateTo({
      url: '/pages/product/browse/index'
    });
  },

  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    });
  },

  onSearch() {
    this.setData({ page: 1 });
    this.loadFeaturedProducts();
  },

  viewProductDetail(e) {
    const productId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/product/detail/index?id=${productId}`
    });
  },
  
  // 登录按钮
  goToLogin() {
    wx.redirectTo({
      url: '/pages/login/index'
    });
  },
  
  // 退出登录
  logout() {
    const app = getApp();
    app.logout();
    this.setData({
      role: 'user',
      isLogin: false,
      userInfo: null
    });
    wx.showToast({
      title: '已退出登录',
      icon: 'success'
    });
  },

  // 图片加载错误处理
  onImageError(e) {
    const index = e.currentTarget.dataset.index;
    if (index !== undefined) {
      const featuredProducts = this.data.featuredProducts;
      if (featuredProducts[index]) {
        // 确保images数组存在
        if (!featuredProducts[index].images) {
          featuredProducts[index].images = [];
        }
        // 设置默认图片
        featuredProducts[index].images[0] = "https://images.unsplash.com/photo-1596462502278-27bfdc403348?w=300&h=300&fit=crop";
        this.setData({
          featuredProducts: featuredProducts
        });
      }
    }
  },

  onShareAppMessage() {
    const app = getApp();
    const inviterId = app.globalData.openid || ''; // 当前用户作为邀请人
    return {
      title: '为您推荐一款超赞的小程序',
      path: `/pages/index/index?inviterId=${inviterId}`
    };
  }
})
