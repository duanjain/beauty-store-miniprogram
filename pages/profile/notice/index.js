Page({
  data: {
    notices: [
      {
        id: 1,
        content: '此小程序为新手所做，有诸多缺点，请将修改意见发至邮箱：contact@example.com；',
        hasLink: true
      },
      {
        id: 2,
        content: '每20积分可抵1元钱；'
      },
      {
        id: 3,
        content: '用积分购买商品时，积分所抵用的金额不再加入积分中；'
      },
      {
        id: 4,
        content: '商品配送服务仅支持凉州市区内，其余地方需要用快递发货，请注意查收；'
      },
      {
        id: 5,
        content: '有任何问题可在“我的”页面中联系客服，请使用电话或添加微信联系人（搜索手机号即可）联系客服'
      },
      {
        id: 6,
        content: '本程序中积分的发放与使用只与商品系列有关，与服务有关积分请咨询客服'
      },
      {
        id: 7,
        content: '由于微信支付限制，不能支付0元订单，所以最大抵用积分为“抵用后为0元订单的低分 - 1”'
      },
      {
        id: 8,
        content: '邀请码每位用户只能在第一次注册登录时填写，后续填写或修改均无效'
      }
    ],
    indices: ['①', '②', '③', '④', '⑤', '⑥','⑦','⑧']
  },

  // 复制邮箱
  copyEmail() {
    wx.setClipboardData({
      data: 'contact@example.com',
      success: function () {
        wx.showToast({
          title: '邮箱已复制',
          icon: 'success'
        });
      }
    });
  }
})
