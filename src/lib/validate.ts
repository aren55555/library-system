import { badRequest } from './errors.ts';

export function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw badRequest('invalid_field', `${field} is required`);
  }
  return value.trim();
}

export function requireId(value: unknown, field: string): number {
  const id = typeof value === 'string' ? Number(value) : value;
  if (typeof id !== 'number' || !Number.isInteger(id) || id <= 0) {
    throw badRequest('invalid_field', `${field} must be a positive integer`);
  }
  return id;
}

export function requireAmount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw badRequest('invalid_field', `${field} must be a positive number`);
  }
  return value;
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}
