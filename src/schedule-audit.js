// Recompute the declared scheduling constraints; this does not prove solver optimality.
export function verifyMarketSchedule(result, config) {
  const issues = [];
  const issue = (code, id) => issues.push({ code, ...(id ? { id } : {}) });
  const finite = (value) => typeof value === 'number' && Number.isFinite(value);
  const id = (value) => typeof value === 'string' && value.length > 0 && value.length <= 128;
  const array = (value) => Array.isArray(value) && value.length <= 2000;
  if (
    !result ||
    !config ||
    !finite(config.budgetUnits) ||
    config.budgetUnits < 0 ||
    ![result.requests, result.contacts, result.awards].every(array)
  )
    return { valid: false, issues: [{ code: 'invalid_schedule_shape' }] };
  const requests = new Map(),
    contacts = new Map();
  for (const r of result.requests) {
    if (
      !r ||
      !id(r.id) ||
      requests.has(r.id) ||
      !Number.isSafeInteger(r.bytes) ||
      r.bytes <= 0 ||
      !finite(r.value) ||
      r.value < 0 ||
      !finite(r.releaseAt) ||
      !finite(r.deadline) ||
      r.releaseAt < 0 ||
      r.deadline < r.releaseAt
    ) {
      issue('invalid_request', r?.id);
      continue;
    }
    requests.set(r.id, r);
  }
  for (const c of result.contacts) {
    if (
      !c ||
      !id(c.id) ||
      contacts.has(c.id) ||
      !id(c.station) ||
      ![c.start, c.end, c.rateBytesPerSec, c.pricePerMbUnits].every(finite) ||
      c.start < 0 ||
      c.end <= c.start ||
      c.rateBytesPerSec <= 0 ||
      c.pricePerMbUnits < 0
    ) {
      issue('invalid_contact', c?.id);
      continue;
    }
    contacts.set(c.id, c);
  }
  let spent = 0,
    science = 0;
  const delivered = new Set(),
    scheduled = [];
  for (const a of result.awards) {
    const r = requests.get(a?.requestId),
      c = contacts.get(a?.contactId);
    if (!r || !c || ![a.start, a.end, a.costUnits, a.scienceValue, a.bytes].every(finite)) {
      issue('invalid_award', a?.requestId);
      continue;
    }
    if (delivered.has(r.id)) issue('duplicate_request', r.id);
    delivered.add(r.id);
    if (a.station !== c.station || a.station === config.outage) issue('station_unavailable', r.id);
    if (
      a.start < Math.max(r.releaseAt, c.start) ||
      a.end > Math.min(r.deadline, c.end) ||
      a.end - a.start < Math.ceil(r.bytes / c.rateBytesPerSec)
    )
      issue('invalid_window', r.id);
    if (
      a.bytes !== r.bytes ||
      a.scienceValue !== r.value ||
      a.costUnits !== Math.ceil(r.bytes / 1e6) * c.pricePerMbUnits
    )
      issue('award_accounting_mismatch', r.id);
    spent += a.costUnits;
    science += a.scienceValue;
    scheduled.push(a);
  }
  scheduled.sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < scheduled.length; i++)
    if (scheduled[i].start < scheduled[i - 1].end)
      issue('overlapping_awards', scheduled[i].requestId);
  if (
    !finite(science) ||
    !finite(spent) ||
    spent > config.budgetUnits ||
    spent !== result.spentUnits ||
    config.budgetUnits - spent !== result.remainingUnits ||
    science !== result.scienceValue
  )
    issue('total_accounting_mismatch');
  return {
    valid: issues.length === 0,
    issues,
    awardsChecked: result.awards.length,
    spentUnits: spent,
    scienceValue: finite(science) ? science : null,
    requestCoverage: {
      declared: result.requests.length,
      recognized: requests.size,
      allocated: delivered.size,
      unallocatedRequestIds: [...requests.keys()].filter((id) => !delivered.has(id)).sort(),
    },
  };
}
