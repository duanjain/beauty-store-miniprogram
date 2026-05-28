Page({
  data: {
    orders: [], // 订单列表数据
    pageSize: 10, // 每页数量
    pageNum: 0, // 当前页码
    hasMore: true, // 是否有更多数据
    loading: false, // 加载中状态
    activeNav: 'order', // 当前激活的导航项
    isAdmin: false, // 是否为管理员
    
    // User Order Center Tabs (Non-Admin)
    activeTab: 'product', // 'product' or 'appointment'
    
    // Appointment Data
    appointments: [],
    appointmentPage: 1,
    appointmentPageSize: 10,
    appointmentHasMore: true,
    appointmentLoading: false,
    
    // Shared Status Options
    statusOptions: [
      { value: 'all', text: '全部' },
      { value: 'pending', text: '待付款/待确认' },
      { value: 'paid', text: '已付款' },
      { value: 'confirmed', text: '已确认' },
      { value: 'completed', text: '已完成' },
      { value: 'cancelled', text: '已取消' }
    ],
    searchKeyword: '',
  },

  // 页面加载时调用
  onLoad: function (options) {
    // 检查用户角色
    const app = getApp();
    const isAdmin = app.globalData.isLogin && app.globalData.role === 'admin';
    
    // 获取状态参数
    const status = options.status || 'all';
    
    this.setData({ 
      isAdmin: isAdmin,
      currentStatus: status 
    });
    
    // 强制登录检查 (Login Check)
    if (!app.globalData.isLogin) {
       // Allow a brief moment for app.js to finish its auto-login check if it's running
       // But if we are here, usually app.js has run.
       // Check if we should redirect.
       // However, we should be careful not to redirect if the app is still initializing.
       // A safe bet is to use onShow for strict enforcement, but let's do a soft check here.
    }
  },

  // 页面显示时调用（每次进入页面都会执行）
  onShow: function () {
    // 检查用户角色
    const app = getApp();
    
    // 1. Strict Login Check
    if (!app.globalData.isLogin) {
      wx.showModal({
        title: '提示',
        content: '请先登录后查看订单',
        showCancel: false,
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: '/pages/login/index'
            });
          }
        }
      });
      // Optionally stop execution, but the modal is async.
      // We can return early to avoid fetching data.
      return; 
    }

    const isAdmin = app.globalData.isLogin && app.globalData.role === 'admin';
    this.setData({ isAdmin: isAdmin });
    
    // 如果不是第一次加载（onLoad已经设置了currentStatus），则保持当前状态
    // 这里不需要重新设置currentStatus，除非想重置
    
    if (this.data.activeTab === 'product') {
       // 重置分页参数
       this.resetPage();
       // 重新加载订单列表
       this.loadOrders();
    } else {
       this.resetAppointmentPage();
       this.fetchUserAppointments();
    }
  },

  // 切换订单中心 Tab (商品订单 vs 服务预约)
  onTypeTabChange(e) {
    const type = e.currentTarget.dataset.type;
    if (type === this.data.activeTab) return;
    
    // 切换大类时，重置状态筛选为 'all'
    this.setData({ 
      activeTab: type,
      currentStatus: 'all'
    });
    
    if (type === 'product') {
      this.resetPage();
      this.loadOrders();
    } else {
      this.resetAppointmentPage();
      this.fetchUserAppointments();
    }
  },

  // 重置预约分页
  resetAppointmentPage() {
    this.setData({
      appointmentPage: 1,
      appointments: [],
      appointmentHasMore: true
    });
  },

  // 获取用户预约 (Copied & Adapted from pages/profile/appointment/index.js)
  fetchUserAppointments(loadMore = false) {
    const app = getApp();
    if (!app.globalData.isLogin || !app.globalData.openid) return;

    if (!loadMore) {
      this.setData({
        appointmentLoading: true,
        appointmentPage: 1,
        appointmentHasMore: true,
        appointments: []
      });
    } else if (this.data.appointmentLoading || !this.data.appointmentHasMore) {
      return;
    } else {
      this.setData({
        appointmentLoading: true
      });
    }

    const db = wx.cloud.database();
    const openid = app.globalData.openid;
    const page = this.data.appointmentPage;
    const pageSize = this.data.appointmentPageSize;
    const status = this.data.currentStatus === 'all' ? '' : this.data.currentStatus;
    
    // Map currentStatus to appointment status if needed
    // The currentStatus uses: pending_pay, pending_ship, shipped, completed
    // Appointment uses: pending, paid, confirmed, completed
    // We need to map or use a separate status for appointment?
    // Let's use the same 'currentStatus' for simplicity but we might need mapping.
    
    let queryStatus = '';
    if (status === 'pending_pay') queryStatus = 'pending';
    else if (status === 'pending_ship') queryStatus = 'paid'; // "待发货" roughly maps to "Paid/Confirmed" for appointments?
    else if (status === 'shipped') queryStatus = 'confirmed'; // "待收货" -> "Confirmed"?
    else if (status === 'completed') queryStatus = 'completed';
    else if (status === 'all') queryStatus = '';
    
    // Actually, it's better if we just use the raw status if the user selected a specific one, 
    // but the tabs in UI are specific to Product Orders (pending_pay, pending_ship...).
    // We should probably update the Status Tabs to be generic or change based on ActiveType.
    // For now, let's fetch ALL appointments if the status mapping is ambiguous, or handle filtering client side or just fetch all.
    // User requested "Unified Order Center".
    
    // Let's adjust query based on currentStatus, but maybe we need separate status tabs for Appointments?
    // Or we make the Status Tabs dynamic.
    
    let query = db.collection('appointments').where({
      userId: openid
    });

    // Simple mapping for now, or just ignore status filter for appointments if tabs don't match
    // Ideally we should update the UI to show appropriate tabs.
    // Let's implement dynamic status mapping in the next step (WXML).
    // For JS, let's assume currentStatus holds a valid value for the current tab.
    
    if (status && status !== 'all') {
       // If we are in Appointment tab, we should expect valid appointment statuses.
       // We will ensure WXML sends correct status codes.
       query = query.where({
        status: status
      });
    }

    // 搜索关键词
    if (this.data.searchKeyword) {
      query = query.where({
        serviceName: db.RegExp({
          regexp: this.data.searchKeyword,
          options: 'i'
        })
      });
    }

    // 执行查询
    query
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get()
      .then(res => {
        const newAppointments = res.data;
        const formattedAppointments = newAppointments.map(item => {
          // Format Date
          let formattedDate = '';
          try {
            let appointmentDate;
            if (typeof item.appointmentTime === 'string') {
              appointmentDate = new Date(item.appointmentTime);
            } else if (item.appointmentTime instanceof Date) {
              appointmentDate = item.appointmentTime;
            } else if (item.appointmentTime && typeof item.appointmentTime === 'object' && item.appointmentTime._seconds) {
              appointmentDate = new Date(item.appointmentTime._seconds * 1000);
            } else {
              appointmentDate = new Date();
            }

            if (appointmentDate instanceof Date && !isNaN(appointmentDate.getTime())) {
              const year = appointmentDate.getFullYear();
              const month = (appointmentDate.getMonth() + 1).toString().padStart(2, '0');
              const day = appointmentDate.getDate().toString().padStart(2, '0');
              formattedDate = `${year}-${month}-${day}`;
            }
          } catch (error) {
            console.error('Format date error:', error);
          }

          const status = item.status || 'pending';
          let statusText = '待确认';
          switch (status) {
            case 'pending': statusText = '待确认'; break;
            case 'paid': statusText = '已付款'; break;
            case 'confirmed': statusText = '已确认'; break;
            case 'completed': statusText = '已完成'; break;
            case 'cancelled': statusText = '已取消'; break;
            default: statusText = '待确认';
          }

          return {
            ...item,
            formattedAppointmentDate: formattedDate,
            status: status,
            statusText: statusText
          };
        });

        this.setData({
          appointments: loadMore ? [...this.data.appointments, ...formattedAppointments] : formattedAppointments,
          appointmentHasMore: formattedAppointments.length === pageSize,
          appointmentPage: loadMore ? page + 1 : 2,
          appointmentLoading: false
        });
      })
      .catch(err => {
        console.error('Fetch appointments failed:', err);
        this.setData({ appointmentLoading: false });
      });
  },

  // 取消预约
  cancelAppointment(e) {
    const appointmentId = e.currentTarget.dataset.id;
    const that = this;
    
    wx.showModal({
      title: '取消预约',
      content: '确定要取消该预约吗？',
      success: function (res) {
        if (res.confirm) {
          wx.showLoading({ title: '取消中...' });
          wx.cloud.callFunction({
            name: 'appointmentUpdate',
            data: {
              _id: appointmentId,
              status: 'cancelled',
              cancelledByUser: true
            },
            success: res => {
              wx.hideLoading();
              if (res.result.success) {
                wx.showToast({ title: '取消成功', icon: 'success' });
                that.fetchUserAppointments();
              } else {
                wx.showToast({ title: res.result.message || '取消失败', icon: 'none' });
              }
            },
            fail: err => {
              wx.hideLoading();
              wx.showToast({ title: '调用云函数失败', icon: 'none' });
            }
          });
        }
      }
    });
  },
  
  // 切换Tab
  onTabChange(e) {
    const status = e.currentTarget.dataset.status;
    this.setData({
      currentStatus: status
    });
    
    if (this.data.activeTab === 'product') {
      this.resetPage();
      this.loadOrders();
    } else {
      this.resetAppointmentPage();
      this.fetchUserAppointments();
    }
  },

  onSearch() {
    this.setData({ currentStatus: 'all' });
    if (this.data.activeTab === 'product') {
      this.resetPage();
      // 强制重置 loading，防止因页面初始加载未完成而导致搜索被拦截
      this.setData({ loading: false });
      this.loadOrders();
    } else {
      this.resetAppointmentPage();
      // 强制重置 appointmentLoading
      this.setData({ appointmentLoading: false });
      this.fetchUserAppointments();
    }
  },

  // 搜索框输入事件
  onSearchInput(e) {
    this.setData({
      searchKeyword: e.detail.value
    });
  },

  // 重置分页参数
  resetPage() {
    this.setData({
      pageNum: 0,
      orders: [],
      hasMore: true
    });
  },

  // 加载订单数据
  loadOrders(isLoadMore = false) {
    if (this.data.loading || !this.data.hasMore) return;

    const that = this;
    that.setData({ loading: true });

    // 使用云函数获取订单，解决权限和跨端环境问题
    wx.cloud.callFunction({
      name: 'getOrders',
      data: {
        page: that.data.pageNum,
        pageSize: that.data.pageSize,
        status: that.data.currentStatus || 'all',
        search: that.data.searchKeyword
      }
    }).then(res => {
      const result = res.result || {};
      if (result.success) {
        console.log('getOrders success, isAdmin:', result.isAdmin, 'debug:', result.debug);
        const newOrders = result.data || [];
        
        // Ensure all orders have proper formatting
        const formattedOrders = newOrders.map(order => {
          const createTime = that.resolveCreateTime(order);
          return {
            ...order,
            createTime: createTime,
            formattedCreateTime: that.formatDate(createTime),
            totalAmount: parseFloat(order.totalAmount || 0).toFixed(2)
          };
        });
        
        const totalOrders = isLoadMore ? that.data.orders.concat(formattedOrders) : formattedOrders;
        // 如果返回数量少于 pageSize，说明没有更多了
        const hasMore = newOrders.length === that.data.pageSize;

        that.setData({
          orders: totalOrders,
          hasMore: hasMore,
          loading: false,
          pageNum: that.data.pageNum + 1
        });
      } else {
        console.error('获取订单失败', result.message);
        that.setData({ loading: false });
        // 如果是集合不存在等特定错误，可以视为无数据
        if (result.error && (result.error.errCode === -502005 || (result.error.errMsg && result.error.errMsg.includes('collection not exists')))) {
             that.setData({
              orders: [],
              hasMore: false
            });
        } else {
            wx.showToast({
                title: result.message || '获取订单失败',
                icon: 'none'
            });
        }
      }
    }).catch(err => {
      console.error('调用getOrders失败', err);
      that.setData({ loading: false });
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none'
      });
    });
  },

  // 加载更多
  loadMore() {
    if (this.data.activeTab === 'product') {
      this.loadOrders(true);
    } else {
      this.fetchUserAppointments(true);
    }
  },

  // 下拉刷新
  onPullDownRefresh: function () {
    if (this.data.activeTab === 'product') {
      this.resetPage();
      this.loadOrders();
    } else {
      this.resetAppointmentPage();
      this.fetchUserAppointments();
    }
    wx.stopPullDownRefresh();
  },

  // 跳转到订单详情页面
  navigateToDetailOrder(e) {
    const orderId = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/order/detail/index?id=${orderId}`
    });
  },

  // 修改订单状态
  onChangeStatus(e) {
    if (!this.data.isAdmin) {
      return;
    }

    const { id, status } = e.currentTarget.dataset;
    const that = this;

    // 显示状态选择菜单
    const statusOptions = [
      { value: 'pending', label: '待付款' },
      { value: 'paid', label: '已付款' },
      { value: 'confirmed', label: '已确认' },
      { value: 'shipped', label: '已发货' },
      { value: 'completed', label: '已完成' },
      { value: 'cancelled', label: '已取消' }
    ];

    const statusFlowMap = {
      pending: ['paid', 'confirmed', 'cancelled'],
      paid: ['confirmed', 'cancelled'],
      confirmed: ['shipped', 'completed', 'cancelled'],
      shipped: ['completed'],
      completed: [],
      cancelled: []
    };

    const allowedStatus = statusFlowMap[status] || statusOptions.map(option => option.value);
    const filteredOptions = statusOptions.filter(option => allowedStatus.indexOf(option.value) !== -1 && option.value !== status);

    if (!filteredOptions.length) {
      wx.showToast({
        title: '当前状态不可修改',
        icon: 'none'
      });
      return;
    }

    // 创建操作菜单
    wx.showActionSheet({
      itemList: filteredOptions.map(option => option.label),
      success(res) {
        const selectedStatus = filteredOptions[res.tapIndex].value;
        const selectedLabel = filteredOptions[res.tapIndex].label;
        wx.showModal({
          title: '确认修改',
          content: `确定要将订单状态修改为"${selectedLabel}"吗？`,
          success(modalRes) {
            if (modalRes.confirm) {
              wx.showLoading({
                title: '修改中...'
              });
              wx.cloud.callFunction({
                name: 'orderUpdate',
                data: {
                  orderId: id,
                  status: selectedStatus
                }
              }).then(cfRes => {
                wx.hideLoading();
                const result = cfRes.result || {};
                if (result.success) {
                  wx.showToast({
                    title: '状态修改成功',
                    icon: 'success'
                  });
                  const newOrders = that.data.orders.map(item => {
                    if (item._id === id) {
                      return {
                        ...item,
                        status: selectedStatus
                      };
                    }
                    return item;
                  });
                  that.setData({
                    orders: newOrders
                  });
                } else {
                  wx.showToast({
                    title: result.message || '状态修改失败',
                    icon: 'none'
                  });
                }
              }).catch(err => {
                wx.hideLoading();
                console.error('调用订单状态云函数失败', err);
                wx.showToast({
                  title: '状态修改失败',
                  icon: 'none'
                });
              });
            }
          }
        });
      }
    });
  },

  // 解析订单创建时间
  resolveCreateTime(order) {
    if (order.createTime) {
      return order.createTime;
    }
    if (order._id && order._id.length >= 8) {
      const timestamp = parseInt(order._id.substring(0, 8), 16) * 1000;
      if (!isNaN(timestamp)) {
        return new Date(timestamp);
      }
    }
    return null;
  },

  // 格式化日期
  formatDate(date) {
    if (!date) return '';
    let d = date;
    if (!(d instanceof Date)) {
      d = new Date(d);
    }
    if (isNaN(d.getTime())) {
      return '';
    }
    return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
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

  onHide: function () {},
  onUnload: function () {},
  onReachBottom: function () {
    this.loadMore();
  },
  onShareAppMessage: function () {}
})
