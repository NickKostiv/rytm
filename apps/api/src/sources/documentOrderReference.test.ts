import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findDocumentOrderReference } from './documentOrderReference.js';

test('worded Ukrainian date with order number', () => {
  assert.deepEqual(findDocumentOrderReference('ЗАТВЕРДЖЕНО Наказ Міністерства 7 липня 2024 року № 1000'), {
    orderNumber: '1000',
    orderDate: '2024-07-07',
  });
});

test('numeric date with order number', () => {
  assert.deepEqual(findDocumentOrderReference('наказ Міністерства 05.06.2019 № 2000'), {
    orderNumber: '2000',
    orderDate: '2019-06-05',
  });
});

test('no order reference returns null', () => {
  assert.equal(findDocumentOrderReference('КЛІНІЧНИЙ ПРОТОКОЛ 2024'), null);
});
