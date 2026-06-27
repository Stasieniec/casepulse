import type { ClaimStatus, Relation } from '../../shared/types'

/**
 * Single source of truth for status presentation. Every component that needs a
 * status color, label, or tint imports from here — never hardcode a hex.
 */

export const STATUS_HEX: Record<ClaimStatus, string> = {
  well_supported: '#2FBF8F', // emerald
  contested: '#E8A13A', // amber
  contradicted: '#E5484D', // crimson
  gap: '#D9772B', // burnt-orange
  unaddressed: '#5B6675', // slate
}

export const STATUS_LABEL: Record<ClaimStatus, string> = {
  well_supported: 'Supported',
  contested: 'Contested',
  contradicted: 'Contradicted',
  gap: 'Evidence gap',
  unaddressed: 'Unaddressed',
}

/** Short label for tight chips / counters. */
export const STATUS_SHORT: Record<ClaimStatus, string> = {
  well_supported: 'Supported',
  contested: 'Contested',
  contradicted: 'Contradicted',
  gap: 'Gap',
  unaddressed: 'Unaddressed',
}

/** Tailwind text utility per status (tokens defined in tailwind.config). */
export const STATUS_TEXT_CLASS: Record<ClaimStatus, string> = {
  well_supported: 'text-status-supported',
  contested: 'text-status-contested',
  contradicted: 'text-status-contradicted',
  gap: 'text-status-gap',
  unaddressed: 'text-status-unaddressed',
}

export function statusColor(status: ClaimStatus): string {
  return STATUS_HEX[status]
}

export function statusLabel(status: ClaimStatus): string {
  return STATUS_LABEL[status]
}

/** rgba tint of a status color at a given alpha (for highlight fills). */
export function statusTint(status: ClaimStatus, alpha: number): string {
  const hex = STATUS_HEX[status].replace('#', '')
  const r = parseInt(hex.slice(0, 2), 16)
  const g = parseInt(hex.slice(2, 4), 16)
  const b = parseInt(hex.slice(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

/** Color for a relation edge (supports/contradicts/neutral). */
export function relationColor(relation: Relation): string {
  if (relation === 'supports') return STATUS_HEX.well_supported
  if (relation === 'contradicts') return STATUS_HEX.contradicted
  return STATUS_HEX.unaddressed
}

/** Color zone for the readiness gauge (0–100). */
export function scoreZoneColor(score: number): string {
  if (score < 40) return STATUS_HEX.contradicted // red zone
  if (score < 70) return STATUS_HEX.contested // amber zone
  return STATUS_HEX.well_supported // green zone
}
