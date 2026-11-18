import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeNumberText } from '#numberText';
import { checkStatedVolumes, maskStatedVolumes, type StatedVolumeCheck, type VolumeSourceUnit } from '#statedVolumes';

const moh = (text: string): VolumeSourceUnit => ({ text, isWeb: false });
const web = (text: string): VolumeSourceUnit => ({ text, isWeb: true });

const VERIFIED: StatedVolumeCheck = { status: 'verified', isWebBound: false };
const WEB_BOUND: StatedVolumeCheck = { status: 'verified', isWebBound: true };
const UNVERIFIED: StatedVolumeCheck = { status: 'unverified' };

const SYNTHETIC_ITEM = 'Синтетикол (1 мг/мл): дорослі 0,3 мг в/м; діти 0,15 мг в/м.';

test('mg dose and mg/ml concentration from one source item recompute the volume, decimal comma and trailing zeros included', () => {
  assert.deepEqual(checkStatedVolumes('Наберіть 0,3 мл: синтетикол «(1 мг/мл)», «0,3 мг в/м».', [moh(SYNTHETIC_ITEM)]), [VERIFIED]);
  assert.deepEqual(checkStatedVolumes('Наберіть 0,30 мл: «1 мг/мл», «0,3 мг».', [moh(SYNTHETIC_ITEM)]), [VERIFIED]);
  assert.deepEqual(checkStatedVolumes('Наберіть 0,5 мл: «1 мг/мл», «0,3 мг».', [moh(SYNTHETIC_ITEM)]), [UNVERIFIED]);
});

test('g, mcg, %, mcg/ml, A mg/B ml and 1:N are converted exactly', () => {
  assert.deepEqual(checkStatedVolumes('«4 г в/в (20% розчин)» — це 20 мл.', [moh('1.4. Синтетикол - 4 г в/в (20% розчин) протягом 20 хв.')]), [VERIFIED]);
  assert.deepEqual(checkStatedVolumes('«4 г в/в (20% розчин)» — це 16 мл.', [moh('1.4. Синтетикол - 4 г в/в (20% розчин) протягом 20 хв.')]), [UNVERIFIED]);
  assert.deepEqual(checkStatedVolumes('«50 мкг», «10 мкг/мл»: 5 мл.', [moh('Синтетикол 10 мкг/мл, болюс 50 мкг.')]), [VERIFIED]);
  assert.deepEqual(checkStatedVolumes('«10 мг», «40 мг/2 мл»: 0,5 мл.', [moh('Синтетикол 40 мг/2 мл, доза 10 мг.')]), [VERIFIED]);
  assert.deepEqual(checkStatedVolumes('«0,5 мг» розчину «1:1000» — 0,5 мл.', [moh('Синтетикол 1:1 000, доза 0,5 мг.')]), [VERIFIED]);
  assert.deepEqual(checkStatedVolumes('«0,3 мг», «0,1%» — 0,3 мл.', [moh('Синтетикол 0,1%, доза 0,3 мг.')]), [VERIFIED]);
});

test('a dose range needs a matching volume range; a single value against a range fails either way', () => {
  const unit = moh('Синтетикол (1 мг/мл) 0,3–0,5 мг в/м.');
  assert.deepEqual(checkStatedVolumes('«1 мг/мл», «0,3–0,5 мг» — 0,3–0,5 мл.', [unit]), [VERIFIED]);
  assert.deepEqual(checkStatedVolumes('«1 мг/мл», «0,3–0,5 мг» — 0,3–0,6 мл.', [unit]), [UNVERIFIED]);
  assert.deepEqual(checkStatedVolumes('«1 мг/мл», «0,3–0,5 мг» — 0,3 мл.', [unit]), [UNVERIFIED]);
  assert.deepEqual(checkStatedVolumes('«1 мг/мл», «0,3 мг» — 0,3–0,5 мл.', [moh(SYNTHETIC_ITEM)]), [UNVERIFIED]);
});

test('a per-kg volume needs a per-kg dose, and an absolute volume against a per-kg dose fails', () => {
  const unit = moh('Синтетикол 0,1 мг/кг, розчин 1 мг/мл.');
  assert.deepEqual(checkStatedVolumes('«0,1 мг/кг», «1 мг/мл» — 0,1 мл/кг.', [unit]), [VERIFIED]);
  assert.deepEqual(checkStatedVolumes('«0,1 мг/кг», «1 мг/мл» — 0,1 мл.', [unit]), [UNVERIFIED]);
});

test('a result that is not a finite decimal fails, there is no rounding or tolerance', () => {
  assert.deepEqual(checkStatedVolumes('«1 мг», «3 мг/мл» — 0,33 мл.', [moh('Синтетикол 3 мг/мл, доза 1 мг.')]), [UNVERIFIED]);
});

test('an unparseable concentration leaves only the verbatim path, which a recomputed volume does not have', () => {
  assert.deepEqual(checkStatedVolumes('«5000 ОД», «5000 ОД/мл» — 1 мл.', [moh('Синтетикол 5000 ОД/мл, доза 5000 ОД.')]), [UNVERIFIED]);
});

test('dose and concentration must sit in one source unit: different items, different sources and fragment plus web fail', () => {
  const sentence = 'Наберіть 0,3 мл: «1 мг/мл», «0,3 мг».';
  assert.deepEqual(checkStatedVolumes(sentence, [moh('Синтетикол 0,3 мг в/м.'), moh('Синтетикол 1 мг/мл.')]), [UNVERIFIED]);
  assert.deepEqual(checkStatedVolumes(sentence, [moh('Синтетикол 0,3 мг в/м.'), web('Синтетикол 1 мг/мл, ампула')]), [UNVERIFIED]);
});

test('dose and concentration in one web cited text pass and mark the volume as web-bound', () => {
  assert.deepEqual(checkStatedVolumes('Наберіть 0,3 мл: «1 мг/мл», «0,3 мг».', [web('Синтетикол 1 мг/мл: 0,3 мг в/м')]), [WEB_BOUND]);
  assert.deepEqual(
    checkStatedVolumes('Наберіть 0,3 мл: «1 мг/мл», «0,3 мг».', [web('Синтетикол 1 мг/мл: 0,3 мг в/м'), moh(SYNTHETIC_ITEM)]),
    [VERIFIED],
  );
});

test('one source with two preparations of a drug pairs each dose only with the concentration that recomputes it', () => {
  const units = [moh('Синтетикол 10 мкг/мл, болюс 10 мкг в/в.'), moh('Синтетикол (1 мг/мл): 0,3 мг в/м.')];
  assert.deepEqual(checkStatedVolumes('«0,3 мг», «1 мг/мл» — 0,3 мл.', units), [VERIFIED]);
  assert.deepEqual(checkStatedVolumes('«0,3 мг», «10 мкг/мл» — 30 мл.', units), [UNVERIFIED]);
});

test('a volume the source states directly passes when quoted verbatim with its unit from one item, in a sentence with no dose or concentration', () => {
  const unit = moh('5. За наявності стридору синтетикол 1 мг/мл, 5 мл через небулайзер.');
  assert.deepEqual(checkStatedVolumes('Протокол: «5 мл через небулайзер».', [unit]), [VERIFIED]);
  assert.deepEqual(checkStatedVolumes('Протокол: «синтетикол 1 мг/мл, 5 мл через небулайзер».', [unit]), [UNVERIFIED]);
  assert.deepEqual(checkStatedVolumes('Протокол: «20 мл/кг ізотонічного розчину».', [moh('7. Введіть 20 мл/кг ізотонічного розчину.')]), [VERIFIED]);
  assert.deepEqual(checkStatedVolumes('Обмеження «до 80 мл/год».', [moh('обмеження об’єму - до 80 мл/год')]), [VERIFIED]);
  assert.deepEqual(checkStatedVolumes('Протокол: «20 мл/кг».', [moh('7. Введіть 20 мл ізотонічного розчину.')]), [UNVERIFIED]);
  assert.deepEqual(checkStatedVolumes('Наберіть 0,3 мл.', [moh(SYNTHETIC_ITEM)]), [UNVERIFIED]);
  assert.deepEqual(checkStatedVolumes('Наберіть 5 мл.', [web('Синтетикол, 5 мл через небулайзер')]), [WEB_BOUND]);
});

test('a dose or a concentration in the sentence rules out the verbatim path, so a source volume cannot pose as a dose', () => {
  const unit = moh('Синтетикол, ампула 1 мл, розчин 0,1%.');
  assert.deepEqual(checkStatedVolumes('Наберіть 1 мл розчину «0,1%».', [unit]), [UNVERIFIED]);
  assert.deepEqual(checkStatedVolumes('Наберіть 1 мл, доза «0,3 мг».', [moh('Синтетикол 0,3 мг, ампула 1 мл.')]), [UNVERIFIED]);
  assert.deepEqual(checkStatedVolumes('Обмеження «до 80 мл/год», розчин «0,9%».', [moh('0,9% розчин, до 80 мл/год')]), [UNVERIFIED]);
});

test('every volume unit is located and recomputed in ml: ml, мілілітрів, кубиків, cc, см³, см3, л', () => {
  const unit = moh('2. введіть синтетикол 10 мг (5 мг/мл)');
  const wrong = ['10 ml', '10 мілілітрів', '10 кубиків', '10 кубика', '10 cc', '10 см³', '10 см3', '0,01 л', '10 мл'];
  wrong.forEach((volume) => assert.deepEqual(checkStatedVolumes(`Синтетикол «10 мг» «(5 мг/мл)» — ${volume}.`, [unit]), [UNVERIFIED], volume));
  const right = ['2 ml', '2 мілілітри', '2 кубики', '2 cc', '2 см³', '0,002 л', '2 мл'];
  right.forEach((volume) => assert.deepEqual(checkStatedVolumes(`Синтетикол «10 мг» «(5 мг/мл)» — ${volume}.`, [unit]), [VERIFIED], volume));
  assert.deepEqual(checkStatedVolumes('«4 г в/в (20% розчин)» — це 0,02 л.', [moh('1.4. Синтетикол - 4 г в/в (20% розчин).')]), [VERIFIED]);
  assert.deepEqual(checkStatedVolumes('Протокол: «20 ml/kg».', [moh('Введіть 20 мл/кг ізотонічного розчину.')]), [VERIFIED]);
  assert.deepEqual(checkStatedVolumes('Подайте «1 млн» одиниць.', [unit]), []);
});

test('a stated dose and concentration require the recompute even when the volume is also in the source', () => {
  assert.deepEqual(checkStatedVolumes('«4 г», «20%» — 25 мл.', [moh('Синтетикол 4 г (20%), 25 мл.')]), [UNVERIFIED]);
});

test('concentrations, rates and percentage ranges are not volumes or doses', () => {
  assert.deepEqual(checkStatedVolumes('Синтетикол «1 мг/мл», «40 мг/2 мл», «1 г/год», знизити на «20-25%».', [moh(SYNTHETIC_ITEM)]), []);
});

test('every volume in a sentence is checked', () => {
  assert.deepEqual(checkStatedVolumes('«1 мг/мл», «0,3 мг» — 0,3 мл, потім 0,7 мл.', [moh(SYNTHETIC_ITEM)]), [VERIFIED, UNVERIFIED]);
});

test('masking blanks volume tokens only and keeps the text length', () => {
  const text = normalizeNumberText('«0,3 мг» «1 мг/мл» — 0,3 мл; 20 мл/кг; 10 ml; 7 кубиків; 4 см³');
  const masked = maskStatedVolumes(text);
  assert.equal(masked.length, text.length);
  assert.ok(masked.includes('0.3 мг') && masked.includes('1 мг/мл'));
  assert.ok(!/\d/.test(masked.slice(masked.indexOf('—'))));
});
