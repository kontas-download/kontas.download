[Lietuvių](DOCUMENTS.md) | [Русский](DOCUMENTS.ru.md) | [English](DOCUMENTS.en.md)

# Kliento sąskaitos ir el. paštas

Spausdinimo veiksmas sukuria atskirą A4 PDF per `/api/invoices/:id/pdf`. Peržiūra, atsisiuntimas ir naršyklės PDF spausdinimas naudoja tą patį dokumentą. Vidiniai mokėjimo statusai ir pastabos į PDF neįtraukiami. Ilgos lentelės tęsiasi kituose puslapiuose su pakartojamomis stulpelių antraštėmis ir puslapių numeriais. PDF kalbą (lietuvių, rusų ar anglų) galima pasirinkti pagal pirkėją.

Pardavėjo PVM statusą nustatykite skiltyje „Įmonių valdymas“. Naujos ne PVM mokėtojo sąskaitos neskaičiuoja PVM, o sumos be PVM ir su PVM sutampa. Kiekviena sąskaita išsaugo pardavėjo mokesčių statusą, todėl vėlesni įmonės pakeitimai tyliai nekeičia istorinių dokumentų. Pirkėjo PVM statusas yra atskiras.

Kiekvienos įmonės kortelėje pasirinkite **El. pašto / SMTP nustatymai**. Nurodykite siuntėjo adresą, SMTP serverį, prievadą, TLS/STARTTLS ir prisijungimo duomenis, kuriuos suteikė tos įmonės pašto teikėjas. Bendro atsarginio siuntėjo nėra: naudojami tik pardavėjo įmonės nustatymai. SMTP slaptažodžiai šifruojami AES-256-GCM ir niekada negrąžinami į naršyklę. Redaguojant tuščias slaptažodžio laukas palieka išsaugotą slaptažodį.

`SMTP_ENCRYPTION_KEY` (64 šešioliktainiai simboliai) sugeneruokite vieną kartą ir saugokite saugiai; komanda yra faile `.env.example`. Be rakto SMTP nustatymų išsaugoti negalima. Naudojant Docker, raktas perduodamas vykdymo metu (pvz., `docker compose --env-file web/.env up -d --build` arba per `deploy/.env` serveryje) ir niekada nekopijuojamas į atvaizdą. Raktą saugokite atskirai nuo duomenų bazės kopijų ir neįtraukite į Git.

Paspaudę kliento el. paštą, pasirinkite sąskaitą, peržiūrėkite gavėją, tekstą ir PDF, tada siųskite. SMTP serverio priėmimas rodomas kaip priėmimas, o ne kaip garantuotas pristatymas į gautuosius. Pakartotiniai bandymai naudoja tą patį idempotentiškumo identifikatorių. Jei rezultatas neaiškus, prieš kurdami naują siuntimą patikrinkite pašto dėžutę. Sėkmingai išsiųsto laiško PDF priedas (baitai, SHA-256, gavėjas) išsaugomas nekeičiamame archyve.

Patikra: `npm test`, `npm run build`; atskiras gamybos patikrinimas naudoja `NEXT_BUILD_DIR=.next-audit` ir `node tests/production-smoke.mjs`. Joks bandymas nesiunčia tikrų laiškų.
