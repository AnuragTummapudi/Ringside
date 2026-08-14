export type NegotiationMode = 'agent' | 'human'

export interface BillDraft {
  billId?: string
  provider?: string
  planName?: string
  currentMonthlyPrice?: number
  speed?: string
  customerTenure?: string
  contractStatus?: string
  sourceFilename?: string
  confidence?: Record<string, number>
}

export interface NegotiationFormDraft {
  company: string
  currentPrice: string
  targetPrice: string
  notes: string
  tenure: string
  competitor: string
  phone: string
  mode: NegotiationMode
}

export interface NegotiationDraft {
  form: NegotiationFormDraft
  bill: BillDraft | null
  uploadState: 'idle' | 'processing' | 'done' | 'error'
  suggestion: number | null
}

const DRAFT_KEY = 'ringside-new-negotiation-draft'

function isFormDraft(value: unknown): value is NegotiationFormDraft {
  if (!value || typeof value !== 'object') return false
  const form = value as Record<string, unknown>
  return ['company', 'currentPrice', 'targetPrice', 'notes', 'tenure', 'competitor', 'phone'].every((key) => typeof form[key] === 'string') && (form.mode === 'agent' || form.mode === 'human')
}

export function saveNegotiationDraft(draft: NegotiationDraft) {
  sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
}

export function getNegotiationDraft(): NegotiationDraft | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(DRAFT_KEY) || 'null') as Partial<NegotiationDraft> | null
    if (!value || !isFormDraft(value.form)) return null
    return {
      form: value.form,
      bill: value.bill && typeof value.bill === 'object' ? value.bill as BillDraft : null,
      uploadState: ['idle', 'processing', 'done', 'error'].includes(String(value.uploadState)) ? value.uploadState as NegotiationDraft['uploadState'] : 'idle',
      suggestion: typeof value.suggestion === 'number' ? value.suggestion : null,
    }
  } catch {
    return null
  }
}

export function clearNegotiationDraft() {
  sessionStorage.removeItem(DRAFT_KEY)
}
