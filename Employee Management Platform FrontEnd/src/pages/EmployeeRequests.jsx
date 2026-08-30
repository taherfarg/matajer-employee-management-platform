import { useState } from 'react'
import { CalendarDays, ClipboardCheck, FileText, Plane, UserRound, X } from 'lucide-react'
import { Async, FormError, Spinner, StatusPill } from '../components/ui.jsx'
import RequestFormModal from '../components/RequestFormModal.jsx'
import { useResource } from '../hooks/useResource.js'
import { formatDate } from '../lib/format.js'
import { cancelRequest, fetchMyBalances, fetchMyProfile, fetchMyRequests } from '../api/endpoints.js'

const FILTERS = [
  { label: 'All', value: '' },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
  { label: 'Cancelled', value: 'CANCELLED' },
]

export default function EmployeeRequests({ onToast }) {
  const [type, setType] = useState(null)
  const [filter, setFilter] = useState('')
  const [cancellingId, setCancellingId] = useState(null)
  const [error, setError] = useState(null)

  // /me/requests forces the caller's own employee id server-side, so this list
  // can never contain anyone else regardless of what is sent.
  const requests = useResource(() => fetchMyRequests({ status: filter || undefined }), [filter])
  const balances = useResource(() => fetchMyBalances(), [])
  const profile = useResource(() => fetchMyProfile(), [])

  const items = requests.data?.items ?? []
  const summary = requests.data?.summary ?? {}

  const withdraw = async (request) => {
    setCancellingId(request.id)
    setError(null)
    try {
      await cancelRequest(request.id)
      onToast(`${request.reference} withdrawn. Any held leave days have been returned.`)
      requests.reload()
      balances.reload()
    } catch (caught) {
      setError(caught)
    } finally {
      setCancellingId(null)
    }
  }

  const refresh = () => {
    requests.reload()
    balances.reload()
    profile.reload()
  }

  return (
    <div className="page-stack">
      <section className="request-action-banner reveal">
        <div>
          <p className="eyebrow">Self-service</p>
          <h2>What can we help with?</h2>
          <p>Submit a request here and track every update—no email follow-up needed.</p>
        </div>
        <div>
          <button className="button button-light" onClick={() => setType('Leave')}>
            <Plane size={17} /> Request leave
          </button>
          <button className="button button-outline-light" onClick={() => setType('Document')}>
            <FileText size={17} /> Request document
          </button>
          <button className="button button-outline-light" onClick={() => setType('Profile')}>
            <UserRound size={17} /> Update details
          </button>
        </div>
      </section>

      <section className="panel my-requests-panel reveal">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Request history</p>
            <h2>My requests</h2>
          </div>
          <div className="segmented-tabs compact">
            {FILTERS.map((item) => (
              <button className={filter === item.value ? 'active' : ''} onClick={() => setFilter(item.value)} key={item.label}>
                {item.label}
                {item.value && summary[item.value] ? <b>{summary[item.value]}</b> : null}
              </button>
            ))}
          </div>
        </div>

        <FormError error={error} />

        <Async loading={requests.loading} error={requests.error} onRetry={requests.reload} rows={4}>
          <div className="my-request-list">
            {items.map((request) => (
              <article key={request.id}>
                <div className={`my-request-icon ${request.typeValue === 'LEAVE' ? 'leave' : 'document'}`}>
                  {request.typeValue === 'LEAVE' ? <CalendarDays size={20} /> : <FileText size={20} />}
                </div>
                <div className="my-request-main">
                  <div>
                    <p>{request.type}</p>
                    <h3>{request.subtype}</h3>
                  </div>
                  <StatusPill status={request.status} />
                  <p>{describe(request)}</p>
                  {request.adminNote && (
                    <blockquote>
                      <strong>People team:</strong> {request.adminNote}
                    </blockquote>
                  )}
                  {/* Withdrawing is only possible while a request is still pending. */}
                  {request.statusValue === 'PENDING' && (
                    <button
                      className="text-button danger"
                      onClick={() => withdraw(request)}
                      disabled={cancellingId === request.id}
                    >
                      {cancellingId === request.id ? <Spinner size={14} /> : <X size={14} />} Withdraw request
                    </button>
                  )}
                </div>
                <div className="my-request-meta">
                  <span>{request.reference}</span>
                  <time>Submitted {formatDate(request.submittedAt)}</time>
                  {request.decidedAt && <small>Decided {formatDate(request.decidedAt)}</small>}
                </div>
              </article>
            ))}
            {!items.length && (
              <div className="empty-state">
                <ClipboardCheck size={25} />
                <h3>No requests here</h3>
                <p>New requests will appear here with their current status.</p>
              </div>
            )}
          </div>
        </Async>
      </section>

      <RequestFormModal
        type={type}
        profile={profile.data}
        balances={balances.data ?? []}
        onClose={() => setType(null)}
        onSubmitted={() => {
          setType(null)
          refresh()
        }}
        onToast={onToast}
      />
    </div>
  )
}

function describe(request) {
  if (request.typeValue === 'LEAVE') {
    return `${formatDate(request.startDate)} — ${formatDate(request.endDate)} · ${request.days} working days`
  }
  if (request.typeValue === 'DOCUMENT') {
    return `${request.purpose ?? 'Document request'} · ${request.language}`
  }
  return Array.isArray(request.changes) && request.changes.length
    ? request.changes.map((change) => change.label).join(', ')
    : `${request.changeCount ?? 0} field(s) proposed`
}
