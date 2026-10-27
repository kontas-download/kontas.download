import { companyTaxMode, purchaseDebitAccount, purchaseTax, taxMode } from '@/lib/tax';
import { calculateLine, totalLines } from '@/lib/money';
import { restoreLineCodes, snapshotLineCodes } from '@/lib/tax-line-codes';
import { validateBody } from '@/lib/validation';
import { requireApiAccess, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { getActiveCompanyId } from '@/lib/company';

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
    const id = Number(idStr);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Neteisingas ID' }, { status: 400 });

    const companyId = await getActiveCompanyId();
    if (!getDb().prepare('SELECT id FROM Purchase WHERE id = ? AND companyId = ?').get(id, companyId)) return NextResponse.json({ error: 'Įrašas nerastas' }, { status: 404 });
    const locked = getDb().prepare("SELECT docType, EXISTS(SELECT 1 FROM Purchase c WHERE c.originalPurchaseId=Purchase.id) AS credited FROM Purchase WHERE id=? AND companyId=?").get(id, companyId) as { docType: string | null; credited: number };
    if (locked.docType === 'KS') return NextResponse.json({ error: 'Kreditinio dokumento redaguoti negalima: ištrinkite jį ir sukurkite naują.' }, { status: 409 });
    if (locked.credited) return NextResponse.json({ error: 'Dokumentas turi kreditinių dokumentų: pirmiausia ištrinkite juos.' }, { status: 409 });
    const body = await request.json();
    validateBody(body, 'purchases', companyId);
    const { 
      series, 
      number, 
      purchaseDate, 
      clientId, 
      clientName, 
      clientCode, 
      notes, 
      items = [] 
    } = body;

    const db = getDb();

    const { sumWithoutVat, sumWithVat, vat } = totalLines(items);
    const snapshot=db.prepare('SELECT buyerVatMode,deductionPercent,debitAccount FROM Purchase WHERE id=? AND companyId=?').get(id,companyId) as {buyerVatMode:string|null;deductionPercent:number|null;debitAccount:string|null};
    const mode=snapshot.buyerVatMode?taxMode(snapshot.buyerVatMode):companyTaxMode(companyId,purchaseDate);
    const {deductionPercent,deductibleVat}=purchaseTax(vat,mode,body.deductionPercent ?? snapshot.deductionPercent ?? undefined);
    const debitAccount=body.debitAccount===undefined?snapshot.debitAccount:purchaseDebitAccount(db,body.debitAccount);


    let droppedTaxCodes: { itemName: string; taxCode: string }[] = [];
    const updateTx = db.transaction(() => {
      db.prepare(`
        UPDATE Purchase SET
          series = ?,
          number = ?,
          purchaseDate = ?,
          clientId = ?,
          clientName = ?,
          clientCode = ?,
          sumWithoutVat = ?,
          vat = ?,
          sumWithVat = ?,
          notes = ?,
          buyerVatMode = ?, deductionPercent = ?, deductibleVat = ?, debitAccount = ?
        WHERE id = ? AND companyId = ?
      `).run(
        series || '',
        String(number).trim(),
        purchaseDate,
        clientId ? Number(clientId) : null,
        clientName || null,
        clientCode || null,
        sumWithoutVat,
        vat,
        sumWithVat,
        notes || null,
        mode, deductionPercent, deductibleVat, debitAccount,
        id,
        companyId
      );

      // Replace items
      const codesBefore = snapshotLineCodes(db, 'PURCHASE', id);
      db.prepare('DELETE FROM PurchaseItem WHERE purchaseId = ?').run(id);

      const insertItem = db.prepare(`
        INSERT INTO PurchaseItem (
          purchaseId, itemName, itemCode, quantity, price, sumWithoutVat, sumWithVat, vatRate
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const it of items) {
        const { qty, price, vatRate, lineNoVat, lineWithVat } = calculateLine(it);
        insertItem.run(
          id,
          it.itemName || 'Prekė / Paslauga',
          it.itemCode || null,
          qty,
          price,
          lineNoVat,
          lineWithVat,
          vatRate
        );
      }
      // The accountant's i.SAF codes follow the lines; a code that fits no new line is reported and the document is marked for review.
      droppedTaxCodes = restoreLineCodes(db, companyId, 'PURCHASE', id, codesBefore);
    });

    updateTx();
    const updated = db.prepare('SELECT * FROM Purchase WHERE id = ? AND companyId = ?').get(id, companyId);
    return NextResponse.json({ success: true, purchase: updated, items:db.prepare('SELECT * FROM PurchaseItem WHERE purchaseId=? ORDER BY id').all(id), droppedTaxCodes });
  } catch (err: any) {
    return apiError(err);
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const denied = await requireApiAccess();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const { id: idStr } = await context.params;
    const id = Number(idStr);
    if (!Number.isSafeInteger(id) || id <= 0) return NextResponse.json({ error: 'Neteisingas ID' }, { status: 400 });

    const companyId = await getActiveCompanyId();
    if (!getDb().prepare('SELECT id FROM Purchase WHERE id = ? AND companyId = ?').get(id, companyId)) return NextResponse.json({ error: 'Įrašas nerastas' }, { status: 404 });
    const db = getDb();

    const deleteTx = db.transaction(() => {
      db.prepare('DELETE FROM PurchaseItem WHERE purchaseId = ?').run(id);
      db.prepare('DELETE FROM Purchase WHERE id = ? AND companyId = ?').run(id, companyId);
    });

    deleteTx();
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return apiError(err);
  }
}
