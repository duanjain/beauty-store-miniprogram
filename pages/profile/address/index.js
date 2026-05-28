Page({
  data: {
    addressList: []
  },

  onLoad() {
    this.getAddressList();
  },

  onShow() {
    // 返回页面时刷新地址列表
    this.getAddressList();
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 获取地址列表
  getAddressList() {
    wx.showLoading({
      title: '加载中...',
    });
    
    wx.cloud.callFunction({
      name: 'getAddressList',
      success: res => {
        console.log('获取地址列表成功:', res);
        this.setData({
          addressList: res.result.data || []
        });
      },
      fail: err => {
        console.error('获取地址列表失败:', err);
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  },

  // 选择地址
  selectAddress(e) {
    const index = e.currentTarget.dataset.index;
    const selectedAddress = this.data.addressList[index];
    
    // 返回上一页并传递选择的地址
    const pages = getCurrentPages();
    const prevPage = pages[pages.length - 2];
    if (prevPage && prevPage.onSelectAddress) {
      prevPage.onSelectAddress(selectedAddress);
    }
    wx.navigateBack();
  },

  // 添加地址
  addAddress() {
    wx.navigateTo({
      url: '/pages/profile/address/edit/index'
    });
  },

  // 编辑地址
  editAddress(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({
      url: `/pages/profile/address/edit/index?id=${id}`
    });
  },

  // 删除地址
  deleteAddress(e) {
    const id = e.currentTarget.dataset.id;
    
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个地址吗？',
      success: res => {
        if (res.confirm) {
          wx.cloud.callFunction({
            name: 'deleteAddress',
            data: {
              id: id
            },
            success: res => {
              console.log('删除地址成功:', res);
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              });
              // 刷新地址列表
              this.getAddressList();
            },
            fail: err => {
              console.error('删除地址失败:', err);
              wx.showToast({
                title: '删除失败',
                icon: 'none'
              });
            }
          });
        }
      }
    });
  }
});