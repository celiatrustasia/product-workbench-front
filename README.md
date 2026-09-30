# 产品工作台

面向产品、研发和测试团队的协作工作台。React + TypeScript + Ant Design 前端，Express REST 后端，MySQL 8.4 数据库。前后端源码独立，生产环境域名为 [celiawang.fun](https://celiawang.fun)，使用云 MySQL 的独立库 `friend_product_workbench`；本地应用连接同一数据库。

## 本地运行

需要 Node.js 24 LTS。首次安装执行 `npm ci` 与 `npm --prefix server ci`。根据 `server/.env.example` 配置私有 `server/.env`，SSH 密钥、known_hosts 和数据库密码文件放在仓库外。

```bash
npm run start:local
```

访问 `http://127.0.0.1:5174/`。也可在 Finder 中双击 `启动本地预览.command`，启动数据库隧道、后端和前端后自动打开页面。服务后台运行，不需要保持终端窗口打开。停止前后端用 `npm run stop:local` 或双击 `停止本地服务.command`；隧道可能供其他程序使用，不会自动结束。

默认管理员 `celia`。随机临时密码保存在首次初始化机器的 `server/.runtime/bootstrap-admin.txt`，不提交 Git，不输出到日志，首次登录必须改密。新成员由管理员创建，并获得一次性显示的临时密码；重置密码会使已有会话失效。

## 功能

工作台汇总全部状态的本周重点需求/任务，三个页签为本周重点、我负责的、我参与的。临期列表随左侧高度延展，超出时分页。需求与任务支持列表/看板、状态多选、关注是/否及来源筛选、R00001/T00001 编号、北京时间完整日期、关联需求、一个负责人及多个参与人、截止日期和里程碑。

需求/任务及平台/人员/字典支持编辑和删除，引用保护、最后管理员保护及操作权限均在后端校验。平台和字典支持拖拽排序。已完成/上线时间由后端维护。

描述可粘贴图片并预览；图片与附件均可上传、下载和移除，保存在云 MySQL，刷新及切换浏览器后可继续查看。单文件 1 MB，每类 12 个。支持分派/变更提醒、定时到期提醒、个人已读状态、并发版本冲突保护和操作审计。

## 离线界面预览

双击 `产品工作台-直接打开.html` 可使用浏览器本地的演示数据，预览账号 `celia/demo1234` 或 `chenyi/demo1234`。离线模式不连接云库，不是真实登录，不能多人同步。历史本地演示数据保持独立，不自动导入云库。

通过 HTTP 访问默认进入真实 API 模式；`npm run dev:preview` 可单独运行演示模式。源码 `index.html` 不是可双击执行的文件；直接打开请用已打包 HTML。

## 验证和构建

```bash
npm test
npm --prefix server test
npm run build
cd server
RUN_MYSQL_TESTS=1 node --env-file=.env --test test/*.test.mjs
```

云集成测试使用随机独立测试数据库，覆盖认证、权限、附件、版本冲突、并发编号、管理增删改排序、通知、归档及删除，结束仅清理本次测试库。构建更新 `dist/` 和独立 HTML；前后端完整发布包不应包含 `.env`、`.runtime`、密钥或 `node_modules`。

当前功能需求见 [PRD](docs/产品工作台_PRD.md)，接口约定见 [API](docs/API.md)，上线步骤见 [部署说明](docs/部署说明.md) 和 `deploy/`。
