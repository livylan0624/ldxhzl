# 课表聚合器（Web 版）

把大学生散落在教务系统、学习通、微信群、邮件里的课程与任务信息，聚合到一条统一的时间轴。

## 功能

- **手动添加课程**：课程名、教师、教室、星期、节次、周次范围（每周/单周/双周）
- **手动添加任务**：任务名、关联课程、截止时间、来源（学习通/邮件/微信群/教务/手动）、备注
- **时间轴视图**：今天 / 明天两个页面，按时间顺序排列
  - 课程 → 蓝色卡片
  - 任务 → 橙色卡片（含倒计时：剩 X 天 / X 小时 / X 分钟）
  - 已完成 → 置灰 + 删除线；逾期未完成 → 红色「已逾期」标签并排在最前
- **数据持久化**：保存在浏览器 localStorage，刷新不丢失，无需数据库

## 技术栈

纯原生 HTML / CSS / JavaScript，零依赖、零构建、零后端，静态部署。

## 数据模型

| 实体 | 字段 |
|------|------|
| 课程 course | name、teacher、classroom、weekday(1-7)、startSection、endSection、weeks{start,end,type} |
| 任务 task | title、courseId、courseName、deadline、source、status(pending/done)、remark |

## 本地运行

直接双击 `index.html` 用浏览器打开即可，或：

```bash
npx serve .
```

## 部署（GitHub + Vercel）

1. 推送到 GitHub：

```bash
git init
git add .
git commit -m "课表聚合器 Web 版"
git branch -M main
git remote add origin https://github.com/你的用户名/kebiao.git
git push -u origin main
```

2. 部署到 Vercel：
   - 打开 [vercel.com](https://vercel.com) → Continue with GitHub 登录
   - Add New Project → Import 该仓库
   - Framework Preset 选 **Other**（纯静态站，不要选 Next.js）
   - Deploy → 约 1 分钟后获得 `xxx.vercel.app` 网址

## 使用说明

1. 打开网页，确认顶部「学期第 1 周的周一」日期正确（用于计算当前周次）
2. 点「+ 添加课程 / 任务」录入数据
3. 时间轴自动按周次、单双周、星期过滤显示对应课程

> 说明：数据存在浏览器 localStorage 中，仅保存在本机；后续版本规划接入云数据库与订阅消息提醒。
