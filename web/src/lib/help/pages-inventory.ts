import type { HelpPage } from './types';

export const inventoryPages: HelpPage[] = [
  {
    slug: 'inventory-costing',
    group: 'accounting',
    appHref: '/stock',
    sources: ['lt-business-accounting-standards', 'lt-financial-accounting-law'],
    text: {
      lt: {
        title: 'Atsargų savikaina',
        summary: 'Svertinio vidurkio arba FIFO savikainos apskaita, atsargų judėjimai ir rankiniai koregavimai su priežastimi.',
        purpose: [
          'Puslapyje „Atsargos“ įmonė pasirenka savikainos metodą: išjungta, svertinis vidurkis arba FIFO. Išjungus viskas veikia kaip iki šiol ir savikaina neskaičiuojama.',
          'Įjungus metodą, kiekvienas pirkimas ir pardavimas sukuria atsargų judėjimą ir savikainos žurnalo įrašą (atsargų ir savikainos sąskaitos nurodomos nustatymuose). Prekės kortelėje matomi judėjimai, likutis po kiekvieno judėjimo ir parduotų prekių savikaina.',
        ],
        steps: [
          'Pasirinkite metodą ir, jei reikia, atsargų bei savikainos sąskaitas, tada išsaugokite. Esami likučiai tampa pradiniu likučiu.',
          'Pirkimus ir pardavimus registruokite kaip įprasta; savikaina apskaičiuojama automatiškai.',
          'Norėdami ištaisyti kiekį ar vertę, atidarykite prekės judėjimus, pasirinkite koregavimo tipą, nurodykite pokytį ir privalomą priežastį.',
          'Audito pėdsakas rodo kiekvieną judėjimą, koreguojančią sąskaitą, priežastį ir naudotoją.',
        ],
        rules: [
          'Įjungus apskaitą užregistruoti dokumentai ir atsargų kortelės apsaugomi nuo keitimo; klaidos taisomos naujais judėjimais ar koregavimais.',
          'Parduoti daugiau nei yra likutyje negalima: pardavimas blokuojamas.',
          'Kai yra judėjimų, metodo pakeisti negalima (galima tik išjungti ir vėl įjungti tą patį metodą).',
          'Koregavimas visada reikalauja priežasties ir niekada nekeičia ankstesnių įrašų.',
        ],
        mistakes: [
          'Neteisingas likutis prieš įjungiant metodą iškreipia savikainą; pirmiausia patikrinkite kiekius ir kainas.',
          'Savikainos ir atsargų sąskaitos turi skirtis; atsiskaitymų, PVM ir pinigų sąskaitų naudoti negalima.',
        ],
      },
      ru: {
        title: 'Себестоимость запасов',
        summary: 'Учёт себестоимости методом средневзвешенной или FIFO, движения запасов и ручные корректировки с указанием причины.',
        purpose: [
          'На странице «Запасы» компания выбирает метод себестоимости: выключено, средневзвешенная или FIFO. При выключенном методе всё работает как раньше, себестоимость не считается.',
          'При включённом методе каждая покупка и продажа создаёт движение запаса и проводку себестоимости (счета запасов и себестоимости задаются в настройках). В карточке товара видны движения, остаток после каждого движения и себестоимость проданных товаров.',
        ],
        steps: [
          'Выберите метод и при необходимости счета запасов и себестоимости, затем сохраните. Текущие остатки становятся начальным остатком.',
          'Регистрируйте покупки и продажи как обычно; себестоимость считается автоматически.',
          'Чтобы исправить количество или стоимость, откройте движения товара, выберите тип корректировки, укажите изменение и обязательную причину.',
          'Аудиторский след показывает каждое движение, корреспондирующий счёт, причину и пользователя.',
        ],
        rules: [
          'После включения учёта проведённые документы и карточки запасов защищены от изменений; ошибки исправляются новыми движениями или корректировками.',
          'Продать больше остатка нельзя: продажа блокируется.',
          'При наличии движений метод менять нельзя (можно только выключить и снова включить тот же метод).',
          'Корректировка всегда требует причины и никогда не меняет прежние записи.',
        ],
        mistakes: [
          'Неверный остаток перед включением метода искажает себестоимость; сначала проверьте количества и цены.',
          'Счета себестоимости и запасов должны различаться; счета расчётов, НДС и денег использовать нельзя.',
        ],
      },
      en: {
        title: 'Inventory costing',
        summary: 'Weighted average or FIFO costing, stock movements and manual adjustments with a reason.',
        purpose: [
          'On the "Stock" page the company chooses a costing method: off, weighted average or FIFO. When off, everything works as before and no cost is calculated.',
          'With a method enabled, every purchase and sale creates a stock movement and a cost journal entry (the inventory and cost accounts are set in the settings). The item card shows the movements, the balance after each one and the cost of goods sold.',
        ],
        steps: [
          'Choose the method and, if needed, the inventory and cost accounts, then save. Current balances become the opening balance.',
          'Record purchases and sales as usual; the cost is calculated automatically.',
          'To correct a quantity or value, open the item movements, choose the adjustment type, enter the change and the required reason.',
          'The audit trail shows every movement, the offsetting account, the reason and the user.',
        ],
        rules: [
          'Once tracking is enabled, posted documents and stock cards are protected from changes; mistakes are fixed with new movements or adjustments.',
          'Selling more than the balance is not possible: the sale is blocked.',
          'The method cannot be changed once movements exist (it can only be switched off and the same method switched on again).',
          'An adjustment always requires a reason and never changes earlier records.',
        ],
        mistakes: [
          'A wrong balance before enabling the method distorts the cost; check quantities and prices first.',
          'The cost and inventory accounts must differ; settlement, VAT and cash accounts cannot be used.',
        ],
      },
    },
  },
];
