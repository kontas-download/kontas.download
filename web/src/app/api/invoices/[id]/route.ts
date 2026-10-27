import { companyTaxMode, taxMode } from '@/lib/tax';
import { calculateLine, totalLines } from '@/lib/money';
import { restoreLineCodes, snapshotLineCodes } from '@/lib/tax-line-codes';
import { validateBody } from '@/lib/validation';
import { requireApiAccess, checkOrigin, withCurrentActor } from '@/lib/access';
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
    if (!getDb().prepare('SELECT id FROM Sale WHERE id = ? AND companyId = ?').get(id, companyId)) return NextResponse.json({ error: 'Įrašas nerastas' }, { status: 404 });
    const locked = getDb().prepare("SELECT docType, EXISTS(SELECT 1 FROM Sale c WHERE c.originalSaleId=Sale.id) AS credited FROM Sale WHERE id=? AND companyId=?").get(id, companyId) as {docType:string|null;credited:number};
    if (locked.docType === 'KS') return NextResponse.json({ error: 'Kreditinis dokumentas nėra redaguojamas: ištrinkite jį ir sukurkite naują.' }, { status: 409 });
    if (locked.credited) return NextResponse.json({ error: 'Sąskaita turi kreditinių dokumentų: pirmiausia juos ištrinkite.' }, { status: 409 });
    const body = await request.json();
    const snapshot = getDb().prepare('SELECT sellerVatMode,sellerIsVatPayer FROM Sale WHERE id=? AND companyId=?').get(id, companyId) as {sellerVatMode:string|null;sellerIsVatPayer:number};
    const mode=taxMode(snapshot.sellerVatMode,snapshot.sellerIsVatPayer);
    const vatStatus={isVatPayer:mode==='STANDARD_VAT'};
    if (Array.isArray(body?.items) && !vatStatus.isVatPayer) {
      if (body.items.some((item: { vatRate?: unknown }) => item && Number(item.vatRate ?? 0) !== 0)) return NextResponse.json({ error: 'Esant režimui be PVM arba SVS, pardavime PVM neskaičiuojamas' }, { status: 400 });
      body.items = body.items.map((item: object) => ({ ...item, vatRate: 0 }));
    }
    validateBody(body, 'invoices', companyId);
    const { 
      series, 
      number, 
      saleDate, 
      payUntil, 
      statusName, 
      warehouseName, 
      clientId, 
      clientName, 
      clientCode, 
      clientVatCode, 
      notes, 
      items = [] 
    } = body;

    const db = getDb();

    const { sumWithoutVat, sumWithVat, vat } = totalLines(items);


    let droppedTaxCodes: { itemName: string; taxCode: string }[] = [];
    const updateTx = db.transaction(() => {
      db.prepare(`
        UPDATE Sale SET
          series = ?,
          number = ?,
          saleDate = ?,
          payUntil = ?,
          statusName = ?,
          warehouseName = ?,
          clientId = ?,
          clientName = ?,
          clientCode = ?,
          clientVatCode = ?,
          sumWithoutVat = ?,
          vat = ?,
          sumWithVat = ?,
          notes = ?
        WHERE id = ? AND companyId = ?
      `).run(
        series || 'PARD',
        String(number).trim(),
        saleDate,
        payUntil || null,
        statusName || 'Apmokėta',
        warehouseName || 'Pagrindinis',
        clientId ? Number(clientId) : null,
        clientName || null,
        clientCode || null,
        clientVatCode || null,
        sumWithoutVat,
        vat,
        sumWithVat,
        notes || null,
        id,
        companyId
      );

      // Replace items
      const codesBefore = snapshotLineCodes(db, 'SALE', id);
      db.prepare('DELETE FROM SaleItem WHERE saleId = ?').run(id);

      const insertItem = db.prepare(`
        INSERT INTO SaleItem (
          saleId, itemName, itemCode, quantity, price, priceWithVat,
          vatRate, sumWithoutVat, sumWithVat, warehouseName
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const it of items) {
        const { qty, price, vatRate, lineNoVat, lineWithVat } = calculateLine(it);
        insertItem.run(
          id,
          it.itemName || 'Paslauga',
          it.itemCode || null,
          qty,
          price,
          lineWithVat / qty,
          vatRate,
          lineNoVat,
          lineWithVat,
          warehouseName || 'Pagrindinis'
        );
      }
      // The accountant's i.SAF codes follow the lines; a code that fits no new line is reported and the document is marked for review.
      droppedTaxCodes = restoreLineCodes(db, companyId, 'SALE', id, codesBefore);
    });

    await withCurrentActor(updateTx);
    const updated = db.prepare('SELECT * FROM Sale WHERE id = ? AND companyId = ?').get(id, companyId);
    return NextResponse.json({ success: true, sale: updated, items: db.prepare('SELECT * FROM SaleItem WHERE saleId=? ORDER BY id').all(id), droppedTaxCodes });
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
    if (!getDb().prepare('SELECT id FROM Sale WHERE id = ? AND companyId = ?').get(id, companyId)) return NextResponse.json({ error: 'Įrašas nerastas' }, { status: 404 });
    const db = getDb();

    const deleteTx = db.transaction(() => {
      db.prepare('DELETE FROM SaleItem WHERE saleId = ?').run(id);
      db.prepare('DELETE FROM Sale WHERE id = ? AND companyId = ?').run(id, companyId);
    });

    await withCurrentActor(deleteTx);
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return apiError(err);
  }
}
