# 基域 · BASIS LAB

[![质量检查](https://github.com/Shrimpaste/LinearAlgebraVisualization/actions/workflows/ci.yml/badge.svg)](https://github.com/Shrimpaste/LinearAlgebraVisualization/actions/workflows/ci.yml)
[![GitHub Pages](https://github.com/Shrimpaste/LinearAlgebraVisualization/actions/workflows/pages.yml/badge.svg)](https://github.com/Shrimpaste/LinearAlgebraVisualization/actions/workflows/pages.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-2f3437.svg)](LICENSE)

当前部署候选：`v1.2.0-beta.1` · **待进一步测试优化**。核心功能与自动化验收已完成，此版本作为预发布阶段继续收集真实浏览器、复杂数值边界与长期交互反馈。

基域是一套覆盖 `R/C` 与 1–3 维实验的交互式线性代数工作台。它把矩阵、向量组、基、内积和分解放回同一个可操作空间：直接编辑数值，逐帧观察单步或复合变换，并用残差证书读取奇异、非正规、非正定等边界状态。

**[打开在线版本](https://shrimpaste.github.io/LinearAlgebraVisualization/)**

![基域 1–3 维线性代数工作台](docs/assets/basis-lab-overview.png)

## 核心场景

| 场景     | 可视化内容                            | 交互与边界处理                                                       |
| -------- | ------------------------------------- | -------------------------------------------------------------------- |
| 向量张成 | 1–6 个 `R²` 向量的秩、组合与系数格    | 编辑全部向量/系数，按输入顺序稳定选出基，识别冗余、共线与零向量      |
| 线性变换 | `Rⁿ → Rᵐ`，`m,n ∈ {1,2,3}`            | 编辑 `A = [T]_{C←B}`；方阵可顺序复合 `T₂∘T₁`，时间轴展示 `I→T₁→T₂T₁` |
| 特征系统 | `R²` 自同态的特征方向、方向场与幂迭代 | 在单一基 `B` 下读取相似矩阵 `B⁻¹AB`，覆盖实根、重根、缺陷与共轭复根  |
| 内积空间 | `R/C`、1–3 维 Gram 内积、投影与正交化 | 编辑 `G`，逐项验证正定性、第一槽加性/齐性和共轭对称性                |
| 行列式   | `R²` 有向面积、定向翻转和坍缩         | 播放列变换，解释缩放、换列与加列操作                                 |
| 谱分解   | `R/C`、1–3 维自伴与 normal 算子       | 自动构造并验证 `A = UΛU*`，区分非正规、求解失败和重根非唯一性        |
| 矩阵分解 | 1–3 行/列实矩阵的 SVD 与右极分解      | 同步演示 `Vᵀ → Σ → U` 与 `P → Q → QP`，标明秩亏和部分等距            |

一般线性变换可以连接不同空间：若 `A = [T]_{C←B}`，定义域基为 `B`、陪域基为 `C`，则标准坐标映射是 `T = C A B⁻¹`。特征系统只讨论自同态 `T: V → V`；同一基 `B` 同时用于输入和输出，标准矩阵 `A` 的坐标表示是相似矩阵 `[T]_B = B⁻¹AB`。使用不同的 `B/C` 只会得到矩阵等价，不保持 eigensystem，因此特征场景不提供这种伪换基。

所有场景共享确定性时间轴、暂停/重播/定位、PNG 导出、浅色/深色主题及本地状态恢复；Canvas 舞台还提供速度控制。线性变换的顺序复合仅适用于方阵，Canvas 与 Three.js 舞台都把时间轴分为 `I → T₁ → T₂T₁` 两段。状态 schema 当前为：线性变换 v3、内积 v2、向量张成/特征系统/谱分解/矩阵分解 v1；只有行列式仍使用未版本化状态。

平面实验使用高 DPI Canvas 2D；只有线性变换与矩阵分解在输入或输出为三维时按需加载 Three.js，并提供轨道相机、WebGL 恢复和无 WebGL 后备状态。内积与谱分解的三维或复空间使用明确标注的分量/相位投影。界面支持键盘焦点、Canvas 文本替代、响应式移动布局和减少动态效果偏好。

## 快速开始

需要 Node.js 20 或更高版本，推荐使用与自动化环境一致的 Node.js 22。

```bash
git clone https://github.com/Shrimpaste/LinearAlgebraVisualization.git
cd LinearAlgebraVisualization
npm ci
npm run dev
```

项目没有环境变量、后端服务或外部 API 依赖。开发服务器默认为 `http://127.0.0.1:5173/`；端口被占用时可运行 `npm run dev -- --port 5174`。首次运行端到端测试前安装 Chromium：

```bash
npx playwright install chromium
npm run verify:full
```

Linux CI 或新工作站可用 `npx playwright install --with-deps chromium` 同时安装系统依赖。完整验收成功时，命令会通过格式、类型、Lint、单测、构建及两个浏览器尺寸的 Playwright 用例，并保持浏览器控制台零错误、零警告。

## 常用命令

| 命令                  | 用途                                 |
| --------------------- | ------------------------------------ |
| `npm run dev`         | 启动 Vite 开发服务器                 |
| `npm run build`       | 执行 TypeScript 构建并输出 `dist/`   |
| `npm run preview`     | 本地预览生产构建                     |
| `npm run format`      | 使用 Prettier 格式化仓库文件         |
| `npm run test`        | 运行 Vitest 单元与组件测试           |
| `npm run test:e2e`    | 运行桌面端与 Pixel 7 Playwright 验收 |
| `npm run verify`      | 格式、类型、Lint、单测和生产构建门禁 |
| `npm run verify:full` | `verify` 加完整浏览器验收            |

## 工程结构

```text
src/
  app/                  场景注册表与应用类型
  components/           工作台、可视化舞台和可访问控件
  engine/               高 DPI Canvas、视口与确定性时间轴
  hooks/                响应式与持久化状态
  math/                 兼容的 R² 核心与 dimension-generic `nd` 纯函数
  rendering/            无状态 Canvas 绘图基元
  scenes/               七个独立场景的模型、界面与渲染适配
  styles/               设计令牌与响应式布局
  utils/                数值与公式格式化
e2e/                    Playwright 产品级验收
```

数学、分解适配、动画、绘制和 React 状态保持分层；`mathjs` 与 `ml-matrix` 对象不会越过纯数学适配边界，Three.js 和新分解场景通过动态导入进入独立产物。场景通过注册表接入应用外壳。详细设计与扩展约定见[架构说明](docs/ARCHITECTURE.md)。

## 构建与发布

生产资源使用相对路径，场景导航使用 URL hash，因此产物可部署到 GitHub Project Pages 子路径或任意静态文件服务器。推送到 `main` 后，`deploy-pages` 工作流会执行包括桌面/移动浏览器验收在内的完整质量门禁、构建 `dist/`、上传 Pages artifact，并通过 GitHub OIDC 部署。

首次启用、手动发布、回滚与故障排查见[部署手册](docs/DEPLOYMENT.md)。参与开发前请阅读[贡献指南](CONTRIBUTING.md)。

## 浏览器支持

支持当前稳定版 Chrome、Edge、Firefox 与 Safari，自动化验收以 Chromium 为基准。Canvas 分量投影不需要 WebGL；变换与矩阵分解的 Three.js 三维舞台需要 WebGL2，初始化或上下文恢复失败时会显示明确后备状态。应用不需要后端服务、环境变量或外部运行时 API。

## 许可证

本项目基于 [MIT License](LICENSE) 开源。
