[Lietuvių](README.md) | [Русский](README.ru.md) | [English](README.en.md)

# Diegimas serveryje

Minimalus serveris: 1 vCPU, 1 GB RAM (geriau 2 GB), 20 GB disko, Linux su Docker 24+ ir Compose v2. Programa veikia vienu egzemplioriumi (SQLite duomenų bazė yra faile), todėl apkrovos balansuotojai ir bevaldės platformos be nuolatinio disko netinka.

Schema: programos konteineris `kontas-app` pasiekiamas tik per Caddy konteinerį `kontas-caddy`, kuris pats gauna ir atnaujina HTTPS sertifikatą. Išorėje atidaryti tik 80 ir 443 prievadai.

## Pasiruošimas

1. Nukreipkite domeno DNS įrašą (pvz., `apskaita.pavyzdys.lt`) į serverio IP. Atidarykite 80 ir 443 prievadus.
2. Įdiekite Docker ir nukopijuokite saugyklą į serverį (`git clone`; klientams naudokite `git archive HEAD`, kad neperduotumėte istorijos).
3. Jei serveryje mažai atminties (1 GB), atvaizdo (image) kūrimo metu pridėkite 2 GB swap: `fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`. Sukūrus atvaizdą jis nebereikalingas.

## Pirmas paleidimas

```bash
cd deploy
cp .env.example .env
# užpildykite DOMAIN, SMTP_ENCRYPTION_KEY (generavimo komanda yra faile), ADMIN_EMAIL
mkdir -p data && chown -R 1000:1000 data
docker compose -f docker-compose.server.yml --env-file .env up -d --build
docker logs kontas-app      # čia vieną kartą parodomas administratoriaus slaptažodis, jei ADMIN_PASSWORD tuščias
```

Kintamieji faile `.env`:

- `DOMAIN` – viešas domeno vardas (privalomas).
- `SMTP_ENCRYPTION_KEY` – 64 šešioliktainiai simboliai (privalomas); juo šifruojami duomenų bazėje saugomi SMTP slaptažodžiai.
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` – naudojami tik pirmą kartą, kai duomenų bazės dar nėra. Jei `ADMIN_EMAIL` tuščias, bus `admin@kontas.local`; jei `ADMIN_PASSWORD` tuščias, sugeneruojamas atsitiktinis vienkartinis slaptažodis (numatytojo slaptažodžio nėra). Slaptažodis – bent 10 simbolių.

Atidarykite `https://jūsų-domenas`, prisijunkite ir iškart pasikeiskite slaptažodį.

Pirmą kartą paleidus programa sukuria tuščią duomenų bazę su standartiniu Lietuvos sąskaitų planu ir vienu administratoriumi (skriptas `web/scripts/bootstrap.cjs`). Esamos duomenų bazės paleidimo skriptas niekada nekeičia, o migracijas programa taiko pati pirmą kartą kreipusis į duomenis.

## Esamų duomenų perkėlimas

Sustabdykite programą, įdėkite duomenų bazės failą į `deploy/data/dev.db` (šalia neturi būti senų `dev.db-wal` ir `dev.db-shm`), vykdykite `chown 1000:1000`, paleiskite. `SMTP_ENCRYPTION_KEY` turi būti toks pat kaip senajame serveryje, kitaip išsaugotų SMTP slaptažodžių nepavyks iššifruoti. Jei duomenų bazės nėra, sukurkite įmonę skiltyje „Įmonių valdymas“; kitos sistemos duomenis galima įkelti importuojant įmonės paketą.

## Ką reikia saugoti

- **Duomenų bazė:** `deploy/data/dev.db`. Veikiančios bazės atsarginę kopiją darykite SQLite backup mechanizmu, o ne kopijuodami failą: `docker exec kontas-app node -e "const D=require('better-sqlite3');new D('/app/prisma/dev.db',{readonly:true}).backup('/tmp/b.db').then(()=>console.log('ok'))" && docker cp kontas-app:/tmp/b.db ./backup-$(date +%F).db`. Administratorius kopiją gali parsisiųsti ir iš pačios programos (`/api/admin/backup`).
- **Raktas `SMTP_ENCRYPTION_KEY`:** saugokite atskirai nuo duomenų bazės kopijų; be jo išsaugoti SMTP slaptažodžiai nebeperskaitomi ir juos tektų įvesti iš naujo.
- Kopijas laikykite ne šiame serveryje.

## Atnaujinimas

```bash
git pull
docker compose -f docker-compose.server.yml --env-file .env up -d --build
```

Prieš atnaujindami pasidarykite duomenų bazės kopiją. Duomenų bazės migracijos taikomos automatiškai ir tik prideda naujus elementus.

## Slaptažodžio atkūrimas

```bash
docker exec -it kontas-app node scripts/set-password.cjs admin@pavyzdys.lt          # naujas atsitiktinis slaptažodis
docker exec -it kontas-app node scripts/set-password.cjs admin@pavyzdys.lt 'mano-ilgas-slaptazodis'
docker exec -it kontas-app node scripts/set-password.cjs admin@pavyzdys.lt --enable  # taip pat įjungia išjungtą paskyrą
```

Slaptažodis – bent 10 simbolių; visos naudotojo sesijos baigiamos, o prisijungimo bandymų blokavimas panaikinamas. Jei naudotojo paskyra išjungta, be `--enable` slaptažodis pasikeis, bet prisijungti vis tiek nepavyks (programa tai įspės); paskyrą galima įjungti ir skiltyje „Naudotojai“.

## Veikimo patikra

`docker ps` rodo konteinerio `kontas-app` būseną `healthy` (Dockerfile tikrina `/login` puslapį kas 30 s). Žurnalai: `docker logs -f kontas-app`.

## Siunčiamas el. paštas

Sąskaitoms ir priminimams siųsti serveriui reikia prieigos prie SMTP serverio (prievadai 465 arba 587). Kai kurie hostingo teikėjai juos uždaro: jei laiškai nesiunčiami, naudokite savo pašto teikėjo SMTP paslaugą arba paprašykite atidaryti prievadą. SMTP nustatymai įvedami kiekvienos įmonės kortelėje.

## Saugumas

Išorėje atidaryti tik 80 ir 443 prievadai (Caddy); programa pasiekiama tik Docker tinkle. Įjunkite automatinius OS atnaujinimus ir užkardą. Neviešinkite failo `.env` ir katalogo `data`. Daugiau: [../web/SECURITY.md](../web/SECURITY.md).


## Diegimas į Cloudflare (`deploy-all` / `deploy-code`)

`python scripts/cloudflare_containers.py deploy-all` (arba `deploy-code`) atlieka: privalomą atsarginę kopiją (D1 + konteineris) → kodo diegimą → patikrą. Gyvų duomenų jis **nekeičia**; vietinė `web/prisma/dev.db` į D1 nesinchronizuojama. Be sėkmingos kopijos diegimas nevyksta. Reikalingi kintamieji (aplinkoje arba `scripts/.deploy.env`, pavyzdys `scripts/.deploy.env.example`): `KONTAS_ADMIN_EMAIL`, `KONTAS_ADMIN_PASSWORD`, `INTERNAL_BRIDGE_KEY`. Aiškiai pasirinkus `--skip-d1-backup`, D1 kopija praleidžiama (su įspėjimu). Pavojinga komanda `sync-d1 --from-local-dev-db` reikalauja interaktyviai įvesti domeną, daro kopiją ir sustoja, jei gyvų įrašų daugiau nei vietinių (be `--allow-data-loss`).
