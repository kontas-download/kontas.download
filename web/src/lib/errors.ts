import { NextResponse } from 'next/server';
export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
// The form was opened for another company than the one active now (company switched in another tab).
export function assertFormCompany(formCompanyId: unknown, activeCompanyId: number) {
  if (formCompanyId !== undefined && formCompanyId !== null && Number(formCompanyId) !== activeCompanyId) throw new HttpError(409, 'Aktyvi įmonė pasikeitė. Perkraukite puslapį.');
}
export function apiError(error: unknown) {
  if(error instanceof Error && error.message==='ACCOUNTING_PERIOD_LOCKED')return NextResponse.json({error:'Laikotarpis uždarytas keitimams. Atidarykite jį įmonės apskaitos kontrolėje, jei taisymas tikrai būtinas.'},{status:409});
  if(error instanceof Error && error.message==='DUPLICATE_DOCUMENT_NUMBER')return NextResponse.json({error:'Dokumentas su šia serija ir numeriu įmonėje jau egzistuoja.'},{status:409});
  if(error instanceof Error && error.message==='Allocated payments exceed document total')return NextResponse.json({error:'Dokumento suma negali būti mažesnė už jau susietus mokėjimus. Pirmiausia ištrinkite arba sumažinkite susiejimus banko skyriuje.'},{status:409});
  if(error instanceof Error && error.message==='INVENTORY_DOCUMENT_POSTED')return NextResponse.json({error:'Dokumentas jau įtrauktas į atsargų apskaitą (pajamuotos arba nurašytos prekės). Jo keisti ar trinti negalima: išrašykite kreditinę sąskaitą arba atlikite atsargų koregavimą.'},{status:409});
  if(error instanceof Error && error.message==='INVENTORY_ITEM_HAS_MOVEMENTS')return NextResponse.json({error:'Atsargų kortelė turi apskaitos judėjimų, todėl jos ištrinti negalima.'},{status:409});
  if(error instanceof Error && error.message==='INVENTORY_MOVEMENT_IMMUTABLE')return NextResponse.json({error:'Atsargų judėjimai nekeičiami: klaidą taisykite nauju koregavimu.'},{status:409});
  if (error instanceof HttpError) return NextResponse.json({ error: error.message }, { status: error.status });
  if (error instanceof SyntaxError) return NextResponse.json({ error: 'Neteisingas JSON' }, { status: 400 });
  const code = (error as { code?: string })?.code || '';
  if (code.startsWith('SQLITE_CONSTRAINT')) return NextResponse.json({ error: 'Operacija pažeidžia duomenų vientisumą arba sukuria dublikatą' }, { status: 409 });
  console.error('API operation failed', error);
  return NextResponse.json({ error: 'Vidinė serverio klaida' }, { status: 500 });
}
