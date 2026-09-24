/**
 * Ownership stamp for Employee / AttendanceLog / EmployeePayment records.
 * Branch account: the branch's station + network owner.
 * Single store (no branch): the creating account as station, no network owner.
 * An employee's own stamp wins, so shifts/payments follow their employee.
 */
export function ownershipFields(branch, userEmail, employee) {
  const base = branch
    ? { station_email: branch.station_email || null, tenant_email: branch.tenant_email || null }
    : { station_email: userEmail || null, tenant_email: null };
  return {
    station_email: employee?.station_email || base.station_email,
    tenant_email: employee?.tenant_email || base.tenant_email,
  };
}