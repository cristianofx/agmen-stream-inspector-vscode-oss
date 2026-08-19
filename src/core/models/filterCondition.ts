import { FilterOperator } from './filterOperator';

/**
 * Represents a single filter condition for conditional filtering.
 */
export interface FilterCondition {
  /** Field name to match against */
  fieldName: string;
  /** Comparison operator to use */
  operator: FilterOperator;
  /** Value to compare with (not used for Exists operator) */
  value: string;
  /** Optional JSON path for nested field extraction (e.g., "meta.asset_id") */
  jsonPath?: string;
}
