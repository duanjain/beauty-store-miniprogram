const config = require('./config')

App({
  onLaunch(options) {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: config.cloudEnvId,
        traceUser: true,
      })
    }

    // 初始化全局数据
    this.globalData = {
      userInfo: null,
      isLogin: false,
      role: null, // 'admin' 或 'user'
      openid: null
    }
    
    // 获取系统信息，用于自定义导航栏
    this.initSystemInfo()
    
    // 执行自动登录流程
    this.autoLogin()
  },
  
  onShow(options) {
    // 再次检查邀请人ID (处理后台唤起情况)
    if (options && options.query && options.query.inviterId) {
      wx.setStorageSync('pendingInviter', options.query.inviterId);
    }
  },

  initSystemInfo() {
    try {
      // 优先使用新的 API 获取窗口信息，兼容低版本基础库
      const systemInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      this.globalData.statusBarHeight = systemInfo.statusBarHeight
      
      // 获取胶囊按钮位置信息
      const menuButtonInfo = wx.getMenuButtonBoundingClientRect()
      // 导航栏高度 = (胶囊顶部 - 状态栏高度) * 2 + 胶囊高度
      const navBarHeight = (menuButtonInfo.top - systemInfo.statusBarHeight) * 2 + menuButtonInfo.height
      
      this.globalData.navBarHeight = navBarHeight
      this.globalData.totalNavHeight = systemInfo.statusBarHeight + navBarHeight
      this.globalData.menuButtonInfo = menuButtonInfo
    } catch (e) {
      // 降级处理
      console.error('获取系统信息失败', e)
      this.globalData.statusBarHeight = 20
      this.globalData.navBarHeight = 44
      this.globalData.totalNavHeight = 64
    }
  },
  
  // 自动登录逻辑
  autoLogin() {
    // 1. 优先检查本地缓存
    const storageUser = wx.getStorageSync('userInfo')
    // 确保缓存中有openid信息，否则视为无效缓存
    if (storageUser && (storageUser.openid || storageUser._openid || storageUser._id)) {
      // 检查session有效性
      wx.checkSession({
        success: () => {
          // session有效，直接恢复登录状态
          this.updateUserInfo(storageUser)
          this.handleRedirect(storageUser)
        },
        fail: () => {
          // session失效，尝试云函数静默登录
          this.silentCloudLogin()
        }
      })
    } else {
      // 无本地缓存或缓存无效，尝试云函数静默登录
      this.silentCloudLogin()
    }
  },

  // 云函数静默登录/检查
  silentCloudLogin() {
    wx.cloud.callFunction({
      name: 'login',
      data: { action: 'check' },
      success: res => {
        const result = res.result
        if (result.success) {
          // 兼容处理：尝试从不同字段获取OpenID
          const currentOpenId = result.openid || (result.userInfo && (result.userInfo.openid || result.userInfo._id));
          
          if (!currentOpenId) {
             console.warn('注意：无法自动获取OpenID。可能是云函数未更新或未部署。');
          }

          // 检查是否在管理员白名单中 (优先使用云函数返回的 isAdmin 标记)
          // 移除前端 config.adminOpenIds 检查，完全依赖云函数返回的权限
          const isAdmin = result.isAdmin
          
          if (result.registered) {
             // 已注册 -> 自动登录
             // 如果云函数返回 isAdmin=true，则强制 role='admin'
             const role = isAdmin ? 'admin' : (result.userInfo.role || 'user')
             const user = { ...result.userInfo, role }
             
             this.updateUserInfo(user)
             this.handleRedirect(user)
          } else {
              // 未注册 (无论是 admin 还是 user) -> 停留在登录页，等待用户点击授权
              if (this.loginCheckCallback) {
                this.loginCheckCallback({ registered: false })
              }
          }
        }
      },
      fail: err => {
        console.error('静默登录检查失败', err)
      }
    })
  },
  
  // 刷新用户信息 (仅更新数据，不跳转)
  refreshUserInfo() {
    return new Promise((resolve, reject) => {
      wx.cloud.callFunction({
        name: 'login',
        data: { action: 'check' },
        success: res => {
          const result = res.result
          if (result.success && result.userInfo) {
            const isAdmin = result.isAdmin
            
            const newUserInfo = { 
              ...result.userInfo, 
              role: isAdmin ? 'admin' : (result.userInfo.role || 'user') 
            }
            
            this.updateUserInfo(newUserInfo)
            resolve(newUserInfo)
          } else {
            resolve(this.globalData.userInfo)
          }
        },
        fail: err => {
          console.error('刷新用户信息失败', err)
          resolve(this.globalData.userInfo) // 失败也resolve，避免卡住
        }
      })
    })
  },

  // 处理页面跳转
  handleRedirect(userInfo) {
    // 只有在当前页面是登录页时才跳转，避免干扰用户正常浏览
    // 但如果是onLaunch启动，通常是在启动页或首页
    const pages = getCurrentPages()
    const currentPage = pages[pages.length - 1]
    const currentPath = currentPage ? currentPage.route : 'pages/login/index' // 假设初始是登录页
    
    // 如果已经在目标页面，就不跳转
    if (userInfo.role === 'admin') {
      if (currentPath !== 'pages/product/list/index') { // 假设商品管理是管理员首页
         wx.redirectTo({ url: '/pages/product/list/index' })
      }
    } else {
      if (currentPath === 'pages/login/index') {
         // 如果页面栈大于1，说明是从其他页面跳转过来的，应该返回上一页
         if (pages.length > 1) {
           wx.navigateBack()
         } else {
           wx.switchTab({ url: '/pages/index/index' }).catch(() => {
             wx.redirectTo({ url: '/pages/index/index' })
           })
         }
      }
    }
    
    // 通知回调
    if (this.loginCheckCallback) {
      this.loginCheckCallback({ registered: true, userInfo })
    }
  },
  
  // 更新用户信息
  updateUserInfo(userInfo) {
    this.globalData.userInfo = userInfo
    this.globalData.isLogin = true
    this.globalData.role = userInfo.role || 'user'
    // 增加对 _id 的支持，因为云开发数据库默认主键是 _id，且等于 openid
    this.globalData.openid = userInfo.openid || userInfo._openid || userInfo._id || null
    
    // 如果 userInfo 中没有 openid 字段，补全它，确保 setStorageSync 保存的数据完整
    if (!userInfo.openid && this.globalData.openid) {
      userInfo.openid = this.globalData.openid;
    }

    wx.setStorageSync('userInfo', userInfo)
  },
  
  // 退出登录
  logout() {
    this.globalData.userInfo = null
    this.globalData.isLogin = false
    this.globalData.role = null
    // 标记为主动退出，防止登录页再次自动检查
    this.globalData.isLogout = true 
    
    wx.removeStorageSync('userInfo')
    wx.reLaunch({
      url: '/pages/login/index'
    })
  }
})
