import { companyTaxMode } from '@/lib/tax';
import { importedUnitPrice } from '@/lib/import-values';
import { requireAdminApi, checkOrigin } from '@/lib/access';
import { apiError } from '@/lib/errors';
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const denied = await requireAdminApi();
    if (denied) return denied;
    const forbidden = await checkOrigin(request);
    if (forbidden) return forbidden;
    const { companyId, jsonData } = await request.json();
    const id = parseInt(String(companyId), 10);

    if (isNaN(id)) {
      return NextResponse.json({ error: 'Neteisingas įmonės ID' }, { status: 400 });
    }

    if (!jsonData) {
      return NextResponse.json({ error: 'Trūksta duomenų importui' }, { status: 400 });
    }

    const db = getDb();
    const company = db.prepare('SELECT * FROM Company WHERE id = ?').get(id) as { isVatPayer: number } | undefined;
    if (!company) {
      return NextResponse.json({ error: 'Įmonė nerasta' }, { status: 404 });
    }

    const payload = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
    const data = payload.data || payload;

    const clients = data.clients || [];
    const sales = data.sales || [];
    const saleItems = data.sale_items || [];
    const purchases = data.purchases || [];
    const purchaseItems = data.purchase_items || [];
    const stock = data.stock || [];
    const bankTxns = data.bank_transactions || [];
    const payrolls = data.payrolls || [];
    const payrollEmployees = data.payroll_employees || [];

    const importTransaction = db.transaction(() => {
      // 1. Clients
      const insertClient = db.prepare(`
        INSERT INTO Client (
          companyId, externalId, name, code, vatCode, email, phone, 
          address, city, countryName, isVatPayer, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
      `);

      const clientMap = new Map<number, number>();
      for (const cl of clients) {
        const res = insertClient.run(
          id,
          cl.id || null,
          cl.name || 'Nežinomas klientas',
          cl.code || null,
          cl.vatCode || null,
          cl.email || null,
          cl.phoneNumber || null,
          cl.registrationAddress || cl.address || null,
          cl.registrationCity || cl.city || null,
          cl.registrationCountry || cl.countryName || 'Lietuva',
          typeof cl.isVatPayer === 'boolean' ? Number(cl.isVatPayer) : Number(Boolean(cl.vatCode?.trim()))
        );
        if (cl.id) {
          clientMap.set(cl.id, Number(res.lastInsertRowid));
        }
      }

      // 2. Sales & Items
      const insertSale = db.prepare(`
        INSERT INTO Sale (
          companyId, externalId, series, number, saleDate, payUntil, 
          statusName, warehouseName, clientId, clientName, clientCode, 
          clientVatCode, sumWithoutVat, vat, sumWithVat, currencyCode, 
          operationTypeName, notes, sellerIsVatPayer, sellerVatMode, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '2000-01-01 00:00:00')
      `);

      const insertSaleItem = db.prepare(`
        INSERT INTO SaleItem (
          saleId, itemName, itemCode, quantity, price, priceWithVat, 
          vatRate, sumWithoutVat, sumWithVat, warehouseName
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const saleMap = new Map<number, number>();
      for (const s of sales) {
        const mappedClientId = s.clientId ? clientMap.get(s.clientId) || null : null;
        const res = insertSale.run(
          id,
          s.id || null,
          s.series || '',
          s.number || '',
          s.saleDate || s.date || '2026-01-01',
          s.payUntil || null,
          s.statusName || 'Apmokėta',
          s.warehouseName || 'Pagrindinis',
          mappedClientId,
          s.clientName || null,
          s.clientCode || null,
          s.clientVatCode || null,
          Number(s.sumWithoutVat || 0),
          Number(s.vat || 0),
          Number(s.sumWithVat || 0),
          s.currencyCode || 'EUR',
          s.operationTypeName || null,
          s.notes || null,
          Number(Number(s.vat || 0) !== 0 || companyTaxMode(id,s.saleDate || s.date || '2026-01-01')!=='NON_VAT'),
          Number(s.vat || 0)!==0?'STANDARD_VAT':companyTaxMode(id,s.saleDate || s.date || '2026-01-01')
        );
        if (s.id) {
          saleMap.set(s.id, Number(res.lastInsertRowid));
        }
      }

      for (const si of saleItems) {
        const dbSaleId = saleMap.get(si.saleId);
        if (dbSaleId) {
          insertSaleItem.run(
            dbSaleId,
            si.itemName || si.name || 'Paslauga / Prekė',
            si.itemCode || si.code || null,
            Number(si.quantity || 1),
            importedUnitPrice(si),
            Number(si.priceWithVat || 0),
            Number(si.vatRate || 0),
            Number(si.sumWithoutVat || 0),
            Number(si.sumWithVat || 0),
            si.warehouseName || null
          );
        }
      }

      // 3. Purchases & Items
      const insertPurchase = db.prepare(`
        INSERT INTO Purchase (
          companyId, externalId, series, number, purchaseDate, 
          clientId, clientName, clientCode, sumWithoutVat, vat, 
          sumWithVat, currencyCode, notes, createdAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      `);

      const insertPurchaseItem = db.prepare(`
        INSERT INTO PurchaseItem (
          purchaseId, itemName, itemCode, quantity, price, 
          sumWithoutVat, sumWithVat
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      const purchaseMap = new Map<number, number>();
      for (const p of purchases) {
        const mappedClientId = p.clientId ? clientMap.get(p.clientId) || null : null;
        const res = insertPurchase.run(
          id,
          p.id || null,
          p.series || '',
          p.number || '',
          p.purchaseDate || p.date || '2026-01-01',
          mappedClientId,
          p.clientName || null,
          p.clientCode || null,
          Number(p.sumWithoutVat || 0),
          Number(p.vat || 0),
          Number(p.sumWithVat || 0),
          p.currencyCode || 'EUR',
          p.notes || null
        );
        if (p.id) {
          purchaseMap.set(p.id, Number(res.lastInsertRowid));
        }
      }

      for (const pi of purchaseItems) {
        const dbPurchaseId = purchaseMap.get(pi.purchaseId);
        if (dbPurchaseId) {
          insertPurchaseItem.run(
            dbPurchaseId,
            pi.itemName || pi.name || 'Prekė / Paslauga',
            pi.itemCode || pi.code || null,
            Number(pi.quantity || 1),
            importedUnitPrice(pi),
            Number(pi.sumWithoutVat || 0),
            Number(pi.sumWithVat || 0)
          );
        }
      }

      // 4. Stock
      const insertStock = db.prepare(`
        INSERT INTO StockItem (
          companyId, externalId, name, code, barcode, warehouseName, 
          stock, remainder, price, cost, purchaseDate, clientName
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const st of stock) {
        insertStock.run(
          id,
          st.id || null,
          st.name || 'Prekė',
          st.code || null,
          st.barcode || null,
          st.warehouseName || 'Pagrindinis',
          Number(st.stock || 0),
          Number(st.remainder || 0),
          Number(st.price || 0),
          Number(st.cost || 0),
          st.purchaseDate || null,
          st.clientName || null
        );
      }

      // 5. Bank Transactions
      const insertBank = db.prepare(`
        INSERT INTO BankTransaction (
          companyId, externalId, date, number, clientName, clientCode, 
          sum, correspondenceAccountCode, accountingBankInternalName, notes
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const bt of bankTxns) {
        insertBank.run(
          id,
          bt.id || null,
          bt.date || '2026-01-01',
          bt.number || null,
          bt.clientName || null,
          bt.clientCode || null,
          Number(bt.sum || 0),
          bt.correspondenceAccountCode || null,
          bt.accountingBankInternalName || null,
          bt.notes || null
        );
      }

      // 6. Payrolls & Employees
      const insertPayroll = db.prepare(`
        INSERT INTO Payroll (
          companyId, externalId, year, month, sumWithVat, createdAt
        ) VALUES (?, ?, ?, ?, ?, datetime('now'))
      `);

      const insertPayrollEmp = db.prepare(`
        INSERT INTO PayrollEmployee (
          payrollId, employeeName, employeeCode, grossSalary, 
          netSalary, gpm, sodraEmployee, sodraEmployer
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const payrollMap = new Map<number, number>();
      for (const pr of payrolls) {
        const res = insertPayroll.run(
          id,
          pr.id || null,
          Number(pr.year || 2026),
          Number(pr.month || 1),
          Number(pr.sumWithVat || pr.sum || 0)
        );
        if (pr.id) {
          payrollMap.set(pr.id, Number(res.lastInsertRowid));
        }
      }

      for (const pe of payrollEmployees) {
        const dbPrId = payrollMap.get(pe.payrollId);
        if (dbPrId) {
          insertPayrollEmp.run(
            dbPrId,
            pe.employeeName || 'Darbuotojas',
            pe.employeeCode || null,
            Number(pe.grossSalary || pe.accrued || 0),
            Number(pe.netSalary || pe.payout || 0),
            Number(pe.gpm || 0),
            Number(pe.sodraEmployee || 0),
            Number(pe.sodraEmployer || 0)
          );
        }
      }
    });

    importTransaction();

    return NextResponse.json({
      success: true,
      imported: {
        clients: clients.length,
        sales: sales.length,
        purchases: purchases.length,
        stock: stock.length,
        bank: bankTxns.length,
        payrolls: payrolls.length,
      }
    });
  } catch (err: any) {
    return apiError(err);
  }
}
