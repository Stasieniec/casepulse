/**
 * Evidence bundle metadata: real document dates/categories from the bundle
 * index, plus faked-but-plausible handover metadata (upload date, version,
 * custodian) to power the Evidence Repository's version-control view.
 *
 * Upload batches:
 *   Documentary evidence (D03–D15)  — Standard Disclosure:    2025-07-18
 *   Witness statements (D16–D18)    — Exchange:               2026-03-13
 *   Expert reports (D19–D20)        — Service:                2026-04-24
 *
 * D16 (Helena Vance) is deliberately v2 to demonstrate version control.
 */

export type DocCategory =
  | 'Contract'
  | 'Amendment'
  | 'Record'
  | 'Correspondence'
  | 'Internal record'
  | 'Witness (fact)'
  | 'Witness (expert)'

export interface DocMeta {
  id: string
  title: string
  category: DocCategory
  /** Document's own date (or date range) as a display string. */
  docDate: string
  /** ISO-8601 date the document was uploaded/disclosed to the bundle. */
  uploadedAt: string
  /** Version tag — all v1 except D16 which is v2. */
  version: string
  /** For D16: human-readable note explaining the supersession. */
  supersededNote?: string
  /** The instructing / disclosing solicitor or firm. */
  custodian: string
}

export const DOC_META: Record<string, DocMeta> = {
  D03: {
    id: 'D03',
    title: 'Master Services Agreement',
    category: 'Contract',
    docDate: '14 Mar 2024',
    uploadedAt: '2025-07-18T09:00:00Z',
    version: 'v1',
    custodian: 'Caldwell Pryce LLP',
  },
  D04: {
    id: 'D04',
    title: 'Statement of Work (SOW-01)',
    category: 'Contract',
    docDate: '14 Mar 2024',
    uploadedAt: '2025-07-18T09:12:00Z',
    version: 'v1',
    custodian: 'Caldwell Pryce LLP',
  },
  D05: {
    id: 'D05',
    title: 'Order Form (Phase 1)',
    category: 'Contract',
    docDate: '20 Mar 2024',
    uploadedAt: '2025-07-18T09:24:00Z',
    version: 'v1',
    custodian: 'Caldwell Pryce LLP',
  },
  D06: {
    id: 'D06',
    title: 'Deed of Variation No. 1',
    category: 'Amendment',
    docDate: '28 Jun 2024',
    uploadedAt: '2025-07-18T09:36:00Z',
    version: 'v1',
    custodian: 'Caldwell Pryce LLP',
  },
  D07: {
    id: 'D07',
    title: 'Change Order No. 3 (loyalty)',
    category: 'Amendment',
    docDate: '2 Sep 2024',
    uploadedAt: '2025-07-18T09:48:00Z',
    version: 'v1',
    custodian: 'Caldwell Pryce LLP',
  },
  D08: {
    id: 'D08',
    title: 'Phase-1 UAT Acceptance Certificate',
    category: 'Record',
    docDate: '12 Nov 2024',
    uploadedAt: '2025-07-18T10:00:00Z',
    version: 'v1',
    custodian: 'Caldwell Pryce LLP',
  },
  D09: {
    id: 'D09',
    title: 'Email — go-live decision',
    category: 'Correspondence',
    docDate: '24 Oct 2024',
    uploadedAt: '2025-07-18T10:12:00Z',
    version: 'v1',
    custodian: 'Caldwell Pryce LLP',
  },
  D10: {
    id: 'D10',
    title: 'Email — loyalty change request',
    category: 'Correspondence',
    docDate: '21–27 Aug 2024',
    uploadedAt: '2025-07-18T10:24:00Z',
    version: 'v1',
    custodian: 'Caldwell Pryce LLP',
  },
  D11: {
    id: 'D11',
    title: 'Email — 25 Nov outage root cause',
    category: 'Correspondence',
    docDate: '26 Nov 2024',
    uploadedAt: '2025-07-18T10:36:00Z',
    version: 'v1',
    custodian: 'Caldwell Pryce LLP',
  },
  D12: {
    id: 'D12',
    title: 'Email — internal, Q4 trading',
    category: 'Internal record',
    docDate: '8 Dec 2024',
    uploadedAt: '2025-07-18T10:48:00Z',
    version: 'v1',
    custodian: 'Caldwell Pryce LLP',
  },
  D13: {
    id: 'D13',
    title: 'Platform defect / issue log',
    category: 'Internal record',
    docDate: 'Nov 2024–Jan 2025',
    uploadedAt: '2025-07-18T11:00:00Z',
    version: 'v1',
    custodian: 'Caldwell Pryce LLP',
  },
  D14: {
    id: 'D14',
    title: 'Letter — Notice of Termination',
    category: 'Correspondence',
    docDate: '20 Jan 2025',
    uploadedAt: '2025-07-18T11:12:00Z',
    version: 'v1',
    custodian: 'Caldwell Pryce LLP',
  },
  D15: {
    id: 'D15',
    title: 'Letter — TechFlow response',
    category: 'Correspondence',
    docDate: '7 Feb 2025',
    uploadedAt: '2025-07-18T11:24:00Z',
    version: 'v1',
    custodian: 'Caldwell Pryce LLP',
  },
  D16: {
    id: 'D16',
    title: 'Witness statement — Helena Vance',
    category: 'Witness (fact)',
    docDate: '13 Mar 2026',
    uploadedAt: '2026-03-13T09:00:00Z',
    version: 'v2',
    supersededNote: 'v2 — amended 13 Mar → 20 Mar 2026; supersedes v1',
    custodian: 'Caldwell Pryce LLP',
  },
  D17: {
    id: 'D17',
    title: 'Witness statement — Raymond Okafor',
    category: 'Witness (fact)',
    docDate: '13 Mar 2026',
    uploadedAt: '2026-03-13T09:30:00Z',
    version: 'v1',
    custodian: 'Caldwell Pryce LLP',
  },
  D18: {
    id: 'D18',
    title: 'Witness statement — Priya Nair',
    category: 'Witness (fact)',
    docDate: '13 Mar 2026',
    uploadedAt: '2026-03-13T10:00:00Z',
    version: 'v1',
    custodian: 'Caldwell Pryce LLP',
  },
  D19: {
    id: 'D19',
    title: 'Expert report — Dr Whitfield (IT)',
    category: 'Witness (expert)',
    docDate: '24 Apr 2026',
    uploadedAt: '2026-04-24T09:00:00Z',
    version: 'v1',
    custodian: 'Caldwell Pryce LLP',
  },
  D20: {
    id: 'D20',
    title: 'Expert report — Greenhalgh (quantum)',
    category: 'Witness (expert)',
    docDate: '24 Apr 2026',
    uploadedAt: '2026-04-24T11:00:00Z',
    version: 'v1',
    custodian: 'Caldwell Pryce LLP',
  },
}
