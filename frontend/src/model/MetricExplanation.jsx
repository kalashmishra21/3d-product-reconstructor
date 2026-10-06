export function MetricExplanation({ metric }) {
  return <div><dt><details><summary>{metric.label}</summary><p>{metric.description}</p></details></dt><dd>{metric.value}</dd></div>
}
