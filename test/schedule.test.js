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

test('coverage distinguishes unallocated requests from declared route success', () => {
  const result = verifyMarketSchedule(report.result, report.config),
    allocated = new Set(report.result.awards.map((a) => a.requestId));
  assert.equal(result.requestCoverage.declared, report.result.requests.length);
  assert.equal(result.requestCoverage.allocated, allocated.size);
  assert.deepEqual(
    result.requestCoverage.unallocatedRequestIds,
    report.result.requests
      .map((r) => r.id)
      .filter((id) => !allocated.has(id))
      .sort(),
  );
  assert.equal(
    result.requestCoverage.allocated + result.requestCoverage.unallocatedRequestIds.length,
    result.requestCoverage.recognized,
  );
});
test('overflowed science cannot validate by comparing Infinity to Infinity', () => {
  const requests = [0, 1].map((i) => ({
    id: 'r' + i,
    bytes: 1,
    value: 1e308,
    releaseAt: 0,
    deadline: 3,
  }));
  const contacts = [
    { id: 'c', station: 'station', start: 0, end: 3, rateBytesPerSec: 1, pricePerMbUnits: 0 },
  ];
  const awards = requests.map((r, i) => ({
    requestId: r.id,
    contactId: 'c',
    station: 'station',
    start: i,
    end: i + 1,
    costUnits: 0,
    scienceValue: r.value,
    bytes: 1,
  }));
  const result = verifyMarketSchedule(
    { requests, contacts, awards, spentUnits: 0, remainingUnits: 10, scienceValue: Infinity },
    { budgetUnits: 10, outage: 'none' },
  );
  assert.equal(result.valid, false);
  assert.equal(result.scienceValue, null);
  assert.ok(result.issues.some((i) => i.code === 'total_accounting_mismatch'));
});
