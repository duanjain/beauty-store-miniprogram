Page({
  data: {
    order: null, // 订单详情
    loading: true, // 加载中状态
    orderId: '', // 订单ID
    isAdmin: false // 是否为管理员
  },

  // 页面加载时调用
  onLoad: function (options) {
    const app = getApp();
    const isAdmin = app.globalData.isLogin && app.globalData.role === 'admin';
    this.setData({ isAdmin: isAdmin });

    const orderId = options.id;
    if (orderId) {
      this.setData({
        orderId: orderId
      });
      this.loadOrderDetail();
    } else {
      wx.showToast({
        title: '订单ID不能为空',
        icon: 'none'
      });
      wx.navigateBack();
    }
  },

  // 加载订单详情
  loadOrderDetail() {
    const that = this;
    that.setData({ loading: true });

    wx.cloud.callFunction({
      name: 'getOrderDetail',
      data: {
        orderId: that.data.orderId
      }
    }).then(res => {
      const result = res.result || {};
      
      if (result.success) {
        const order = result.data;
        order.createTime = that.resolveCreateTime(order);
        order.formattedCreateTime = that.formatDate(order.createTime);

        // 格式化商品信息
        if (order.items) {
          order.items = order.items.map((item, index) => {
             // 确保图片字段存在且有效
            let imageUrl = '';
            if (item.imageUrl) {
              imageUrl = item.imageUrl;
            } else if (item.images && item.images.length > 0 && item.images[0]) {
              imageUrl = item.images[0];
            } else {
              imageUrl = '/images/tabbar/home.png';
            }

            return {
              ...item,
              _id: item.productId || item._id || `item-${index}`,
              imageUrl: imageUrl,
              subtotal: (parseFloat(item.price || 0) * (item.quantity || 1)).toFixed(2)
            };
          });
        }
        
        that.setData({
          order: order,
          loading: false,
          isAdmin: result.isAdmin
        });
      } else {
        console.error('获取订单详情失败', result.message);
        wx.showToast({
          title: result.message || '获取订单详情失败',
          icon: 'none'
        });
        that.setData({ loading: false });
      }
    }).catch(err => {
      console.error('调用getOrderDetail失败', err);
      wx.showToast({
        title: '获取订单详情失败',
        icon: 'none'
      });
      that.setData({ loading: false });
    });
  },

  // 返回订单列表
  goBack() {
    wx.navigateBack();
  },

  // 修改订单状态
  onChangeStatus(e) {
    if (!this.data.isAdmin) {
      return;
    }

    const { status } = e.currentTarget.dataset;
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
                  orderId: that.data.orderId,
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
                  that.setData({
                    'order.status': selectedStatus
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

  // 顾客取消订单
  onCancelOrder() {
    if (this.data.isAdmin) {
      return;
    }
    const order = this.data.order;
    if (!order || !order._id) {
      return;
    }
    const status = order.status;
    
    // Updated Logic:
    // 1. Pending (Unpaid) -> Cancel directly
    // 2. Paid -> Refund and Cancel
    // 3. Confirmed (Before Shipping) -> Refund and Cancel
    // 4. Shipped/Completed -> Cannot cancel

    if (status === 'shipped' || status === 'completed') {
      wx.showModal({
        title: '无法取消订单',
        content: '订单已发货或已完成，无法取消。',
        showCancel: false
      });
      return;
    }

    if (status === 'cancelled') {
      wx.showToast({ title: '订单已取消', icon: 'none' });
      return;
    }

    const needsRefund = (status === 'paid' || status === 'confirmed');
    
    wx.showModal({
      title: '取消订单',
      content: needsRefund ? '订单已付款，取消后将自动发起退款，确定继续吗？' : '确定要取消该订单吗？',
      success: res => {
        if (!res.confirm) return;

        wx.showLoading({ title: '处理中...' });
        
        // Use orderUpdate cloud function for all cancellations (it handles refund logic now)
        wx.cloud.callFunction({
          name: 'orderUpdate',
          data: {
            orderId: order._id,
            status: 'cancelled'
          }
        }).then(cfRes => {
           wx.hideLoading();
           const result = cfRes.result || {};
           if (result.success) {
              wx.showToast({ title: '订单已取消', icon: 'success' });
              this.setData({ 'order.status': 'cancelled' });
              // Reload to refresh view
              this.loadOrderDetail();
           } else {
              wx.showToast({ title: result.message || '取消失败', icon: 'none' });
           }
        }).catch(err => {
           wx.hideLoading();
           console.error('取消订单异常', err);
           wx.showToast({ title: '系统繁忙: ' + (err.errMsg || err.message || ''), icon: 'none' });
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

  onHide: function () {},
  onUnload: function () {},
  onShareAppMessage: function () {}
})
