Page({
  data: {
    userId: '',
    logs: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false
  },

  onLoad(options) {
    if (options.userId) {
      this.setData({ userId: options.userId });
    }
    // 初始加载放在 onShow 中执行，确保每次进入页面都刷新
  },

  onShow() {
    this.getLogs(true);
  },

  onPullDownRefresh() {
    this.getLogs(true);
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({ page: this.data.page + 1 });
      this.getLogs(false);
    }
  },

  getLogs(reset = false) {
    if (this.data.loading) return;
    
    this.setData({ loading: true });
    
    if (reset) {
      this.setData({ 
        page: 1, 
        logs: [], 
        hasMore: true 
      });
    }

    wx.cloud.callFunction({
      name: 'getPointsLogs',
      data: {
        userId: this.data.userId,
        page: this.data.page,
        pageSize: this.data.pageSize
      }
    }).then(res => {
      const result = res.result;
      if (result.success) {
        const newLogs = result.data.map(log => {
          return {
            ...log,
            createTimeStr: this.formatTime(log.createTime),
            sourceStr: this.formatSource(log.source)
          };
        });
        
        this.setData({
          logs: reset ? newLogs : this.data.logs.concat(newLogs),
          hasMore: newLogs.length === this.data.pageSize
        });
      } else {
        wx.showToast({
          title: result.message || '获取记录失败',
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
      if (reset) wx.stopPullDownRefresh();
    });
  },

  formatTime(timeStr) {
    if (!timeStr) return '';
    const date = new Date(timeStr);
    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');
    const h = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    return `${y}-${m}-${d} ${h}:${min}`;
  },

  formatSource(source) {
    const map = {
      'order': '订单完成',
      'appointment': '预约完成',
      'manual': '管理员操作'
    };
    return map[source] || source;
  }
});
