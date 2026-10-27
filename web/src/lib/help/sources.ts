import type { HelpSource } from './types';

// Official documents the help pages cite. Only URLs that were checked to exist are listed.
// Where a stable deep link could not be verified, the URL is the official register (portal: true)
// and the exact Lithuanian title of the act is given so it can be found there.
const ETAR = 'https://www.e-tar.lt/portal/lt/index';
const VERIFIED = '2026-10-27';

export const helpSources: HelpSource[] = [
  {
    id: 'lt-vat-law',
    title: {
      lt: 'Lietuvos Respublikos pridėtinės vertės mokesčio įstatymas (Nr. IX-751)',
      ru: 'Закон Литовской Республики о налоге на добавленную стоимость (Lietuvos Respublikos pridėtinės vertės mokesčio įstatymas, Nr. IX-751)',
      en: 'Law on Value Added Tax of the Republic of Lithuania (Lietuvos Respublikos pridėtinės vertės mokesčio įstatymas, No. IX-751)',
    },
    url: ETAR, issuer: 'Lietuvos Respublikos Seimas / Teisės aktų registras', portal: true, verifiedOn: VERIFIED,
  },
  {
    id: 'lt-financial-accounting-law',
    title: {
      lt: 'Lietuvos Respublikos finansinės apskaitos įstatymas (Nr. IX-574; iki 2022-05-01 – Buhalterinės apskaitos įstatymas)',
      ru: 'Закон Литовской Республики о финансовом учёте (Lietuvos Respublikos finansinės apskaitos įstatymas, Nr. IX-574; до 2022-05-01 — Закон о бухгалтерском учёте)',
      en: 'Law on Financial Accounting of the Republic of Lithuania (Lietuvos Respublikos finansinės apskaitos įstatymas, No. IX-574; Law on Accounting until 2022-05-01)',
    },
    url: ETAR, issuer: 'Lietuvos Respublikos Seimas / Teisės aktų registras', portal: true, verifiedOn: VERIFIED,
  },
  {
    id: 'lt-pit-law',
    title: {
      lt: 'Lietuvos Respublikos gyventojų pajamų mokesčio įstatymas (Nr. IX-1007)',
      ru: 'Закон Литовской Республики о подоходном налоге с населения (Lietuvos Respublikos gyventojų pajamų mokesčio įstatymas, Nr. IX-1007)',
      en: 'Law on Personal Income Tax of the Republic of Lithuania (Lietuvos Respublikos gyventojų pajamų mokesčio įstatymas, No. IX-1007)',
    },
    url: ETAR, issuer: 'Lietuvos Respublikos Seimas / Teisės aktų registras', portal: true, verifiedOn: VERIFIED,
  },
  {
    id: 'lt-cit-law',
    title: {
      lt: 'Lietuvos Respublikos pelno mokesčio įstatymas (Nr. IX-675)',
      ru: 'Закон Литовской Республики о налоге на прибыль (Lietuvos Respublikos pelno mokesčio įstatymas, Nr. IX-675)',
      en: 'Law on Corporate Income Tax of the Republic of Lithuania (Lietuvos Respublikos pelno mokesčio įstatymas, No. IX-675)',
    },
    url: ETAR, issuer: 'Lietuvos Respublikos Seimas / Teisės aktų registras', portal: true, verifiedOn: VERIFIED,
  },
  {
    id: 'lt-tax-administration-law',
    title: {
      lt: 'Lietuvos Respublikos mokesčių administravimo įstatymas (Nr. IX-2112)',
      ru: 'Закон Литовской Республики об администрировании налогов (Lietuvos Respublikos mokesčių administravimo įstatymas, Nr. IX-2112)',
      en: 'Law on Tax Administration of the Republic of Lithuania (Lietuvos Respublikos mokesčių administravimo įstatymas, No. IX-2112)',
    },
    url: 'https://e-seimas.lrs.lt/rs/legalact/TAD/TAIS.231855/', issuer: 'Lietuvos Respublikos Seimas (e-seimas)', portal: false, verifiedOn: VERIFIED,
  },
  {
    id: 'lt-gov-780',
    title: {
      lt: 'LRV 2002 m. nutarimas Nr. 780 „Dėl Mokesčiams apskaičiuoti naudojamų apskaitos dokumentų išrašymo ir pripažinimo taisyklių patvirtinimo“',
      ru: 'Постановление Правительства ЛР 2002 г. № 780 о правилах выписки и признания учётных документов, используемых для исчисления налогов (Mokesčiams apskaičiuoti naudojamų apskaitos dokumentų išrašymo ir pripažinimo taisyklės)',
      en: 'Government Resolution No. 780 of 2002 on the rules for issuing and recognising accounting documents used to calculate taxes (Mokesčiams apskaičiuoti naudojamų apskaitos dokumentų išrašymo ir pripažinimo taisyklės)',
    },
    url: ETAR, issuer: 'Lietuvos Respublikos Vyriausybė / Teisės aktų registras', portal: true, verifiedOn: VERIFIED,
  },
  {
    id: 'vmi-isaf-rules',
    title: {
      lt: 'VMI viršininko 2004 m. įsakymas Nr. VA-55 dėl PVM sąskaitų faktūrų registrų duomenų tvarkymo ir pateikimo taisyklių (i.SAF)',
      ru: 'Приказ начальника VMI 2004 г. № VA-55 о правилах обработки и представления данных регистров PVM-счетов-фактур (i.SAF)',
      en: 'VMI Head Order No. VA-55 of 2004 on the rules for processing and submitting VAT invoice register data (i.SAF)',
    },
    url: ETAR, issuer: 'Valstybinė mokesčių inspekcija (VMI) / Teisės aktų registras', portal: true, verifiedOn: VERIFIED,
  },
  {
    id: 'vmi-vat-return-rules',
    title: {
      lt: 'Pridėtinės vertės mokesčio deklaracijos ir kitų su šiuo mokesčiu susijusių formų užpildymo taisyklės (FR0600)',
      ru: 'Правила заполнения декларации PVM и других связанных с этим налогом форм (Pridėtinės vertės mokesčio deklaracijos ir kitų su šiuo mokesčiu susijusių formų užpildymo taisyklės, FR0600)',
      en: 'Rules for completing the VAT return and other forms related to this tax (Pridėtinės vertės mokesčio deklaracijos ir kitų su šiuo mokesčiu susijusių formų užpildymo taisyklės, FR0600)',
    },
    url: ETAR, issuer: 'Valstybinė mokesčių inspekcija (VMI) / Teisės aktų registras', portal: true, verifiedOn: VERIFIED,
  },
  {
    id: 'vmi-fr0564-rules',
    title: {
      lt: 'Prekių tiekimo ir paslaugų teikimo į kitas Europos Sąjungos valstybes nares ataskaitos FR0564 formos ir jos priedų užpildymo, teikimo ir tikslinimo taisyklės (VMI viršininko 2004-03-12 įsakymas Nr. VA-34, suvestinė redakcija nuo 2025-05-01, pakeitimas VA-40)',
      ru: 'Правила заполнения, подачи и уточнения отчёта FR0564 о поставках товаров и услуг в другие государства-члены ЕС (приказ начальника VMI от 2004-03-12 № VA-34, сводная редакция с 2025-05-01, изменение VA-40)',
      en: 'Rules for completing, submitting and correcting the report FR0564 on supplies of goods and services to other EU member states (VMI Head Order No. VA-34 of 2004-03-12, consolidated version from 2025-05-01, amendment VA-40)',
    },
    url: ETAR, issuer: 'Valstybinė mokesčių inspekcija (VMI) / Teisės aktų registras', portal: true, verifiedOn: VERIFIED,
  },
  {
    id: 'vmi-gpm313-rules',
    title: {
      lt: 'Mėnesinės pajamų mokesčio deklaracijos GPM313 formos užpildymo ir pateikimo tvarkos aprašas (VMI viršininko 2017-12-20 įsakymas Nr. VA-121, paskutiniai pakeitimai 2025-11-20 įsakymu Nr. VA-105)',
      ru: 'Порядок заполнения и подачи ежемесячной декларации подоходного налога GPM313 (приказ начальника VMI от 2017-12-20 № VA-121, последние изменения приказом от 2025-11-20 № VA-105)',
      en: 'Procedure for completing and submitting the monthly personal income tax declaration GPM313 (VMI Head Order No. VA-121 of 2017-12-20, last amended by Order No. VA-105 of 2025-11-20)',
    },
    url: ETAR, issuer: 'Valstybinė mokesčių inspekcija (VMI) / Teisės aktų registras', portal: true, verifiedOn: VERIFIED,
  },
  {
    id: 'vmi-gpm312-rules',
    title: {
      lt: 'Metinės gyventojams išmokėtų išmokų, priskiriamų A ir B klasių pajamoms, deklaracijos GPM312 formos, jos priedų GPM312L, GPM312U formų užpildymo ir pateikimo taisyklės (VMI viršininko 2018-02-06 įsakymas Nr. VA-9, redakcija 2026-03-26 įsakymu Nr. VA-24)',
      ru: 'Правила заполнения и подачи годовой декларации GPM312 о выплатах физическим лицам, относимых к доходам классов A и B, и её приложений GPM312L, GPM312U (приказ начальника VMI от 2018-02-06 № VA-9, редакция приказа от 2026-03-26 № VA-24)',
      en: 'Rules for completing and submitting the annual declaration GPM312 of payments to individuals attributed to class A and B income and its appendices GPM312L, GPM312U (VMI Head Order No. VA-9 of 2018-02-06, as amended by Order No. VA-24 of 2026-03-26)',
    },
    url: ETAR, issuer: 'Valstybinė mokesčių inspekcija (VMI) / Teisės aktų registras', portal: true, verifiedOn: VERIFIED,
  },
  {
    id: 'lt-business-accounting-standards',
    title: {
      lt: 'Verslo apskaitos standartai (VAS)',
      ru: 'Стандарты бухгалтерского учёта предприятий (Verslo apskaitos standartai, VAS)',
      en: 'Lithuanian Business Accounting Standards (Verslo apskaitos standartai, VAS)',
    },
    url: ETAR, issuer: 'Audito, apskaitos, turto vertinimo ir nemokumo valdymo tarnyba / Teisės aktų registras', portal: true, verifiedOn: VERIFIED,
  },
  {
    id: 'vmi-eds',
    title: {
      lt: 'VMI Elektroninio deklaravimo sistema (EDS)',
      ru: 'Система электронного декларирования VMI (EDS)',
      en: 'VMI Electronic Declaration System (EDS)',
    },
    url: 'https://deklaravimas.vmi.lt/', issuer: 'Valstybinė mokesčių inspekcija (VMI)', portal: false, verifiedOn: VERIFIED,
  },
  {
    id: 'vmi-eds-forms',
    title: {
      lt: 'EDS formų sąrašas (deklaracijų formos ir jų aprašai, įskaitant FR0600)',
      ru: 'Список форм EDS (формы деклараций и их описания, включая FR0600)',
      en: 'EDS list of forms (return forms and their descriptions, including FR0600)',
    },
    url: 'https://deklaravimas.vmi.lt/lt/Formu_sarasas.aspx', issuer: 'Valstybinė mokesčių inspekcija (VMI)', portal: false, verifiedOn: VERIFIED,
  },
  {
    id: 'eu-vat-directive',
    title: {
      lt: 'Tarybos direktyva 2006/112/EB dėl pridėtinės vertės mokesčio bendros sistemos',
      ru: 'Директива Совета 2006/112/ЕС об общей системе налога на добавленную стоимость',
      en: 'Council Directive 2006/112/EC on the common system of value added tax',
    },
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32006L0112', issuer: 'EUR-Lex (European Union)', portal: false, verifiedOn: VERIFIED,
  },
  {
    id: 'eu-einvoicing-directive',
    title: {
      lt: 'Direktyva 2014/55/ES dėl elektroninių sąskaitų faktūrų viešuosiuose pirkimuose',
      ru: 'Директива 2014/55/ЕС об электронных счетах-фактурах в государственных закупках',
      en: 'Directive 2014/55/EU on electronic invoicing in public procurement',
    },
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32014L0055', issuer: 'EUR-Lex (European Union)', portal: false, verifiedOn: VERIFIED,
  },
  {
    id: 'eu-gdpr',
    title: {
      lt: 'Reglamentas (ES) 2016/679 (Bendrasis duomenų apsaugos reglamentas, BDAR)',
      ru: 'Регламент (ЕС) 2016/679 (Общий регламент по защите данных, GDPR)',
      en: 'Regulation (EU) 2016/679 (General Data Protection Regulation, GDPR)',
    },
    url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32016R0679', issuer: 'EUR-Lex (European Union)', portal: false, verifiedOn: VERIFIED,
  },
  {
    id: 'peppol-bis-billing',
    title: {
      lt: 'Peppol BIS Billing 3.0 (EN 16931 pagrįsta e. sąskaitų specifikacija, UBL 2.1)',
      ru: 'Peppol BIS Billing 3.0 (спецификация электронных счетов на основе EN 16931, UBL 2.1)',
      en: 'Peppol BIS Billing 3.0 (EN 16931-based e-invoice specification, UBL 2.1)',
    },
    url: 'https://docs.peppol.eu/poacc/billing/3.0/', issuer: 'OpenPeppol', portal: false, verifiedOn: VERIFIED,
  },
  {
    id: 'sodra',
    title: {
      lt: 'Valstybinio socialinio draudimo fondo valdyba (Sodra)',
      ru: 'Правление фонда государственного социального страхования (Sodra)',
      en: 'State Social Insurance Fund Board (Sodra)',
    },
    url: 'https://sodra.lt/', issuer: 'Sodra', portal: false, verifiedOn: VERIFIED,
  },
];

export const helpSourceById = new Map(helpSources.map(source => [source.id, source]));
