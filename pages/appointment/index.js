Page({
  data: {
    // 服务列表相关数据（客户端）
    services: [],
    // 预约管理相关数据（管理员）
    appointments: [],
    loading: false,
    page: 1,
    pageSize: 10,
    hasMore: true,
    keyword: '',
    status: '', // 实际的状态值
    statusIndex: 0, // 状态选择器的索引
    currentStatusText: '全部',
    activeNav: 'appointment', // 当前激活的导航项
    statusOptions: [
      { value: '', text: '全部' },
      { value: 'pending', text: '待确认' },
      { value: 'confirmed', text: '已确认' },
      { value: 'completed', text: '已完成' },
      { value: 'cancelled', text: '已取消' }
    ],
    isAdmin: false // 用户是否为管理员
  },

  onLoad: function (options) {
    // 检查用户角色
    const app = getApp();
    console.log('预约页面onLoad，当前用户信息：', app.globalData);
    const isAdmin = app.globalData.isLogin && app.globalData.role === 'admin';
    console.log('是否为管理员：', isAdmin);
    
    // 确保activeNav总是设置为appointment
    this.setData({ 
      isAdmin: isAdmin,
      activeNav: 'appointment' // 确保当前页面的activeNav正确
    });
    
    // 根据角色控制tabBar显示
    if (isAdmin) {
      // 管理员端：隐藏tabBar
      wx.hideTabBar();
      // 管理员端：加载预约列表
      this.getAppointments(true);
    } else {
      // 客户端：显示tabBar
      wx.showTabBar();
      // 客户端：加载服务列表
      this.getServices(true);
    }
  },

  onShow: function () {
    const app = getApp();
    console.log('预约页面onShow，当前用户信息：', app.globalData);
    const isAdmin = app.globalData.isLogin && app.globalData.role === 'admin';
    console.log('是否为管理员：', isAdmin);
    
    // 确保activeNav总是设置为appointment
    this.setData({ 
      isAdmin: isAdmin,
      activeNav: 'appointment' // 确保当前页面的activeNav正确
    });
    
    // 根据角色控制tabBar显示
    if (isAdmin) {
      // 管理员端：隐藏tabBar
      wx.hideTabBar();
      // 管理员端：刷新预约列表
      this.getAppointments(true);
    } else {
      // 客户端：显示tabBar
      wx.showTabBar();
      // 客户端：刷新服务列表
      this.getServices(true);
    }
  },

  // 管理员端：获取预约列表
  getAppointments(init = false) {
    console.log('getAppointments函数被调用，isAdmin:', this.data.isAdmin);
    if (!this.data.isAdmin) return;

    if (init) {
      this.setData({
        page: 1,
        hasMore: true,
        appointments: []
      });
    }

    if (!this.data.hasMore || this.data.loading) return;

    this.setData({ loading: true });

    wx.cloud.callFunction({
      name: 'appointmentList',
      data: {
        page: this.data.page,
        pageSize: this.data.pageSize,
        keyword: this.data.keyword,
        status: this.data.status
      },
      success: res => {
        const result = res.result;
        if (result.success) {
          const appointments = result.data || [];
          console.log('实际返回的预约数据:', appointments);
          
          // 保存this上下文，供map回调使用
          const that = this;
          
          // 为每个预约数据添加必要的时间字段检查和默认值
          const formattedAppointments = appointments.map(item => {
            console.log('单个预约数据:', item);
            console.log('所有字段:', Object.keys(item));
            
            // 检查并转换各种日期格式为Date对象
            let appointmentDate = null;
            let createDate = null;
            
            // 处理appointmentTime
            if (item.appointmentTime) {
              try {
                if (typeof item.appointmentTime === 'string') {
                  // ISO字符串转换为Date对象
                  appointmentDate = new Date(item.appointmentTime);
                  console.log('appointmentTime字符串转换为Date:', appointmentDate);
                } else if (typeof item.appointmentTime === 'object' && item.appointmentTime._seconds) {
                  // 云数据库Date对象
                  appointmentDate = new Date(item.appointmentTime._seconds * 1000);
                  console.log('appointmentTime云数据库对象转换为Date:', appointmentDate);
                } else if (item.appointmentTime instanceof Date) {
                  // 已经是Date对象
                  appointmentDate = item.appointmentTime;
                  console.log('appointmentTime已经是Date对象:', appointmentDate);
                }
                
                // 验证Date对象是否有效
                if (!(appointmentDate instanceof Date) || isNaN(appointmentDate.getTime())) {
                  appointmentDate = null;
                  console.log('appointmentTime转换后无效，设置为null');
                }
              } catch (error) {
                console.log('处理appointmentTime时出错:', error);
                appointmentDate = null;
              }
            }
            
            // 处理createTime/createdAt
            const timeField = item.createTime || item.createdAt;
            if (timeField) {
              try {
                if (typeof timeField === 'string') {
                  // ISO字符串转换为Date对象
                  createDate = new Date(timeField);
                  console.log('createTime字符串转换为Date:', createDate);
                } else if (typeof timeField === 'object' && timeField._seconds) {
                  // 云数据库Date对象
                  createDate = new Date(timeField._seconds * 1000);
                  console.log('createTime云数据库对象转换为Date:', createDate);
                } else if (timeField instanceof Date) {
                  // 已经是Date对象
                  createDate = timeField;
                  console.log('createTime已经是Date对象:', createDate);
                }
                
                // 验证Date对象是否有效
                if (!(createDate instanceof Date) || isNaN(createDate.getTime())) {
                  createDate = null;
                  console.log('createTime转换后无效，设置为null');
                }
              } catch (error) {
                console.log('处理createTime时出错:', error);
                createDate = null;
              }
            }
            
            // 如果没有有效的预约时间，使用创建时间或当前时间
            if (!appointmentDate) {
              if (createDate) {
                appointmentDate = createDate;
                console.log('使用createDate作为appointmentDate:', appointmentDate);
              } else {
                appointmentDate = new Date();
                console.log('使用当前时间作为appointmentDate:', appointmentDate);
              }
            }
            
            // 直接生成日期字符串，不依赖Date对象
            let appointmentDateStr = '2026-01-14';
            try {
              if (appointmentDate instanceof Date && !isNaN(appointmentDate.getTime())) {
                const year = appointmentDate.getFullYear();
                const month = that.formatNumber(appointmentDate.getMonth() + 1);
                const day = that.formatNumber(appointmentDate.getDate());
                appointmentDateStr = `${year}-${month}-${day}`;
                console.log('生成的appointmentDateStr:', appointmentDateStr);
              }
            } catch (error) {
              console.log('生成appointmentDateStr时出错:', error);
            }
            
            // 直接生成订单时间字符串
            let createDateStr = '2026-01-14 10:00';
            try {
              if (createDate instanceof Date && !isNaN(createDate.getTime())) {
                const year = createDate.getFullYear();
                const month = that.formatNumber(createDate.getMonth() + 1);
                const day = that.formatNumber(createDate.getDate());
                const hours = that.formatNumber(createDate.getHours());
                const minutes = that.formatNumber(createDate.getMinutes());
                createDateStr = `${year}-${month}-${day} ${hours}:${minutes}`;
                console.log('生成的createDateStr:', createDateStr);
              }
            } catch (error) {
              console.log('生成createDateStr时出错:', error);
            }
            
            // 为前端提供直接可用的字符串
            item.formattedAppointmentDate = appointmentDateStr;
            item.formattedCreateDate = createDateStr;
            
            // 如果没有订单时间，使用创建时间或当前时间
            if (!item.createTime) {
              if (item.createdAt) {
                item.createTime = item.createdAt;
              } else if (item.appointmentTime) {
                item.createTime = item.appointmentTime;
              } else {
                // 如果没有任何时间字段，使用当前时间
                item.createTime = new Date().toISOString();
              }
            }
            
            return item;
          });
          
          this.setData({
            appointments: init ? formattedAppointments : [...this.data.appointments, ...formattedAppointments],
            hasMore: formattedAppointments.length === this.data.pageSize,
            page: init ? 2 : this.data.page + 1
          });
        } else {
          wx.showToast({
            title: result.message || '获取预约列表失败',
            icon: 'none'
          });
        }
      },
      fail: err => {
        console.error('获取预约列表失败', err);
        wx.showToast({
          title: '系统错误，请重试',
          icon: 'none'
        });
      },
      complete: () => {
        this.setData({ loading: false });
        wx.stopPullDownRefresh();
      }
    });
  },

  // 客户端：获取服务列表
  getServices(init = false) {
    if (this.data.isAdmin) return;

    if (init) {
      this.setData({
        page: 1,
        hasMore: true,
        services: []
      });
    }

    if (!this.data.hasMore || this.data.loading) return;

    this.setData({ loading: true });

    wx.cloud.callFunction({
      name: 'serviceList',
      data: {
        page: this.data.page,
        pageSize: this.data.pageSize,
        keyword: this.data.keyword
      },
      success: res => {
        const result = res.result;
        if (result.success) {
          const services = result.data || [];
          this.setData({
            services: init ? services : [...this.data.services, ...services],
            hasMore: services.length === this.data.pageSize,
            page: init ? 2 : this.data.page + 1
          });
        } else {
          wx.showToast({
            title: result.message || '获取服务列表失败',
            icon: 'none'
          });
        }
      },
      fail: err => {
        console.error('获取服务列表失败', err);
        wx.showToast({
          title: '系统错误，请重试',
          icon: 'none'
        });
      },
      complete: () => {
        this.setData({ loading: false });
        wx.stopPullDownRefresh();
      }
    });
  },

  // 搜索输入处理
  onSearchInput(e) {
    this.setData({
      keyword: e.detail.value
    });
  },

  // 执行搜索
  onSearch() {
    console.log('执行搜索，关键字:', this.data.keyword);
    if (this.data.isAdmin) {
      // 管理员端：搜索预约
      this.getAppointments(true);
    } else {
      // 客户端：搜索服务
      this.getServices(true);
    }
  },

  // 客户端：前往服务详情页面
  navigateToServiceDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/service/detail/index?id=${id}`
    });
  },

  // 筛选状态
  onStatusChange(e) {
    const newIndex = e.detail.value;
    const selectedOption = this.data.statusOptions[newIndex];
    this.setData({
      statusIndex: newIndex,
      status: selectedOption.value,
      currentStatusText: selectedOption.text
    });
    this.getAppointments(true);
  },

  // 根据状态值获取状态文本
  getStatusTextByValue(status) {
    const { statusOptions } = this.data;
    const selectedOption = statusOptions.find(item => item.value === status);
    return selectedOption ? selectedOption.text : '全部';
  },

  // 更新预约状态
  updateAppointmentStatus(e) {
    const { _id, status } = e.currentTarget.dataset;
    const that = this;
    
    // 从本地数据中获取当前预约的实际状态
    const currentAppointment = this.data.appointments.find(item => item._id === _id);
    const currentStatus = currentAppointment ? currentAppointment.status : '';
    
    console.log('=== 预约状态修改 ===');
    console.log('预约ID:', _id);
    console.log('当前实际状态:', currentStatus);
    console.log('新状态:', status);
    console.log('新状态文本:', this.getStatusText(status));
    
    wx.showModal({
      title: '确认操作',
      content: `确定要将该预约状态修改为${this.getStatusText(status)}吗？`,
      success: res => {
        if (res.confirm) {
          // 检查是否是用户自己取消的预约 (仅限制非管理员)
          if (!this.data.isAdmin && currentAppointment && currentAppointment.cancelledByUser && status !== 'cancelled') {
            wx.showToast({
              title: '该预约由用户取消，无法修改状态',
              icon: 'none'
            });
            return;
          }
          
          wx.showLoading({ title: '更新状态中...' });
          
          // 检查是否需要发放积分（已废弃：预约不再发放积分）
          const needAddPoints = false;
          console.log('是否需要发放积分:', needAddPoints);
          
          // 从本地数据中获取预约信息
          const appointment = this.data.appointments.find(item => item._id === _id);
          console.log('预约信息:', appointment);
          
          // 直接更新UI状态，提供即时反馈
          const newAppointments = this.data.appointments.map(appointment => {
            if (appointment._id === _id) {
              return {
                ...appointment,
                status: status
              };
            }
            return appointment;
          });
          this.setData({ appointments: newAppointments });
          
          // 调用云函数更新数据库
          wx.cloud.callFunction({
            name: 'appointmentUpdate',
            data: {
              _id: _id,
              status: status
            },
            success: res => {
              const result = res.result;
              console.log('appointmentUpdate云函数返回:', result);
              wx.hideLoading();
              if (result.success) {
                wx.showToast({
                  title: '状态更新成功',
                  icon: 'success'
                });
                
                // 如果需要发放积分
                // 逻辑已移除：预约不再发放积分
                /*
                if (needAddPoints && appointment) {
                  // 尝试从多个可能的字段中获取价格
                  const price = appointment.price || appointment.servicePrice || appointment.amount || 0;
                  console.log('获取到的价格:', price);
                  
                  if (price > 0) {
                    console.log('准备发放积分，预约金额:', price);
                    
                    // 调用云函数发放积分
                    wx.cloud.callFunction({
                      name: 'addAppointmentPoints',
                      data: {
                        appointmentId: _id,
                        userId: appointment.userId
                      },
                      success: pointsRes => {
                        console.log('addAppointmentPoints云函数返回:', pointsRes);
                        if (pointsRes.result.success) {
                          console.log(`积分发放成功: ${pointsRes.result.pointsAdded}`);
                        } else {
                          console.error('积分发放失败:', pointsRes.result.message);
                        }
                      },
                      fail: err => {
                        console.error('云函数调用失败:', err);
                      }
                    });
                  } else {
                    console.log('预约金额为0或不存在，不发放积分');
                  }
                }
                */
                
                // 刷新列表，确保数据与数据库一致
                setTimeout(() => {
                  this.getAppointments(true);
                }, 500);
              } else {
                wx.showToast({
                  title: result.message || '状态更新失败',
                  icon: 'none'
                });
                // 失败时恢复原状态
                this.getAppointments(true);
              }
            },
            fail: err => {
              console.error('更新预约状态失败', err);
              wx.hideLoading();
              wx.showToast({
                title: '系统错误，请重试',
                icon: 'none'
              });
              // 失败时恢复原状态
              this.getAppointments(true);
            },
            complete: () => {
              wx.hideLoading();
            }
          });
        }
      }
    });
  },

  // 获取状态文本
  getStatusText(status) {
    const statusMap = {
      'pending': '待确认',
      'paid': '已付款',
      'confirmed': '已确认',
      'completed': '已完成',
      'cancelled': '已取消'
    };
    return statusMap[status] || status;
  },

  // 获取状态样式
  getStatusClass(status) {
    const statusMap = {
      'pending': 'status-pending',
      'paid': 'status-paid',
      'confirmed': 'status-confirmed',
      'completed': 'status-completed',
      'cancelled': 'status-cancelled'
    };
    return statusMap[status] || '';
  },

  // 格式化日期时间 - 只显示年月日和时分（兼容WXML调用）
  formatDate(dateValue) {
    try {
      console.log('formatDate接收到的参数:', dateValue, '类型:', typeof dateValue);
      
      let date;
      // 处理不同类型的日期数据
      if (typeof dateValue === 'string') {
        date = new Date(dateValue);
        console.log('字符串转换为Date:', date);
      } else if (dateValue instanceof Date) {
        date = dateValue;
        console.log('已经是Date对象:', date);
      } else if (dateValue && typeof dateValue === 'object' && dateValue._seconds) {
        // 处理云数据库的Date对象
        date = new Date(dateValue._seconds * 1000);
        console.log('云数据库Date对象转换为Date:', date);
      } else {
        console.log('无法转换的类型，返回默认值');
        return '2026-01-14 10:00';
      }
      
      if (isNaN(date.getTime())) {
        console.log('无效的Date对象，返回默认值');
        return '2026-01-14 10:00';
      }
      
      const year = date.getFullYear();
      const month = this.formatNumber(date.getMonth() + 1);
      const day = this.formatNumber(date.getDate());
      const hours = this.formatNumber(date.getHours());
      const minutes = this.formatNumber(date.getMinutes());
      
      const result = `${year}-${month}-${day} ${hours}:${minutes}`;
      console.log('formatDate返回结果:', result);
      return result;
    } catch (error) {
      console.log('formatDate执行出错:', error);
      return '2026-01-14 10:00';
    }
  },
  
  // 格式化日期 - 只显示年月日
  formatDateOnly(dateValue) {
    try {
      console.log('formatDateOnly接收到的参数:', dateValue, '类型:', typeof dateValue);
      
      // 检查dateValue是否存在
      if (!dateValue) {
        console.log('dateValue不存在，返回默认值');
        return '2026-01-14';
      }
      
      let date;
      // 处理不同类型的日期数据
      if (typeof dateValue === 'string') {
        date = new Date(dateValue);
        console.log('字符串转换为Date:', date);
      } else if (dateValue instanceof Date) {
        date = dateValue;
        console.log('已经是Date对象:', date);
      } else if (dateValue && typeof dateValue === 'object' && dateValue._seconds) {
        // 处理云数据库的Date对象
        date = new Date(dateValue._seconds * 1000);
        console.log('云数据库Date对象转换为Date:', date);
      } else {
        console.log('无法转换的类型，返回默认值');
        return '2026-01-14';
      }
      
      if (isNaN(date.getTime())) {
        console.log('无效的Date对象，返回默认值');
        return '2026-01-14';
      }
      
      const year = date.getFullYear();
      const month = this.formatNumber(date.getMonth() + 1);
      const day = this.formatNumber(date.getDate());
      
      const result = `${year}-${month}-${day}`;
      console.log('formatDateOnly返回结果:', result);
      return result;
    } catch (error) {
      console.log('formatDateOnly执行出错:', error);
      return '2026-01-14';
    }
  },
  
  // 格式化日期时间 - 只显示年月日和时分（兼容旧调用）
  formatDateTime(dateValue) {
    return this.formatDate(dateValue);
  },
  
  // 格式化数字，确保两位数显示（兼容处理，不使用padStart）
  formatNumber(n) {
    n = n.toString();
    return n.length === 1 ? '0' + n : n;
  },
  
  // 格式化Date对象为字符串（YYYY-MM-DD）
  formatDateString(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return '2026-01-14';
    }
    
    const year = date.getFullYear();
    const month = this.formatNumber(date.getMonth() + 1);
    const day = this.formatNumber(date.getDate());
    
    return `${year}-${month}-${day}`;
  },
  
  // 格式化Date对象为字符串（YYYY-MM-DD HH:mm）
  formatDateTimeString(date) {
    if (!(date instanceof Date) || isNaN(date.getTime())) {
      return '2026-01-14 10:00';
    }
    
    const year = date.getFullYear();
    const month = this.formatNumber(date.getMonth() + 1);
    const day = this.formatNumber(date.getDate());
    const hours = this.formatNumber(date.getHours());
    const minutes = this.formatNumber(date.getMinutes());
    
    return `${year}-${month}-${day} ${hours}:${minutes}`;
  },

  // 获取当前选中状态的文本
  getCurrentStatusText() {
    const { status, statusOptions } = this.data;
    const selectedOption = statusOptions.find(item => item.value === status);
    return selectedOption ? selectedOption.text : '全部';
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

  // 下拉刷新
  onPullDownRefresh: function () {
    if (this.data.isAdmin) {
      this.getAppointments(true);
    } else {
      this.getServices(true);
    }
  },

  // 上拉加载更多
  onReachBottom: function () {
    if (this.data.isAdmin) {
      this.getAppointments(false);
    } else {
      this.getServices(false);
    }
  },

  onHide: function () {},
  onUnload: function () {},

  onShareAppMessage: function () {}
})