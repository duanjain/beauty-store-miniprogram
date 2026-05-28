# Beauty Store Mini Program

一个基于微信小程序原生框架和微信云开发的美妆商城与服务预约项目。项目覆盖商品浏览、购物车、订单支付、服务预约、会员积分、地址管理和管理员后台等常见业务流程，适合作为微信小程序电商/预约类项目的学习与二次开发参考。

> 本仓库为开源脱敏版本，不包含真实小程序 AppID、云开发环境 ID、商户号、支付密钥、证书、OpenID、云存储私有链接或模型文件。

## 功能特性

- 商品模块：商品列表、分类筛选、商品详情、商品新增/编辑/删除、上下架管理。
- 购物车与订单：加入购物车、订单创建、订单列表、订单详情、订单状态更新。
- 微信支付：云函数统一下单、订单查询、退款逻辑、服务端金额校验。
- 服务预约：服务列表、预约下单、不可用时间段查询、预约状态管理。
- 用户中心：静默登录、资料更新、手机号、收货地址、积分与积分明细。
- 管理后台：基于用户角色的商品、服务、订单、预约和用户管理。
- 云托管推理服务：`cloudhosting/skin-infer` 提供一个 Node.js 图像推理服务骨架，可自行放置 ONNX 模型。

## 技术栈

- 微信小程序原生开发：WXML、WXSS、JavaScript、JSON
- 微信云开发：云函数、云数据库、云存储、云调用
- Node.js：云函数与云托管服务
- Express / Sharp / ONNX Runtime：云托管图像推理服务

## 目录结构

```text
.
├── app.js / app.json / app.wxss        # 小程序全局入口与配置
├── config.example.js                   # 前端配置模板
├── project.config.json                 # 微信开发者工具项目配置，占位 AppID
├── cloudfunctions/                     # 云函数
│   ├── login/                          # 登录注册与角色判断
│   ├── pay/                            # 微信支付、订单查询、退款
│   ├── productAdd/ productUpdate/ ...  # 商品管理
│   ├── serviceAdd/ serviceUpdate/ ...  # 服务管理
│   ├── appointmentList/ appointmentUpdate/
│   └── getAddressFromCoords/           # 腾讯地图逆地址解析
├── cloudhosting/
│   └── skin-infer/                     # 云托管图像推理服务
├── images/                             # 本地图标资源
├── pages/                              # 小程序页面
│   ├── index/                          # 首页
│   ├── product/                        # 商品相关页面
│   ├── service/                        # 服务相关页面
│   ├── appointment/                    # 预约页面
│   ├── cart/                           # 购物车
│   ├── order/                          # 订单
│   ├── profile/                        # 个人中心
│   └── user/                           # 用户/积分管理
└── utils/                              # 工具函数
```

## 开始使用

### 1. 克隆项目

```bash
git clone <your-repo-url>
cd merged-miniprogram
```

### 2. 创建本地配置

复制配置模板：

```bash
cp config.example.js config.js
```

Windows PowerShell 可使用：

```powershell
Copy-Item config.example.js config.js
```

然后修改 `config.js`：

```js
const config = {
  cloudEnvId: 'YOUR_CLOUDBASE_ENV_ID',
  pageSize: 10,
  pay: {
    currency: 'CNY'
  },
  adminOpenIds: [],
  cloudHosting: {
    skinInferService: 'YOUR_CLOUDHOSTING_SERVICE',
    skinInferPath: '/infer',
    resourceEnv: '',
    resourceAppid: ''
  }
}

module.exports = config
```

`config.js` 已加入 `.gitignore`，请不要提交真实环境配置。

### 3. 修改小程序 AppID

打开 `project.config.json`，将：

```json
"appid": "YOUR_APPID"
```

替换为你自己的微信小程序 AppID。公开仓库中请保留占位值。

### 4. 使用微信开发者工具导入

1. 打开微信开发者工具。
2. 选择“导入项目”。
3. 项目目录选择本仓库根目录。
4. AppID 使用你自己的小程序 AppID。
5. 云开发环境选择或创建自己的环境。

## 云函数配置

云函数位于 `cloudfunctions/`。部署前需要在微信开发者工具中逐个上传并部署云函数，或按你的 CI/CD 流程部署。

### 必需/可选环境变量

支付相关，供 `cloudfunctions/pay` 使用：

| 变量名 | 说明 |
| --- | --- |
| `WX_APPID` | 小程序 AppID |
| `WX_MCH_ID` | 微信支付商户号 |
| `WX_PAY_KEY` | 微信支付 API Key |
| `WX_NOTIFY_URL` | 支付回调地址，可选 |
| `WX_REFUND_NOTIFY_URL` | 退款回调地址，可选 |
| `WX_PAY_CERT_FILEID` | 商户证书在云存储中的 FileID，可选 |
| `WX_PAY_KEY_FILEID` | 商户私钥在云存储中的 FileID，可选 |
| `INTERNAL_SECRET` | 内部系统调用鉴权密钥，可选但建议配置 |

权限相关，供 `cloudfunctions/login` 使用：

| 变量名 | 说明 |
| --- | --- |
| `ADMIN_OPENIDS` | 管理员 OpenID 列表，多个值用英文逗号分隔 |

地图相关，供 `cloudfunctions/getAddressFromCoords` 使用：

| 变量名 | 说明 |
| --- | --- |
| `TENCENT_MAP_KEY` | 腾讯地图 WebService Key |

请在云函数控制台或部署配置中设置以上变量，不要写入源码。

## 云托管图像推理服务

`cloudhosting/skin-infer` 是一个独立的 Node.js 服务，用于接收图片 URL 并调用 ONNX 模型进行推理。

本仓库不包含模型文件。你需要自行放置模型：

```text
cloudhosting/skin-infer/model/best.onnx
```

或通过环境变量指定：

| 变量名 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `80` | 服务端口 |
| `INPUT_SIZE` | `640` | 模型输入尺寸 |
| `CONF_THRESHOLD` | `0.25` | 置信度阈值 |
| `IOU_THRESHOLD` | `0.45` | NMS IOU 阈值 |
| `MODEL_PATH` | `model/best.onnx` | 模型路径 |

本地调试：

```bash
cd cloudhosting/skin-infer
npm install
npm start
```

## 数据库集合参考

项目使用微信云数据库，主要集合包括：

| 集合名 | 说明 |
| --- | --- |
| `users` | 用户资料、角色、积分、邀请码 |
| `products` | 商品信息、价格、库存、图片、分类 |
| `categories` | 商品分类 |
| `cart` | 购物车 |
| `orders` | 商品订单 |
| `appointments` | 服务预约 |
| `services` | 服务项目 |
| `addresses` | 收货地址 |
| `pointsLogs` | 积分流水 |

实际字段请以云函数读写逻辑为准。生产环境中请配置云数据库安全规则，限制普通用户只能访问自己的数据，管理员操作应通过云函数鉴权。

## 安全与脱敏说明

本开源版本已做以下处理：

- `project.config.json` 中的小程序 AppID 使用 `YOUR_APPID` 占位。
- `config.js` 已加入 `.gitignore`，仓库只保留 `config.example.js`。
- 微信支付商户号、支付 Key、证书、内部密钥均通过环境变量配置。
- 管理员 OpenID 通过 `ADMIN_OPENIDS` 环境变量配置。
- 腾讯地图 Key 通过 `TENCENT_MAP_KEY` 环境变量配置。
- 商户证书、私钥、`.env`、私有配置、模型文件、压缩包和导出文档均已加入 `.gitignore`。
- 示例联系方式使用占位值，不包含真实手机号或真实邮箱。

发布前建议再次检查：

```bash
git status --short
```

确认没有提交以下文件：

```text
config.js
.env
project.private.config.json
*.pem
*.key
*.p12
*.pfx
*.onnx
*.zip
*.docx
*.pdf
```

如果某个敏感文件曾经被 Git 跟踪过，需要先移出暂存区：

```bash
git rm --cached <file>
```

如果敏感信息已经进入历史提交，应更换对应密钥，并使用专门工具清理 Git 历史。

## 常见问题

### 为什么启动时报找不到 `./config`？

请先复制 `config.example.js` 为 `config.js`，并填写自己的云开发环境 ID。

### 为什么支付不可用？

支付需要配置微信支付商户号、API Key、证书和回调地址。开源版本不包含任何真实支付凭据。

### 为什么管理员入口不可见？

管理员权限由云函数根据 `ADMIN_OPENIDS` 判断。请在云函数环境变量中配置管理员 OpenID，并重新部署 `login` 云函数。

### 为什么皮肤检测/图像推理不可用？

开源版本不包含 ONNX 模型文件。请自行准备模型，并放到 `cloudhosting/skin-infer/model/` 或设置 `MODEL_PATH`。

## 开源许可

MIT License © 2024 王嘉卫
