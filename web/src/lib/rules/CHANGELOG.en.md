[Lietuvių](CHANGELOG.md) · [Русский](CHANGELOG.ru.md) · **English**

# Rules registry change log

Every change of the registry (`src/lib/rules`) is recorded here: what changed, on what basis, who checked it and when. Old entries are never deleted: when a law changes, a new entry is added and the old one gets its `effectiveTo`.

## 2026-10-27 – initial registry

- Registry created; values moved out of the calculation code without changing the program's behaviour.
- `vat.rate.standard` 21%, `vat.rate.reduced9` 9%, `vat.rate.reduced5` 5% (in the registry from 2016-10-01), `vat.rate.reduced12` 12% (from 2026-01-01): `verified`, basis – VMI table "Dažniausiai pasitaikančių sandorių deklaravimas FR0600 + i.SAF kodas" (2025-12-17) and the i.SAF codes PVM1, PVM2, PVM3, PVM58.
- `isaf.taxCodes.catalogue` – reference to the i.SAF code catalogue `lib/tax-codes.ts`: `verified`, same basis.
- `vat.return.dueDay` day 25, `calendar.fr0564.dueDay` day 25, `calendar.gpm313.dueDay` day 15, `calendar.gpm312.due` 02-15, `calendar.pln204.due` 06-15: `provisional`, awaiting the accountant's check.
- `payroll.gpm.rate` 20%, `payroll.sodra.employee` 19.5%, `payroll.sodra.employer` 1.77% (payroll form suggestion): `provisional`, awaiting the accountant's check.
- Checked by: kontas.download (automatinė peržiūra), 2026-10-27. Next check by 2026-12-31.
