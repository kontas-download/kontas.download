import { z } from 'zod';

const text = z.string().nullable();
const num = z.number().nullable();

// What a recognition provider returns for one purchase document. Every value that is not clearly printed stays null.
export const RecognizedDocumentSchema = z.object({
  docKind: z.enum(['INVOICE', 'RECEIPT', 'CREDIT_NOTE', 'OTHER']),
  supplier: z.object({ name: text, code: text, vatCode: text, address: text }),
  buyer: z.object({ name: text, code: text, vatCode: text }),
  series: text,
  number: text,
  issueDate: text,
  dueDate: text,
  currency: text,
  lines: z.array(z.object({ name: text, quantity: num, unitPrice: num, net: num, vatRate: num, vat: num, gross: num })),
  totals: z.object({ net: num, vat: num, gross: num }),
  vatBreakdown: z.array(z.object({ rate: num, net: num, vat: num })),
  // Cash register receipt data (kasos kvitas / cekis); null for documents without it.
  receipt: z.object({ cashRegisterNo: text, receiptNo: text, time: text, storeAddress: text }).nullable(),
  payment: z.object({ method: z.enum(['CARD', 'CASH', 'TRANSFER', 'OTHER']).nullable(), cardLast4: text }),
  uncertainFields: z.array(z.string()),
  notes: text,
});
export type RecognizedDocument = z.infer<typeof RecognizedDocumentSchema>;

export interface RecognitionProvider {
  recognize(file: { data: Buffer; mimeType: string }, opts: { apiKey: string; model: string }): Promise<RecognizedDocument>;
  // Tiny text-only request that proves the key and the model work. Throws RecognitionError.
  testKey(apiKey: string, model: string): Promise<void>;
}

// Typed failure of a recognition attempt; the message is shown to the user and saved on the document.
export class RecognitionError extends Error {
  constructor(public code: 'AUTH' | 'RATE_LIMIT' | 'API' | 'REFUSED' | 'TRUNCATED' | 'EMPTY', message: string) { super(message); }
}
