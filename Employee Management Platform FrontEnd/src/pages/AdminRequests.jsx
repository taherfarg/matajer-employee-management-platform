import { useEffect, useState } from 'react'
import {
  ArrowRight,
  Building2,
  CalendarCheck2,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  FileText,
  Globe2,
  Plane,
  UserRound,
  X,
} from 'lucide-react'
import {
  Async,
  Avatar,
  EntityBadge,
  ErrorState,
  FormError,
  LoadingState,
  Modal,
  RequestFact,
  Spinner,
  StatusPill,
} from '../components/ui.jsx'
import LetterModal from '../components/LetterModal.jsx'
import { useResource } from '../hooks/useResource.js'
import { formatDate, formatTime, plural } from '../lib/format.js'
import { approveRequest, fetchRequest, fetchRequests, rejectRequest } from '../api/endpoints.js'

const STATUS_TABS = [
  { label: 'Pending', value: 'PENDING' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Cancelled', value: 'CANCELLED' },
  { label: 'All', value: '' },
]

const TYPE_OPTIONS = [
  { label: 'All request types', value: '' },
  { label: 'Leave', value: 'LEAVE' },
  { label: 'Document', value: 'DOCUMENT' },
  { label: 'Profile change', value: 'PROFILE_CHANGE' },
]

export default function AdminRequests({ onToast, onDecided }) {
  const [status, setStatus] = useState('PENDING')
  const [type, setType] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const inbox = useResource(() => fetchRequests({ status, type, pageSize: 50 }), [status, type])

  const requests = inbox.data?.items ?? []
  // The API returns per-status counts for the same filter set, so the tab
  // badges are always consistent with the list rather than counted client-side.
  const summary = inbox.data?.summary ?? {}

  const totalsByType = requests.reduce(
    (result, request) => ({ ...result, [request.typeValue]: (result[request.typeValue] ?? 0) + 1 }),
    {},
  )

  return (
    <div className="page-stack">
      <section className="request-summary-grid">
        <article className="request-summary request-summary-dark">
          <span>
            <ClipboardCheck size={21} />
          </span>
          <div>
            <strong>{summary.PENDING ?? 0}</strong>
            <p>Waiting for review</p>
          </div>
          <small>Action required</small>
        </article>
        <article className="request-summary">
          <span>
            <CalendarCheck2 size={21} />
          </span>
          <div>
            <strong>{totalsByType.LEAVE ?? 0}</strong>
            <p>Leave requests</p>
          </div>
          <small>In this view</small>
        </article>
        <article className="request-summary">
          <span>
            <FileText size={21} />
          </span>
          <div>
            <strong>{(totalsByType.DOCUMENT ?? 0) + (totalsByType.PROFILE_CHANGE ?? 0)}</strong>
            <p>Document &amp; profile</p>
          </div>
          <small>In this view</small>
        </article>
      </section>

      <section className="panel requests-panel reveal">
        <div className="request-tabs-row">
          <div className="segmented-tabs" role="tablist">
            {STATUS_TABS.map((tab) => (
              <button
                role="tab"
                aria-selected={status === tab.value}
                className={status === tab.value ? 'active' : ''}
                onClick={() => setStatus(tab.value)}
                key={tab.label}
              >
                {tab.label}
                {tab.value && summary[tab.value] ? <b>{summary[tab.value]}</b> : null}
              </button>
            ))}
          </div>
          <label className="select-wrap">
            <select value={type} onChange={(event) => setType(event.target.value)} aria-label="Filter request type">
              {TYPE_OPTIONS.map((option) => (
                <option value={option.value} key={option.label}>
                  {option.label}
                </option>
              ))}
            </select>
            <ChevronDown size={15} />
          </label>
        </div>

        <Async loading={inbox.loading} error={inbox.error} onRetry={inbox.reload} rows={6}>
          <>
            <div className="request-table-wrap">
              <table className="people-table request-table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Request</th>
                    <th>Details</th>
                    <th>Submitted</th>
                    <th>Status</th>
                    <th>
                      <span className="sr-only">Open</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((request) => (
                    <tr key={request.id} onClick={() => setSelectedId(request.id)}>
                      <td>
                        <div className="person-cell">
                          <Avatar employee={request.employee} size="sm" />
                          <span>
                            <strong>{request.employee?.fullName ?? 'Unknown'}</strong>
                            <small>{request.employee?.department}</small>
                          </span>
                        </div>
                      </td>
                      <td>
                        <strong>{request.subtype}</strong>
                        <small>{request.reference}</small>
                      </td>
                      <td>
                        <strong>{describeRequest(request)}</strong>
                        <small>{describeRequestMeta(request)}</small>
                      </td>
                      <td>
                        <strong>{formatDate(request.submittedAt, { year: undefined })}</strong>
                        <small>{formatTime(request.submittedAt)}</small>
                      </td>
                      <td>
                        <StatusPill status={request.status} />
                      </td>
                      <td>
                        <button className="row-action" aria-label={`Open ${request.reference}`}>
                          <ChevronRight size={18} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!requests.length && (
                <div className="empty-state">
                  <CheckCircle2 size={25} />
                  <h3>No requests here</h3>
                  <p>There are no requests matching this filter.</p>
                </div>
              )}
            </div>

            <div className="mobile-request-list">
              {requests.map((request) => (
                <button className="mobile-request-card" key={request.id} onClick={() => setSelectedId(request.id)}>
                  <div>
                    <Avatar employee={request.employee} size="sm" />
                    <span>
                      <strong>{request.employee?.fullName ?? 'Unknown'}</strong>
                      <small>{request.subtype}</small>
                    </span>
                  </div>
                  <StatusPill status={request.status} />
                  <p>{describeRequest(request)}</p>
                  <ChevronRight size={18} />
                </button>
              ))}
            </div>
          </>
        </Async>
      </section>

      <RequestDetail
        requestId={selectedId}
        onClose={() => setSelectedId(null)}
        onDecided={() => {
          inbox.reload()
          // The sidebar pending badge lives in App, so it has to be told too.
          onDecided?.()
        }}
        onToast={onToast}
      />
    </div>
  )
}

function describeRequest(request) {
  if (request.typeValue === 'LEAVE') return plural(request.days, 'working day')
  if (request.typeValue === 'DOCUMENT') return request.purpose ?? 'Document request'
  return `${plural(request.changeCount ?? 0, 'field')} proposed`
}

function describeRequestMeta(request) {
  if (request.typeValue === 'LEAVE') {
    return `${formatDate(request.startDate, { year: undefined })} — ${formatDate(request.endDate, { year: undefined })}`
  }
  if (request.typeValue === 'DOCUMENT') return request.language
  return request.purpose
}

// ---------------------------------------------------------------------------
// Request detail
// ---------------------------------------------------------------------------

function RequestDetail({ requestId, onClose, onDecided, onToast }) {
  const [letterId, setLetterId] = useState(null)
  const [note, setNote] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  const detail = useResource(() => fetchRequest(requestId), [requestId], { enabled: Boolean(requestId) })
  const request = detail.data

  useEffect(() => {
    setNote(request?.adminNote ?? '')
    setError(null)
  }, [request?.id, request?.adminNote])

  if (!requestId) return null

  const isPending = request?.status === 'Pending'

  const decide = async (action) => {
    setBusy(true)
    setError(null)
    try {
      if (action === 'approve') {
        await approveRequest(request.id, note)
        onToast(`${request.reference} approved.`)
      } else {
        // The API requires a reason for a rejection, so fall back to a default
        // rather than letting the request fail validation.
        await rejectRequest(request.id, note || 'Unable to approve this request at this time.')
        onToast(`${request.reference} rejected.`)
      }
      detail.reload()
      onDecided()
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={Boolean(requestId)}
      onClose={onClose}
      title={request?.subtype ?? 'Request'}
      eyebrow={request ? `${request.reference} · ${formatDate(request.submittedAt)}` : undefined}
      size="lg"
    >
      {detail.loading && <LoadingState label="Loading request…" />}
      {detail.error && <ErrorState error={detail.error} onRetry={detail.reload} />}

      {request && (
        <div className="request-detail">
          <div className="request-person">
            <Avatar employee={request.employee} />
            <div>
              <strong>{request.employee?.fullName}</strong>
              <span>{request.employee?.role}</span>
              <EntityBadge
                entityId={request.employee?.entityId}
                entityCode={request.employee?.entityCode}
                entityName={request.employee?.entityName}
              />
            </div>
            <StatusPill status={request.status} />
          </div>

          <div className="request-facts">
            {request.typeValue === 'LEAVE' && (
              <>
                <RequestFact
                  icon={CalendarDays}
                  label="Dates"
                  value={`${formatDate(request.startDate)} — ${formatDate(request.endDate)}`}
                />
                <RequestFact icon={Clock3} label="Chargeable" value={plural(request.days, 'working day')} />
                <RequestFact icon={Plane} label="Leave type" value={request.subtype} />
                <RequestFact icon={Building2} label="Entity calendar" value={request.employee?.entityName} />
              </>
            )}
            {request.typeValue === 'DOCUMENT' && (
              <>
                <RequestFact icon={FileText} label="Document" value={request.subtype} />
                <RequestFact icon={Globe2} label="Language" value={request.language} />
                <RequestFact icon={UserRound} label="Addressed to" value={request.addressedTo ?? 'Not specified'} />
                <RequestFact
                  icon={Building2}
                  label="States salary"
                  value={request.includeSalary ? 'Yes' : 'No'}
                />
              </>
            )}
            {request.typeValue === 'PROFILE_CHANGE' && (
              <>
                <RequestFact icon={UserRound} label="Fields" value={`${request.changeCount} proposed`} />
                <RequestFact icon={Building2} label="Entity" value={request.employee?.entityName} />
                <RequestFact
                  icon={CheckCircle2}
                  label="Applied"
                  value={request.appliedAt ? formatDate(request.appliedAt) : 'Not yet'}
                />
                <RequestFact icon={Clock3} label="Submitted" value={formatDate(request.submittedAt)} />
              </>
            )}
          </div>

          {/* A profile change is reviewed as a before/after, not a list of new values. */}
          {request.typeValue === 'PROFILE_CHANGE' && Array.isArray(request.changes) && (
            <div className="change-list">
              <p className="eyebrow">Proposed changes</p>
              {request.changes.map((change) => (
                <div className="change-row" key={change.field}>
                  <span>{change.label}</span>
                  <del>{change.currentValue || 'Not set'}</del>
                  <ArrowRight size={14} />
                  <ins>{change.proposedValue}</ins>
                </div>
              ))}
            </div>
          )}

          {request.reason && (
            <div className="reason-box">
              <p className="eyebrow">Employee note</p>
              <blockquote>“{request.reason}”</blockquote>
              {request.handoverNotes && (
                <p className="handover">
                  <strong>Handover:</strong> {request.handoverNotes}
                </p>
              )}
            </div>
          )}

          {request.purpose && request.typeValue === 'DOCUMENT' && (
            <div className="reason-box">
              <p className="eyebrow">Purpose</p>
              <blockquote>“{request.purpose}”</blockquote>
            </div>
          )}

          {request.issuedDocument && (
            <div className="issued-document">
              <FileText size={18} />
              <div>
                <strong>{request.issuedDocument.title}</strong>
                <small>{request.issuedDocument.fileName}</small>
              </div>
              <button className="button button-secondary" onClick={() => setLetterId(request.issuedDocument.id)}>
                Read letter
              </button>
            </div>
          )}

          <div className="decision-box">
            <label className="field">
              <span>
                Decision note {isPending && <small>Shared with the employee</small>}
              </span>
              <textarea
                rows="3"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Add context for your decision…"
                disabled={!isPending || busy}
              />
            </label>
            {request.decidedAt && (
              <p className="decision-meta">
                <CheckCircle2 size={15} /> Decision recorded {formatDate(request.decidedAt)}
                {request.decidedBy ? ` by ${request.decidedBy}` : ''}
              </p>
            )}
          </div>

          <FormError error={error} />

          {isPending && (
            <div className="request-actions">
              <button className="button button-reject" onClick={() => decide('reject')} disabled={busy}>
                <X size={17} /> Reject
              </button>
              <button className="button button-primary" onClick={() => decide('approve')} disabled={busy}>
                {busy ? <Spinner size={16} /> : <Check size={17} />} Approve request
              </button>
            </div>
          )}
        </div>
      )}
      <LetterModal documentId={letterId} onClose={() => setLetterId(null)} />
    </Modal>
  )
}
