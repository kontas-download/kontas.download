import type { HelpPage } from './types';

export const assetPages: HelpPage[] = [
  {
    slug: 'fixed-assets',
    group: 'accounting',
    appHref: '/assets',
    sources: ['lt-business-accounting-standards', 'lt-cit-law'],
    text: {
      lt: {
        title: 'Ilgalaikis turtas ir nusidėvėjimas',
        summary: 'Turto registras, mėnesio nusidėvėjimo registravimas, nurašymas ir rankiniai pakeitimai su priežastimi.',
        purpose: [
          'Skiltyje „Ilgalaikis turtas“ vedamas turto registras: įsigijimo kaina, naudojimo pradžia, grupė, naudingo tarnavimo laikas, likvidacinė vertė ir nusidėvėjimo metodas (tiesiogiai proporcingas arba mažėjančio likučio).',
          'Kiekvieno mėnesio nusidėvėjimas užregistruojamas vienu veiksmu visam turtui; sukuriami žurnalo įrašai (sąnaudos ir sukauptas nusidėvėjimas). Numatytąjį metodą naujam turtui įmonė pasirenka nustatymuose.',
        ],
        steps: [
          'Pridėkite turtą: nurodykite kodą, pavadinimą, grupę, datas ir kainą. Tuščias tarnavimo laikas pakeičiamas grupės mokestiniu laiku.',
          'Pasirinkite mėnesį ir peržiūrėkite numatomą sumą, tada užregistruokite nusidėvėjimą. Nusidėvėti pradedama nuo mėnesio po naudojimo pradžios.',
          'Norėdami pakeisti metodą, tarnavimo laiką, likvidacinę vertę ar koeficientą, atidarykite turto kortelę, pasirinkite „Redaguoti“ ir nurodykite priežastį. Pakeitimas įrašomas į pakeitimų žurnalą.',
          'Nurašydami nurodykite datą, priežastį ir, jei parduodama, kainą; užregistruojamas nusidėvėjimas iki nurašymo mėnesio, o likutinė vertė nurašoma. Nurašymą galima atšaukti.',
        ],
        rules: [
          'Užregistravus nusidėvėjimą kainos, datų, grupės ir sąskaitų keisti negalima; pirmiausia atšaukite paskutinius mėnesius.',
          'Atšaukti galima tik paskutinį užregistruotą mėnesį.',
          'Būsimų mėnesių nusidėvėjimo registruoti negalima.',
          'Taisyklių registro reikšmės (kapitalizavimo riba, mokestiniai tarnavimo laikai, koeficientas) laikinos: buhalteris turi jas patikrinti, prieš naudojant rezultatus deklaracijoms.',
        ],
        mistakes: [
          'Per trumpas tarnavimo laikas nei mokestinis ar kaina žemiau kapitalizavimo ribos rodomi įspėjimu „!“; patikrinkite, ar turtą verta kapitalizuoti.',
          'Pardavimo kaina čia tik įrašoma rezultatui apskaičiuoti; pačią pardavimo sąskaitą išrašykite skiltyje „Pardavimai“.',
        ],
      },
      ru: {
        title: 'Основные средства и амортизация',
        summary: 'Реестр активов, проведение ежемесячной амортизации, списание и ручные изменения с указанием причины.',
        purpose: [
          'В разделе «Основные средства» ведётся реестр активов: стоимость приобретения, начало использования, группа, срок полезного использования, ликвидационная стоимость и метод амортизации (линейный или уменьшаемого остатка).',
          'Амортизация каждого месяца проводится одним действием для всех активов; создаются записи журнала (расходы и накопленная амортизация). Метод по умолчанию для новых активов компания выбирает в настройках.',
        ],
        steps: [
          'Добавьте актив: укажите код, название, группу, даты и стоимость. Пустой срок заменяется налоговым сроком группы.',
          'Выберите месяц и проверьте ожидаемую сумму, затем проведите амортизацию. Амортизация начинается со следующего месяца после начала использования.',
          'Чтобы изменить метод, срок, ликвидационную стоимость или коэффициент, откройте карточку актива, выберите «Изменить» и укажите причину. Изменение записывается в журнал изменений.',
          'При списании укажите дату, причину и, если актив продаётся, цену; амортизация проводится до месяца списания, остаточная стоимость списывается. Списание можно отменить.',
        ],
        rules: [
          'После проведения амортизации стоимость, даты, группу и счета менять нельзя; сначала отмените последние месяцы.',
          'Отменить можно только последний проведённый месяц.',
          'Проводить амортизацию будущих месяцев нельзя.',
          'Значения реестра правил (порог капитализации, налоговые сроки, коэффициент) временные: бухгалтер должен проверить их, прежде чем использовать результаты для деклараций.',
        ],
        mistakes: [
          'Срок короче налогового или стоимость ниже порога капитализации отмечаются предупреждением «!»; проверьте, стоит ли капитализировать актив.',
          'Цена продажи здесь только записывается для расчёта результата; саму счёт-фактуру на продажу выпишите в разделе «Продажи».',
        ],
      },
      en: {
        title: 'Fixed assets and depreciation',
        summary: 'The asset register, posting monthly depreciation, disposal and manual changes with a reason.',
        purpose: [
          'The "Fixed assets" section keeps the asset register: acquisition cost, commissioning date, category, useful life, residual value and depreciation method (straight-line or declining balance).',
          'Depreciation of each month is posted in one action for all assets; ledger entries are created (expense and accumulated depreciation). The company chooses the default method for new assets in the settings.',
        ],
        steps: [
          'Add an asset: enter the code, name, category, dates and cost. An empty useful life is replaced by the tax life of the category.',
          'Choose the month and check the expected amount, then post the depreciation. Depreciation starts in the month after commissioning.',
          'To change the method, useful life, residual value or factor, open the asset card, choose "Edit" and state the reason. The change is written to the change log.',
          'When disposing, enter the date, the reason and, for a sale, the price; depreciation is posted up to the disposal month and the book value is written off. A disposal can be cancelled.',
        ],
        rules: [
          'Once depreciation is posted, the cost, dates, category and accounts cannot be changed; undo the latest months first.',
          'Only the latest posted month can be undone.',
          'Depreciation of future months cannot be posted.',
          'The values from the rules registry (capitalization threshold, tax lives, factor) are provisional: the accountant must verify them before the results are used for returns.',
        ],
        mistakes: [
          'A life shorter than the tax life or a cost below the capitalization threshold is flagged with "!"; check whether the asset should be capitalized.',
          'The sale price is only recorded here to compute the result; issue the sales invoice itself in "Sales".',
        ],
      },
    },
  },
];
