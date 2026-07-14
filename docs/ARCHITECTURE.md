# 架构说明

## 设计目标

基域把数学真相、动画时间、坐标视口、Canvas 绘制与 React 界面分开。场景只组合这些能力，不拥有底层循环，也不把计算结果藏在绘制代码中。

```text
App + Scene Registry
        |
Scene Component ---- Pure Scene Model
        |                   |
VisualizationStage      src/math
        |
Viewport + Timeline + Stateless Renderer
```

## 分层职责

### 数学层 `src/math`

- 所有函数都是无浏览器依赖的纯函数。
- `Vec2` 表示为只读元组 `[x, y]`。
- `Mat2` 使用行优先元组 `[m00, m01, m10, m11]`。
- `multiplyMat2(left, right)` 表示复合 `left * right`，右侧先作用。
- 奇异求解、特征分析和度量分析使用可辨识联合类型返回边界状态，不用异常表达普通数学情况。
- 浮点比较使用与输入尺度相关的容差；界面格式化不回写计算值。

### 引擎层 `src/engine`

- `Viewport2D` 负责世界坐标与 Canvas CSS 像素互换、缩放锚点和平移。
- `AnimationTimeline` 只管理标准化进度，播放时才请求动画帧。
- `resizeCanvas` 将后备像素与 CSS 尺寸及 DPR 对齐，DPR 上限为 2。

### 绘制层 `src/rendering`

- 接收 `CanvasRenderingContext2D`、`Viewport2D` 与显式参数。
- 统一网格、坐标轴、向量、箭头、线、圆、变换网格和标签的视觉语义。
- 不保存场景状态，不触发 React 更新，不管理动画。

### 舞台组件 `VisualizationStage`

- 持有单一 Canvas、视口、时间轴和指针手势生命周期。
- 通过确定性的 `render(frame)` 回调驱动场景；同一状态与进度必须得到同一画面。
- 暴露播放、定位、缩放、复位、重绘和 PNG 导出命令。
- 仅在尺寸、状态、视口或时间轴变化时绘制；静态状态没有常驻 RAF。

### 场景层 `src/scenes`

每个场景至少包含：

- `model.ts`：默认状态、预设和派生数学结果。
- `*Scene.tsx`：控件组合、Canvas 绘制叙事与直接操作。

派生结果用 `useMemo` 计算，绘制函数只读取已经验证的状态。场景状态使用独立的 localStorage key，切换主题或场景不会丢失实验。

## 新增场景

1. 在 `src/scenes/<id>/model.ts` 定义状态、默认值、预设与纯派生函数。
2. 使用 `SceneLayout` 和 `VisualizationStage` 创建场景组件。
3. 复用 `src/components/ui` 的矩阵、向量、范围、分段和状态控件。
4. 只通过 `src/rendering` 绘制；新的通用几何能力放入绘制层。
5. 将元数据与组件加入 `src/app/sceneRegistry.tsx`。
6. 为新数学函数添加 Vitest 边界测试，为新工作流添加 Playwright 验收。

## 测试边界

- **Vitest**：向量/矩阵不变量、求解、换基、特征分类、SPD 度量、投影、Gram-Schmidt、视口和时间轴。
- **Playwright**：场景导航、编辑、预设、边界提示、播放、主题、响应式布局、Canvas 后备像素与像素方差。
- **构建门禁**：Prettier、TypeScript、零警告 ESLint、单测、生产构建和浏览器控制台零错误。

## 性能约束

- Canvas 绘制使用 CSS 像素坐标并一次设置 DPR transform。
- 静态场景按失效重绘；没有后台动画循环。
- 网格密度随缩放分档，避免无界线段数量。
- 数学范围固定在 R2/2x2，使边界处理与交互深度优先于不完整的高维展示。
