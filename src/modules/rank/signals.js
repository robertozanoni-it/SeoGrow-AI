export function trafficDropSignals(dataset) {
  return (dataset?.changes || [])
    .filter((row) => row.clickDelta < 0 || row.positionDelta > 2)
    .slice(0, 50);
}
