Page({
  data: {
    name: '',
    id: ''
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ id: options.id });
      this.loadCategory(options.id);
    }
  },

  loadCategory(id) {
    wx.cloud.database().collection('categories').doc(id).get().then(res => {
      this.setData({ name: res.data.name });
    });
  },

  onInput(e) {
    this.setData({ name: e.detail.value });
  },

  save() {
    if (!this.data.name) {
      wx.showToast({ title: '请输入分类名称', icon: 'none' });
      return;
    }

    const db = wx.cloud.database();
    if (this.data.id) {
      db.collection('categories').doc(this.data.id).update({
        data: { name: this.data.name }
      }).then(() => {
        wx.navigateBack();
      });
    } else {
      db.collection('categories').add({
        data: { name: this.data.name, createTime: new Date() }
      }).then(() => {
        wx.navigateBack();
      });
    }
  }
})