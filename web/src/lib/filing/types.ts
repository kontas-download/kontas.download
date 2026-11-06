import type Database from 'better-sqlite3';
import type { ApiProvider, ConnectionStatus } from '../api-access';
import type { PreparedObligation } from '../tax-prepare';

// Filing providers are the state systems a declaration may be sent to. No provider sends anything yet: submit and checkStatus return
// NOT_IMPLEMENTED with a message that tells the person to file the downloaded file by hand.
export type FilingProviderId = Extract<ApiProvider, 'VMI_EDS' | 'SODRA_EDAS' | 'RC'>;
export type FilingResultCode = 'NOT_IMPLEMENTED' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'ERROR';
export interface FilingResult { result: FilingResultCode; message: string; ref: string | null }

export interface FilingProvider {
  id: FilingProviderId;
  label: string;
  /** Where the file is filed by hand. */
  manualUrl: string;
  supports(formCode: string): boolean;
  status(db: Database.Database, companyId: number): ConnectionStatus;
  submit(db: Database.Database, companyId: number, doc: PreparedObligation): Promise<FilingResult>;
  checkStatus(db: Database.Database, companyId: number, submissionRef: string | null): Promise<FilingResult>;
}
