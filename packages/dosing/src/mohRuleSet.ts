import type { DosingRule, Route, SourceValidity } from '#dosingRule';

export type RuleSourceDocument = { title: string; url: string; sha256: string };

export const MOH_RULE_SET_DATE = '2026-11-18';

const ORDER_1269_REGISTRY_ID = '1269-20190605-dod';

export const MOH_RULE_SOURCE_DOCUMENTS: ReadonlyMap<string, RuleSourceDocument> = new Map<string, RuleSourceDocument>([
  [
    ORDER_1269_REGISTRY_ID,
    {
      title: 'ЕКСТРЕНА МЕДИЧНА ДОПОМОГА: ДОГОСПІТАЛЬНИЙ ЕТАП. НОВИЙ КЛІНІЧНИЙ ПРОТОКОЛ',
      url: 'https://moz.gov.ua/uploads/2/12737-dn_20190605_1269_dod.pdf',
      sha256: '78ec08b025920da3421dc17292460c5b9df7832e5f4371a4482fe2d02d9523f0',
    },
  ],
]);

export const MOH_OFFLINE_SOURCE_VALIDITIES: ReadonlyMap<string, SourceValidity> = new Map<string, SourceValidity>([
  [ORDER_1269_REGISTRY_ID, 'unknown'],
]);

type SourceLocation = { section: string; page: number; quote: string };

const order1269Source = ({ section, page, quote }: SourceLocation): DosingRule['source'] => ({
  registryId: ORDER_1269_REGISTRY_ID,
  orderNumber: '1269',
  orderDate: '2019-06-05',
  annex: null,
  section,
  page,
  quote,
});

const SECTION_ANAPHYLAXIS = '3.4. АНАФІЛАКТИЧНА ТА АЛЕРГІЧНА РЕАКЦІЯ';
const SECTION_PAIN = '3.11. КОНТРОЛЬ БОЛЮ';
const SECTION_SEIZURES = '3.12. СУДОМИ';
const SECTION_SHOCK = '3.13. ШОК';
const SECTION_CROUP = '5.3. РЕСПІРАТОРНИЙ ДИСТРЕС-СИНДРОМ У ДІТЕЙ (КРУП)';
const SECTION_BRONCHOSPASM = '7.2. БРОНХОСПАЗМ (БРОНХІАЛЬНА АСТМА АБО ХОЗЛ)';

type PerKgRuleFields = {
  drug: string;
  indication: string;
  population: string | null;
  mgPerKg: number;
  maxSingleDoseMg: number | null;
  source: DosingRule['source'];
};

const perKgRulesForRoutes = (idPrefix: string, routes: readonly Route[], fields: PerKgRuleFields): DosingRule[] =>
  routes.map((route) => ({
    id: `${idPrefix}-${route}`,
    drug: fields.drug,
    indication: fields.indication,
    population: fields.population,
    route,
    concentration: null,
    concentrationText: null,
    dose: { kind: 'per_kg', mgPerKg: fields.mgPerKg },
    maxSingleDoseMg: fields.maxSingleDoseMg,
    repeat: null,
    rounding: 'none',
    source: fields.source,
  }));

export const MOH_DOSING_RULES: readonly DosingRule[] = [
  ...perKgRulesForRoutes('diphenhydramine-urticaria', ['im', 'iv', 'po'], {
    drug: 'дифенгідрамін',
    indication: 'кропивниця або свербіж',
    population: null,
    mgPerKg: 1,
    maxSingleDoseMg: 50,
    source: order1269Source({
      section: SECTION_ANAPHYLAXIS,
      page: 64,
      quote: 'дифенгідрамін 1 мг/кг, максимальна доза - 50 мг в/м, в/в, перорально',
    }),
  }),
  ...perKgRulesForRoutes('paracetamol-pain', ['po'], {
    drug: 'парацетамол',
    indication: 'біль',
    population: null,
    mgPerKg: 15,
    maxSingleDoseMg: 1000,
    source: order1269Source({
      section: SECTION_PAIN,
      page: 85,
      quote: 'парацетамол 15 мг/кг перорально (максимальна доза – 1 г)',
    }),
  }),
  ...perKgRulesForRoutes('morphine-pain', ['im'], {
    drug: 'морфіну сульфат',
    indication: 'біль',
    population: null,
    mgPerKg: 0.1,
    maxSingleDoseMg: 15,
    source: order1269Source({
      section: SECTION_PAIN,
      page: 86,
      quote: 'морфіну сульфат - 0,1 мг/кг в/м (максимальна разова доза - 15 мг)',
    }),
  }),
  ...perKgRulesForRoutes('midazolam-seizures', ['im'], {
    drug: 'мідазолам',
    indication: 'судоми',
    population: null,
    mgPerKg: 0.2,
    maxSingleDoseMg: 10,
    source: order1269Source({
      section: SECTION_SEIZURES,
      page: 94,
      quote: 'мідазолам 0,2 мг/кг (максимальна доза – 10 мг), бажано в/м, або назально',
    }),
  }),
  ...perKgRulesForRoutes('lorazepam-seizures', ['iv', 'io'], {
    drug: 'лоразепам',
    indication: 'судоми',
    population: null,
    mgPerKg: 0.1,
    maxSingleDoseMg: 4,
    source: order1269Source({
      section: SECTION_SEIZURES,
      page: 94,
      quote: 'лоразепам 0,1мг/кг в/в або в/к, максимум 4 мг',
    }),
  }),
  ...perKgRulesForRoutes('paracetamol-febrile-seizures', ['po', 'iv', 'io'], {
    drug: 'парацетамол',
    indication: 'фебрильні судоми',
    population: null,
    mgPerKg: 15,
    maxSingleDoseMg: 650,
    source: order1269Source({
      section: SECTION_SEIZURES,
      page: 94,
      quote:
        'парацетамол 15 мг/кг, максимальна доза - 650 мг, шляхи введення - ректальний/ в/в /в/к (якщо пацієнт не може ковтати) або пероральний (якщо пацієнт може ковтати)',
    }),
  }),
  ...perKgRulesForRoutes('methylprednisolone-shock-adrenal', ['iv'], {
    drug: 'метилпреднізолон',
    indication: 'шок із наднирковою недостатністю або стероїдною залежністю',
    population: null,
    mgPerKg: 2,
    maxSingleDoseMg: 125,
    source: order1269Source({
      section: SECTION_SHOCK,
      page: 99,
      quote: 'метилпреднізолон, 2 мг/кг в/в (максимальна доза - 125 мг)',
    }),
  }),
  ...perKgRulesForRoutes('methylprednisolone-bronchospasm', ['iv', 'im'], {
    drug: 'метилпреднізолон',
    indication: 'бронхоспазм (бронхіальна астма або ХОЗЛ)',
    population: 'у дітей 2 річного віку або старше',
    mgPerKg: 2,
    maxSingleDoseMg: 125,
    source: order1269Source({
      section: SECTION_BRONCHOSPASM,
      page: 156,
      quote: 'метилпреднізолон (2 мг/кг, максимальна доза - 125 мг) в/в або в/м',
    }),
  }),
  ...perKgRulesForRoutes('dexamethasone-bronchospasm', ['iv', 'im', 'po'], {
    drug: 'дексаметазон',
    indication: 'бронхоспазм (бронхіальна астма або ХОЗЛ)',
    population: 'у дітей 2 річного віку або старше',
    mgPerKg: 0.6,
    maxSingleDoseMg: 16,
    source: order1269Source({
      section: SECTION_BRONCHOSPASM,
      page: 156,
      quote: 'дексаметазон (0,6 мг/кг, максимальна доза - 16 мг) в/в, в/м або перорально',
    }),
  }),
  ...perKgRulesForRoutes('dexamethasone-croup', ['po', 'iv', 'im'], {
    drug: 'дексаметазон',
    indication: 'круп',
    population: 'у дітей',
    mgPerKg: 0.6,
    maxSingleDoseMg: 16,
    source: order1269Source({
      section: SECTION_CROUP,
      page: 133,
      quote: 'дексаметазон 0,6 мг/кг перорально, в/в, в/м; макс. доза - 16 мг; слід вводити за підозри на круп',
    }),
  }),
];
