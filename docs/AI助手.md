# AI 助手

右下角提供聊天入口。成员用自然语言描述需求或任务，助手读取已启用的平台、人员、字典和已有需求，信息完整后直接创建；缺少平台、人员不唯一或日期有歧义时追问。支持多轮补充、每次最多 10 条，以及同批创建需求和关联任务。

未指定负责人时使用当前成员，优先级默认 P2，需求初始状态为待评估、任务为待处理；关注默认关闭。未指定日期则不填，明确指定日期但未指定时刻时默认北京时间 17:00，并在回复说明。创建结果显示编号、名称、平台、负责人及详情链接，列表会刷新。

当前助手只负责新增，不修改、删除已有事项，也不新增平台或人员。不提供附件上传及通用联网搜索。离线 HTML 预览显示助手入口，实际调用在在线系统中进行。

## 开源组件调研

调研日期：2026-10-10。

| 方案 | 许可证 | 在本项目中的用途 |
| --- | --- | --- |
| [Ant Design X](https://github.com/ant-design/x) | MIT | 已采用 2.9.0 的 Bubble、Sender，兼容现有 React 19 / Ant Design 6。 |
| [assistant-ui](https://github.com/assistant-ui/assistant-ui) | MIT | 另一套 React 聊天界面，适合深度定制；本项目无需引入第二套聊天 UI。 |
| [AI SDK](https://ai-sdk.dev/providers/openai-compatible-providers) | Apache-2.0 | 可统一接入多个服务商，本次 Express 后端直接调用服务商接口，无需新增这层依赖。 |

开源组件负责对话界面，不自带模型或免费模型额度。当前支持 DeepSeek、阿里云百炼的通义千问、OpenAI，需要对应服务商的 API Key，调用费用由服务商按用量收取。自建开放模型需要另外部署推理服务，当前版本不包含此项。

## 管理员配置

1. 登录在线系统，打开右下角 AI 助手。
2. 点击助手右上角齿轮，选择模型服务。
3. 输入模型名称、服务商官方接口地址和 API Key，点击“测试连接并保存”。
4. 连接成功后全体成员可使用。更换服务商需填写新 Key，同一服务商留空可保留已保存 Key。

默认选项为 DeepSeek `deepseek-flash`、通义千问 `qwen-plus` 或 OpenAI `gpt-4.1-mini`。模型名称可修改，所选模型需支持相应接口及 JSON 模式。实际可用模型和余额以自己的服务商账号为准。接口地址限制为对应服务商官方 HTTPS 地址；阿里云支持官方兼容接口及其工作空间域名。

OpenAI 接口地址为 `https://api.openai.com/v1`，后端调用 Responses API，设置 `text.format.type=json_object` 和 `store=false`，使用已完成的助手消息解析创建信息；不完整、拒绝或无效 JSON 不会创建事项。默认使用低延迟的 `gpt-4.1-mini`。管理员需在 [OpenAI 平台](https://platform.openai.com/api-keys) 创建 API Key；ChatGPT / Codex 登录凭据和会员额度不能代替此 Key，API 单独计费。连接、权限或余额检查不通过时不保存新配置，原配置继续保留。

服务商官方说明：[DeepSeek API](https://api-docs.deepseek.com/)、[DeepSeek JSON 模式](https://api-docs.deepseek.com/guides/json_mode/)、[通义千问兼容接口](https://help.aliyun.com/zh/model-studio/qwen-api-via-openai-chat-completions)。

OpenAI 官方说明：[Responses API](https://developers.openai.com/api/docs/guides/migrate-to-responses)、[JSON 模式](https://developers.openai.com/api/docs/guides/structured-outputs#json-mode)、[GPT-4.1 Mini](https://developers.openai.com/api/docs/models/gpt-4.1-mini)、[Codex 登录与 API 计费](https://developers.openai.com/codex/auth/)。

Key 不返回浏览器、不写入前端、不提交 GitHub。服务端配置文件权限为 600，生产路径为 `/var/lib/product-workbench/ai-config.json`，由 `AI_CONFIG_FILE` 指定。也可配置 `AI_PROVIDER`、`AI_MODEL`、`AI_BASE_URL`、`AI_API_KEY` 环境变量，启用后界面配置只读。

## 创建和验证

前端只传用户消息、最近 12 条对话及请求 UUID。后端请求模型输出 JSON，校验字段和目录后，使用原有创建函数完成权限校验、编号生成、关联、通知和操作记录。最多 10 条在同一 MySQL 事务中提交，任意一条失败则全部回滚。保存前复核账号和会话；模型不能自定义编号、创建人、附件或权限。

请求 UUID 与成员绑定并保存在 MySQL，重复发送同一 UUID 返回已保存结果；同 UUID 更换消息会被拒绝。连接中断时使用“重试这条消息”，不要重新复制发送，以免产生两次独立的创建请求。每位成员每分钟最多 10 次助手请求。

自动测试使用模拟模型 JSON 验证默认值、目录校验、关联创建、批量回滚和重试去重。真实模型连通性由管理员配置时验证；未配置 Key 时系统不会伪造 AI 回复或创建数据。
