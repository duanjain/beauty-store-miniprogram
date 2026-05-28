Page({
  data: {
    service: {}, // 服务详情数据
    // 预约相关数据
    selectedDate: '',
    selectedTime: '',
    selectedTimeIndex: 0,
    availableTimeSlots: [],
    minDate: '',
    maxDate: '',
    // 联系人信息
    contactName: '',
    contactPhone: '',
    // 用户角色
    isAdmin: false
  },

  // 页面加载时调用
  onLoad: function (options) {
    console.log('服务详情页面onLoad被调用');
    console.log('页面参数:', options);
    const { id } = options;
    if (!id) {
      wx.showToast({
        title: '参数错误',
        icon: 'none'
      });
      wx.navigateBack();
      return;
    }
    // 初始化日期范围
    this.initDateRange();
    // 检查用户角色
    this.checkUserRole();
    this.loadServiceDetail(id);
  },

  // 检查用户角色
  checkUserRole() {
    const app = getApp();
    // 明确检查管理员角色
    const isLogin = app.globalData.isLogin || false;
    const role = app.globalData.role || '';
    const isAdmin = isLogin && role === 'admin';
    console.log('检查用户角色:', { isLogin, role, isAdmin });
    this.setData({ isAdmin: isAdmin });
    // 确保管理员端不会加载预约相关数据
    if (isAdmin) {
      // 管理员端可以选择性地重置或不加载预约相关数据
      this.setData({
        selectedDate: '',
        selectedTime: '',
        selectedTimeIndex: 0,
        availableTimeSlots: []
      });
    }
  },

  // 初始化日期范围
  initDateRange() {
    const today = new Date();
    const minDate = today.toISOString().split('T')[0];
    // 设置最大预约日期为30天后
    const maxDate = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    this.setData({
      minDate: minDate,
      maxDate: maxDate
    });
  },

  // 加载服务详情数据
  loadServiceDetail(id) {
    const that = this;

    // 直接使用数据库查询
    wx.cloud.database().collection('services').doc(id).get().then(res => {
      console.log('直接查询获取服务数据:', res.data);
      
      let serviceData = res.data;
      
      // 统一处理createTime字段
      let createTime = serviceData.createTime || serviceData.createdAt;
      let formattedCreateTime = '未设置';
      if (createTime && createTime._seconds) {
        // 如果是云开发Date对象，转换为JS Date对象
        createTime = new Date(createTime._seconds * 1000);
        formattedCreateTime = that.formatDate(createTime);
      } else if (typeof createTime === 'string') {
        // 如果是字符串，直接创建Date对象
        createTime = new Date(createTime);
        formattedCreateTime = that.formatDate(createTime);
      } else if (createTime instanceof Date) {
        // 如果本身就是Date对象，则无需处理
        formattedCreateTime = that.formatDate(createTime);
      }
      
      // 确保timeSettings字段存在
      if (!serviceData.timeSettings) {
        serviceData.timeSettings = {
          timeGranularity: 30,
          dailyStartTime: '09:00',
          dailyEndTime: '21:00',
          availableDays: [],
          maxCapacity: 1,
          specialDates: []
        };
      } 
      
      // 确保timeSettings的子字段存在
      serviceData.timeSettings.timeGranularity = serviceData.timeSettings.timeGranularity || 30;
      serviceData.timeSettings.dailyStartTime = serviceData.timeSettings.dailyStartTime || '09:00';
      serviceData.timeSettings.dailyEndTime = serviceData.timeSettings.dailyEndTime || '21:00';
      serviceData.timeSettings.maxCapacity = serviceData.timeSettings.maxCapacity || 1;
      serviceData.timeSettings.specialDates = serviceData.timeSettings.specialDates || [];
      
      // 确保 availableDays 是一个数组，并且元素都是字符串类型
      if (!Array.isArray(serviceData.timeSettings.availableDays)) {
        serviceData.timeSettings.availableDays = [];
      } else {
        // 将所有元素转换为字符串类型
        serviceData.timeSettings.availableDays = serviceData.timeSettings.availableDays.map(day => day.toString());
      }
      
      // 格式化营业日
      const formattedAvailableDays = that.formatWeekDays(serviceData.timeSettings.availableDays);
      
      // 确保images数组存在
      if (!serviceData.images) {
        serviceData.images = [];
      }
      
      that.setData({
        service: serviceData,
        formattedCreateTime: formattedCreateTime,
        formattedAvailableDays: formattedAvailableDays
      });
    }).catch(err => {
      console.error('获取服务详情失败', err);
      wx.showToast({
        title: '获取服务详情失败',
        icon: 'none'
      });
    });
  },

  // 格式化日期
  formatDate(date) {
    console.log('格式化日期:', date, '类型:', typeof date);
    if (!date) return '';
    
    let d;
    // 确保date是Date对象
    if (typeof date === 'object' && date instanceof Date) {
      d = date;
    } else if (typeof date === 'string') {
      d = new Date(date);
    } else {
      console.error('无效的日期类型:', date);
      return '';
    }
    
    // 检查日期是否有效
    if (isNaN(d.getTime())) {
      console.error('无效的日期:', date);
      return '';
    }
    
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const day = d.getDate();
    
    // 使用传统方式格式化月份和日期，确保两位数显示
    const formattedMonth = month < 10 ? '0' + month : month;
    const formattedDay = day < 10 ? '0' + day : day;
    
    const result = `${year}-${formattedMonth}-${formattedDay}`;
    console.log('格式化结果:', result);
    return result;
  },

  // 格式化星期
  formatWeekDays(availableDays) {
    if (!Array.isArray(availableDays) || availableDays.length === 0) {
      return '无';
    }

    const weekMap = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    
    const dayNames = availableDays
      .map(day => parseInt(day)) // 确保是数字
      .filter(dayNum => !isNaN(dayNum) && dayNum >= 1 && dayNum <= 7) // 过滤无效数字
      .sort((a, b) => a - b) // 排序
      .map(dayNum => weekMap[dayNum - 1]); // 映射为中文

    return dayNames.length > 0 ? dayNames.join('、') : '无';
  },

  // 图片加载错误处理
  onImageError(e) {
    const index = e.currentTarget.dataset.index;
    const service = this.data.service;
    if (service && service.images && service.images[index]) {
      // 图片加载失败时，将其替换为空字符串或占位符
      service.images[index] = '';
      this.setData({ service });
    }
  },

  // 预览图片
  previewImage(e) {
    const index = e.currentTarget.dataset.index;
    const images = this.data.service.images;
    if (images && images.length > 0) {
      wx.previewImage({
        current: images[index], // 当前显示图片的http链接
        urls: images // 需要预览的图片http链接列表
      });
    }
  },

  // 返回上一页
  navigateBack() {
    wx.navigateBack();
  },

  // 管理员端：前往编辑服务页面
  navigateToEdit() {
    wx.navigateTo({
      url: `/pages/service/edit/index?id=${this.data.service._id}`
    });
  },

  // 管理员端：删除服务
  deleteService() {
    const that = this;
    wx.showModal({
      title: '删除服务',
      content: '确定要删除该服务吗？',
      success: function (res) {
        if (res.confirm) {
          wx.showLoading({ title: '删除中...' });

          wx.cloud.callFunction({
            name: 'serviceDelete',
            data: {
              id: that.data.service._id
            },
            success: res => {
              wx.hideLoading();
              if (res.result.success) {
                wx.showToast({
                  title: '删除成功',
                  icon: 'success'
                });
                // 删除成功后返回服务列表页
                setTimeout(() => {
                  wx.navigateBack();
                }, 1500);
              } else {
                wx.showToast({
                  title: res.result.message || '删除失败',
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
              console.error('调用云函数失败', err);
            }
          });
        }
      }
    });
  },

  // 日期选择变化
  onDateChange(e) {
    const selectedDate = e.detail.value;
    this.setData({ 
      selectedDate: selectedDate,
      selectedTime: '',
      selectedTimeIndex: 0
    });
    // 生成可选时间段
    this.generateTimeSlots(selectedDate);
  },

  // 时间选择变化
  onTimeChange(e) {
    const selectedIndex = e.detail.value;
    const selectedTime = this.data.availableTimeSlots[selectedIndex];
    this.setData({ 
      selectedTimeIndex: selectedIndex,
      selectedTime: selectedTime
    });
  },

  // 联系人姓名输入变化
  onNameInput(e) {
    this.setData({ 
      contactName: e.detail.value
    });
  },

  // 联系电话输入变化
  onPhoneInput(e) {
    this.setData({ 
      contactPhone: e.detail.value
    });
  },

  // 查询指定日期已被预约的时间段，并转换为时间范围
  getBookedTimeSlots(selectedDate) {
    return new Promise((resolve, reject) => {
      // 使用云函数获取占用时间段，解决跨用户读取权限问题
      wx.cloud.callFunction({
        name: 'getUnavailableTimeSlots',
        data: {
          date: selectedDate
        }
      }).then(res => {
        const result = res.result;
        if (result.success) {
          const rawAppointments = result.data || [];
          console.log('Raw appointments from cloud:', rawAppointments);
          
          const targetDate = selectedDate; // "YYYY-MM-DD"
          
          const bookedTimeRanges = rawAppointments.filter(item => {
             if (!item.appointmentTime) return false;
             try {
                // Handle both ISO String and Date object (if passed directly)
                let dateObj = new Date(item.appointmentTime);
                if (isNaN(dateObj.getTime())) return false;
                
                // Convert to Beijing Time (UTC+8) to match the selectedDate context
                // The selectedDate (e.g. "2026-01-20") is a Beijing Date.
                // We need to see if the appointmentTime falls on that Beijing Date.
                
                // Method: Add 8 hours to UTC timestamp, then extract UTC components
                const beijingTime = new Date(dateObj.getTime() + 8 * 60 * 60 * 1000);
                const year = beijingTime.getUTCFullYear();
                const month = String(beijingTime.getUTCMonth() + 1).padStart(2, '0');
                const day = String(beijingTime.getUTCDate()).padStart(2, '0');
                const itemDateStr = `${year}-${month}-${day}`;
                
                // Also log for debugging
                // console.log(`Checking appt: ${item.appointmentTime} -> Beijing: ${itemDateStr} vs Target: ${targetDate}`);
                
                return itemDateStr === targetDate;
             } catch (e) {
                console.error('Date parse error', e);
                return false;
             }
          }).map(item => {
             if (item.timeSlot) {
                try {
                    const [startStr, endStr] = item.timeSlot.split(' - ')
                    const [startH, startM] = startStr.split(':').map(Number)
                    const [endH, endM] = endStr.split(':').map(Number)
                    
                    return {
                        startTime: startH * 60 + startM,
                        endTime: endH * 60 + endM,
                        timeSlot: item.timeSlot
                    }
                } catch (e) {
                    return null
                }
             }
             return null
          }).filter(item => item !== null);

          console.log('Filtered booked ranges (Beijing Time):', bookedTimeRanges);
          resolve(bookedTimeRanges);
        } else {
          console.error('获取已被预约时间失败:', result.message);
          // Don't fallback silently if cloud function explicitly fails
          // resolve([]); 
          // Instead, throw error or return empty but with warning?
          // Let's resolve empty but verify if this is safe.
          // If we resolve empty, user can book. This is dangerous.
          // But throwing reject might block the UI completely.
          // Better: Alert user.
          wx.showToast({
             title: '获取预约数据异常，请刷新重试',
             icon: 'none',
             duration: 3000
          });
          reject(new Error(result.message));
        }
      }).catch(err => {
        console.error('调用getUnavailableTimeSlots失败:', err);
        // Fallback to local check ONLY IF we are sure it works (e.g. admin)
        // For normal users, local check will fail to see others' appointments due to permissions.
        // So fallback is actually harmful (gives false sense of vacancy).
        // Check if user is admin? No, just alert.
        wx.showToast({
             title: '网络繁忙，无法获取最新预约状态',
             icon: 'none',
             duration: 3000
        });
        reject(err);
        // this.getBookedTimeSlotsLocal(selectedDate).then(resolve); // DISABLED DANGEROUS FALLBACK
      });
    });
  },

  // 本地查询指定日期已被预约的时间段 (备用)
  getBookedTimeSlotsLocal(selectedDate) {
    return new Promise((resolve, reject) => {
      try {
        const db = wx.cloud.database();
        db.collection('appointments')
          .where({
            // 匹配指定日期
            appointmentTime: db.command.and(
              db.command.gte(new Date(`${selectedDate} 00:00:00`)),
              db.command.lt(new Date(`${selectedDate} 23:59:59`))
            ),
            // 排除已取消的预约
            status: db.command.neq('cancelled')
          })
          .get()
          .then(res => {
            // 提取已被预约的时间段，并转换为时间范围对象
            const bookedTimeRanges = res.data.map(item => {
              if (item.timeSlot) {
                // 解析时间段字符串，如"9:00 - 10:40"
                const [start, end] = item.timeSlot.split(' - ');
                const [startHour, startMinute] = start.split(':').map(Number);
                const [endHour, endMinute] = end.split(':').map(Number);
                
                return {
                  timeSlot: item.timeSlot,
                  startTime: startHour * 60 + startMinute, // 转换为分钟数
                  endTime: endHour * 60 + endMinute // 转换为分钟数
                };
              }
              return null;
            }).filter(range => range !== null);
            
            console.log('已被预约的时间范围 (本地查询):', bookedTimeRanges);
            resolve(bookedTimeRanges);
          })
          .catch(err => {
            console.error('查询已预约时间段失败:', err);
            resolve([]);
          });
      } catch (error) {
        console.error('getBookedTimeSlotsLocal方法执行出错:', error);
        resolve([]);
      }
    });
  },

  // 生成时间段
  generateTimeSlots(selectedDate) {
    const { service } = this.data;
    const { timeSettings } = service;
    const specialDates = timeSettings.specialDates || [];
    const specialDateConfig = specialDates.find(item => item.date === selectedDate);
    
    if (specialDateConfig && specialDateConfig.isClosed) {
      this.setData({ availableTimeSlots: [] });
      wx.showToast({
        title: '该日期为休息日',
        icon: 'none'
      });
      return;
    }
    
    let isBusinessDay = true;
    if (!specialDateConfig) {
      const date = new Date(selectedDate);
      const dayOfWeek = date.getDay() === 0 ? 7 : date.getDay();
      if (timeSettings.availableDays.length > 0) {
        isBusinessDay = timeSettings.availableDays.some(day => 
          day === dayOfWeek || day === dayOfWeek.toString()
        );
      }
    }
    
    if (!isBusinessDay) {
      this.setData({ availableTimeSlots: [] });
      return;
    }
    
    let startTime = timeSettings.dailyStartTime || '09:00';
    let endTime = timeSettings.dailyEndTime || '21:00';
    if (specialDateConfig && !specialDateConfig.isClosed) {
      startTime = specialDateConfig.startTime || startTime;
      endTime = specialDateConfig.endTime || endTime;
    }

    const granularity = Number(timeSettings.timeGranularity) || 30; // 默认30分钟
    
    // 转换为分钟数
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    const startTotalMinutes = startHour * 60 + startMinute;
    const endTotalMinutes = endHour * 60 + endMinute;
    
    // 查询该日期已被预约的时间段
    this.getBookedTimeSlots(selectedDate).then(bookedTimeRanges => {
      // 生成所有可能的时间段
      const allTimeSlots = [];
      for (let minutes = startTotalMinutes; minutes < endTotalMinutes; minutes += granularity) {
        const hour = Math.floor(minutes / 60);
        const min = minutes % 60;
        // 使用兼容的方式格式化时间，不使用padStart
        const formatNumber = (n) => {
          n = n.toString();
          return n.length === 1 ? '0' + n : n;
        };
        const timeSlotStart = `${formatNumber(hour)}:${formatNumber(min)}`;
        
        // Calculate slot end time based on duration if available, otherwise granularity
        const duration = (service.duration && Number(service.duration)) || granularity;
        const endMinutes = minutes + duration;

        const endHour = Math.floor(endMinutes / 60);
        const endMin = endMinutes % 60;
        const timeSlotEnd = `${formatNumber(endHour)}:${formatNumber(endMin)}`;
        
        const timeSlot = `${timeSlotStart} - ${timeSlotEnd}`;
        
        // 计算当前时间段的开始和结束分钟数
        const currentStart = minutes;
        const currentEnd = endMinutes;
        
        // 检查当前时间段是否与已预约的时间段重叠
        let isOverlapping = false;
        for (const bookedRange of bookedTimeRanges) {
          // 时间重叠检测：如果两个时间段有重叠，则不可预约
          // 重叠条件：currentStart < bookedRange.endTime && currentEnd > bookedRange.startTime
          if (currentStart < bookedRange.endTime && currentEnd > bookedRange.startTime) {
            isOverlapping = true;
            break;
          }
        }
        
        // 如果不重叠，则添加到可用时间段列表
        if (!isOverlapping) {
          allTimeSlots.push(timeSlot);
        }
      }
      
      this.setData({ availableTimeSlots: allTimeSlots });
    }).catch(err => {
      console.error('generateTimeSlots error:', err);
      // Ensure no slots are shown if we can't verify availability
      this.setData({ availableTimeSlots: [] });
    });
  },

  // 提交预约
  submitAppointment() {
    const { service, selectedDate, selectedTime } = this.data;
    
    // 检查是否已登录
    const app = getApp();
    if (!app.globalData.isLogin || !app.globalData.openid) {
      wx.showToast({
        title: '请先登录',
        icon: 'none'
      });
      setTimeout(() => {
        wx.navigateTo({ url: '/pages/login/index' });
      }, 1500);
      return;
    }
    
    // 准备预约数据
    const appointmentData = {
      userId: app.globalData.openid,
      userName: this.data.contactName,
      phone: this.data.contactPhone,
      serviceId: service._id,
      serviceName: service.serviceName,
      appointmentTime: new Date(`${selectedDate} ${selectedTime.split(' - ')[0]}`),
      timeSlot: selectedTime, // 保存完整的时间段字符串，比如"10:00 - 10:30"
      status: 'pending',
      createTime: new Date()
    };
    
    const price = typeof service.price === 'number' ? service.price : parseFloat(service.price) || 0;
    app.globalData.pendingAppointment = {
      ...appointmentData,
      price: price
    };

    wx.showModal({
      title: '预约提示',
      content: '预约服务需要到店接受服务，请确保您能按时到店。',
      confirmText: '继续预约',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({
            url: '/pages/pay/index?type=appointment'
          });
        }
      }
    });
  }
})
