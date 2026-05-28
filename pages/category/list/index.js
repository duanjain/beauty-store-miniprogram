Page({
  data: {
    categories: [],
    loading: false,
    activeNav: 'category' // 当前激活的导航项
  },

  onShow() {
    this.setData({ activeNav: 'category' });
    this.loadCategories();
  },

  loadCategories() {
    this.setData({ loading: true });
    wx.cloud.database().collection('categories').get().then(res => {
      this.setData({
        categories: res.data,
        loading: false
      });
    }).catch(err => {
      console.error('加载分类失败', err);
      this.setData({ loading: false });
    });
  },

  addCategory() {
    wx.navigateTo({
      url: '/pages/category/add/index'
    });
  },

  editCategory(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/category/add/index?id=${id}`
    });
  },

  deleteCategory(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个分类吗？',
      success: res => {
        if (res.confirm) {
          wx.cloud.database().collection('categories').doc(id).remove().then(() => {
            wx.showToast({
              title: '删除成功',
              icon: 'success'
            });
            this.loadCategories();
          }).catch(err => {
            console.error('删除失败', err);
            wx.showToast({
              title: '删除失败',
              icon: 'none'
            });
          });
        }
      }
    });
  },

  // 切换导航
  switchNav(e) {
    const nav = e.currentTarget.dataset.nav;
    this.setData({ activeNav: nav });
    
    if (nav === 'product') {
      // 跳转到商品管理页面
      wx.navigateTo({
        url: '/pages/product/list/index'
      });
    } else if (nav === 'service') {
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
  }
})