import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges conditional class names and resolves Tailwind conflicts.
 *
 * `clsx` handles conditionals; `twMerge` ensures a later `p-4` beats an earlier
 * `p-2` from a base variant instead of both landing in the class list and
 * depending on stylesheet order.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
