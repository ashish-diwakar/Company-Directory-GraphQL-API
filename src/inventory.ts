import type { EquipmentInput } from './__generated__/resolvers-types.js';
import { badInput } from './errors.js';

export function equipmentInput(input: EquipmentInput) {
  const result = { type: input.type.trim(), model: input.model.trim(), serialNumber: input.serialNumber.trim().toUpperCase() };
  for (const [field, value] of Object.entries(result)) {
    if (!value || value.length > 100) throw badInput(`${field} must contain between 1 and 100 characters.`);
    if (/[\x00-\x1f\x7f]/.test(value)) throw badInput(`${field} cannot contain control characters.`);
  }
  return result;
}
