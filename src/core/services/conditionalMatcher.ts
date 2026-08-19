import { FilterCondition } from '../models/filterCondition';
import { ConditionalFilterGroup } from '../models/conditionalFilterGroup';
import { FilterOperator } from '../models/filterOperator';
import { LogicalOperator } from '../models/logicalOperator';
import { SearchOptions } from '../models/searchOptions';

/**
 * Evaluates conditional filter groups with AND/OR logic and nested groups.
 */

interface MatchResult {
  matched: boolean;
  rawMessage?: string;
}

export function matches(
  entry: any,
  filterGroup: ConditionalFilterGroup,
  opts: SearchOptions
): MatchResult {
  // Empty group matches all
  if (filterGroup.conditions.length === 0 &&
      (!filterGroup.nestedGroups || filterGroup.nestedGroups.length === 0)) {
    return { matched: true };
  }

  // Parse JSON from entry
  const jsonRoot = extractJson(entry, opts.jsonField || 'message');
  if (!jsonRoot) {
    return { matched: false };
  }

  // Evaluate direct conditions
  const conditionResults = filterGroup.conditions.map(c =>
    evaluateCondition(c, jsonRoot, opts.caseInsensitive || false)
  );

  // Evaluate nested groups recursively
  const nestedResults = (filterGroup.nestedGroups || []).map(g =>
    matches(entry, g, opts).matched
  );

  // Combine all results
  const allResults = [...conditionResults, ...nestedResults];

  if (allResults.length === 0) {
    return { matched: true };
  }

  const matched = filterGroup.operator === LogicalOperator.And
    ? allResults.every(r => r)
    : allResults.some(r => r);

  return {
    matched,
    rawMessage: matched ? getRawMessage(jsonRoot, opts) : undefined
  };
}

function evaluateCondition(
  condition: FilterCondition,
  jsonRoot: any,
  caseInsensitive: boolean
): boolean {
  const value = extractFieldValue(jsonRoot, condition.fieldName, condition.jsonPath);

  switch (condition.operator) {
    case FilterOperator.Equals:
      return value != null && stringEquals(value, condition.value, caseInsensitive);

    case FilterOperator.NotEquals:
      return value == null || !stringEquals(value, condition.value, caseInsensitive);

    case FilterOperator.Contains:
      if (value == null) return false;
      const haystack = caseInsensitive ? value.toLowerCase() : value;
      const needle = caseInsensitive ? condition.value.toLowerCase() : condition.value;
      return haystack.includes(needle);

    case FilterOperator.Exists:
      return value != null;

    default:
      return false;
  }
}

function extractFieldValue(
  jsonRoot: any,
  fieldName: string,
  jsonPath?: string
): string | null {
  // If jsonPath is specified, use path extraction
  if (jsonPath) {
    const result = getByPath(jsonRoot, jsonPath);
    return result !== undefined ? String(result) : null;
  }

  // If fieldName is specified, search recursively
  if (fieldName) {
    const result = findByKey(jsonRoot, fieldName);
    return result !== undefined ? String(result) : null;
  }

  // Neither specified, return root as string
  return jsonRoot != null ? String(jsonRoot) : null;
}

function getByPath(obj: any, path: string): any {
  const parts = path.split('.');
  let current = obj;

  for (const part of parts) {
    if (current == null) return undefined;

    // Handle array indexing like "items[0]"
    const arrayMatch = part.match(/^(.+)\[(\d+)\]$/);
    if (arrayMatch) {
      const [, propName, index] = arrayMatch;
      current = current[propName];
      if (!Array.isArray(current)) return undefined;
      current = current[parseInt(index, 10)];
    } else {
      current = current[part];
    }
  }

  return current;
}

function findByKey(obj: any, key: string, depth: number = 0): any {
  if (depth > 50 || obj == null) return undefined;

  if (typeof obj === 'object') {
    if (key in obj) return obj[key];

    for (const prop in obj) {
      const result = findByKey(obj[prop], key, depth + 1);
      if (result !== undefined) return result;
    }
  }

  return undefined;
}

function extractJson(entry: any, jsonFieldName: string): any {
  if (!entry || !entry[jsonFieldName]) return null;

  const value = entry[jsonFieldName];
  if (typeof value === 'object') return value;

  // Try parsing as JSON string (handles double-encoded JSON)
  try {
    const s = typeof value === 'string' ? value.trim() : String(value);
    if (s.length === 0) return null;

    // Case 1: direct JSON object/array
    if (s[0] === '{' || s[0] === '[') {
      return JSON.parse(s);
    }

    // Case 2: JSON string literal that itself contains JSON
    if (s[0] === '"') {
      const outer = JSON.parse(s);
      if (typeof outer === 'string') {
        const inner = outer.trim();
        if (inner.startsWith('{') || inner.startsWith('[')) {
          return JSON.parse(inner);
        }
      }
      return null;
    }

    // Case 3: try plain parse
    const parsed = JSON.parse(s);
    if (typeof parsed === 'string') {
      // Single-level string wrapping JSON
      const inner = parsed.trim();
      if (inner.startsWith('{') || inner.startsWith('[')) {
        return JSON.parse(inner);
      }
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function getRawMessage(jsonRoot: any, opts: SearchOptions): string {
  if (opts.messageOnly && jsonRoot) {
    return typeof jsonRoot === 'string' ? jsonRoot : JSON.stringify(jsonRoot);
  }

  if (typeof jsonRoot === 'object') {
    return JSON.stringify(jsonRoot, null, 2);
  }

  return String(jsonRoot);
}

function stringEquals(a: string, b: string, caseInsensitive: boolean): boolean {
  if (caseInsensitive) {
    return a.toLowerCase() === b.toLowerCase();
  }
  return a === b;
}
