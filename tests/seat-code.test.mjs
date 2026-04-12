import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSeatNumberFromSeatCode, parseTableOrWaveFromSeatCode } from '../src/lib/seat-code.js';

test('parse wave from class C seat code', () => {
  assert.equal(parseTableOrWaveFromSeatCode('C-R1-S10', 'C'), 'R1');
  assert.equal(parseTableOrWaveFromSeatCode('C-WVIP-S2', 'C'), 'VIP');
});

test('parse table id from table seat code', () => {
  assert.equal(parseTableOrWaveFromSeatCode('A-R2-T15-S3', 'A'), '15');
  assert.equal(parseTableOrWaveFromSeatCode('B-R1-TH-S12', 'B'), 'H');
});

test('parse seat number from modern and compact barcodes', () => {
  assert.equal(parseSeatNumberFromSeatCode('C-R1-S10'), 10);
  assert.equal(parseSeatNumberFromSeatCode('A-0012'), 12);
  assert.equal(parseSeatNumberFromSeatCode('INVALID'), null);
});
