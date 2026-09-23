/** Helpers for the "Category » Subcategory » Topic" rule strings. */

export function ruleChain(rule: string): string[] {
  return rule.split('»').map((s) => s.trim()).filter(Boolean);
}

/** Short label for cards, e.g. "a = /ă/" or "sl". */
export function topicFromRule(rule: string): string {
  const chain = ruleChain(rule);
  return chain[chain.length - 1] ?? rule;
}

/** Full descriptive rule, e.g. "Short Vowels · a = /ă/". */
export function fullRuleLabel(rule: string): string {
  const chain = ruleChain(rule);
  if (chain.length <= 1) return rule;
  return chain.slice(0, -1).join(' · ');
}

/** Numbered learning chain for the Learn screen sidebar. */
export function ruleSteps(rule: string): { label: string; current: boolean }[] {
  const chain = ruleChain(rule);
  return chain.map((label, i) => ({ label, current: i === chain.length - 1 }));
}
