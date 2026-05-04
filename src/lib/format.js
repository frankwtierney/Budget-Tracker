import { format, isValid } from 'date-fns';
import { Timestamp } from 'firebase/firestore';

export function formatCurrency(amount) {
  if (amount == null || isNaN(amount)) return '$0.00';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

export function toDate(value) {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string' || typeof value === 'number') {
    const d = new Date(value);
    return isValid(d) ? d : null;
  }
  return null;
}

export function formatDate(value, fmt = 'MM/dd/yyyy') {
  const d = toDate(value);
  if (!d) return '—';
  return format(d, fmt);
}

export function formatDateLong(value) {
  return formatDate(value, 'MMMM d, yyyy');
}

export function formatDateShort(value) {
  return formatDate(value, 'M/d/yy');
}

export function toTimestamp(date) {
  if (!date) return null;
  if (date instanceof Timestamp) return date;
  const d = typeof date === 'string' ? new Date(date) : date;
  return Timestamp.fromDate(d);
}
