**Lietuvių** · [Русский](CHANGELOG.ru.md) · [English](CHANGELOG.en.md)

# Taisyklių registro pakeitimų žurnalas

Kiekvienas registro (`src/lib/rules`) pakeitimas įrašomas čia: kas pakeista, kokiu pagrindu, kas ir kada patikrino. Seni įrašai netrinami: pasikeitus teisės aktui pridedamas naujas įrašas, o senojo `effectiveTo` užbaigiamas.

## 2026-10-27 – pradinis registras

- Sukurtas registras; reikšmės perkeltos iš skaičiavimo kodo nekeičiant programos elgsenos.
- `vat.rate.standard` 21 %, `vat.rate.reduced9` 9 %, `vat.rate.reduced5` 5 % (registre nuo 2016-10-01), `vat.rate.reduced12` 12 % (nuo 2026-01-01): `verified`, pagrindas – VMI lentelė „Dažniausiai pasitaikančių sandorių deklaravimas FR0600 + i.SAF kodas“ (2025-12-17) ir i.SAF kodai PVM1, PVM2, PVM3, PVM58.
- `isaf.taxCodes.catalogue` – nuoroda į i.SAF kodų katalogą `lib/tax-codes.ts`: `verified`, tas pats pagrindas.
- `vat.return.dueDay` 25 d., `calendar.fr0564.dueDay` 25 d., `calendar.gpm313.dueDay` 15 d., `calendar.gpm312.due` 02-15, `calendar.pln204.due` 06-15: `provisional`, laukia buhalterio patikros.
- `payroll.gpm.rate` 20 %, `payroll.sodra.employee` 19,5 %, `payroll.sodra.employer` 1,77 % (darbo užmokesčio formos pasiūlymas): `provisional`, laukia buhalterio patikros.
- Patikrino: kontas.download (automatinė peržiūra), 2026-10-27. Kita patikra – iki 2026-12-31.
