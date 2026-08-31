import { useEffect, useMemo, useState } from 'react'
import {
  BadgeCheck,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  FileText,
  LockKeyhole,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react'
import {
  Async,
  Avatar,
  Detail,
  EntityBadge,
  ErrorState,
  FormError,
  FormField,
  LoadingState,
  Modal,
  Spinner,
  StatusPill,
} from '../components/ui.jsx'
import { useDebouncedValue, useResource } from '../hooks/useResource.js'
import { useOrg } from '../hooks/useOrg.jsx'
import { formatDate, formatMoney, plural, todayIso } from '../lib/format.js'
import { EMPLOYEE_STATUS_VALUES } from '../api/adapters.js'
import {
  CONTRACT_TYPE_OPTIONS,
  EMPLOYEE_STATUS_OPTIONS,
  EMPLOYMENT_TYPE_OPTIONS,
  WORK_MODE_OPTIONS,
} from '../data.js'
import {
  addCompensation,
  changeEmployeeStatus,
  createEmployee,
  fetchCompensation,
  fetchEmployee,
  fetchEmployeeBalances,
  fetchEmployeeDocuments,
  fetchEmployees,
  fetchEmployeeTimeline,
  updateEmployee,
} from '../api/endpoints.js'

const PAGE_SIZE = 12

export default function PeopleDirectory({ onToast }) {
  const { entities, departments } = useOrg()

  const [query, setQuery] = useState('')
  const [entityFilter, setEntityFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [sort, setSort] = useState('name')
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState(null)
  const [adding, setAdding] = useState(false)

  // Searching hits the API, so the input is debounced to avoid a request per keystroke.
  const debouncedQuery = useDebouncedValue(query, 300)

  const sortConfig = useMemo(() => {
    if (sort === 'joined') return { sortBy: 'hireDate', sortOrder: 'desc' }
    if (sort === 'title') return { sortBy: 'jobTitle', sortOrder: 'asc' }
    if (sort === 'number') return { sortBy: 'employeeNumber', sortOrder: 'asc' }
    return { sortBy: 'name', sortOrder: 'asc' }
  }, [sort])

  // Any filter change returns to the first page; staying on page 4 of a
  // now-shorter result set would show an empty table.
  useEffect(() => {
    setPage(1)
  }, [debouncedQuery, entityFilter, statusFilter, sort])

  const directory = useResource(
    () =>
      fetchEmployees({
        q: debouncedQuery,
        legalEntityId: entityFilter || undefined,
        status: statusFilter ? EMPLOYEE_STATUS_VALUES[statusFilter] : undefined,
        includeOffboarded: statusFilter === 'Offboarded',
        page,
        pageSize: PAGE_SIZE,
        ...sortConfig,
      }),
    [debouncedQuery, entityFilter, statusFilter, sort, page],
  )

  const employees = directory.data?.items ?? []
  const meta = directory.data?.meta ?? { total: 0, page: 1, totalPages: 0 }

  const clearFilters = () => {
    setQuery('')
    setEntityFilter('')
    setStatusFilter('')
  }

  return (
    <div className="page-stack">
      <section className="directory-toolbar reveal">
        <div className="directory-count">
          <strong>{meta.total}</strong>
          <span>
            {meta.total === 1 ? 'person' : 'people'} across <b>{plural(entities.length, 'entity', 'entities')}</b>
          </span>
        </div>
        <button className="button button-primary" onClick={() => setAdding(true)}>
          <Plus size={18} /> Add employee
        </button>
      </section>

      <section className="panel directory-panel reveal">
        <div className="filters-row">
          <label className="search-field">
            <Search size={18} />
            <input
              aria-label="Search employees"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, number, email, role…"
            />
            {query && (
              <button onClick={() => setQuery('')} aria-label="Clear search">
                <X size={15} />
              </button>
            )}
          </label>
          <label className="select-wrap">
            <Building2 size={16} />
            <select
              value={entityFilter}
              onChange={(event) => setEntityFilter(event.target.value)}
              aria-label="Filter by legal entity"
            >
              <option value="">All entities</option>
              {entities.map((entity) => (
                <option value={entity.id} key={entity.id}>
                  {entity.shortName}
                </option>
              ))}
            </select>
            <ChevronDown size={15} />
          </label>
          <label className="select-wrap">
            <BadgeCheck size={16} />
            <select
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All statuses</option>
              {EMPLOYEE_STATUS_OPTIONS.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
            <ChevronDown size={15} />
          </label>
          <label className="select-wrap sort-select">
            <span>Sort:</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="Sort employees">
              <option value="name">Name</option>
              <option value="joined">Newest</option>
              <option value="title">Job title</option>
              <option value="number">Employee no.</option>
            </select>
            <ChevronDown size={15} />
          </label>
        </div>

        <div className="table-caption">
          <span>
            {directory.refreshing && <Spinner size={13} />} Showing {employees.length} of {meta.total} employees
          </span>
          <span>
            <LockKeyhole size={13} /> Compensation visible to HR only
          </span>
        </div>

        <Async loading={directory.loading} error={directory.error} onRetry={directory.reload} rows={6}>
          <>
            <div className="people-table-wrap">
              <table className="people-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Role &amp; team</th>
                    <th>Legal entity</th>
                    <th>Joined</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee) => (
                    <tr key={employee.id} onClick={() => setSelectedId(employee.id)}>
                      <td>
                        <div className="person-cell">
                          <Avatar employee={employee} size="sm" />
                          <span>
                            <strong>{employee.fullName}</strong>
                            <small>
                              {employee.employeeNumber} · {employee.email}
                            </small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <strong>{employee.role}</strong>
                        <small>{employee.department}</small>
                      </td>
                      <td>
                        <EntityBadge entityId={employee.entityId} entityCode={employee.entityCode} entityName={employee.entityName} full />
                      </td>
                      <td>
                        <strong>{formatDate(employee.joinDate)}</strong>
                        <small>{employee.employmentType}</small>
                      </td>
                      <td>
                        <StatusPill status={employee.status} />
                      </td>
                      <td>
                        <button
                          className="row-action"
                          onClick={(event) => {
                            event.stopPropagation()
                            setSelectedId(employee.id)
                          }}
                          aria-label={`View ${employee.fullName}`}
                        >
                          <ChevronRight size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!employees.length && (
                <div className="empty-state">
                  <Search size={25} />
                  <h3>No people found</h3>
                  <p>Try changing your search or filters.</p>
                  <button className="text-button" onClick={clearFilters}>
                    Clear all filters
                  </button>
                </div>
              )}
            </div>

            <div className="mobile-people-list">
              {employees.map((employee) => (
                <button className="mobile-person-card" key={employee.id} onClick={() => setSelectedId(employee.id)}>
                  <Avatar employee={employee} />
                  <span>
                    <strong>{employee.fullName}</strong>
                    <small>{employee.role}</small>
                    <EntityBadge entityId={employee.entityId} entityCode={employee.entityCode} />
                  </span>
                  <StatusPill status={employee.status} />
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>

            {meta.totalPages > 1 && (
              <nav className="pagination" aria-label="Directory pages">
                <button onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>
                  <ChevronLeft size={16} /> Previous
                </button>
                <span>
                  Page {meta.page} of {meta.totalPages}
                </span>
                <button
                  onClick={() => setPage((value) => Math.min(meta.totalPages, value + 1))}
                  disabled={page >= meta.totalPages}
                >
                  Next <ChevronRight size={16} />
                </button>
              </nav>
            )}
          </>
        </Async>
      </section>

      <EmployeeDetail
        employeeId={selectedId}
        onClose={() => setSelectedId(null)}
        onChanged={() => directory.reload()}
        onToast={onToast}
        departments={departments}
      />

      <Modal open={adding} onClose={() => setAdding(false)} title="Add a new employee" eyebrow="People directory" size="lg">
        <EmployeeForm
          departments={departments}
          entities={entities}
          onCancel={() => setAdding(false)}
          onSaved={(message) => {
            setAdding(false)
            directory.reload()
            onToast(message)
          }}
          onToast={onToast}
        />
      </Modal>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Employee detail
// ---------------------------------------------------------------------------

function EmployeeDetail({ employeeId, onClose, onChanged, onToast, departments }) {
  const { entities } = useOrg()
  const [editing, setEditing] = useState(false)
  const [changingStatus, setChangingStatus] = useState(false)

  useEffect(() => {
    setEditing(false)
    setChangingStatus(false)
  }, [employeeId])

  const detail = useResource(() => fetchEmployee(employeeId), [employeeId], { enabled: Boolean(employeeId) })

  /**
   * Compensation and the timeline are fetched separately because the API gates
   * them independently. A 403 on pay degrades that one panel instead of the
   * whole profile.
   */
  const compensation = useResource(() => fetchCompensation(employeeId), [employeeId], {
    enabled: Boolean(employeeId),
  })
  const timeline = useResource(() => fetchEmployeeTimeline(employeeId), [employeeId], {
    enabled: Boolean(employeeId),
  })
  const balances = useResource(() => fetchEmployeeBalances(employeeId), [employeeId], {
    enabled: Boolean(employeeId),
  })
  const documents = useResource(() => fetchEmployeeDocuments(employeeId), [employeeId], {
    enabled: Boolean(employeeId),
  })

  if (!employeeId) return null

  const employee = detail.data

  return (
    <Modal
      open={Boolean(employeeId)}
      onClose={onClose}
      title={employee?.fullName ?? 'Employee'}
      eyebrow={employee?.employeeNumber}
      size="xl"
    >
      {detail.loading && <LoadingState label="Loading employee record…" />}
      {detail.error && <ErrorState error={detail.error} onRetry={detail.reload} />}

      {employee && editing && (
        <EmployeeForm
          employee={employee}
          departments={departments}
          entities={entities}
          onCancel={() => setEditing(false)}
          onSaved={(message) => {
            setEditing(false)
            detail.reload()
            timeline.reload()
            onChanged()
            onToast(message)
          }}
          onToast={onToast}
        />
      )}

      {employee && changingStatus && (
        <StatusChangeForm
          employee={employee}
          onCancel={() => setChangingStatus(false)}
          onSaved={(message) => {
            setChangingStatus(false)
            detail.reload()
            timeline.reload()
            onChanged()
            onToast(message)
          }}
        />
      )}

      {employee && !editing && !changingStatus && (
        <div className="employee-detail">
          <div className="profile-hero">
            <Avatar employee={employee} size="xl" />
            <div>
              <div className="profile-title-row">
                <h3>{employee.role}</h3>
                <StatusPill status={employee.status} />
              </div>
              <p>
                {employee.department} · {employee.entityName}
              </p>
              <div className="profile-tags">
                <EntityBadge entityId={employee.entityId} entityCode={employee.entityCode} entityName={employee.entityName} full />
                <span>
                  <BriefcaseBusiness size={14} /> {employee.employmentType}
                </span>
                <span>
                  <MapPin size={14} /> {employee.workMode}
                </span>
              </div>
            </div>
            <div className="profile-hero-actions">
              <button className="button button-secondary" onClick={() => setEditing(true)}>
                <Pencil size={16} /> Edit profile
              </button>
              <button className="button button-ghost" onClick={() => setChangingStatus(true)}>
                Change status
              </button>
            </div>
          </div>

          <div className="detail-grid">
            <section className="detail-section">
              <p className="eyebrow">Employment</p>
              <h3>Position details</h3>
              <dl className="detail-list">
                <Detail label="Job title" value={employee.role} />
                <Detail label="Department" value={employee.department} />
                <Detail label="Manager" value={employee.managerName ?? 'Executive team'} />
                <Detail label="Start date" value={formatDate(employee.joinDate)} />
                <Detail label="Contract" value={employee.contractType} />
                <Detail label="Contract end" value={formatDate(employee.contractEnd)} />
                <Detail label="Probation ends" value={formatDate(employee.probationEnd)} />
                <Detail label="Notice period" value={employee.noticePeriodDays ? `${employee.noticePeriodDays} days` : '—'} />
                <Detail label="Legal employer" value={employee.entityName} />
                <Detail label="Direct reports" value={employee.directReportCount} />
              </dl>
            </section>

            <CompensationPanel
              state={compensation}
              employeeId={employeeId}
              currency={employee.currency}
              onSaved={() => {
                compensation.reload()
                timeline.reload()
                onToast('Compensation change recorded.')
              }}
              onToast={onToast}
            />

            <section className="detail-section">
              <p className="eyebrow">Leave</p>
              <h3>Current balances</h3>
              <Async loading={balances.loading} error={balances.error} onRetry={balances.reload} rows={3}>
                <div className="employee-balance-list">
                  {(balances.data ?? []).map((balance) => (
                    <div key={balance.id}>
                      <i style={{ background: balance.color }} />
                      <span>
                        <strong>{balance.name}</strong>
                        <small>{balance.used} used · {balance.pending} pending</small>
                      </span>
                      <b>{balance.available}</b>
                      <em>available</em>
                    </div>
                  ))}
                  {!balances.data?.length && <p className="muted">No leave balances configured.</p>}
                </div>
              </Async>
            </section>

            <section className="detail-section">
              <p className="eyebrow">Documents</p>
              <h3>Employment records</h3>
              <Async loading={documents.loading} error={documents.error} onRetry={documents.reload} rows={3}>
                <div className="document-list employee-document-list">
                  {(documents.data ?? []).slice(0, 6).map((document) => (
                    <div key={document.id}>
                      <FileText size={16} />
                      <span>
                        <strong>{document.title}</strong>
                        <small>
                          {document.category.replaceAll('_', ' ').toLowerCase()}
                          {document.expiresOn ? ` · expires ${formatDate(document.expiresOn, { year: undefined })}` : ''}
                        </small>
                      </span>
                      {document.isConfidential && <LockKeyhole size={14} aria-label="Confidential" />}
                      <a href={document.fileUrl} target="_blank" rel="noreferrer" aria-label={`Open ${document.title}`}>
                        <ExternalLink size={15} />
                      </a>
                    </div>
                  ))}
                  {!documents.data?.length && <p className="muted">No employment documents recorded.</p>}
                </div>
              </Async>
            </section>

            <section className="detail-section">
              <p className="eyebrow">Contact</p>
              <h3>Personal information</h3>
              <dl className="detail-list">
                <Detail icon={Mail} label="Work email" value={employee.email} />
                <Detail icon={Mail} label="Personal email" value={employee.personalEmail} />
                <Detail icon={Phone} label="Phone" value={employee.phone} />
                <Detail icon={MapPin} label="Address" value={employee.address} />
                <Detail label="Nationality" value={employee.nationality} />
                <Detail label="Date of birth" value={formatDate(employee.dateOfBirth)} />
                <Detail label="Emergency contact" value={employee.emergencyContact} />
                <Detail label="Emergency phone" value={employee.emergencyContactPhone} />
              </dl>
            </section>

            <section className="detail-section">
              <p className="eyebrow">Record history</p>
              <h3>Employment timeline</h3>
              <Async loading={timeline.loading} error={timeline.error} onRetry={timeline.reload} rows={3}>
                <div className="history-rail">
                  {(timeline.data ?? []).slice(0, 8).map((entry) => (
                    <div key={entry.id}>
                      <i />
                      <span>
                        <strong>{entry.title}</strong>
                        <small>
                          {formatDate(entry.date)}
                          {entry.description ? ` · ${entry.description}` : ''}
                        </small>
                      </span>
                    </div>
                  ))}
                  {!timeline.data?.length && <p className="muted">No recorded history yet.</p>}
                </div>
              </Async>
            </section>
          </div>
        </div>
      )}
    </Modal>
  )
}

/**
 * Salary is rendered in its own component so a 403 from the compensation
 * endpoint shows a locked panel rather than failing the profile around it.
 */
function CompensationPanel({ state, employeeId, currency, onSaved, onToast }) {
  const [adding, setAdding] = useState(false)

  if (state.loading) {
    return (
      <section className="detail-section compensation-section">
        <LoadingState label="Loading compensation…" />
      </section>
    )
  }

  if (state.error) {
    return (
      <section className="detail-section compensation-section">
        <div className="sensitive-label">
          <LockKeyhole size={13} /> Restricted
        </div>
        <ErrorState error={state.error} compact />
      </section>
    )
  }

  const current = state.data?.current
  const history = state.data?.history ?? []

  return (
    <section className="detail-section compensation-section">
      <div className="sensitive-label">
        <LockKeyhole size={13} /> HR only
      </div>
      <p className="eyebrow">Compensation</p>
      {current ? (
        <>
          <h3>
            {formatMoney(current.baseSalary, current.currency)} <small>/ month</small>
          </h3>
          <dl className="detail-list">
            <Detail label="Total fixed" value={formatMoney(current.totalFixed, current.currency)} />
            <Detail label="Housing" value={formatMoney(current.housingAllowance, current.currency)} />
            <Detail label="Transport" value={formatMoney(current.transportAllowance, current.currency)} />
            <Detail label="Effective from" value={formatDate(current.effectiveFrom)} />
            <Detail label="Reason" value={current.changeReason} />
            <Detail label="Annualized" value={formatMoney(current.totalFixed * 12, current.currency)} />
          </dl>
          {history.length > 1 && (
            <div className="salary-history">
              <p className="eyebrow">History</p>
              {history.slice(1).map((record) => (
                <div key={record.id}>
                  <span>{formatDate(record.effectiveFrom, { day: undefined })}</span>
                  <strong>{formatMoney(record.baseSalary, record.currency)}</strong>
                  <small>{record.changeReason}</small>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="muted">No compensation recorded for this employee yet.</p>
      )}

      <button className="text-button" onClick={() => setAdding(true)}>
        Record a change
      </button>

      <Modal open={adding} onClose={() => setAdding(false)} title="Record a compensation change" eyebrow="HR only">
        <CompensationForm
          employeeId={employeeId}
          currency={currency}
          current={current}
          onCancel={() => setAdding(false)}
          onSaved={() => {
            setAdding(false)
            onSaved()
          }}
          onToast={onToast}
        />
      </Modal>
    </section>
  )
}

function CompensationForm({ employeeId, currency, current, onCancel, onSaved, onToast }) {
  const [form, setForm] = useState({
    baseSalary: current?.baseSalary ?? '',
    housingAllowance: current?.housingAllowance ?? 0,
    transportAllowance: current?.transportAllowance ?? 0,
    effectiveFrom: todayIso(),
    changeReason: '',
  })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (key, value) => setForm((state) => ({ ...state, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await addCompensation(employeeId, {
        baseSalary: Number(form.baseSalary),
        housingAllowance: Number(form.housingAllowance || 0),
        transportAllowance: Number(form.transportAllowance || 0),
        effectiveFrom: form.effectiveFrom,
        changeReason: form.changeReason,
      })
      onSaved()
    } catch (caught) {
      setError(caught)
      setSaving(false)
    }
  }

  return (
    <form className="simple-form" onSubmit={submit} noValidate>
      <div className="two-col">
        <FormField label={`Monthly base salary (${currency})`} error={error?.fieldError?.('baseSalary')}>
          <input type="number" min="0" value={form.baseSalary} onChange={(e) => set('baseSalary', e.target.value)} required />
        </FormField>
        <FormField label="Effective from" error={error?.fieldError?.('effectiveFrom')}>
          <input type="date" value={form.effectiveFrom} onChange={(e) => set('effectiveFrom', e.target.value)} required />
        </FormField>
        <FormField label="Housing allowance">
          <input type="number" min="0" value={form.housingAllowance} onChange={(e) => set('housingAllowance', e.target.value)} />
        </FormField>
        <FormField label="Transport allowance">
          <input type="number" min="0" value={form.transportAllowance} onChange={(e) => set('transportAllowance', e.target.value)} />
        </FormField>
      </div>
      <FormField
        label="Reason for change"
        error={error?.fieldError?.('changeReason')}
        hint="Appears on the employee timeline. The amount itself is never shown there."
      >
        <input value={form.changeReason} onChange={(e) => set('changeReason', e.target.value)} placeholder="Annual review" required />
      </FormField>
      <FormError error={error} />
      <div className="form-actions">
        <button type="button" className="button button-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="button button-primary" type="submit" disabled={saving}>
          {saving ? <Spinner size={16} /> : <Check size={17} />} Save change
        </button>
      </div>
    </form>
  )
}

/**
 * Status is changed through its own endpoint because it is a business event -
 * it needs a reason and an effective date, and offboarding also disables the
 * employee's login.
 */
function StatusChangeForm({ employee, onCancel, onSaved }) {
  const [form, setForm] = useState({
    status: employee.statusValue === 'ACTIVE' ? 'ON_LEAVE' : 'ACTIVE',
    effectiveDate: todayIso(),
    reason: '',
    exitReason: '',
  })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const set = (key, value) => setForm((state) => ({ ...state, [key]: value }))

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      await changeEmployeeStatus(employee.id, {
        status: form.status,
        effectiveDate: form.effectiveDate,
        reason: form.reason,
        exitReason: form.status === 'OFFBOARDED' ? form.exitReason : undefined,
      })
      onSaved(`${employee.fullName} is now ${form.status.replace('_', ' ').toLowerCase()}.`)
    } catch (caught) {
      setError(caught)
      setSaving(false)
    }
  }

  return (
    <form className="simple-form" onSubmit={submit} noValidate>
      <div className="status-change-note">
        <ShieldCheck size={18} />
        <p>
          Current status is <strong>{employee.status}</strong>. The change is written to the employment timeline and the
          audit trail. Offboarding also deactivates the login.
        </p>
      </div>
      <div className="two-col">
        <FormField label="New status" error={error?.fieldError?.('status')}>
          <select value={form.status} onChange={(e) => set('status', e.target.value)}>
            {Object.entries(EMPLOYEE_STATUS_VALUES)
              .filter(([, value]) => value !== employee.statusValue)
              .map(([label, value]) => (
                <option value={value} key={value}>
                  {label}
                </option>
              ))}
          </select>
        </FormField>
        <FormField label="Effective date" error={error?.fieldError?.('effectiveDate')}>
          <input type="date" value={form.effectiveDate} onChange={(e) => set('effectiveDate', e.target.value)} required />
        </FormField>
      </div>
      <FormField label="Reason" error={error?.fieldError?.('reason')}>
        <input value={form.reason} onChange={(e) => set('reason', e.target.value)} placeholder="Probation completed" required />
      </FormField>
      {form.status === 'OFFBOARDED' && (
        <FormField label="Exit reason" error={error?.fieldError?.('exitReason')}>
          <input value={form.exitReason} onChange={(e) => set('exitReason', e.target.value)} placeholder="Resignation" required />
        </FormField>
      )}
      <FormError error={error} />
      <div className="form-actions">
        <button type="button" className="button button-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="button button-primary" type="submit" disabled={saving}>
          {saving ? <Spinner size={16} /> : <Check size={17} />} Save status
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Create / edit form
// ---------------------------------------------------------------------------

function EmployeeForm({ employee, departments, entities, onCancel, onSaved, onToast }) {
  const isEdit = Boolean(employee)

  const [form, setForm] = useState(() => ({
    firstName: employee?.firstName ?? '',
    lastName: employee?.lastName ?? '',
    workEmail: employee?.email ?? '',
    personalEmail: employee?.personalEmail ?? '',
    phone: employee?.phone ?? '',
    nationality: employee?.nationality ?? '',
    dateOfBirth: employee?.dateOfBirth ?? '',
    addressLine: employee?.addressLine ?? '',
    city: employee?.city ?? '',
    country: employee?.country ?? '',
    jobTitle: employee?.role ?? '',
    departmentId: employee?.departmentId ?? '',
    legalEntityId: employee?.entityId ?? entities[0]?.id ?? '',
    managerId: employee?.managerId ?? '',
    employmentType: employee?.employmentTypeValue ?? 'FULL_TIME',
    contractType: employee?.contractTypeValue ?? 'UNLIMITED',
    workMode: employee?.workModeValue ?? 'ONSITE',
    // Only sent when creating; on edit, status has its own endpoint.
    status: 'PROBATION',
    hireDate: employee?.joinDate ?? todayIso(),
    contractEndDate: employee?.contractEnd ?? '',
    baseSalary: '',
    createAccount: true,
  }))
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const set = (key, value) => setForm((state) => ({ ...state, [key]: value }))

  // Manager picker needs a full list; the directory is paginated, so it is
  // fetched separately at a size that covers a company of this scale.
  const managerPool = useResource(() => fetchEmployees({ pageSize: 100, sortBy: 'name' }), [])
  const managerOptions = (managerPool.data?.items ?? []).filter((item) => item.id !== employee?.id)
  const selectedEntity = entities.find((entity) => entity.id === form.legalEntityId)

  const submit = async (event) => {
    event.preventDefault()
    setSaving(true)
    setError(null)

    try {
      if (isEdit) {
        // Status is deliberately absent - it has its own endpoint.
        await updateEmployee(employee.id, {
          firstName: form.firstName,
          lastName: form.lastName,
          workEmail: form.workEmail,
          personalEmail: form.personalEmail || undefined,
          phone: form.phone || undefined,
          nationality: form.nationality || undefined,
          dateOfBirth: form.dateOfBirth || undefined,
          addressLine: form.addressLine || undefined,
          city: form.city || undefined,
          country: form.country || undefined,
          jobTitle: form.jobTitle,
          departmentId: form.departmentId || undefined,
          legalEntityId: form.legalEntityId,
          managerId: form.managerId || undefined,
          employmentType: form.employmentType,
          contractType: form.contractType,
          workMode: form.workMode,
          hireDate: form.hireDate,
          contractEndDate: form.contractEndDate || undefined,
        })
        onSaved('Employee profile updated.')
        return
      }

      const result = await createEmployee({
        firstName: form.firstName,
        lastName: form.lastName,
        workEmail: form.workEmail,
        personalEmail: form.personalEmail || undefined,
        phone: form.phone || undefined,
        nationality: form.nationality || undefined,
        dateOfBirth: form.dateOfBirth || undefined,
        addressLine: form.addressLine || undefined,
        city: form.city || undefined,
        country: form.country || undefined,
        jobTitle: form.jobTitle,
        departmentId: form.departmentId || undefined,
        legalEntityId: form.legalEntityId,
        managerId: form.managerId || undefined,
        employmentType: form.employmentType,
        contractType: form.contractType,
        workMode: form.workMode,
        status: form.status,
        hireDate: form.hireDate,
        contractEndDate: form.contractEndDate || undefined,
        compensation: form.baseSalary
          ? { baseSalary: Number(form.baseSalary), changeReason: 'Starting compensation' }
          : undefined,
        account: form.createAccount ? { role: 'EMPLOYEE' } : undefined,
      })

      onSaved(`${result.employee.fullName} added as ${result.employee.employeeNumber}.`)
      // The temporary password is returned exactly once and cannot be read back.
      if (result.temporaryPassword) {
        onToast(`Temporary password for ${result.employee.email}: ${result.temporaryPassword}`, 'success')
      }
    } catch (caught) {
      setError(caught)
      setSaving(false)
    }
  }

  const fieldError = (name) => error?.fieldError?.(name)

  return (
    <form className="employee-form" onSubmit={submit} noValidate>
      <div className="form-section">
        <div>
          <span>01</span>
          <h3>Personal details</h3>
          <p>Identity and contact information.</p>
        </div>
        <div className="form-fields two-col">
          <FormField label="First name" error={fieldError('firstName')}>
            <input value={form.firstName} onChange={(e) => set('firstName', e.target.value)} required />
          </FormField>
          <FormField label="Last name" error={fieldError('lastName')}>
            <input value={form.lastName} onChange={(e) => set('lastName', e.target.value)} required />
          </FormField>
          <FormField label="Work email" error={fieldError('workEmail')}>
            <input type="email" value={form.workEmail} onChange={(e) => set('workEmail', e.target.value)} required />
          </FormField>
          <FormField label="Personal email" error={fieldError('personalEmail')}>
            <input type="email" value={form.personalEmail} onChange={(e) => set('personalEmail', e.target.value)} />
          </FormField>
          <FormField label="Phone" error={fieldError('phone')}>
            <input value={form.phone} onChange={(e) => set('phone', e.target.value)} placeholder="+971 50 000 0000" />
          </FormField>
          <FormField label="Nationality">
            <input value={form.nationality} onChange={(e) => set('nationality', e.target.value)} />
          </FormField>
          <FormField label="Date of birth" error={fieldError('dateOfBirth')}>
            <input type="date" value={form.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
          </FormField>
          <FormField label="City">
            <input value={form.city} onChange={(e) => set('city', e.target.value)} />
          </FormField>
        </div>
      </div>

      <div className="form-section">
        <div>
          <span>02</span>
          <h3>Employment</h3>
          <p>Role, legal entity and contract.</p>
        </div>
        <div className="form-fields two-col">
          <FormField label="Job title" error={fieldError('jobTitle')}>
            <input value={form.jobTitle} onChange={(e) => set('jobTitle', e.target.value)} required />
          </FormField>
          <FormField label="Department" error={fieldError('departmentId')}>
            <select value={form.departmentId} onChange={(e) => set('departmentId', e.target.value)}>
              <option value="">Unassigned</option>
              {departments.map((department) => (
                <option value={department.id} key={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Legal entity" error={fieldError('legalEntityId')}>
            <select value={form.legalEntityId} onChange={(e) => set('legalEntityId', e.target.value)}>
              {entities.map((entity) => (
                <option value={entity.id} key={entity.id}>
                  {entity.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Manager" error={fieldError('managerId')}>
            <select value={form.managerId} onChange={(e) => set('managerId', e.target.value)}>
              <option value="">Executive team</option>
              {managerOptions.map((item) => (
                <option value={item.id} key={item.id}>
                  {item.fullName} — {item.role}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Start date" error={fieldError('hireDate')}>
            <input type="date" value={form.hireDate} onChange={(e) => set('hireDate', e.target.value)} required />
          </FormField>
          <FormField
            label="Contract end"
            error={fieldError('contractEndDate')}
            hint={form.contractType === 'LIMITED' ? 'Required for a limited-term contract' : undefined}
          >
            <input type="date" value={form.contractEndDate} onChange={(e) => set('contractEndDate', e.target.value)} />
          </FormField>
          <FormField label="Employment type">
            <select value={form.employmentType} onChange={(e) => set('employmentType', e.target.value)}>
              {EMPLOYMENT_TYPE_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Contract type">
            <select value={form.contractType} onChange={(e) => set('contractType', e.target.value)}>
              {CONTRACT_TYPE_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Work mode">
            <select value={form.workMode} onChange={(e) => set('workMode', e.target.value)}>
              {WORK_MODE_OPTIONS.map((option) => (
                <option value={option.value} key={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </FormField>
          {!isEdit && (
            <FormField label="Starting status">
              <select value={form.status} onChange={(e) => set('status', e.target.value)}>
                <option value="PROBATION">Probation</option>
                <option value="ACTIVE">Active</option>
              </select>
            </FormField>
          )}
        </div>
      </div>

      {!isEdit && (
        <div className="form-section">
          <div>
            <span>03</span>
            <h3>Compensation &amp; access</h3>
            <p>Sensitive, HR-only information.</p>
          </div>
          <div className="form-fields two-col">
            <FormField
              label={`Monthly salary (${selectedEntity?.currency ?? ''})`}
              error={fieldError('compensation.baseSalary')}
              hint="Optional — can be added later"
            >
              <input type="number" min="0" value={form.baseSalary} onChange={(e) => set('baseSalary', e.target.value)} />
            </FormField>
            <FormField label="Login account" hint="A temporary password is shown once after saving">
              <select value={form.createAccount ? 'yes' : 'no'} onChange={(e) => set('createAccount', e.target.value === 'yes')}>
                <option value="yes">Create a login</option>
                <option value="no">No login for now</option>
              </select>
            </FormField>
          </div>
        </div>
      )}

      <FormError error={error} />

      <div className="form-actions">
        <button type="button" className="button button-ghost" onClick={onCancel}>
          Cancel
        </button>
        <button className="button button-primary" type="submit" disabled={saving}>
          {saving ? <Spinner size={16} /> : <Check size={17} />} {isEdit ? 'Save changes' : 'Add employee'}
        </button>
      </div>
    </form>
  )
}
