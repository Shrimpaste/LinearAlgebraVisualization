# 部署手册

基域是纯静态 Vite 应用。GitHub Actions 构建 `dist/`，再通过官方 Pages artifact 与 OIDC 部署；仓库不保存构建产物，也不需要长期部署密钥。

## 自动发布流程

`.github/workflows/pages.yml` 在以下情况触发：

- 向 `main` 推送提交；
- 在 GitHub Actions 页面手动运行 `deploy-pages`。

工作流使用 Node.js 22 和锁文件安装依赖，安装 Chromium 并执行 `npm run verify:full` 后上传 `dist/`。这意味着 Playwright 桌面/移动验收失败时不会部署。部署作业只消费构建作业生成的 artifact，并将实际 URL 写入 `github-pages` environment。并发组会让已有部署完成后再处理后续提交，避免中途取消线上发布。

部署不使用仓库 secrets，也不访问外部运行时 API。`dist/` 中包含便于线上诊断的公开 sourcemap；源代码和构建配置不得包含凭据。Pages artifact 只服务本次工作流，不作为长期回滚包，Git 提交是唯一发布来源。

权限按作业隔离为 GitHub Pages 官方流程需要的最小集合：

- 构建作业使用 `contents: read` 检出源代码、`pages: read` 读取站点配置；
- 部署作业使用 `pages: write` 创建 deployment、`id-token: write` 签发 OIDC token；
- 工作流顶层关闭其他默认权限，构建步骤不能创建部署或签发部署身份。

## 首次启用

1. 在仓库的 **Settings → Pages** 中将 **Build and deployment → Source** 设为 **GitHub Actions**。
2. 确认默认分支为 `main`，且 Actions 可以读取仓库内容并创建 Pages deployment。
3. 推送到 `main`，或在 **Actions → deploy-pages → Run workflow** 手动触发。
4. 等待 `Build static site` 与 `Deploy to GitHub Pages` 两个作业成功。
5. 从工作流摘要的 `github-pages` environment 打开部署地址。

本仓库的标准地址为：

```text
https://shrimpaste.github.io/LinearAlgebraVisualization/
```

Pages 首次开通后 DNS 与 CDN 传播可能需要数分钟。工作流成功但地址暂时返回 404 时，应先等待并重新加载，而不是立即重复部署。

每次部署在 Actions 与 `github-pages` environment 中记录源提交 SHA。线上验收通过后，需要正式版本时再为同一提交创建 tag；tag 本身不会触发第二次部署。

## 本地发布前检查

```bash
npm ci
npx playwright install chromium
npm run verify:full
npm run preview
```

打开 Vite 输出的本地预览地址，确认五个 hash 场景、主题切换、动画、输入、拖动与 PNG 导出工作正常。构建后的 `dist/index.html` 应引用 `./assets/...`，确保项目页子路径不被解析为站点根路径。

部署成功后执行一次线上 smoke test：

1. 打开标准地址，确认页面和 Canvas 非空且浏览器控制台无错误。
2. 依次访问 `#span`、`#transform`、`#eigen`、`#inner-product`、`#determinant`。
3. 修改一个数值、播放一次动画、切换主题并刷新，确认 hash 与本地状态恢复。
4. 在移动视口检查导航、画布尺寸与控制面板，并确认 Network 中脚本、样式和字体均为 200。

## 手动重发

自动部署失败或 GitHub Pages 短暂不可用时：

1. 打开 **Actions → deploy-pages**。
2. 选择 **Run workflow**，分支保持 `main`。
3. 查看失败步骤日志；不要在没有新证据时连续重试。

手动触发仍然执行同一构建和质量门禁，不存在绕过验证的发布通道。工作流只接受 `main` 引用；从其他分支手动运行会跳过构建和部署。

## 回滚

Pages 部署与 Git 提交一一对应。先在 **Deployments → github-pages** 或最近一次成功工作流中找到已知良好的源 SHA，再根据坏改动的合并方式创建回退：

```bash
# 回退一个普通提交或 squash-merged PR
git revert <commit-sha>

# 回退以 main 为第一父级的 merge commit
git revert -m 1 <merge-commit-sha>

# 连续多个提交：先创建全部回退，再一次提交
git revert --no-commit <oldest-bad-sha>^..<newest-bad-sha>
git commit -m "Revert to known-good deployment"

npm ci
npx playwright install chromium
npm run verify:full
git push origin main
```

先在本地检查回退 diff 并通过完整验收；团队仓库应通过紧急 Pull Request 合并回退，只有直接维护者流程才推送 `main`。新的工作流会重新构建并部署回退后的代码，同时保留完整历史。不要强制推送、重置 `main` 或直接覆盖 Pages artifact。

场景状态保存在 `basis-lab:*` localStorage 键中，目前没有 schema 迁移。如果回滚跨越了状态结构变化，应在发布说明中要求用户使用场景的复位操作；仍异常时，可在该站点的浏览器控制台执行：

```js
Object.keys(localStorage)
  .filter((key) => key.startsWith("basis-lab:"))
  .forEach((key) => localStorage.removeItem(key));
location.reload();
```

回滚部署完成后重复线上 smoke test，并在 Actions 中确认 environment 指向回退提交。

## 故障排查

### 工作流没有启动

- 确认提交已进入 `main`，或使用 `workflow_dispatch` 手动触发。
- 确认 `.github/workflows/pages.yml` 存在于默认分支且 YAML 语法有效。
- 在仓库 Actions 设置中确认 Actions 未被禁用。

### `npm ci` 失败

- 确认 `package.json` 与 `package-lock.json` 同步提交。
- 使用 Node.js 22 在本地重新运行 `npm ci`，只在确实调整依赖时更新锁文件。

### Playwright 无法启动浏览器

- 本地先运行 `npx playwright install chromium`，Linux 使用 `--with-deps`。
- 失败后查看终端、`playwright-report/` 和 `test-results/` 中保留的 trace 与截图。

### Pages 配置或部署权限失败

- 确认 Pages Source 为 **GitHub Actions**。
- 确认工作流保留 `pages: write` 与 `id-token: write`。
- 如果 `github-pages` environment 配置了保护规则，确认当前分支满足规则或审批已完成。

### 页面空白或静态资源 404

- 检查 `vite.config.ts` 的 `base` 是否仍为 `"./"`。
- 检查 `dist/index.html` 是否使用相对资源 URL。
- 不要直接打开本地 `dist/index.html` 判断模块加载；使用 `npm run preview` 或静态 HTTP 服务。
- 资源文件名带内容 hash，通常不会命中旧资源；如果 `index.html` 仍来自 CDN 缓存，等待数分钟后强制刷新。

### 刷新后场景不一致

应用使用 URL hash 选择场景，不依赖服务端路由回退。确认地址形如 `/#transform`，并检查浏览器是否禁用了 localStorage。清除站点数据可恢复全部场景默认值。

### Canvas 空白或 PNG 无法导出

- 记录浏览器名称与版本、完整 URL/hash、部署提交 SHA、控制台错误及失败输入。
- 在无扩展的当前稳定版浏览器重试，并检查 Canvas 是否被隐私扩展或下载策略阻止。
- 用相同输入运行本地 `npm run preview`；若可复现，附上 Playwright trace 和截图提交 issue。

## 其他静态托管

`dist/` 不依赖 GitHub Pages API，可上传到任意静态文件服务。保留相对资源路径，并将站点入口指向 `index.html`；由于路由位于 hash 中，不需要额外的 SPA rewrite 规则。
