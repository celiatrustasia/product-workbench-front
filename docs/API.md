# 产品工作台 REST API

统一前缀 `/api`，JSON UTF-8。失败返回 `{ "error": { "code": "...", "message": "..." } }`；未登录 401，权限/CSRF 403，不存在 404，冲突 409，首次改密 428，限流 429。

## 登录

`POST /auth/login`：`{ username, password }`，返回 `{ user, csrf }` 并设置会话 Cookie。`GET /auth/me` 查询登录身份及 CSRF。其他写请求需 `X-CSRF-Token`，所有请求携带同源 Cookie；不要把登录 Token 放在 localStorage。

`POST /auth/password`：`{ oldPassword, newPassword }`。新密码 12 至 128 位，包含字母与数字。首次登录必须先完成此操作。`POST /auth/logout` 销毁当前会话。

## 事项

`GET /workspace`：人员、平台、字典、需求、任务、迭代、操作记录及仅属于当前成员的提醒。不包含密码、会话 Token 或附件二进制。

`GET /works/:kind`：返回 `{ items, total, page, pageSize }`，kind 为 `requirement` 或 `task`。支持 `page`、`pageSize`（最多 100）、`search`、`statuses`（逗号分隔）、`platformId`、`priority`、`ownerId`、`archived=true|false|all`、`focus=yes|no`。

`focus` 只按未归档事项的 `manualFocus` 判断，不自动包含临期、逾期或本周时间节点。默认按编号降序、优先级升序、状态阶段升序、手动关注优先排列。

`GET /works/:kind/:id` 查询详情；`POST /works/:kind` 创建；`PUT /works/:kind/:id` 保存完整可编辑字段；更新需携带当前 `revision`，冲突时返回 `VERSION_CONFLICT`，不可无提示覆盖。

公共字段：`title`、`platformId`、`ownerId`、`priority`、`status` 必填；`description`、`participantIds`、`note`、`manualFocus`、`source`、`attachments`、`descriptionImages` 可选。附件数组用 `{ id }` 引用已上传文件。ID、R/T 编号、创建人/时间、更新人/时间及完成时间由服务端生成或维护。

需求附加：`type`、`proposer`、`proposedAt`、`targetAt`。任务附加：`requirementId`、`startedAt`、`dueAt`、`milestones: [{ id, name, plannedAt, completedAt? }]`。日期使用 ISO 格式，显示和无时区输入按北京时间处理。

`PATCH /works/:kind/:id/archive`：`{ archived: boolean }`，仅管理员。`DELETE /works/:kind/:id` 仅管理员，逻辑删除需求时保留关联任务并解除关联。

`PATCH /tasks/:id/milestones/:milestoneId`：`{ completed: boolean, revision: number }`。创建人、负责人、管理员和参与人可更新；参与人不可更改分派和基础信息，仅可改状态、备注、附件和里程碑完成状态。

## 迭代

以下接口均需登录，并遵守现有 CSRF 和 Origin 校验。`GET /iterations` 返回迭代数组；`POST /iterations` 创建，`PUT /iterations/:id` 更新，`DELETE /iterations/:id` 删除。字段：`name`（1–100 字）、`goal`（最多 2000 字）、`startDate/endDate`（有效的 YYYY-MM-DD，结束不早于开始）、`ownerId`、`status`（待开始/进行中/已完成）；更新需携带 `revision`。新迭代从待开始创建，需开始后才能完成。

`POST /iterations/:id/items`：`{items:[{kind:"requirement"|"task",id,revision}],remove?:boolean}`，最多 100 项。默认移入目标迭代并解除旧归属，`remove:true` 从当前迭代移出；整个批次通过权限和版本检查后原子提交，每项的 `revision` 递增。

管理员、迭代创建人或负责人可管理该迭代；移动还需要每个事项的基础编辑权限，跨迭代移动需同时拥有源迭代权限。已完成迭代须重新打开才能调整范围。删除迭代仅解除归属，保留需求、任务和操作记录。

事项返回字段 `iterationId` 为可选；保存时传 ID 可设置归属，传 `null` 可清除，不传则保留已有归属。同样执行迭代权限与完成状态校验。公开 `/youke` 只提供虚构的前端演示，所有 `/api` 业务接口仍需真实登录。

## 基础管理

`POST /platforms|people|dictionaries` 新增；`PUT /:resource/:id` 编辑；`DELETE /:resource/:id` 删除，仅管理员。当前账号和最后一位启用管理员不可删除/停用；历史事项引用的基础记录不可删除。

人员字段：`name, username, role, access, active, color`，角色 产品/研发/测试，权限 管理员/普通成员；平台：`name, description, active`；字典：`name, group, active`，group 为 `requirementType|requirementSource|taskSource`。

`POST /platforms/order`：`{ ids }`。`POST /dictionaries/order`：`{ group, ids }`。省略的有效项追加末尾，分类间顺序独立。

新增成员返回 `{ person, temporaryPassword }`。`POST /people/:id/reset-password` 返回 `{ temporaryPassword }` 并撤销原会话；临时密码仅此次返回，首次登录必须改密，日志和审计不保存密码。管理员本人应使用个人改密。

## 附件和通知

`POST /files`：multipart/form-data 的 `file` 字段，单文件最多 1 MB，返回 `{ id, name, size, mime, dataUrl }`。图片按内容签名检测，不信任扩展名；HTML/SVG 不以内联方式显示。

`GET /files/:id`：带会话下载或查看图片，草稿只有上传人可读，绑定事项后团队成员可读；已删除事项文件不可访问。`DELETE /files/:id` 仅删除自己尚未绑定的草稿附件。

`GET /notices` 返回当前成员提醒。`PATCH /notices/:id/read` 标记单条，`PATCH /notices/read` 全部已读，只更新当前成员。

`GET /audit` 仅管理员，查看最近 500 条安全审计。`GET /health` 不需要登录，用于可用性检查。

## AI 助手

- `GET /api/assistant/config`：读取是否已配置、服务商及模型信息；所有登录成员可用，不返回 Key。
- `PUT /api/assistant/config`：管理员设置 `{provider, model, baseUrl, apiKey}`，调用模型测试连接后保存。Key 留空时仅允许保留同一服务商原有 Key；环境变量配置模式为只读。
- `POST /api/assistant/messages`：提交 `{requestId, message, history}`。`requestId` 为 UUID，消息最多 4000 字，history 最多 12 条 `{role:"user"|"assistant",content}`。返回 `{reply,created:[{kind,id,code,title,status,priority,platformId,ownerId,participantIds,manualFocus,dueAt}]}`。

所有接口沿用会话与 CSRF 校验。创建结果在同一 MySQL 事务中保存，缺少目录字段时返回追问及空 created 数组。同一成员重复提交相同 UUID 和消息返回原结果；同 UUID 修改消息返回 409，仍在处理中返回 409 `AI_PENDING`，未配置返回 503 `AI_NOT_CONFIGURED`。每位成员每分钟最多 10 次创建或配置请求。
