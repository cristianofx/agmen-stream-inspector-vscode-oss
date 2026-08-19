/**
 * Operators for conditional filter matching.
 */
export enum FilterOperator {
  /** Exact string equality match */
  Equals = 'Equals',
  /** Negated equality match */
  NotEquals = 'NotEquals',
  /** Substring contains match */
  Contains = 'Contains',
  /** Field exists in the message (value is ignored) */
  Exists = 'Exists'
}
