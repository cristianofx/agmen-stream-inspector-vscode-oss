import { FilterCondition } from './filterCondition';
import { LogicalOperator } from './logicalOperator';

/**
 * Represents a group of filter conditions combined with a logical operator.
 * Supports nested groups for complex expressions like (A AND B) OR (C AND D).
 */
export interface ConditionalFilterGroup {
  /** Direct filter conditions in this group */
  conditions: FilterCondition[];
  /** Logical operator for combining conditions and nested groups */
  operator: LogicalOperator;
  /** Nested filter groups for complex logical expressions */
  nestedGroups?: ConditionalFilterGroup[];
}
