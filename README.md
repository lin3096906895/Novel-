# 阅界小说平台

原创小说阅读平台 monorepo，包含用户端、管理端、后端 API 和共享包。项目参考主流网文产品的通用业务能力，不复刻第三方品牌、素材或专有界面。

## 技术栈

- 用户端：React、Vite、TypeScript
- 管理端：React、Vite、TypeScript、Ant Design
- 后端：NestJS、TypeScript、Prisma
- 数据库：PostgreSQL
- 本地编排：Docker Compose

## 目录结构

```txt
apps/
  web/       用户端
  admin/     管理端
  server/    后端 API
packages/
  shared/    公共类型
```

## 本地环境

当前必须运行的 Docker 服务只有 PostgreSQL。Redis 尚未被代码使用，不需要启动。

```powershell
corepack pnpm install
corepack pnpm db:up
corepack pnpm --filter @novel/server prisma:generate
corepack pnpm prisma:migrate --name init
corepack pnpm --dir apps/server prisma:seed
corepack pnpm dev
```

默认端口：

- 用户端：http://localhost:5300
- 管理端：http://localhost:5301
- 后端 API：http://localhost:3000/api
- PostgreSQL：localhost:15432

种子账号：

```txt
管理员：admin@novel.local / Admin123456
作者：author@novel.local / Admin123456
```

## 已实现功能

- 账号注册、登录、角色权限与账号封禁；30 分钟访问令牌、30 天轮换刷新令牌和数据库会话鉴权
- 账号安全：退出登录、修改密码、撤销其他会话、设备列表与远程退出；账号封禁和改密会撤销关联会话
- 两步验证：支持验证器应用 TOTP、二维码/手动密钥绑定、一次性恢复码、恢复码轮换和安全关闭；登录挑战 5 分钟有效且最多尝试 5 次
- 账号注销：当前密码与两步验证二次确认、7 天冷静期和随时取消；到期自动清理个人阅读数据、会话及未公开作品，公开作品和评论保留并匿名化
- 个人数据导出：通过当前密码和可选两步验证确认身份，下载带版本号的 UTF-8 JSON，覆盖账号、创作、阅读、互动、安全活动等本人数据且排除认证机密
- 密码找回：6 位邮箱验证码、10 分钟有效期、60 秒重发限制、5 次尝试上限；重置成功后撤销全部会话
- 邮箱安全：注册邮箱验证码、登录后验证新邮箱并修改登录邮箱；改邮箱时校验当前密码并撤销其他会话
- 登录提醒：首次使用新的浏览器设备登录时发送站内通知，并尝试投递提醒邮件；同一设备不重复提醒
- 登录历史：记录成功与失败登录的时间、设备、网络地址、失败原因和风险等级，用户可在设置页分页查看自己的安全活动
- 邮件投递：开发环境控制台投递与本地验证码，生产环境可通过 Resend API 发送邮件
- 作品分类、标签、列表、搜索、筛选与排序
- 搜索历史、全站热搜、作品/作者/标签联想，关键词可匹配作品标签
- 作品详情、章节目录、章节阅读、上一章与下一章
- 移动端与无障碍基础体验：紧凑响应式导航、跳过导航入口、页面级标题与主内容地标、路由切换回顶和聚焦、键盘焦点样式、筛选状态语义及减少动画偏好
- 浏览器端关键路径回归：自动验证作者申诉工作台、管理端内容安全统计与申诉审核队列；自动化会话和登录记录在测试结束后清理
- 书架、阅读历史、跨设备阅读进度、阅读偏好同步、章节书签、评论及评论分页
- 阅读批注、作品评论、章节评论、段落评论、回复、点赞和举报；普通评论与段评均支持后台单条/批量处置
- 作品评分：公开展示 1 至 5 星平均分、评分人数和分布，登录用户可提交、修改或取消自己的评分
- 普通评论互动：作品书评和章节讨论支持一级回复、评论点赞、作者标识；删除已有回复的根评论时保留讨论上下文
- 举报统计：管理端支持 7/14/30 天新增、处理结果、处理率、平均处理时长、原因分布和每日趋势，并展示当前待处理积压
- 榜单中心：热读榜、收藏榜、评论榜、新书榜，支持日榜、周榜、月榜和总榜
- 真实榜单统计：热读榜按完成章节次数计算，收藏榜和评论榜按周期内新增记录计算
- 首页推荐位读取与后台配置
- 个性化推荐：根据阅读历史、书架分类和标签偏好排序，并展示推荐理由；新用户回退到近期活跃作品
- 本地封面上传与读取
- 作者入驻：读者提交申请、待审状态展示、驳回原因与原记录修改重提、后台筛选和分页审核
- 作者身份激活：审核通过后升级账号角色、创建作者资料、发送站内通知并记录管理员审计日志
- 作者资料维护：作者可在工作台修改笔名和简介，当前访问令牌会按数据库角色立即获得写作权限
- 作者工作台：创建和编辑作品、创建和编辑章节、驳回原因展示、重新提交审核
- 作品分卷：创建、重命名、排序和安全删除分卷，章节可在创建、编辑或列表中调整所属卷
- 分卷目录：已有作品自动迁移到默认“正文”卷，作品详情和阅读器目录展示章节所属分卷
- 作品与章节草稿：手动保存、继续编辑、1.2 秒自动保存、提交审核前完整性校验；章节自动保存快照按十分钟节流并自动去重
- 章节定时发布：作者可在创建、编辑或独立调度接口中设置发布时间；审核通过后按计划自动公开，并同步作品字数和订阅通知
- 作品公告：作者可保存公告草稿、发布、撤回、置顶、编辑和删除；已发布公告展示在作品详情，并通知开启更新提醒的书架用户
- 创作日历：按月汇总写作/修订/提醒计划、章节计划发布时间和实际发布时间，支持计划创建、编辑、完成和删除
- 作品生命周期：删除草稿/驳回作品、连载作品设为完结、完结后恢复连载
- 作者数据中心：作品、章节、发布字数、收藏和评论概览，7/14/30 天趋势与作品表现
- 用户互动：昵称资料编辑、我的评论分页与删除、审核/评论站内通知、未读筛选与批量已读
- 章节管理：草稿/驳回章节上下移动、事务重排、单章/批量软删除、删除后二次确认和序号压紧；回收站支持恢复与永久删除
- 章节版本历史：保留手动保存、自动保存、提交审核和恢复前快照，作者可查看正文预览并将历史版本恢复为当前草稿
- 公开作者主页：展示笔名、简介、公开作品、累计字数、章节数、收藏和关注者数据，作品详情与搜索联想可直达作者主页
- 作者关注：登录用户可关注/取消关注作者，重复关注保持幂等，并在“我的关注”页面查看作者及最近公开作品
- 管理端作品审核、章节审核、作品管理、用户角色与封禁管理、评论删除、审计日志；统一评论举报工作区支持来源/状态/关键词筛选、服务端分页、批量处置和删除后快照保留
- 敏感词规则：后台按全局、作品、章节和评论范围维护规则；作者草稿可保存，提交审核和用户发表评论时执行拦截
- 用户端设置页：账号资料、密码修改、登录设备管理、阅读统计、历史、批注、段评和评论管理

## 常用命令

```powershell
corepack pnpm --dir apps/server exec prisma migrate status
corepack pnpm --filter @novel/server lint
corepack pnpm --filter @novel/web lint
corepack pnpm test
corepack pnpm test:functional
corepack pnpm test:e2e
corepack pnpm build
```

## 主要页面

- 书城：http://localhost:5300
- 榜单：http://localhost:5300/rankings
- 作品详情：http://localhost:5300/novels/seed_novel_star_pact
- 登录与注册：http://localhost:5300/login
- 作者工作台：http://localhost:5300/author
- 书架：http://localhost:5300/bookshelf
- 设置：http://localhost:5300/settings
- 管理端：http://localhost:5301

## 作者作品与章节接口

```txt
GET    /api/author/onboarding
POST   /api/author/onboarding
PATCH  /api/author/profile
GET    /api/author/novels
GET    /api/author/dashboard?days=14
POST   /api/author/novels/:novelId/volumes
PATCH  /api/author/volumes/:volumeId
DELETE /api/author/volumes/:volumeId
PUT    /api/author/novels/:novelId/volumes/order
PATCH  /api/author/chapters/:chapterId/volume
DELETE /api/author/novels/:novelId
PATCH  /api/author/novels/:novelId/lifecycle
POST   /api/author/novels/:novelId/chapters
PUT    /api/author/chapters/:chapterId
PATCH  /api/author/chapters/:chapterId/schedule
DELETE /api/author/chapters/:chapterId
GET    /api/author/chapters/:chapterId/versions
POST   /api/author/chapters/:chapterId/versions/:versionId/restore
GET    /api/author/novels/:novelId/chapter-trash
POST   /api/author/chapters/:chapterId/restore
DELETE /api/author/chapters/:chapterId/permanent
PUT    /api/author/novels/:novelId/chapters/order
POST   /api/author/novels/:novelId/chapters/batch-delete
GET    /api/author/novels/:novelId/announcements
POST   /api/author/novels/:novelId/announcements
PATCH  /api/author/announcements/:announcementId
DELETE /api/author/announcements/:announcementId
GET    /api/novels/:novelId/announcements
GET    /api/author/calendar?month=YYYY-MM
POST   /api/author/novels/:novelId/calendar-events
PATCH  /api/author/calendar-events/:eventId
DELETE /api/author/calendar-events/:eventId
GET    /api/authors/:authorId
POST   /api/authors/:authorId/follow
DELETE /api/authors/:authorId/follow
GET    /api/me/followed-authors
```

管理端作者申请接口：

```txt
GET    /api/admin/author-applications
PATCH  /api/admin/author-applications/:applicationId/review
```

用户互动接口：

```txt
PATCH  /api/auth/me
GET    /api/novels/:novelId/rating
PUT    /api/novels/:novelId/rating
DELETE /api/novels/:novelId/rating
GET    /api/novels/:novelId/comments
POST   /api/novels/:novelId/comments
GET    /api/chapters/:chapterId/comments
POST   /api/chapters/:chapterId/comments
PUT    /api/comments/:commentId/like
DELETE /api/comments/:commentId/like
GET    /api/me/comments
DELETE /api/me/comments/:commentId
GET    /api/notifications
PATCH  /api/notifications/:notificationId/read
PATCH  /api/notifications/read-all
```

账号安全接口：

```txt
POST   /api/auth/refresh
POST   /api/auth/logout
PATCH  /api/auth/password
GET    /api/auth/two-factor
POST   /api/auth/two-factor/setup
DELETE /api/auth/two-factor/setup
POST   /api/auth/two-factor/enable
POST   /api/auth/two-factor/login
POST   /api/auth/two-factor/recovery-codes
DELETE /api/auth/two-factor
GET    /api/auth/account-deletion
POST   /api/auth/account-deletion
DELETE /api/auth/account-deletion
POST   /api/auth/data-export
POST   /api/auth/password/forgot
POST   /api/auth/password/reset
POST   /api/auth/register/code
POST   /api/auth/email/change/code
PATCH  /api/auth/email
GET    /api/auth/sessions
GET    /api/auth/login-activities?page=1&pageSize=20
DELETE /api/auth/sessions/others
DELETE /api/auth/sessions/:sessionId
GET    /api/admin/sensitive-words
POST   /api/admin/sensitive-words
PATCH  /api/admin/sensitive-words/:ruleId
DELETE /api/admin/sensitive-words/:ruleId
```

邮件投递配置：

```env
EMAIL_DELIVERY_MODE=console
EMAIL_FROM=阅界 <no-reply@example.com>
TWO_FACTOR_ENCRYPTION_KEY=replace_me_in_real_projects
TWO_FACTOR_RECOVERY_SECRET=replace_me_in_real_projects
# EMAIL_DELIVERY_MODE=resend
# RESEND_API_KEY=re_xxxxxxxxx
```

本地开发默认将验证码输出到 API 控制台，并在接口响应中返回本地验证码；生产环境不会返回验证码。

章节删除和重排仅允许操作草稿或已驳回章节；审核中、待定时发布和已发布章节保持锁定。

## 后续功能优先级

1. 质量保障：关键用户路径浏览器端自动化回归与深度无障碍审计

暂缓事项：异常网络识别、付费章节、会员、订阅、打赏、作者结算、部署网络、监控、缓存和对象存储。
