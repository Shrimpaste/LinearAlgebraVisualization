# 贡献指南

感谢参与基域的开发。仓库以正确的数学语义、稳定的直接操作和清晰的分层为合并标准；新增功能应作为完整工作流交付，而不是孤立的界面演示。

## 开发环境

- Node.js 20 或更高版本，推荐 Node.js 22。
- npm 10 或更高版本。
- 当前稳定版 Chromium，用于端到端验收。

```bash
git clone https://github.com/Shrimpaste/LinearAlgebraVisualization.git
cd LinearAlgebraVisualization
npm ci
npx playwright install chromium
npm run dev
```

项目没有 `.env`、后端服务或外部 API 前置条件。Linux 环境可运行 `npx playwright install --with-deps chromium` 安装浏览器及系统依赖。请使用 `npm ci` 复现锁定依赖；只有在主动调整依赖时才运行 `npm install` 并提交对应的 `package-lock.json`。

Vite 开发端口默认为 5173，Playwright 生产预览端口默认为 4173。端口被占用时，先结束占用进程；仅手动预览时也可运行 `npm run preview -- --port 4174`，但自动化验收仍使用 4173。

## 开发约定

1. 从最新 `main` 创建短生命周期分支，例如 `feat/vector-projection` 或 `fix/singular-basis`。
2. 保持提交聚焦且可独立审查；提交信息使用祈使语气说明行为变化。
3. 修改数学或引擎逻辑时先补充边界测试，修改用户工作流时补充 Playwright 验收。
4. 提交前运行 `npm run format` 和 `npm run verify:full`。
5. Pull Request 说明应包含行为变化、测试结果、关联 issue，以及界面改动的桌面/移动截图。

不要提交 `dist/`、测试报告、覆盖率目录或本地环境文件；这些内容已由 `.gitignore` 排除。

## 架构边界

- `src/math` 只放无浏览器依赖的纯计算，不读取 React、DOM、Canvas 或 Three.js 状态；`src/math/nd` 使用 JSON 可序列化的 1–3 维实/复 DTO。
- `src/engine` 管理视口、时间轴与 Canvas 生命周期，不包含场景数学。
- `src/rendering` 提供无状态绘图基元，输入相同时必须得到相同画面。
- `src/scenes/<id>/model.ts` 保存默认值、预设与派生数学结果；组件只负责编排交互和叙事。
- 可复用控件进入 `src/components/ui`，并保留标签、键盘操作、错误状态和稳定尺寸。

修改共享的 math、engine 或 rendering API 时，必须先搜索全部调用方并保持场景行为兼容；如果需要破坏性变更，应在同一 Pull Request 内迁移所有场景并更新架构文档。共享绘图改动应检查全部受影响场景的桌面和移动画布，Three.js 改动还要检查非空像素、相机交互、窗口缩放、上下文恢复与资源释放。控件改动同时检查键盘焦点、可读标签和禁用状态。

兼容层的二维向量使用只读元组 `[x, y]`，二维矩阵使用行优先 `[m00, m01, m10, m11]`。新功能使用 `src/math/nd` 的嵌套行矩阵和显式 `{ re, im }` 复标量；第三方求解器对象只能存在于适配函数内部。普通退化情况通过可辨识联合类型返回，不使用异常控制流程；浮点判断和分解验收必须使用与输入尺度相关的容差及重构残差。

换基语义必须写清矩阵所在坐标。一般 `V → W` 变换允许定义域有序基 `V=(v₁,…,vₙ)` 与陪域有序基 `W=(w₁,…,wₘ)` 不同，若 `A = [T]_{W←V}`，标准映射为 `T = W A V⁻¹`；方阵可显式选择 `W=V`。基模式或共享基状态切换必须换算编辑矩阵以保持实际映射。eigensystem 只属于自同态 `T: V → V`，必须用同一个 `Q` 得到相似矩阵 `Q⁻¹AQ`；不得用不同输入/输出基声称保持特征值或特征向量。顺序复合必须注明 `T₂∘T₁` 中 `T₁` 先作用，并让 Canvas 与 Three.js 使用相同的 `I → T₁ → T₂T₁` 时间轴。

## 新增场景

1. 在 `src/scenes/<id>/model.ts` 定义版本化状态、默认值、预设、迁移和纯派生函数。
2. 使用 `SceneLayout` 与 `VisualizationStage` 创建平面场景；实线性映射的三维几何可复用按需加载的 `ThreeTransformStage`，其他三维语义应建立同样按需加载、按需渲染并正确释放资源的专用舞台。
3. 复用现有输入、范围、分段、状态和公式组件。
4. 将通用几何能力放入 `src/rendering`，不要把底层绘图复制到场景。
5. 在 `src/app/types.ts` 扩展 `SceneId`，并在 `src/app/sceneRegistry.tsx` 注册场景元数据与懒加载组件。
6. 将场景加入 `e2e/basis-lab.spec.ts` 的 modules 清单，添加数值/迁移边界单测和至少一条完整用户路径的端到端验收。

迁移器必须把 localStorage 内容视为未知 JSON：缺失版本或已知旧版本才进入对应迁移，当前版本仍要重新校验和规范化，未来版本或其他不识别版本必须回到当前默认值。每条迁移路径都应覆盖形状错误、非有限数和版本边界测试。

当前 schema 基线是线性变换 v5、内积 v2、向量张成 v2、特征系统 v2、谱分解 v2、矩阵分解 v1、解集与拟合 v1；行列式仍未版本化。提升版本时必须保留所有已知旧版本迁移，并同时更新模型测试、部署回滚说明和本段基线。

引入较重的数学或渲染依赖时，应优先通过动态导入或场景懒加载隔离，并在生产构建报告中检查首屏影响。同步交互确实需要的数值核心可以保留在首屏，但 Pull Request 必须说明体积与延迟取舍。复空间不得伪装为普通二维/三维几何；可视层应明确说明显示的是分量、相位或实切片，数值证书才是权威结果。

更多职责和性能约束见[架构说明](docs/ARCHITECTURE.md)。

## 验收清单

- `npm run verify:full` 全部通过；Playwright 将 `console.error`、`console.warn` 和未捕获页面错误都视为验收失败。
- 正常、奇异、近奇异、零向量及超出显示范围的输入都有明确结果。
- 向量组检查 `R¹`/`R²`/`R³` 中 1–6 个直接输入向量、全部系数编辑，以及最大线性无关组的稳定顺序。
- 顺序复合检查 `T₁` 先作用、最终矩阵为 `T₂T₁`，并在 Canvas/Three.js 时间轴中点检查 `T₁` 状态。
- 特征换基检查 `Q⁻¹AQ` 与标准矩阵具有相同特征值，并在可对角化时显示实特征基 `P` 和 `[T]_P = P⁻¹AP`；无效 `Q`、缺陷矩阵和复特征值都不产生伪实特征基。
- 桌面端和移动端没有溢出、遮挡或布局跳动，Canvas 后备像素与 CSS 尺寸一致。
- 新交互可用键盘理解和操作；颜色不是传达状态的唯一方式。
- 静态状态不保持后台动画循环，动画可暂停、定位并遵守减少动态效果设置。
- 公共 API、架构约定或发布流程变化同步更新文档。

## Pull Request 门禁

`quality` 工作流会在 push 和 Pull Request 上运行格式检查、TypeScript、零警告 ESLint、全部单元/组件测试、生产构建以及桌面/移动端 Playwright 测试。只有全部检查通过后才应合并到 `main`；合并后由独立的 Pages 工作流发布。

缺陷与功能建议通过 GitHub Issues 记录，附上最小复现、浏览器版本、场景 URL、相关输入和预期/实际结果。项目当前使用 `package.json` 版本标记应用版本；面向用户的发布在部署验收后创建对应 Git tag，仓库不提交生成的 `dist/`。
