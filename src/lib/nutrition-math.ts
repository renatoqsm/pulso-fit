import Decimal from 'decimal.js';
export type Nutrients = Record<string, string | null>;
export function scaleNutrients(values: Nutrients, quantity: string | number): Nutrients {
  const factor = new Decimal(quantity).div(100);
  return Object.fromEntries(
    Object.entries(values).map(([key, value]) => [
      key,
      value == null ? null : new Decimal(value).mul(factor).toString(),
    ]),
  );
}
export function totalNutrients(items: Nutrients[]): Nutrients {
  const keys = [...new Set(items.flatMap((v) => Object.keys(v)))];
  return Object.fromEntries(
    keys.map((key) => [
      key,
      items.some((v) => v[key] == null)
        ? null
        : items.reduce((s, v) => s.add(v[key]!), new Decimal(0)).toString(),
    ]),
  );
}
export function macroDistribution(n: Nutrients) {
  if (['protein_g', 'carbohydrate_g', 'fat_g'].some((k) => n[k] == null)) return null;
  const values = [
    new Decimal(n.protein_g!).mul(4),
    new Decimal(n.carbohydrate_g!).mul(4),
    new Decimal(n.fat_g!).mul(9),
  ];
  const total = values.reduce((s, v) => s.add(v), new Decimal(0));
  return total.isZero() ? null : values.map((v) => v.div(total).mul(100).toString());
}

export function differenceNutrients(actual: Nutrients, planned: Nutrients): Nutrients {
  return Object.fromEntries(
    [...new Set([...Object.keys(actual), ...Object.keys(planned)])].map((key) => [
      key,
      actual[key] == null || planned[key] == null
        ? null
        : new Decimal(actual[key]!).sub(planned[key]!).toString(),
    ]),
  );
}
export function multiplyQuantities(a: string | number, b: string | number) {
  return new Decimal(a).mul(b).toString();
}
