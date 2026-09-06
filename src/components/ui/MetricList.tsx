interface Metric {
  label: string;
  value: string;
  key?: string;
  tone?: "cyan" | "red" | "yellow" | "blue";
}

export function MetricList({ metrics }: { metrics: readonly Metric[] }) {
  const labels: Record<string, string> = {
    rank: "秩",
    span: "张成空间",
    "target membership": "目标能否表示",
    reconstruction: "重构误差",
    orthogonality: "正交误差",
    "normal residual": "正规性误差",
    "self-adjoint residual": "自伴误差",
    class: "算子类别",
    dimension: "空间维数",
    orientation: "定向",
  };
  return (
    <dl className="metric-list" data-testid="module-status">
      {metrics.map((metric) => (
        <div key={metric.key ?? metric.label} data-tone={metric.tone}>
          <dt title={metric.label}>
            {labels[metric.label.toLowerCase()] ?? metric.label}
          </dt>
          <dd
            title={metric.value}
            data-testid="result-value"
            data-result={metric.key}
          >
            {metric.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
