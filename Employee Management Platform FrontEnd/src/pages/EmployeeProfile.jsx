import { useState } from 'react'
import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  FileText,
  Globe2,
  LockKeyhole,
  Mail,
  MapPin,
  Pencil,
  Phone,
  ShieldCheck,
  UserRound,
  UsersRound,
  WalletCards,
} from 'lucide-react'
import {
  Async,
  Avatar,
  Detail,
  EntityBadge,
  ErrorState,
  LoadingState,
  RequestFact,
  StatusPill,
} from '../components/ui.jsx'
import RequestFormModal from '../components/RequestFormModal.jsx'
import LetterModal from '../components/LetterModal.jsx'
import { useResource } from '../hooks/useResource.js'
import { useOrg } from '../hooks/useOrg.jsx'
import { formatDate, formatMoney } from '../lib/format.js'
import { fetchCompensation, fetchMyDocuments, fetchMyProfile, fetchMyTimeline } from '../api/endpoints.js'

export default function EmployeeProfile({ session, onToast }) {
  const [requestType, setRequestType] = useState(null)
  const [letterId, setLetterId] = useState(null)
  const { getEntity } = useOrg()

  const profile = useResource(() => fetchMyProfile(), [])
  const employeeId = session.employee?.id

  // An employee may read their own compensation - the same endpoint HR uses,
  // which returns 403 for anyone else.
  const compensation = useResource(() => fetchCompensation(employeeId), [employeeId], {
    enabled: Boolean(employeeId),
  })
  const documents = useResource(() => fetchMyDocuments(), [])
  const timeline = useResource(() => fetchMyTimeline(), [])

  if (profile.loading) return <LoadingState label="Loading your profile…" />
  if (profile.error) return <ErrorState error={profile.error} onRetry={profile.reload} />

  const employee = profile.data
  const entity = getEntity(employee.entityId)
  const current = compensation.data?.current

  return (
    <div className="page-stack">
      <section className="profile-page-hero reveal">
        <div className="profile-page-person">
          <Avatar employee={employee} size="xl" />
          <div>
            <StatusPill status={employee.status} />
            <h2>{employee.fullName}</h2>
            <p>
              {employee.role} · {employee.department}
            </p>
            <EntityBadge entityId={employee.entityId} entityCode={employee.entityCode} entityName={employee.entityName} full />
          </div>
        </div>
        <div className="profile-completion">
          <div>
            <span>Employee number</span>
            <strong>{employee.employeeNumber}</strong>
          </div>
          <span className="completion-track">
            <i />
          </span>
          <small>Joined {formatDate(employee.joinDate)}</small>
        </div>
      </section>

      <div className="profile-page-grid">
        <section className="panel profile-info-panel reveal">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Employment details</p>
              <h2>Role &amp; contract</h2>
            </div>
            <span className="privacy-chip">
              <ShieldCheck size={14} /> Private to you &amp; People
            </span>
          </div>
          <div className="profile-facts">
            <RequestFact icon={BriefcaseBusiness} label="Position" value={employee.role} />
            <RequestFact icon={UsersRound} label="Department" value={employee.department} />
            <RequestFact icon={UserRound} label="Manager" value={employee.managerName ?? 'Executive team'} />
            <RequestFact icon={CalendarDays} label="Start date" value={formatDate(employee.joinDate)} />
            <RequestFact icon={Building2} label="Legal employer" value={employee.entityName} />
            <RequestFact icon={WalletCards} label="Employment type" value={employee.employmentType} />
            <RequestFact icon={MapPin} label="Work mode" value={employee.workMode} />
            <RequestFact
              icon={CalendarDays}
              label="Notice period"
              value={employee.noticePeriodDays ? `${employee.noticePeriodDays} days` : '—'}
            />
          </div>
        </section>

        <section className="panel salary-card reveal">
          <div className="salary-card-head">
            <span>
              <LockKeyhole size={16} /> Private compensation
            </span>
            <ShieldCheck size={19} />
          </div>
          {compensation.loading && <LoadingState label="Loading…" />}
          {compensation.error && <ErrorState error={compensation.error} compact />}
          {current && (
            <>
              <p>Monthly base salary</p>
              <h2>{formatMoney(current.baseSalary, current.currency)}</h2>
              <span>
                Paid monthly · {current.currency}
              </span>
              <div>
                <span>Total fixed</span>
                <strong>{formatMoney(current.totalFixed, current.currency)}</strong>
              </div>
              <div>
                <span>Annualized</span>
                <strong>{formatMoney(current.totalFixed * 12, current.currency)}</strong>
              </div>
            </>
          )}
          {!compensation.loading && !compensation.error && !current && (
            <p className="muted">No compensation recorded yet.</p>
          )}
        </section>

        <section className="panel profile-contact-panel reveal">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Personal details</p>
              <h2>Contact &amp; identity</h2>
            </div>
            {/* Self-service edits go through approval, so this opens a request. */}
            <button className="button button-secondary" onClick={() => setRequestType('Profile')}>
              <Pencil size={15} /> Request an update
            </button>
          </div>
          <dl className="detail-list contact-detail-list">
            <Detail icon={Mail} label="Work email" value={employee.email} />
            <Detail icon={Mail} label="Personal email" value={employee.personalEmail} />
            <Detail icon={Phone} label="Phone" value={employee.phone} />
            <Detail icon={MapPin} label="Home address" value={employee.address} />
            <Detail icon={Globe2} label="Nationality" value={employee.nationality} />
            <Detail icon={CalendarDays} label="Date of birth" value={formatDate(employee.dateOfBirth)} />
            <Detail icon={ShieldCheck} label="Emergency contact" value={employee.emergencyContact} />
            <Detail icon={Phone} label="Emergency phone" value={employee.emergencyContactPhone} />
          </dl>
          <p className="form-hint">
            <ShieldCheck size={14} /> Job title, salary and legal entity are maintained by People Operations.
          </p>
        </section>

        <section className="panel profile-entity-panel reveal">
          <p className="eyebrow">Your legal employer</p>
          <div className="entity-record">
            <div className="entity-code" style={{ background: entity?.accent, color: entity?.color }}>
              {entity?.countryCode ?? '—'}
            </div>
            <div>
              <h3>{entity?.shortName ?? employee.entityName}</h3>
              <p>{entity?.name}</p>
            </div>
          </div>
          <dl className="detail-list">
            <Detail label="Registration" value={entity?.registration} />
            <Detail label="Office" value={entity?.address} />
            <Detail label="Currency" value={entity?.currency} />
            <Detail label="Working week" value={entity?.workWeekLabel?.join(', ')} />
          </dl>
        </section>
      </div>

      <div className="dashboard-grid employee-dashboard-grid">
        <section className="panel panel-padded reveal">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Records</p>
              <h2>My documents</h2>
            </div>
            <span className="count-badge">{documents.data?.length ?? 0}</span>
          </div>
          <Async loading={documents.loading} error={documents.error} onRetry={documents.reload} rows={3}>
            <div className="document-list">
              {(documents.data ?? []).map((document) => (
                <div key={document.id} className={document.category === 'LETTER' ? 'document-readable' : ''}
                     onClick={() => document.category === 'LETTER' && setLetterId(document.id)}>
                  <FileText size={17} />
                  <span>
                    <strong>{document.title}</strong>
                    <small>
                      {document.category.replace('_', ' ').toLowerCase()}
                      {document.issuedOn ? ` · issued ${formatDate(document.issuedOn)}` : ''}
                    </small>
                  </span>
                  {document.expiresOn && (
                    <StatusPill status={document.isExpired ? 'Rejected' : 'Approved'}>
                      {document.isExpired ? 'Expired' : `Expires ${formatDate(document.expiresOn, { year: undefined })}`}
                    </StatusPill>
                  )}
                </div>
              ))}
              {!documents.data?.length && <p className="muted">No documents have been shared with you yet.</p>}
            </div>
          </Async>
        </section>

        <section className="panel panel-padded reveal">
          <div className="panel-header">
            <div>
              <p className="eyebrow">History</p>
              <h2>My employment timeline</h2>
            </div>
          </div>
          <Async loading={timeline.loading} error={timeline.error} onRetry={timeline.reload} rows={4}>
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

      <LetterModal documentId={letterId} onClose={() => setLetterId(null)} />

      <RequestFormModal
        type={requestType}
        profile={employee}
        onClose={() => setRequestType(null)}
        onSubmitted={() => {
          setRequestType(null)
          profile.reload()
        }}
        onToast={onToast}
      />
    </div>
  )
}
