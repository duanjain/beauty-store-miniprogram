const app = getApp();

Page({
  data: {
    userPoints: 0,
    logs: [],
    page: 1,
    pageSize: 20,
    hasMore: true,
    loading: false
  },

  onLoad() {
    // Initial load handled by onShow
  },

  onShow() {
    this.refreshData();
  },

  refreshData() {
    this.setData({
      page: 1,
      hasMore: true,
      logs: [],
      loading: false
    }, () => {
      this.loadUserPoints();
      this.loadPointsLogs();
    });
  },

  onPullDownRefresh() {
    this.refreshData();
    wx.stopPullDownRefresh();
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.setData({
        page: this.data.page + 1
      }, () => {
        this.loadPointsLogs();
      });
    }
  },

  loadUserPoints() {
    const db = wx.cloud.database();
    db.collection('users').where({
      _openid: app.globalData.openid
    }).get().then(res => {
      if (res.data.length > 0) {
        this.setData({
          userPoints: res.data[0].points || 0
        });
      }
    });
  },

  loadPointsLogs() {
    if (this.data.loading) return Promise.resolve();
    this.setData({ loading: true });

    const db = wx.cloud.database();
    const skip = (this.data.page - 1) * this.data.pageSize;

    return db.collection('pointsLogs')
      .where({
        userId: app.globalData.openid
      })
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(this.data.pageSize)
      .get()
      .then(res => {
        const newLogs = res.data.map(log => {
          return {
            ...log,
            formattedTime: this.formatTime(log.createTime)
          };
        });

        this.setData({
          logs: this.data.page === 1 ? newLogs : this.data.logs.concat(newLogs),
          hasMore: newLogs.length === this.data.pageSize,
          loading: false
        });
      })
      .catch(err => {
        console.error('加载积分记录失败', err);
        this.setData({ loading: false });
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
      });
  },

  formatTime(date) {
    if (!date) return '';
    const d = new Date(date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
});
