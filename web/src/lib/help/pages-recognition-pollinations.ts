import { DEFAULT_POLLINATIONS_MODEL, POLLINATIONS_KEYS_URL, POLLINATIONS_MODELS } from '../recognition/pollinations-models';
import type { HelpPage } from './types';

// Help for the second recognition provider. A separate file because release_tree.py allows the host names and model ids (they contain the
// token "ai") only in the Pollinations files; the other help pages stay free of them.
const models = POLLINATIONS_MODELS.map(m => `${m.label} (${m.id})`).join('; ');

export const recognitionPollinationsPages: HelpPage[] = [
  {
    slug: 'document-recognition-pollinations',
    group: 'operations',
    appHref: '/purchase-documents',
    related: ['document-recognition'],
    sources: ['eu-gdpr'],
    text: {
      lt: {
        title: 'Dokumentų atpažinimas per Pollinations',
        summary: 'Antrasis atpažinimo teikėjas: raktas, modelių pasirinkimas, kaina, PDF ir privatumas.',
        purpose: [
          'Pollinations yra vartai į kelis nebrangius vaizdus skaitančius modelius. Nustatymai → API skiltyje pasirinkite teikėją „Pollinations“, įveskite jo raktą ir įjunkite atpažinimą: darbo eiga (peržiūra, patvirtinimas, kaina ir mėnesio limitas) lieka tokia pati.',
          `Numatytasis modelis: ${DEFAULT_POLLINATIONS_MODEL} (pigiausias). Kiti: ${models}. Galite įvesti ir kitą modelį pagal pavadinimą; jo kaina vertinama pagal numatytąjį modelį, todėl yra apytikslė.`,
        ],
        steps: [
          `Atidarykite ${POLLINATIONS_KEYS_URL}, prisijunkite ir sukurkite SLAPTĄ raktą (prasideda sk_).`,
          'Pageidautina raktui nustatyti išlaidų biudžetą ir papildyti sąskaitą nedidele suma.',
          'Programoje: Nustatymai → API → „Dokumentų atpažinimas“, teikėjas „Pollinations“.',
          'Įklijuokite raktą, pasirinkite modelį, paspauskite „Patikrinti raktą“, tada išsaugokite ir įjunkite atpažinimą.',
        ],
        rules: [
          'Kiekvienas teikėjas turi savo raktą ir savo modelį: perjungus teikėją kito raktas neprarandamas.',
          'Viešieji raktai (pk_) generavimui nebetinka; reikia slapto rakto (sk_).',
          'PDF prieš siunčiant paverčiamas pirmųjų trijų puslapių paveikslėliais; nuotraukos siunčiamos paruošta kopija.',
          'Kaina rodoma apytikslė (katalogo kainos, 1 pollen = 1 USD) ir įtraukiama į mėnesio limitą.',
        ],
        mistakes: [
          'Naudojamas viešasis raktas (pk_) – atpažinimas grąžina rakto klaidą.',
          'Sąskaitoje nepakanka lėšų arba išnaudotas rakto biudžetas – atpažinimas nepavyksta, dokumentas lieka rankiniam įvedimui.',
          'Pollinations privatumo režimas įjungtas – jis pašalina tiekėjų pavadinimus, todėl neįjunkite jo.',
        ],
        notes: [{ title: 'Privatumas', items: [
          'Dokumentų vaizdai siunčiami pasirinkto modelio tiekėjui. Saugojimo terminai nėra nurodyti, todėl šis teikėjas tinka išbandymui; neskelbtinus dokumentus tvarkykite kitu teikėju.',
        ] }],
      },
      ru: {
        title: 'Распознавание документов через Pollinations',
        summary: 'Второй провайдер распознавания: ключ, выбор модели, стоимость, PDF и конфиденциальность.',
        purpose: [
          'Pollinations — шлюз к нескольким недорогим моделям, читающим изображения. В разделе Настройки → API выберите провайдера «Pollinations», введите его ключ и включите распознавание: порядок работы (проверка, подтверждение, стоимость и месячный лимит) остаётся прежним.',
          `Модель по умолчанию: ${DEFAULT_POLLINATIONS_MODEL} (самая дешёвая). Другие: ${models}. Можно ввести и другую модель по названию; её стоимость оценивается по модели по умолчанию, поэтому приблизительная.`,
        ],
        steps: [
          `Откройте ${POLLINATIONS_KEYS_URL}, войдите и создайте СЕКРЕТНЫЙ ключ (начинается с sk_).`,
          'Желательно задать для ключа бюджет расходов и пополнить счёт небольшой суммой.',
          'В программе: Настройки → API → «Распознавание документов», провайдер «Pollinations».',
          'Вставьте ключ, выберите модель, нажмите «Проверить ключ», затем сохраните и включите распознавание.',
        ],
        rules: [
          'У каждого провайдера свой ключ и своя модель: при переключении ключ другого не теряется.',
          'Публичные ключи (pk_) для генерации больше не подходят; нужен секретный ключ (sk_).',
          'PDF перед отправкой превращается в изображения первых трёх страниц; фотографии отправляются подготовленной копией.',
          'Стоимость показывается приблизительная (цены каталога, 1 pollen = 1 USD) и входит в месячный лимит.',
        ],
        mistakes: [
          'Используется публичный ключ (pk_) — распознавание возвращает ошибку ключа.',
          'На счёте недостаточно средств или исчерпан бюджет ключа — распознавание не удаётся, документ остаётся для ручного ввода.',
          'Включён режим приватности Pollinations — он убирает названия поставщиков, поэтому не включайте его.',
        ],
        notes: [{ title: 'Конфиденциальность', items: [
          'Изображения документов отправляются поставщику выбранной модели. Сроки хранения не указаны, поэтому провайдер подходит для проверки; конфиденциальные документы обрабатывайте другим провайдером.',
        ] }],
      },
      en: {
        title: 'Document recognition through Pollinations',
        summary: 'The second recognition provider: key, model choice, cost, PDF and privacy.',
        purpose: [
          'Pollinations is a gateway to several inexpensive models that read images. In Settings → API choose the provider "Pollinations", enter its key and enable recognition: the workflow (review, confirmation, cost and the monthly limit) stays the same.',
          `Default model: ${DEFAULT_POLLINATIONS_MODEL} (cheapest). Others: ${models}. You can also enter another model by name; its cost is estimated at the default model price, so it is approximate.`,
        ],
        steps: [
          `Open ${POLLINATIONS_KEYS_URL}, sign in and create a SECRET key (starts with sk_).`,
          'Preferably set a spending budget on the key and top up the account with a small amount.',
          'In the application: Settings → API → "Document recognition", provider "Pollinations".',
          'Paste the key, choose a model, press "Test the key", then save and enable recognition.',
        ],
        rules: [
          'Each provider has its own key and model: switching providers does not lose the other key.',
          'Public keys (pk_) no longer work for generation; a secret key (sk_) is required.',
          'A PDF is turned into images of its first three pages before sending; photos are sent as the prepared copy.',
          'The cost shown is approximate (catalog prices, 1 pollen = 1 USD) and counts toward the monthly limit.',
        ],
        mistakes: [
          'A public key (pk_) is used - recognition returns a key error.',
          'The account has insufficient funds or the key budget is used up - recognition fails and the document stays for manual entry.',
          'The Pollinations privacy mode is on - it removes supplier names, so do not enable it.',
        ],
        notes: [{ title: 'Privacy', items: [
          'Document images go to the upstream provider of the chosen model. Retention is not documented, so this provider suits testing; process confidential documents with another provider.',
        ] }],
      },
    },
  },
];
