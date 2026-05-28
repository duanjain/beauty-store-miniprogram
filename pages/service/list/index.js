Page({
  data: {
    services: [],
    loading: true,
    page: 1,
    pageSize: 10,
    hasMore: true,
    activeNav: 'service', // 当前激活的导航项
    searchKeyword: '' // 搜索关键词
  },

  onLoad: function (options) {
    // 不在onLoad中加载数据，避免与onShow冲突
  },

  onShow: function () {
    // 确保activeNav总是设置为service
    this.setData({ activeNav: 'service' });
    // 在onShow中加载数据，确保每次页面显示时都能获取最新信息
    this.resetPage();
    this.fetchServices();
  },

  // 重置分页参数
  resetPage() {
    this.setData({
      page: 1,
      services: [],
      hasMore: true
    });
  },

  onPullDownRefresh: function () {
    // 下拉刷新时重置列表并重新获取数据
    this.setData({
      services: [],
      page: 1,
      hasMore: true
    });
    this.fetchServices();
    wx.stopPullDownRefresh();
  },

  onReachBottom: function () {
    // 上拉加载更多
    if (this.data.hasMore) {
      this.setData({
        page: this.data.page + 1
      });
      this.fetchServices();
    }
  },

  fetchServices: function () {
    const that = this;
    that.setData({ loading: true });

    wx.cloud.callFunction({
      name: 'serviceList',
      data: {
        page: that.data.page,
        pageSize: that.data.pageSize,
        keyword: that.data.searchKeyword
      },
      success: res => {
        that.setData({
          loading: false
        });
        
        if (res.result.success) {
          let newServices = res.result.data;
          // 为每个服务项添加格式化的创建时间
          newServices = newServices.map(service => {
            return {
              ...service,
              formattedCreatedAt: that.formatDate(service.createdAt || service.createTime) || '未设置'
            };
          });
          that.setData({
            services: that.data.services.concat(newServices),
            hasMore: newServices.length === that.data.pageSize
          });
        } else {
          wx.showToast({
            title: res.result.message || '获取服务列表失败',
            icon: 'none'
          });
        }
      },
      fail: err => {
        that.setData({ loading: false });
        wx.showToast({
          title: '调用云函数失败',
          icon: 'none'
        });
        console.error('调用云函数失败', err);
      }
    });
  },

  // 前往服务详情页面
  navigateToDetail: function (e) {
    const { id } = e.currentTarget.dataset;
    console.log('查看服务详情ID:', id);
    wx.navigateTo({
      url: `/pages/service/detail/index?id=${id}`
    });
  },

  // 前往服务编辑页面
  navigateToEdit: function (e) {
    const { id } = e.currentTarget.dataset;
    console.log('编辑服务ID:', id);
    wx.navigateTo({
      url: `/pages/service/edit/index?id=${id}`
    });
  },

  // 删除服务
  deleteService: function (e) {
    const { id } = e.currentTarget.dataset;
    const that = this;

    wx.showModal({
      title: '删除服务',
      content: '确定要删除该服务吗？',
      success: function (res) {
        if (res.confirm) {
          that.setData({ loading: true });

          wx.cloud.callFunction({
            name: 'serviceDelete',
            data: {
              id: id
            },
            success: res => {
              that.setData({ loading: false });
              
              if (res.result.success) {
                wx.showToast({
                  title: '删除成功',
                  icon: 'success'
                });
                
                // 更新列表
                const newServices = that.data.services.filter(service => service._id !== id);
                that.setData({
                  services: newServices
                });
              } else {
                wx.showToast({
                  title: res.result.message || '删除失败',
                  icon: 'none'
                });
              }
            },
            fail: err => {
              that.setData({ loading: false });
              wx.showToast({
                title: '调用云函数失败',
                icon: 'none'
              });
              console.error('调用云函数失败', err);
            }
          });
        }
      }
    });
  },

  // 前往添加服务页面
  navigateToAddService: function () {
    wx.navigateTo({
      url: '/pages/service/add/index'
    });
  },

  // 格式化日期
  formatDate: function (date) {
    if (!date) return '';
    const d = new Date(date);
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
  },

  // 切换导航
  switchNav(e) {
    const nav = e.currentTarget.dataset.nav;
    console.log('switchNav函数被调用，nav:', nav);
    this.setData({ activeNav: nav });
    
    if (nav === 'product') {
      // 跳转到商品管理页面
      wx.navigateBack();
    } else if (nav === 'appointment') {
      // 跳转到预约管理页面（tabBar页面必须使用switchTab）
      console.log('准备跳转到预约管理页面');
      wx.switchTab({
        url: '/pages/appointment/index',
        success: function(res) {
          console.log('跳转到预约管理页面成功:', res);
        },
        fail: function(err) {
          console.error('跳转到预约管理页面失败:', err);
          wx.showToast({
            title: '跳转失败，请重试',
            icon: 'none'
          });
        }
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
    } else if (nav === 'category') {
      // 跳转到分类管理页面
      wx.navigateTo({
        url: '/pages/category/list/index'
      });
    }
  },

  // 搜索输入处理
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    });
  },

  // 执行搜索
  onSearch() {
    console.log('搜索服务:', this.data.searchKeyword);
    // 搜索时重置分页并重新获取数据
    this.resetPage();
    this.fetchServices();
  },

  onShareAppMessage: function () {}
})
