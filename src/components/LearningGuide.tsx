import { useState } from "react";
import type { SceneId } from "../app/types";

const guides: Record<
  SceneId,
  { question: string; prerequisite: string; steps: string[]; transfer: string }
> = {
  systems: {
    question: "无法到达时，最近的点在哪里？",
    prerequisite: "列空间、正交投影与零空间",
    steps: [
      "预测：目标不在列空间内，Ax=b还能有解吗？",
      "比较唯一解、无穷多解与无精确解预设。",
      "改变自由参数，观察x变化而Ax与残差保持不变。",
      "最小二乘把b投影到列空间，最小范数解再去掉零空间分量。",
    ],
    transfer: "A的列相关时，最小二乘解为什么也可能不唯一？",
  },
  span: {
    question: "这些方向能到达目标吗？",
    prerequisite: "向量加法与数乘",
    steps: [
      "先预测：两个方向共线时，还能到达平面任意一点吗？",
      "调节组合系数，让红色合向量靠近目标。",
      "观察目标与合向量的距离，再把两个向量改成共线。",
      "独立方向决定能到达的空间，系数决定空间中的位置。",
    ],
    transfer: "加入一个已有方向的倍数，张成空间会扩大吗？",
  },
  transform: {
    question: "为什么两列就能决定整个变换？",
    prerequisite: "标准基与线性组合",
    steps: [
      "预测：只修改第一列，哪个标准基的像会变化？",
      "修改矩阵一列，观察 Te₁、Te₂ 与测试向量。",
      "打开顺序复合，在50%处查看第一步结果。",
      "T(xe₁+ye₂)=xTe₁+yTe₂；复合按右到左计算。",
    ],
    transfer: "先旋转再拉伸，与先拉伸再旋转相同吗？",
  },
  eigen: {
    question: "找到不离开原直线的方向",
    prerequisite: "线性映射与数乘",
    steps: [
      "预测：所有向量经过变换都只改变长度吗？",
      "隐藏特征方向，拖动蓝色候选向量。",
      "播放并比较 v 与 Av；观察方向提示。",
      "Av=λv：负λ允许反向，λ=0把非零向量压到原点。",
    ],
    transfer: "换成纯旋转，还有实特征方向吗？",
  },
  "inner-product": {
    question: "改变度量，正交关系会怎样？",
    prerequisite: "长度、夹角与投影",
    steps: [
      "预测：同一对向量的夹角是否永远相同？",
      "保持向量，比较欧氏内积与加权度量。",
      "观察单位圆与投影残差，再切换Gram–Schmidt。",
      "G定义测量规则，正交意味着内积为零。",
    ],
    transfer: "为什么单位圆在标准坐标中可以是椭圆？",
  },
  determinant: {
    question: "加列会改变面积吗？",
    prerequisite: "平行四边形的底与高",
    steps: [
      "先选择你的预测，再做列操作。",
      "点击加列，观察第二条边沿第一条边滑动。",
      "对照当前面积与目标面积：底和高是否改变？",
      "加列不变、换列变号、倍乘使面积成比例改变。",
    ],
    transfer: "第二列乘以2，面积与定向分别怎样变化？",
  },
  operator: {
    question: "谱分量如何重构同一个输出？",
    prerequisite: "特征方向、正交基与复数共轭",
    steps: [
      "预测：一个谱坐标为零时，它还贡献输出吗？",
      "使用画布上方步骤，依次查看输入与谱坐标。",
      "聚焦一个分量，跟踪它经Λ伸缩再回到原空间。",
      "所有贡献相加等于Ax；重根对应的谱投影不依赖子空间内选基。",
    ],
    transfer: "改用非正规矩阵，为什么没有酉谱分解？",
  },
  decomposition: {
    question: "不同分解能走到同一终点吗？",
    prerequisite: "正交坐标、伸缩与矩形映射",
    steps: [
      "预测：SVD与极分解的最终作用是否相同？",
      "逐阶段查看Vᵀ、Σ、U，然后改用右极分解。",
      "对照终点，再尝试宽矩阵与秩亏预设。",
      "SVD拆出主方向伸缩；极分解先伸缩再定向。薄因子可能降维。",
    ],
    transfer: "某个奇异值为零时，哪个方向的信息消失？",
  },
};

export function LearningGuide({ scene }: { scene: SceneId }) {
  const [step, setStep] = useState(0);
  const guide = guides[scene];
  return (
    <section className="learning-guide" aria-label="入门实验引导">
      <small>先修 · {guide.prerequisite}</small>
      <h2>{guide.question}</h2>
      <div className="lesson-dots" aria-label="学习环节">
        {["预测", "操作", "观察", "解释"].map((label, i) => (
          <button
            type="button"
            key={label}
            aria-pressed={step === i}
            onClick={() => setStep(i)}
          >
            {i + 1} {label}
          </button>
        ))}
      </div>
      <p aria-live="polite">{guide.steps[step]}</p>
      {step === 3 && (
        <p className="lesson-transfer">再想一步：{guide.transfer}</p>
      )}
      <button
        type="button"
        className="text-button"
        onClick={() => setStep((step + 1) % 4)}
      >
        {step === 3 ? "重新观察" : "下一环节"}
      </button>
    </section>
  );
}
