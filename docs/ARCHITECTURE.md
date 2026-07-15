# 架构说明

## 设计目标

基域把数学真相、数值求解、动画时间、绘制生命周期与 React 交互分开。场景负责组合这些能力，不把求解逻辑藏进渲染函数，也不让第三方库对象进入可持久化状态。

```text
App + typed Scene Registry
             |
     Scene Component -------- versioned state migration
        |          |
 Pure Scene Model  |---- Canvas 2D VisualizationStage
        |          `---- demand-rendered ThreeTransformStage
        |
 src/math legacy + src/math/nd
        |
 mathjs / ml-matrix adapters (internal objects only)
```

## 数学边界

### 兼容层 `src/math`

行列式场景继续使用经过充分验证的 `R²` 类型；张成与特征系统使用 `src/math/nd` 的 1–3 维实数 DTO：

- `Vec2` 是只读元组 `[x, y]`；
- `Mat2` 是行优先元组 `[m00, m01, m10, m11]`；
- 奇异求解、特征分析和度量分析使用可辨识联合类型表达普通边界，不以异常控制流程；
- 浮点比较使用与输入尺度相关的容差，格式化结果不回写计算值。

这层保持稳定，避免为了新增维数而扩大既有场景的联合类型和回归范围。

### Dimension-generic 层 `src/math/nd`

新变换、内积、谱分解和矩阵分解使用 1–3 维 JSON DTO：

- 实矩阵使用嵌套行数组，复标量显式表示为 `{ re, im }`；
- 验证器先检查维数、矩形形状和有限数，再进入计算；
- 张成场景接受 `R¹`/`R²`/`R³` 中 1–6 个向量，以输入顺序执行尺度归一的贪心秩增长，返回稳定最大线性无关组、rank 和张成分类；
- 特征系统只处理自同态 `T: V → V`：标准矩阵 `A` 在单一共享基 `Q` 下表示为相似矩阵 `[T]_Q = Q⁻¹AQ`，并仅在认证出完整实特征基时提供 `P` 与 `[T]_P = P⁻¹AP`；
- 若 `A = [T]_{W←V}` 是从定义域有序基 `V` 坐标到陪域有序基 `W` 坐标的坐标矩阵，则对应的标准坐标映射统一为 `T = W A V⁻¹`；方阵可显式令 `W=V`，模式切换时换算编辑矩阵以保持实际映射；
- 方阵变换可编辑第二个坐标矩阵并顺序复合；分别还原标准映射 `T₁`、`T₂` 后，最终矩阵按右到左顺序计算为 `T₂T₁`，矩形映射保持单步模式；
- 第一槽线性的内积约定为 `⟨x,y⟩ = y* G x`，分别报告正定、第一槽加性、第一槽齐性和共轭对称残差；
- normal 谱分解只有在 normal 性、正交性、特征方程和重构残差全部过门槛时才返回成功；
- 实矩形 SVD 使用薄因子，右极分解返回 `A = QP` 并显式标注秩亏或矩形情况下的部分等距。

`mathjs` 只在复谱适配器内部提供 1–3 维特征值种子。适配器按数值等价特征值分组，从 `A - λI` 的行空间重建对应零空间，仅在同一特征子空间内执行主元化双重正交化，再规范相位、用 Rayleigh quotient 校正特征值并复核特征方程、正交性和重构残差。`ml-matrix` 为变换的同步秩/条件数分析及实 SVD 提供稳定内核。外部库的 Matrix/Complex 实例不进入场景模型、React props 或 localStorage。

## 动画与渲染

### Canvas 2D 路径

`VisualizationStage` 持有高 DPI Canvas、`Viewport2D`、`AnimationTimeline` 和指针手势生命周期。场景通过确定性的 `render(frame)` 回调绘制；同一状态、视口和进度必须得到同一画面。

- `resizeCanvas` 将后备像素与 CSS 尺寸及 DPR 对齐，DPR 上限为 2；
- `src/rendering` 提供无状态网格、坐标轴、向量、圆和标签基元；
- 舞台暴露播放、定位、速度、视口缩放、复位、重绘和 PNG 导出；
- 变换复合模式把标准化进度前后两半分别映射到 `I → T₁` 与 `T₁ → T₂T₁`，中点是可检查的真实中间状态；逆向演示按 `I → T₂⁻¹ → T₁⁻¹T₂⁻¹` 撤销两步；
- 仅状态、尺寸、视口或时间轴失效时重绘，静态场景没有常驻 RAF。

### Three.js 路径

输入或输出维数为 3 时，变换按需加载 `ThreeTransformStage`。它把 1D/2D 对象嵌入 `R³`；单步模式按 `(1-t)x + tTx` 变形，复合模式与 Canvas 一致经过 `I → T₁ → T₂T₁`，避免把不兼容的定义域/陪域伪装成同一坐标系。张成和特征系统分别按需加载 `ThreeSpanStage` 和 `ThreeEigenStage`；后者只绘制认证的实特征几何，复特征值不会伪装为实方向。

- 使用 OrbitControls、DPR 上限 2、确定性时间轴和按需渲染；
- 支持网格、圆/球、矩形曲面、向量轨迹、相机复位和 PNG 导出；
- 监听 WebGL 上下文丢失/恢复，并在卸载时释放 geometry、material、controls 和 renderer；
- WebGL 初始化失败时提供可读后备状态，不影响其余 Canvas 2D 场景。

复空间不映射为普通 `R²/R³` 几何。复内积和谱场景只绘制分量幅值/相位投影，并在舞台文字中标明这种表示限制；数值残差是权威结论。

## 场景与状态

`src/app/sceneRegistry.tsx` 保存场景元数据和组件注册，`src/app/types.ts` 的 `SceneId` 联合类型约束合法标识，`e2e/basis-lab.spec.ts` 的 modules 清单驱动全场景产品验收。新增或移除场景时必须同步这三处。谱分解、矩阵分解以及 Three.js 舞台使用 React 动态导入，保持首屏路径轻量。

每个新场景通常包含：

- `model.ts`：schema、默认值、预设、迁移和纯派生结果；
- `model.test.ts`：数值边界与迁移回归；
- `*Scene.tsx`：控件编排、叙事、舞台选择和直接操作。

`useLocalStorage` 在初始化时调用场景迁移器，再持久化规范化结果。迁移器必须接受未知 JSON，并按明确的版本分支处理：缺失版本或已知旧版本执行受支持的迁移，当前版本重新校验并规范化，未来版本或其他不识别版本回退到当前默认值；所有分支都要验证形状与有限数。当前场景 schema 为：线性变换 v4、内积 v2、向量张成 v2、特征系统 v2、谱分解/矩阵分解 v1；只有行列式仍未版本化。矩阵编辑器的表单复数 `{ real, imag }` 只存在于 UI 边界，进入数学层前显式转换为 `{ re, im }`。

## 扩展规则

1. 在纯数学层定义 DTO、计算结果和失败联合类型，并先写数值边界测试；涉及向量组时覆盖顺序稳定的秩/选基，涉及复合时明确右侧先作用，涉及 eigensystem 时限定为同一空间与单一基相似变换。
2. 在场景 `model.ts` 定义版本化状态、迁移、预设和派生函数。
3. 复用 `SceneLayout` 及动态矩阵/向量控件；选择 Canvas 2D 或真实 Three.js 舞台。
4. 把通用平面绘制放入 `src/rendering`，把第三方求解对象封闭在数学适配器中。
5. 在 `src/app/types.ts` 扩展 `SceneId`，在 `sceneRegistry.tsx` 注册元数据；包含重依赖的场景必须懒加载。
6. 更新 `e2e/basis-lab.spec.ts` 的 modules 清单，并添加 Vitest 数值/迁移测试和 Playwright 完整用户路径，包含桌面、移动、像素及控制台错误/警告检查。

## 验收与性能

- **Vitest**：1–3 维向量组贪心选基与目标成员关系、一般换基与同基相似换基、认证实 eigensystem 的残差和缩放边界、顺序复合、Gram 公理、normal 分类、谱残差、SVD/极分解、迁移、视口和时间轴。
- **Playwright**：七场景导航、`R¹`/`R²`/`R³` 的 1–6 向量直接编辑/自动基、标准/自定义有序基及 `W=V` 映射保持、`T₂∘T₁` 的 Canvas/Three 中间状态、共享 `Q` 与 `P/[T]_P` 可用/不可用状态、PNG、主题、响应式及控制台错误/警告。
- **构建门禁**：Prettier、TypeScript、零警告 ESLint、全部单测、生产构建和双视口浏览器验收。
- Three.js 与只在谱/分解场景使用的 mathjs 必须位于按需 chunk；`ml-matrix` 的秩/条件数核心允许进入首屏以保证矩阵编辑后的同步反馈。生产构建审查需关注首屏 gzip 体积与重复依赖。
- 静态 Canvas/Three 场景不得保持后台动画循环；所有动画可暂停、定位，并遵守 `prefers-reduced-motion`。
