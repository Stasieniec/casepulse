/**
 * Single source of truth for the dataset / generalizability framing. Used on
 * Home, the Extraction Lab, and the persistent shell chip so a judge always
 * grasps: this is the curated Meridian bundle, but the engine runs on any
 * litigation bundle.
 */
export const DATASET_CASE = 'Meridian Retail Group PLC v TechFlow Solutions Ltd'

/** The full framing line — dataset named + the generalization promise. */
export const FRAMING_LINE = `${DATASET_CASE} — the same engine runs on any litigation bundle.`

/** The generalization half, on its own, for places that already name the case. */
export const GENERALIZES_LINE = 'The same engine runs on any litigation bundle.'

/** Short chip label for the shell rail. */
export const DATASET_CHIP = 'Demo dataset'
