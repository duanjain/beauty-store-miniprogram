Page({
  data: {
    addressForm: {
      name: '',
      phone: '',
      province: '',
      city: '',
      district: '',
      address: '',
      detail: '',
      isDefault: false
    },
    isEdit: false,
    addressId: '',
    canSave: false
  },

  onLoad(options) {
    this.setData({
      isEdit: !!options.id,
      addressId: options.id || ''
    });
    
    if (options.id) {
      this.getAddressDetail(options.id);
    }
  },

  // 返回上一页
  goBack() {
    wx.navigateBack();
  },

  // 获取地址详情
  getAddressDetail(id) {
    wx.showLoading({
      title: '加载中...',
    });
    
    wx.cloud.callFunction({
      name: 'getAddressDetail',
      data: {
        id: id
      },
      success: res => {
        console.log('获取地址详情成功:', res);
        if (res.result.data) {
          this.setData({
            addressForm: {
              ...res.result.data,
              isDefault: res.result.data.isDefault || false
            }
          });
        }
      },
      fail: err => {
        console.error('获取地址详情失败:', err);
        wx.showToast({
          title: '加载失败',
          icon: 'none'
        });
      },
      complete: () => {
        wx.hideLoading();
        this.checkCanSave();
      }
    });
  },

  // 处理输入
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`addressForm.${field}`]: value
    });
    this.checkCanSave();
  },

  // 处理多行输入
  onTextareaInput(e) {
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value;
    this.setData({
      [`addressForm.${field}`]: value
    });
    this.checkCanSave();
  },

  // 切换默认地址
  toggleDefault() {
    this.setData({
      'addressForm.isDefault': !this.data.addressForm.isDefault
    });
    this.checkCanSave();
  },

  // 检查是否可以保存
  checkCanSave() {
    const { addressForm } = this.data;
    const canSave = 
      addressForm.name && 
      /^1\d{10}$/.test(addressForm.phone) && 
      addressForm.province && 
      addressForm.city && 
      addressForm.district && 
      addressForm.address && 
      addressForm.detail;
    this.setData({
      canSave: canSave
    });
  },

  // 打开地图选择
  openMap() {
    const that = this;
    
    // 检查位置授权状态
    wx.getSetting({
      success(res) {
        if (res.authSetting['scope.userLocation']) {
          // 已授权，打开地图选择
          that.chooseLocation();
        } else if (res.authSetting['scope.userLocation'] === undefined) {
          // 未授权，请求授权
          wx.authorize({
            scope: 'scope.userLocation',
            success() {
              // 授权成功，打开地图选择
              that.chooseLocation();
            },
            fail() {
              // 授权失败，引导用户手动授权
              that.showLocationSettingModal();
            }
          });
        } else {
          // 已拒绝授权，引导用户手动授权
          that.showLocationSettingModal();
        }
      }
    });
  },

  // 选择位置
  chooseLocation() {
    const that = this;
    wx.chooseLocation({
      success: function (res) {
        console.log('选择的位置:', res);
        const { latitude, longitude, name, address } = res;
        
        // 调用云函数进行逆地址解析，获取省市区信息
        // 同时传入address作为降级备选
        that.getAddressFromCoords(latitude, longitude, name, address);
      },
      fail: function (err) {
        console.error('选择位置失败:', err);
        // 如果不是用户取消，则提示错误
        if (err.errMsg.indexOf('cancel') === -1) {
          wx.showToast({
            title: '打开地图失败',
            icon: 'none'
          });
        }
      }
    });
  },

  // 从经纬度获取地址
  getAddressFromCoords(latitude, longitude, poiName = '', rawAddress = '') {
    const that = this;
    
    wx.showLoading({
      title: '解析地址中...',
    });
    
    // 调用云函数获取地址信息
    wx.cloud.callFunction({
      name: 'getAddressFromCoords',
      data: {
        latitude,
        longitude
      },
      success: res => {
        wx.hideLoading();
        if (res.result.success) {
          const resultData = res.result.data;
          if (resultData.status === 0) {
            const addressComponent = resultData.result.address_component;
            
            // 优先使用POI名称作为地址描述，如果没有则使用解析出的推荐地址
            const displayAddress = poiName || resultData.result.address;
            
            that.setData({
              'addressForm.province': addressComponent.province,
              'addressForm.city': addressComponent.city,
              'addressForm.district': addressComponent.district,
              'addressForm.address': displayAddress
            });
            
            that.checkCanSave();
          } else {
            console.warn('云函数返回状态码非0，尝试本地解析');
            that.parseAddressLocally(rawAddress, poiName);
          }
        } else {
          console.warn('云函数调用失败，尝试本地解析');
          that.parseAddressLocally(rawAddress, poiName);
        }
      },
      fail: err => {
        wx.hideLoading();
        console.error('调用云函数失败:', err);
        // 降级处理：尝试本地解析
        that.parseAddressLocally(rawAddress, poiName);
      }
    });
  },

  // 本地解析地址（降级方案）
  parseAddressLocally(fullAddress, poiName) {
    if (!fullAddress) {
      wx.showToast({
        title: '解析地址失败，请手动填写',
        icon: 'none'
      });
      return;
    }

    // 简单的正则匹配省市区
    // 注意：这个正则不能覆盖所有情况，但能处理大部分常见情况
    const regex = /^(.*?[省|自治区|市])(.*?[市|自治州|地区|盟])(.*?[区|县|市|旗])?/;
    const matches = fullAddress.match(regex);
    
    let province = '';
    let city = '';
    let district = '';
    
    if (matches) {
      province = matches[1] || '';
      city = matches[2] || '';
      district = matches[3] || '';
    } else {
      // 尝试处理直辖市的情况 (如: 北京市海淀区...)
      const directCityRegex = /^(北京|天津|上海|重庆)市(.*?[区|县])?/;
      const directMatches = fullAddress.match(directCityRegex);
      if (directMatches) {
        province = directMatches[1] + '市';
        city = directMatches[1] + '市';
        district = directMatches[2] || '';
      }
    }

    // 填充数据
    this.setData({
      'addressForm.province': province,
      'addressForm.city': city,
      'addressForm.district': district,
      'addressForm.address': poiName || fullAddress // 如果有POI名称则用POI名称，否则用全地址
    });

    wx.showToast({
      title: '已自动填写，请核对',
      icon: 'none'
    });
    
    this.checkCanSave();
  },

  // 显示位置设置弹窗
  showLocationSettingModal() {
    wx.showModal({
      title: '位置授权',
      content: '需要获取您的位置信息来选择收货地址，请开启位置授权',
      cancelText: '取消',
      confirmText: '去设置',
      success(res) {
        if (res.confirm) {
          // 打开设置页面
          wx.openSetting({
            success(settingRes) {
              console.log('设置页面返回:', settingRes.authSetting);
            }
          });
        }
      }
    });
  },

  // 保存地址
  saveAddress() {
    const { addressForm, isEdit, addressId } = this.data;
    
    wx.showLoading({
      title: '保存中...',
    });
    
    const cloudFunctionName = isEdit ? 'updateAddress' : 'addAddress';
    const data = {
      ...addressForm,
      userId: getApp().globalData.openid
    };
    
    if (isEdit) {
      data.id = addressId;
    }
    
    wx.cloud.callFunction({
      name: cloudFunctionName,
      data: data,
      success: res => {
        console.log('保存地址成功:', res);
        wx.showToast({
          title: isEdit ? '更新成功' : '添加成功',
          icon: 'success'
        });
        
        // 延迟返回上一页
        setTimeout(() => {
          wx.navigateBack();
        }, 1500);
      },
      fail: err => {
        console.error('保存地址失败:', err);
        wx.showToast({
          title: '保存失败',
          icon: 'none'
        });
      },
      complete: () => {
        wx.hideLoading();
      }
    });
  }
});
