import { FormFieldCondition, FormConditionalRule } from '@/lib/formsApi';

export function evaluateCondition(cond: FormFieldCondition, answers: Record<string, any>): boolean {
  const rawVal = answers[cond.field_key];
  const valStr = rawVal !== undefined && rawVal !== null ? String(rawVal).trim().toLowerCase() : '';
  const expectedStr = cond.value !== undefined && cond.value !== null ? String(cond.value).trim().toLowerCase() : '';

  switch (cond.operator) {
    case 'equals':
      return valStr === expectedStr;
    case 'not_equals':
      return valStr !== expectedStr;
    case 'contains':
      return valStr.includes(expectedStr);
    case 'is_empty':
      return valStr === '' || valStr === 'undefined' || valStr === 'null';
    case 'is_not_empty':
      return valStr !== '' && valStr !== 'undefined' && valStr !== 'null';
    case 'gt': {
      const n1 = parseFloat(valStr);
      const n2 = parseFloat(expectedStr);
      if (isNaN(n1) || isNaN(n2)) return false;
      return n1 > n2;
    }
    case 'lt': {
      const n1 = parseFloat(valStr);
      const n2 = parseFloat(expectedStr);
      if (isNaN(n1) || isNaN(n2)) return false;
      return n1 < n2;
    }
    default:
      return false;
  }
}

export function evaluateRule(rule: FormConditionalRule, answers: Record<string, any>): boolean {
  if (!rule.conditions || rule.conditions.length === 0) return true;
  const isOR = rule.logic === 'OR';

  for (const cond of rule.conditions) {
    const res = evaluateCondition(cond, answers);
    if (isOR && res) return true;
    if (!isOR && !res) return false;
  }
  return !isOR;
}

export function evaluateFormRules(
  rules: FormConditionalRule[] = [],
  answers: Record<string, any>
): {
  visibleFields: Record<string, boolean>;
  requiredFields: Record<string, boolean>;
} {
  const visibleFields: Record<string, boolean> = {};
  const requiredFields: Record<string, boolean> = {};

  for (const rule of rules) {
    const matched = evaluateRule(rule, answers);
    switch (rule.action) {
      case 'show':
        visibleFields[rule.target_field_key] = matched;
        break;
      case 'hide':
        visibleFields[rule.target_field_key] = !matched;
        break;
      case 'require':
        if (matched) {
          requiredFields[rule.target_field_key] = true;
        }
        break;
    }
  }

  return { visibleFields, requiredFields };
}

