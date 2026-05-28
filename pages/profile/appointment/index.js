Page({
  data: {
    appointments: [],
    loading: false,
    hasMore: true,
    page: 1,
    pageSize: 10,
    status: '',
    statusIndex: 0,
    currentStatusText: '全部',
    statusOptions: [
      { value: '', text: '全部' },
      { value: 'pending', text: '待确认' },
      { value: 'paid', text: '已付款' },
      { value: 'confirmed', text: '已确认' },
      { value: 'completed', text: '已完成' },
      { value: 'cancelled', text: '已取消' }
    ]
  },

  onLoad() {
    this.fetchUserAppointments();
  },

  // 获取用户自己的预约记录
  fetchUserAppointments(loadMore = false) {
    const app = getApp();
    if (!app.globalData.isLogin || !app.globalData.openid) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateTo({
          url: '/pages/login/index'
        });
      }, 1500);
      return;
    }

    if (!loadMore) {
      this.setData({
        loading: true,
        page: 1,
        hasMore: true,
        appointments: []
      });
    } else if (this.data.loading || !this.data.hasMore) {
      return;
    } else {
      this.setData({
        loading: true
      });
    }

    const db = wx.cloud.database();
    const openid = app.globalData.openid;
    const page = this.data.page;
    const pageSize = this.data.pageSize;
    const status = this.data.status;

    let query = db.collection('appointments').where({
      userId: openid
    });

    // 如果有状态筛选，添加状态条件
    if (status) {
      query = query.where({
        status: status
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
          // 格式化预约日期
          let formattedDate = '2026-01-14';
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
            console.error('格式化预约日期失败:', error);
          }

          // 直接在JS中格式化状态文本，避免在WXML中调用函数
          const status = item.status || 'pending';
          let statusText = '待确认'; // 默认状态
          
          // 简单的状态映射
          switch (status) {
            case 'pending':
              statusText = '待确认';
              break;
            case 'paid':
              statusText = '已付款';
              break;
            case 'confirmed':
              statusText = '已确认';
              break;
            case 'completed':
              statusText = '已完成';
              break;
            case 'cancelled':
              statusText = '已取消';
              break;
            default:
              statusText = '待确认';
          }
          
          console.log('预约项状态:', { originalStatus: item.status, resolvedStatus: status, statusText: statusText });

          return {
            ...item,
            formattedAppointmentDate: formattedDate,
            status: status, // 确保status字段存在
            statusText: statusText // 直接添加格式化好的状态文本
          };
        });

        this.setData({
          appointments: loadMore ? [...this.data.appointments, ...formattedAppointments] : formattedAppointments,
          hasMore: formattedAppointments.length === pageSize,
          page: loadMore ? page + 1 : 2,
          loading: false
        });
      })
      .catch(err => {
        console.error('获取预约记录失败:', err);
        wx.showToast({
          title: '获取预约记录失败',
          icon: 'none'
        });
        this.setData({
          loading: false
        });
      });
  },

  // 获取状态文本
  getStatusText(status) {
    // 确保status是字符串类型，默认为pending
    const statusStr = String(status || 'pending');
    const statusMap = {
      'pending': '待确认',
      'paid': '已付款',
      'confirmed': '已确认',
      'completed': '已完成',
      'cancelled': '已取消',
      'undefined': '待确认',
      'null': '待确认',
      'NaN': '待确认'
    };
    const result = statusMap[statusStr] || statusMap['pending'];
    console.log('getStatusText:', { input: status, statusStr: statusStr, result: result });
    return result;
  },

  // 状态筛选
  onStatusChange(e) {
    const newIndex = e.detail.value;
    const selectedOption = this.data.statusOptions[newIndex];
    this.setData({
      statusIndex: newIndex,
      status: selectedOption.value,
      currentStatusText: selectedOption.text
    });
    // 重新加载数据
    this.fetchUserAppointments();
  },

  // 加载更多
  loadMore() {
    this.fetchUserAppointments(true);
  },

  // 下拉刷新
  onPullDownRefresh() {
    this.fetchUserAppointments();
    wx.stopPullDownRefresh();
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
          
          // 调用云函数更新预约状态，并标记为用户取消
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
                wx.showToast({
                  title: '取消成功',
                  icon: 'success'
                });
                // 刷新预约列表
                that.fetchUserAppointments();
              } else {
                wx.showToast({
                  title: res.result.message || '取消失败',
                  icon: 'none'
                });
              }
            },
            fail: err => {
              wx.hideLoading();
              wx.showToast({
                title: '调用云函数失败',
                icon: 'none'
              });
              console.error('调用云函数失败:', err);
            }
          });
        }
      }
    });
  }
});