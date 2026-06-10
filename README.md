# AI 发电产业题库刷题网站

本项目是一个本地优先的静态刷题网站，题目以 PDF 版题库为准，已解析为 1000 道题：

- 单选题：450 道
- 多选题：200 道
- 判断题：300 道
- 论述题：50 道

## 本地启动

```bash
npm start
```

启动后终端会显示类似：

```text
http://localhost:4173
http://192.168.x.x:4173
```

电脑端打开 `http://localhost:4173`。

手机端和电脑连接同一个 Wi-Fi 后，打开终端里显示的 `http://192.168.x.x:4173` 地址。

## 像手机 App 一样打开

手机第一次访问局域网地址后，可以添加到主屏幕：

- iPhone Safari：点分享按钮，选择“添加到主屏幕”。
- Android Chrome/Edge：点菜单，选择“添加到主屏幕”或“安装应用”。

添加后，手机桌面会出现“AI 题库”图标，点击图标会以接近 App 的方式打开。

本地局域网模式下，电脑需要保持 `npm start` 服务运行，手机才能稳定访问。若希望手机在不连接电脑、不启动服务的情况下也能完全独立离线使用，推荐后续二选一：

- 部署成 HTTPS PWA，例如放到内网 HTTPS、GitHub Pages、Cloudflare Pages 等静态托管，题库和答题记录仍可保存在手机本地。
- 打包成真正的 iOS/Android App。

## 部署成 HTTPS PWA

PWA 的离线缓存和“安装应用”能力需要 HTTPS，`localhost` 只适合电脑本机开发。同一个 Wi-Fi 下用 `http://192.168.x.x:4173` 可以刷题，但不算完整 HTTPS PWA。

### 方案一：GitHub Pages

适合个人长期使用，免费，部署后会得到一个 `https://用户名.github.io/仓库名/` 地址。

1. 在 GitHub 新建一个仓库，例如 `ai-power-question-bank`。
2. 在本项目目录运行：

```bash
git add .
git commit -m "Create AI question bank PWA"
git branch -M main
git remote add origin https://github.com/你的用户名/ai-power-question-bank.git
git push -u origin main
```

3. 打开 GitHub 仓库页面，进入 `Settings` -> `Pages`。
4. `Build and deployment` 选择 `Deploy from a branch`。
5. `Branch` 选择 `main`，目录选择 `/root`，保存。
6. 等待部署完成，用 GitHub 给出的 HTTPS 地址访问。
7. 手机 Safari/Chrome 打开该 HTTPS 地址后，选择“添加到主屏幕”。

### 方案二：Cloudflare Pages

适合想要更快访问、以后绑定自定义域名，默认也是 HTTPS。

1. 先把项目推到 GitHub。
2. 登录 Cloudflare，进入 `Workers & Pages`。
3. 创建 Pages 项目，连接 GitHub 仓库。
4. Framework preset 选择 `None` 或静态站点。
5. Build command 留空。
6. Output directory 填 `/` 或留空。
7. 部署后打开 Cloudflare 给出的 `https://项目名.pages.dev` 地址。
8. 手机打开该地址并“添加到主屏幕”。

## 使用方式

- 支持顺序练习、随机练习、错题本、收藏。
- 支持按单选、多选、判断、论述筛选。
- 支持搜索题干、选项和答案。
- 客观题提交后自动判分，论述题可先自答再查看参考答案。
- 每题提交或查看参考答案后显示逐选项解析 / 记忆点，便于复盘和记忆。
- 答题记录、错题、收藏、笔记保存在当前设备浏览器本地。
- 通过本地服务器访问后，浏览器会缓存页面和题库，支持离线再次打开。

## 刷新题库

如果 PDF 题库后续更新，运行：

```bash
npm run extract
```

脚本会重新从 PDF 生成：

- `src/questionBank.json`
- `src/questionBank.js`

## 刷新解析

如果“每题每选项解析”Excel 后续更新，运行：

```bash
npm run import:explanations
```

脚本会重新生成：

- `src/explanations.js`

当前解析来源固定为 PDF 文件：

```text
/Volumes/拓展盘一/李宛津工作文件（福源）/竞赛/2026.7 集团人工智能竞赛/题库/附件3：人工智能（发电产业）技能大赛培训题库.pdf
```
