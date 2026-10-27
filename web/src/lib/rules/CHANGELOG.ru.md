[Lietuvių](CHANGELOG.md) · **Русский** · [English](CHANGELOG.en.md)

# Журнал изменений реестра правил

Каждое изменение реестра (`src/lib/rules`) записывается здесь: что изменено, на каком основании, кто и когда проверил. Старые записи не удаляются: при изменении правового акта добавляется новая запись, а у старой заполняется `effectiveTo`.

## 2026-10-27 — начальный реестр

- Создан реестр; значения перенесены из кода расчётов без изменения поведения программы.
- `vat.rate.standard` 21 %, `vat.rate.reduced9` 9 %, `vat.rate.reduced5` 5 % (в реестре с 2016-10-01), `vat.rate.reduced12` 12 % (с 2026-01-01): `verified`, основание — таблица VMI «Dažniausiai pasitaikančių sandorių deklaravimas FR0600 + i.SAF kodas» (2025-12-17) и коды i.SAF PVM1, PVM2, PVM3, PVM58.
- `isaf.taxCodes.catalogue` — ссылка на каталог кодов i.SAF `lib/tax-codes.ts`: `verified`, то же основание.
- `vat.return.dueDay` 25-е число, `calendar.fr0564.dueDay` 25-е число, `calendar.gpm313.dueDay` 15-е число, `calendar.gpm312.due` 02-15, `calendar.pln204.due` 06-15: `provisional`, ждут проверки бухгалтером.
- `payroll.gpm.rate` 20 %, `payroll.sodra.employee` 19,5 %, `payroll.sodra.employer` 1,77 % (предложение в форме зарплаты): `provisional`, ждут проверки бухгалтером.
- Проверил: kontas.download (automatinė peržiūra), 2026-10-27. Следующая проверка — до 2026-12-31.
