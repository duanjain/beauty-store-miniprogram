Page({
  data: {
    userInfo: null,
    activeTab: 'orders', // orders, appointments
    orders: [],
    appointments: [],
    loading: false
  },

  onLoad(options) {
    const { id } = options;
    if (id) {
      this.loadUserDetail(id);
    } else {
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      });
      setTimeout(() => wx.navigateBack(), 1500);
    }
  },

  loadUserDetail(id) {
    this.setData({ loading: true });
    
    wx.cloud.callFunction({
      name: 'getAdminUserDetail',
      data: { userId: id }
    }).then(res => {
      const result = res.result;
      if (result.success) {
        const { userInfo, orders, appointments } = result.data;
        
        this.setData({
          userInfo,
          orders: orders.map(order => ({
            ...order,
            formattedTime: this.formatTime(order.createTime)
          })),
          appointments: appointments.map(app => ({
            ...app,
            formattedTime: this.formatTime(app.appointmentTime || app.createTime)
          }))
        });
      } else {
        wx.showToast({
          title: result.message || '获取详情失败',
          icon: 'none'
        });
      }
    }).catch(err => {
      console.error('调用云函数失败', err);
      wx.showToast({
        title: '网络错误',
        icon: 'none'
      });
    }).finally(() => {
      this.setData({ loading: false });
    });
  },

  // loadOrders 和 loadAppointments 函数已不再需要，可以删除或保留作为备用
  // 为保持代码整洁，建议删除这两个函数以及原来的调用逻辑

  switchTab(e) {
    this.setData({
      activeTab: e.currentTarget.dataset.tab
    });
  },

  formatTime(time) {
    if (!time) return '';
    const date = new Date(time);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  },

  // 复制文本
  copyText(e) {
    wx.setClipboardData({
      data: e.currentTarget.dataset.text,
      success: () => {
        wx.showToast({
          title: '已复制',
          icon: 'success'
        });
      }
    });
  }
});