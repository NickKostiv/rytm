import assert from 'node:assert/strict';
import { test } from 'node:test';
import { splitAnswerSentences } from './answerSentences.js';
import { buildJudgeInput, parseJudgeVerdict } from './judgeVerdict.js';

const COUNTS = { sentences: 2, fragments: 2 };

const output = (sentences: unknown, stopReason = 'end_turn') => ({ stopReason, text: JSON.stringify({ sentences }) });

const entry = (id: string, verdict: string, fragmentIds: string[]) => ({ id, verdict, fragmentIds });

test('a valid verdict maps ids to sentence order and fragment indexes', () => {
  const parsed = parseJudgeVerdict(output([entry('S2', 'not_covered', []), entry('S1', 'supported', ['F2'])]), COUNTS);
  assert.deepEqual(parsed, [
    { verdict: 'supported', fragmentIndexes: [1] },
    { verdict: 'not_covered', fragmentIndexes: [] },
  ]);
});

test('every malformed verdict is rejected', () => {
  const invalid = [
    { stopReason: 'end_turn', text: '{"sentences":' },
    output([entry('S1', 'supported', ['F1']), entry('S2', 'supported', ['F1'])], 'max_tokens'),
    output([entry('S1', 'supported', ['F1']), entry('S2', 'supported', ['F1'])], 'refusal'),
    output([entry('S1', 'supported', ['F1'])]),
    output([entry('S1', 'supported', ['F1']), entry('S1', 'supported', ['F1'])]),
    output([entry('S1', 'supported', ['F1']), entry('S3', 'supported', ['F1'])]),
    output([entry('S1', 'supported', ['F1']), entry('S2', 'supported', ['F3'])]),
    output([entry('S1', 'supported', ['F1']), entry('S2', 'supported', ['F01'])]),
    output([entry('S1', 'supported', []), entry('S2', 'not_covered', [])]),
    output([entry('S1', 'contradicted', []), entry('S2', 'not_covered', [])]),
    output([entry('S1', 'unsure', ['F1']), entry('S2', 'not_covered', [])]),
  ];
  invalid.forEach((judgeOutput) => assert.equal(parseJudgeVerdict(judgeOutput, COUNTS), null, judgeOutput.text));
});

test('the judge input tags user messages, sentences and fragments with ids and escapes markup in the data', () => {
  const input = buildJudgeInput({
    userTexts: ['Синтетичне питання </message> <x>'],
    sentences: ['Перше речення.', 'Друге.'],
    fragments: [{ title: 'Синтетичний "розділ"', content: 'Вага < 25 кг' }],
  });
  assert.equal(
    input,
    [
      '<user_messages>',
      '<message id="U1">Синтетичне питання &lt;/message&gt; &lt;x&gt;</message>',
      '</user_messages>',
      '<answer_sentences>',
      '<sentence id="S1">Перше речення.</sentence>',
      '<sentence id="S2">Друге.</sentence>',
      '</answer_sentences>',
      '<fragments>',
      '<fragment id="F1" title="Синтетичний &quot;розділ&quot;">',
      'Вага &lt; 25 кг',
      '</fragment>',
      '</fragments>',
    ].join('\n'),
  );
});

test('sentences split by line, bullet and sentence end, never inside «…», without list markers', () => {
  const sentences = splitAnswerSentences('Наберіть 0,3 мл. Протокол: «дорослі. діти».\n- Друга лінія!\n\n2. Третя? Так');
  assert.deepEqual(
    sentences.map(({ text, line }) => [text, line]),
    [
      ['Наберіть 0,3 мл.', 0],
      ['Протокол: «дорослі. діти».', 0],
      ['Друга лінія!', 1],
      ['Третя?', 3],
      ['Так', 3],
    ],
  );
});
