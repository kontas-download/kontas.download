import { taxMode, validTaxDate } from '@/lib/tax';
import { requireApiAccess, requireAdminApi, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getAllCompanies, getActiveCompanyId } from '@/lib/company';

export async function GET() {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const companies = getAllCompanies();
    const activeId = await getActiveCompanyId();
    return NextResponse.json({
      companies,
      activeId
    });
  } catch (err: any) {
    return apiError(err);
  }
}

export async function POST(request: Request) {
  try {
    // Creating companies is an administrator decision; accountants work in the existing ones.
    const denied = await requireAdminApi();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const body = await request.json();
    const { 
      name, 
      code, 
      vatCode, 
      address, 
      email, 
      phone, 
      bankName, 
      bankIban, 
      bankSwift, 
      currencyCode 
    } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Pavadinimas privalomas' }, { status: 400 });
    }

    if (body.isVatPayer !== undefined && typeof body.isVatPayer !== 'boolean') return NextResponse.json({ error: 'Neteisingas PVM statusas' }, { status: 400 });
    const mode = taxMode(body.taxMode, body.isVatPayer ?? Boolean(vatCode?.trim()));
    const isVatPayer = mode !== 'NON_VAT';
    if(mode==='SVS_LT' && !vatCode?.trim())return NextResponse.json({error:'SVS režimui nurodykite įmonės PVM kodą'},{status:400});
    const db = getDb();
    const result = db.prepare(`
      INSERT INTO Company (
        name, code, vatCode, address, email, phone, isVatPayer, taxMode,
        bankName, bankIban, bankSwift, currencyCode, isDefault,
        createdAt, updatedAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, datetime('now'), datetime('now'))
    `).run(
      name.trim(),
      code ? code.trim() : null,
      vatCode ? vatCode.trim() : null,
      address ? address.trim() : null,
      email ? email.trim() : null,
      phone ? phone.trim() : null,
      isVatPayer ? 1 : 0,
      mode,
      bankName ? bankName.trim() : null,
      bankIban ? bankIban.trim() : null,
      bankSwift ? bankSwift.trim() : null,
      currencyCode ? currencyCode.trim() : 'EUR'
    );

    const newCompanyId = Number(result.lastInsertRowid);
    const newCompany = db.prepare('SELECT * FROM Company WHERE id = ?').get(newCompanyId);

    const response = NextResponse.json({
      success: true,
      company: newCompany
    });

    // Optionally set as active company right away
    response.cookies.set({
      name: 'active_company_id',
      value: String(newCompanyId),
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 365 * 24 * 60 * 60 // 1 year
    });

    return response;
  } catch (err: any) {
    return apiError(err);
  }
}
