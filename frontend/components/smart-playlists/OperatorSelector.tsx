'use client';

import { FIELD_DEFINITIONS, OPERATORS_BY_TYPE } from './types';

interface OperatorSelectorProps {
  field: string;
  value: string;
  onChange: (operator: string) => void;
  disabled?: boolean;
}

export default function OperatorSelector({
  field,
  value,
  onChange,
  disabled,
}: OperatorSelectorProps) {
  const fieldDef = FIELD_DEFINITIONS[field];
  const operators = fieldDef ? OPERATORS_BY_TYPE[fieldDef.type] : [];

  // If current operator is not valid for the field type, select the first valid one
  const validOperator = operators.find((op) => op.value === value)
    ? value
    : operators[0]?.value || '';

  // Auto-update if operator is invalid
  if (validOperator !== value && validOperator) {
    onChange(validOperator);
  }

  return (
    <select
      value={validOperator}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="px-3 py-2 bg-neutral-800 border border-neutral-700 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent min-w-[140px]"
    >
      {operators.map((op) => (
        <option key={op.value} value={op.value}>
          {op.label}
        </option>
      ))}
    </select>
  );
}
