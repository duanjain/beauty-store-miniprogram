Page({
  data: {
    userList: [],
    keyword: '',
    loading: false,
    activeNav: 'user',
    showInputDialog: false,
    inputType: '',
    inputUser: null,
    inputCurrentPoints: 0,
    inputValue: ''
  },

  onLoad: function() {
    this.getUserList()
  },

  // 获取顾客列表
  getUserList: function() {
    this.setData({
      loading: true
    })

    wx.cloud.callFunction({
      name: 'userList',
      success: res => {
        if (res.result.success) {
          this.setData({
            userList: res.result.data
          })
        } else {
          wx.showToast({
            title: '获取失败',
            icon: 'none'
          })
        }
      },
      fail: err => {
        wx.showToast({
          title: '网络错误',
          icon: 'none'
        })
        console.error('获取顾客列表失败:', err)
      },
      complete: () => {
        this.setData({
          loading: false
        })
      }
    })
  },

  // 搜索输入
  onSearchInput: function(e) {
    this.setData({
      keyword: e.detail.value
    })
  },

  // 执行搜索
  onSearch: function() {
    const keyword = this.data.keyword.trim()
    if (!keyword) {
      this.getUserList()
      return
    }

    // 本地搜索（可以根据需要改为云函数搜索）
    const filteredList = this.data.userList.filter(user => {
      const nickname = user.nickname || ''
      const phone = user.phone || ''
      return nickname.includes(keyword) || phone.includes(keyword)
    })

    this.setData({
      userList: filteredList
    })
  },

  // 下拉刷新
  onPullDownRefresh: function() {
    this.getUserList()
    wx.stopPullDownRefresh()
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
    } else if (nav === 'category') {
      // 跳转到分类管理页面
      wx.navigateTo({
        url: '/pages/category/list/index'
      });
    }
  },

  // 查看用户详情
  viewUserDetail(e) {
    const user = e.currentTarget.dataset.user;
    wx.navigateTo({
      url: `/pages/user/detail/index?id=${user._id}`
    });
  },

  // 管理积分
  managePoints(e) {
    const user = e.currentTarget.dataset.user;
    const currentPoints = user.points !== undefined ? user.points : 0;
    
    wx.showActionSheet({
      itemList: ['增加积分', '扣除积分', '查看积分记录'],
      success: (res) => {
        if (res.tapIndex === 0) {
          this.addPoints(user, currentPoints);
        } else if (res.tapIndex === 1) {
          this.deductPoints(user, currentPoints);
        } else if (res.tapIndex === 2) {
          wx.navigateTo({
            url: `/pages/user/points-log/index?userId=${user._id}`
          });
        }
      }
    });
  },

  // 增加积分
  addPoints(user, currentPoints) {
    this.setData({
      inputType: 'add',
      inputUser: user,
      inputCurrentPoints: currentPoints,
      inputValue: '',
      showInputDialog: true
    });
  },

  // 扣除积分
  deductPoints(user, currentPoints) {
    this.setData({
      inputType: 'deduct',
      inputUser: user,
      inputCurrentPoints: currentPoints,
      inputValue: '',
      showInputDialog: true
    });
  },

  // 确认输入
  confirmInput() {
    const { inputType, inputUser, inputCurrentPoints, inputValue } = this.data;
    const points = parseInt(inputValue);
    
    console.log('=== 积分管理开始 ===');
    console.log('操作类型:', inputType);
    console.log('用户信息:', inputUser);
    console.log('当前积分:', inputCurrentPoints);
    console.log('输入积分:', points);
    
    if (isNaN(points) || points <= 0) {
      wx.showToast({
        title: '请输入有效的积分数量',
        icon: 'none'
      });
      return;
    }

    if (inputType === 'deduct' && points > inputCurrentPoints) {
      wx.showToast({
        title: '积分不足',
        icon: 'none'
      });
      return;
    }

    wx.showLoading({ title: '处理中...' });

    const operation = inputType === 'add' ? 'add' : 'deduct';
    
    wx.cloud.callFunction({
      name: 'updateUserPoints',
      data: {
        userId: inputUser._id,
        points: points,
        operation: operation
      },
      success: res => {
        console.log('云函数返回结果:', res);
        wx.hideLoading();
        
        if (res.result.success) {
          wx.showToast({
            title: res.result.message,
            icon: 'success'
          });
          
          this.setData({ showInputDialog: false });
          
          // 延迟重新获取列表，确保数据同步
          setTimeout(() => {
            this.getUserList();
          }, 500);
        } else {
          wx.showToast({
            title: res.result.message || '操作失败',
            icon: 'none'
          });
        }
      },
      fail: err => {
        console.error('云函数调用失败', err);
        wx.hideLoading();
        wx.showToast({
          title: '操作失败',
          icon: 'none'
        });
      }
    });
  },

  // 取消输入
  cancelInput() {
    this.setData({ showInputDialog: false });
  },

  // 输入框输入
  onInputChange(e) {
    this.setData({ inputValue: e.detail.value });
  },

  // 阻止事件冒泡
  stopPropagation() {
    // 阻止点击对话框内容时关闭对话框
  }
})
