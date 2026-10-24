/**
 * How an order's weight is shown. The backend stores the best source it has:
 * "weighed" (vendor scale) > "estimated" (from admin-configured Master Service
 * avg weights). The "customer" label remains for historical orders created before
 * customer-entered weights were removed. Orders from before weightSource existed
 * are treated as estimates. No weight -> "—", never a made-up number.
 */
export const WEIGHT_SOURCE_LABELS = {
  weighed: "weighed",
  customer: "customer estimate",
  estimated: "estimated",
};

const fmtKg = (n) => `${Number(n.toFixed(2))} kg`;

export const getOrderWeight = (order) => {
  const kg = Number(order?.totalWeight);
  if (!Number.isFinite(kg) || kg <= 0) {
    return { kg: null, source: null, text: "—", label: "", exact: false };
  }
  const source = WEIGHT_SOURCE_LABELS[order.weightSource] ? order.weightSource : "estimated";
  const exact = source === "weighed";
  return {
    kg,
    source,
    exact,
    text: `${exact ? "" : "~"}${fmtKg(kg)}`,
    label: WEIGHT_SOURCE_LABELS[source],
  };
};

/** "4.5 kg · weighed", "~3 kg · customer estimate", or "—" */
export const formatOrderWeight = (order) => {
  const w = getOrderWeight(order);
  return w.kg === null ? "—" : `${w.text} · ${w.label}`;
};
