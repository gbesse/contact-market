import test from 'node:test';
import assert from 'node:assert/strict';
import { replay, verifyMarketSchedule } from '../src/index.js';
const report = await replay();
test('archived schedule gets independent route and budget accounting', () => {
  assert.equal(report.scheduleAudit.valid, true);
  assert.equal(report.scheduleAudit.spentUnits, report.result.spentUnits);
});
test('accounting, availability, duplicated requests and overlap are rejected', () => {
  for (const mutate of [
    (r) => r.scienceValue++,
    (r) => r.remainingUnits++,
    (r) => r.awards[0].costUnits++,
    (r) => r.awards.push(structuredClone(r.awards[0])),
    (r) => (r.awards[0].end = r.awards[0].start),
    (r) => (r.awards[0].station = 'invented'),
  ]) {
    const r = structuredClone(report.result);
    mutate(r);
    assert.equal(verifyMarketSchedule(r, report.config).valid, false);
  }
  const r = structuredClone(report.result);
  assert.equal(
    verifyMarketSchedule(r, { ...report.config, outage: r.awards[0].station }).valid,
    false,
  );
});
test('malformed numbers and duplicate definitions cannot silently verify', () => {
  const r = structuredClone(report.result);
  r.requests.push(r.requests[0]);
  assert.equal(verifyMarketSchedule(r, report.config).valid, false);
  r.awards[0].start = NaN;
  assert.equal(verifyMarketSchedule(r, report.config).valid, false);
  assert.equal(verifyMarketSchedule({}, {}).valid, false);
});
