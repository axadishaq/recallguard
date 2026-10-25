// NDC format reconciliation. Pharmacy/wholesaler systems store an 11-digit
// 5-4-2 code with no dashes; FDA publishes 10-digit codes in 4-4-2, 5-3-2 or
// 5-4-1 form. The 11-digit code adds one leading zero to exactly one segment,
// so each inventory code maps to up to three candidate FDA package codes.

export function ndc11ToPackageCandidates(ndc11: string): string[] {
  const d = ndc11.replace(/\D/g, "");
  if (d.length !== 11) return [];
  const [lab, prod, pkg] = [d.slice(0, 5), d.slice(5, 9), d.slice(9)];
  const out: string[] = [];
  if (lab.startsWith("0")) out.push(`${lab.slice(1)}-${prod}-${pkg}`);
  if (prod.startsWith("0")) out.push(`${lab}-${prod.slice(1)}-${pkg}`);
  if (pkg.startsWith("0")) out.push(`${lab}-${prod}-${pkg.slice(1)}`);
  return out;
}

export function productOf(packageNdc: string): string {
  return packageNdc.split("-").slice(0, 2).join("-");
}

export function sqlList(values: string[]): string {
  return values.length ? values.map((v) => `'${v.replace(/'/g, "''")}'`).join(", ") : "''";
}
