import { taxMode, validTaxDate } from '@/lib/tax';
import { requireApiAccess, requireAdminApi, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { currentUser } from '@/lib/access';

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const { id: idStr } = await context.params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Neteisingas ID' }, { status: 400 });
    }

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
    const previous=db.prepare('SELECT taxMode,isVatPayer FROM Company WHERE id=?').get(id) as {taxMode:string|null;isVatPayer:number}|undefined;
    if(!previous)return NextResponse.json({error:'Įmonė nerasta'},{status:404});
    const previousMode=taxMode(previous.taxMode,previous.isVatPayer);
    if(previousMode!==mode && (await currentUser())?.role!=='admin')return NextResponse.json({error:'Įmonės mokesčių režimą gali keisti tik administratorius'},{status:403});
    if(previousMode!==mode && (!validTaxDate(body.taxEffectiveFrom)||body.taxEffectiveFrom<'1900-01-01'))return NextResponse.json({error:'Nurodykite naujo mokesčių režimo pradžios datą'},{status:400});
    db.transaction(()=>{
    if(previousMode!==mode){db.prepare('INSERT OR IGNORE INTO CompanyTaxPeriod VALUES(?,?,?)').run(id,'0001-01-01',previousMode);db.prepare('INSERT INTO CompanyTaxPeriod VALUES(?,?,?) ON CONFLICT(companyId,effectiveFrom) DO UPDATE SET mode=excluded.mode').run(id,body.taxEffectiveFrom,mode);}
    db.prepare(`
      UPDATE Company SET
        name = ?,
        code = ?,
        vatCode = ?,
        isVatPayer = ?,
        taxMode = ?,
        address = ?,
        email = ?,
        phone = ?,
        bankName = ?,
        bankIban = ?,
        bankSwift = ?,
        currencyCode = ?,
        updatedAt = datetime('now')
      WHERE id = ?
    `).run(
      name.trim(),
      code ? code.trim() : null,
      vatCode ? vatCode.trim() : null,
      isVatPayer ? 1 : 0,
      mode,
      address ? address.trim() : null,
      email ? email.trim() : null,
      phone ? phone.trim() : null,
      bankName ? bankName.trim() : null,
      bankIban ? bankIban.trim() : null,
      bankSwift ? bankSwift.trim() : null,
      currencyCode ? currencyCode.trim() : 'EUR',
      id
    );

    }).immediate();

    const updated = db.prepare('SELECT * FROM Company WHERE id = ?').get(id);
    return NextResponse.json({ success: true, company: updated });
  } catch (err: any) {
    return apiError(err);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Deleting a company removes its documents: administrators only.
    const denied = await requireAdminApi();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const { id: idStr } = await context.params;
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      return NextResponse.json({ error: 'Neteisingas ID' }, { status: 400 });
    }

    const db = getDb();

    // Check count of companies
    const totalCount = db.prepare('SELECT COUNT(*) as cnt FROM Company').get() as { cnt: number };
    if (totalCount.cnt <= 1) {
      return NextResponse.json({ error: 'Negalima ištrinti vienintelės įmonės sistemoje' }, { status: 400 });
    }

    // Delete associated data for this company
    const deleteRelated = db.transaction(() => {
      // Payments, recurring templates and credit notes reference other rows and must go first.
      // Append-only evidence tables (invoice archive, supplier XML, reminder log) are deliberately kept.
      db.prepare('DELETE FROM PaymentAllocation WHERE companyId = ?').run(id);
      db.prepare('DELETE FROM ManualSettlement WHERE companyId = ?').run(id);
      db.prepare('DELETE FROM RecurringRun WHERE recurringId IN (SELECT id FROM RecurringInvoice WHERE companyId = ?)').run(id);
      db.prepare('DELETE FROM RecurringInvoice WHERE companyId = ?').run(id);

      // Delete sale items
      db.prepare(`
        DELETE FROM SaleItem WHERE saleId IN (SELECT id FROM Sale WHERE companyId = ?)
      `).run(id);

      // Delete purchase items
      db.prepare(`
        DELETE FROM PurchaseItem WHERE purchaseId IN (SELECT id FROM Purchase WHERE companyId = ?)
      `).run(id);

      // Delete payroll employees
      db.prepare(`
        DELETE FROM PayrollEmployee WHERE payrollId IN (SELECT id FROM Payroll WHERE companyId = ?)
      `).run(id);

      // Delete records
      db.prepare('DELETE FROM GeneralEntry WHERE companyId = ?').run(id);
      db.prepare('DELETE FROM Sale WHERE companyId = ? AND originalSaleId IS NOT NULL').run(id);
      db.prepare('DELETE FROM Sale WHERE companyId = ?').run(id);
      db.prepare('DELETE FROM Purchase WHERE companyId = ? AND originalPurchaseId IS NOT NULL').run(id);
      db.prepare('DELETE FROM Purchase WHERE companyId = ?').run(id);
      db.prepare('DELETE FROM Client WHERE companyId = ?').run(id);
      db.prepare('DELETE FROM StockItem WHERE companyId = ?').run(id);
      db.prepare('DELETE FROM BankTransaction WHERE companyId = ?').run(id);
      db.prepare('DELETE FROM Payroll WHERE companyId = ?').run(id);
      db.prepare('DELETE FROM Company WHERE id = ?').run(id);
    });

    deleteRelated();

    // Fallback active company to default
    const fallback = db.prepare('SELECT id FROM Company ORDER BY id ASC LIMIT 1').get() as { id: number };

    const response = NextResponse.json({ success: true, activeId: fallback.id });
    response.cookies.set({
      name: 'active_company_id',
      value: String(fallback.id),
      httpOnly: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 365 * 24 * 60 * 60
    });

    return response;
  } catch (err: any) {
    return apiError(err);
  }
}
