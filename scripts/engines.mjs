import assert from 'node:assert/strict';
import { project } from '../src/project.js';
import { run } from '../src/index.js';
const report = await run();
assert.equal(report.execution, 'fresh');
if (project.kind === 'benchmark') {
  assert.ok(report.result.maxEngineDifferenceM > 0 && report.result.maxEngineDifferenceM < 10);
  assert.ok(report.result.maxReferenceResidualM > 100000);
  const coarse = await run({ stepSec: 120 });
  assert.equal(coarse.result.passed, false);
  const moon = await run({ profile: 'moon', stepSec: 60 });
  assert.equal(moon.result.sources[0].id, 'de440s');
}
if (project.kind === 'market') {
  assert.equal(report.result.invariantsPassed, true);
  assert.equal(report.result.transportProof.verified, true);
  assert.equal(report.result.receiptVerified, true);
  assert.equal(report.result.spentUnits + report.result.remainingUnits, 100);
  assert.ok(report.result.scienceValue >= report.result.baseline.scienceValue);
  const outage = await run({ outage: 'tenerife', budgetUnits: 50 });
  assert.ok(outage.result.awards.every((award) => award.station !== 'tenerife'));
}
if (project.kind === 'citizen') {
  assert.equal(report.result.classification, 'known-human-spacecraft');
  assert.equal(report.result.offObservationAvailable, false);
  assert.equal(report.result.carrierHits, 1);
  assert.ok(Math.abs(report.result.measuredPeakDriftHzSec + 0.3741) < 0.005);
}
console.log(
  `FR : moteurs réels vérifiés. EN: real engines verified. ES: motores reales verificados. ${project.slug}`,
);
