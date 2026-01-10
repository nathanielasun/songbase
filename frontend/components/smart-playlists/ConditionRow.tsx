'use client';

import { XMarkIcon } from '@heroicons/react/24/outline';
import { Condition, FIELD_DEFINITIONS, OPERATORS_BY_TYPE } from './types';
import FieldSelector from './FieldSelector';
import OperatorSelector from './OperatorSelector';
import ValueInput from './ValueInput';

interface ConditionRowProps {
  condition: Condition;
  onChange: (condition: Condition) => void;
  onRemove: () => void;
  canRemove: boolean;
  disabled?: boolean;
}

export default function ConditionRow({
  condition,
  onChange,
  onRemove,
  canRemove,
  disabled,
}: ConditionRowProps) {
  const handleFieldChange = (field: string) => {
    const fieldDef = FIELD_DEFINITIONS[field];
    const operators = fieldDef ? OPERATORS_BY_TYPE[fieldDef.type] : [];
    const defaultOperator = operators[0]?.value || 'equals';

    // Reset operator and value when field changes
    onChange({
      ...condition,
      field,
      operator: defaultOperator,
      value:
        fieldDef?.type === 'boolean'
          ? true
          : fieldDef?.type === 'similarity'
          ? { sha_id: '', count: 10 }
          : '',
    });
  };

  const handleOperatorChange = (operator: string) => {
    // Reset value for certain operators
    const noValueOps = ['is_true', 'is_false', 'is_null', 'is_not_null', 'never'];
    const newValue = noValueOps.includes(operator) ? null : condition.value;

    onChange({
      ...condition,
      operator,
      value: newValue,
    });
  };

  const handleValueChange = (value: any) => {
    onChange({
      ...condition,
      value,
    });
  };

  return (
    <div className="flex items-center gap-2 p-3 bg-neutral-800/50 rounded-lg border border-neutral-700/50">
      <FieldSelector
        value={condition.field}
        onChange={handleFieldChange}
        disabled={disabled}
      />
      <OperatorSelector
        field={condition.field}
        value={condition.operator}
        onChange={handleOperatorChange}
        disabled={disabled}
      />
      <ValueInput
        field={condition.field}
        operator={condition.operator}
        value={condition.value}
        onChange={handleValueChange}
        disabled={disabled}
      />
      <button
        type="button"
        onClick={onRemove}
        disabled={!canRemove || disabled}
        className={`p-2 rounded-lg transition-colors ${
          canRemove && !disabled
            ? 'text-neutral-400 hover:text-red-400 hover:bg-red-400/10'
            : 'text-neutral-600 cursor-not-allowed'
        }`}
        title={canRemove ? 'Remove condition' : 'Cannot remove the only condition'}
      >
        <XMarkIcon className="w-4 h-4" />
      </button>
    </div>
  );
}
