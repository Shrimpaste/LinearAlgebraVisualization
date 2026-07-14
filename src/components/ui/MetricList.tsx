interface Metric {
  label: string;
  value: string;
  key?: string;
  tone?: "cyan" | "red" | "yellow" | "blue";
}

export function MetricList({ metrics }: { metrics: readonly Metric[] }) {
  return (
    <dl className="metric-list" data-testid="module-status">
      {metrics.map((metric) => (
        <div key={metric.key ?? metric.label} data-tone={metric.tone}>
          <dt>{metric.label}</dt>
          <dd data-testid="result-value" data-result={metric.key}>
            {metric.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
