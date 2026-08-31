import { useState } from 'react'
import { CalendarDays, CheckCircle2, ChevronRight, FileText, UserRound, UsersRound } from 'lucide-react'
import { Async, Avatar, EntityBadge, RequestFact, StatusPill } from '../components/ui.jsx'
import { useResource } from '../hooks/useResource.js'
import { formatDate, plural } from '../lib/format.js'
import { approveRequest, fetchMyTeam, fetchRequests, rejectRequest } from '../api/endpoints.js'

/**
 * The manager workspace.
 *
 * A line manager sits between an employee and HR: they need to see who reports
 * to them and decide their team's requests, but never their pay. The API already
 * enforces both — `/me/team` returns reports at MANAGER view level (no
 * compensation, no personal identity data), and `assertCanDecideRequest` allows
 * a direct manager to decide while refusing their own request. This screen is
 * the surface for capability the backend already grants; it adds no new
 * authority of its own.
 */
export default function ManagerTeam({ session, onToast }) {
  const team = useResource(() => fetchMyTeam(), [])
  const queue = useResource(() => fetchRequests({ myTeamOnly: true, status: 'PENDING', pageSize: 50 }), [])
  const [decidingId, setDecidingId] = useState(null)

  const reports = team.data ?? []
  const pending = queue.data?.items ?? []
  const selfId = session.employee?.id

  const decide = async (request, action) => {
    setDecidingId(request.id)
    try {
      if (action === 'approve') {
        await approveRequest(request.id, 'Approved by your line manager.')
        onToast(`${request.reference} approved.`)
      } else {
        await rejectRequest(request.id, 'Not approved at this time — your manager will follow up.')
        onToast(`${request.reference} rejected.`)
      }
      queue.reload()
    } catch (error) {
      onToast(error.detailSummary || error.message, 'error')
    } finally {
      setDecidingId(null)
    }
  }

  return (
    <div className="page-stack">
      <section className="request-summary-grid">
        <article className="request-summary request-summary-dark">
          <span><UsersRound size={21} /></span>
          <div>
            <strong>{reports.length}</strong>
            <p>{plural(reports.length, 'direct report')}</p>
          </div>
          <small>Your reporting line</small>
        </article>
        <article className="request-summary">
          <span><CalendarDays size={21} /></span>
          <div>
            <strong>{pending.filter((r) => r.typeValue === 'LEAVE').length}</strong>
            <p>Leave to review</p>
          </div>
          <small>Awaiting your decision</small>
        </article>
        <article className="request-summary">
          <span><FileText size={21} /></span>
          <div>
            <strong>{pending.filter((r) => r.typeValue !== 'LEAVE').length}</strong>
            <p>Document &amp; profile</p>
          </div>
          <small>Awaiting your decision</small>
        </article>
      </section>

      <section className="panel panel-padded reveal">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Reporting line</p>
            <h2>My team</h2>
          </div>
          <span className="count-badge">{reports.length}</span>
        </div>
        <Async loading={team.loading} error={team.error} onRetry={team.reload} rows={4}>
          <div className="notable-list">
            {reports.map((person) => (
              <div className="notable-row" key={person.id}>
                <Avatar employee={person} size="sm" />
                <span>
                  <strong>{person.fullName}</strong>
                  <small>
                    {person.role} · {person.department}
                    {person.joinDate ? ` · joined ${formatDate(person.joinDate)}` : ''}
                  </small>
                </span>
                <EntityBadge entityId={person.entityId} entityCode={person.entityCode} entityName={person.entityName} />
                <StatusPill status={person.status} />
              </div>
            ))}
            {!reports.length && (
              <div className="empty-state">
                <UserRound size={25} />
                <h3>No direct reports</h3>
                <p>Nobody currently reports to you.</p>
              </div>
            )}
          </div>
          {/* Compensation is deliberately absent: pay conversations belong to HR. */}
          <p className="muted" style={{ marginTop: 14, fontSize: 12 }}>
            You see working context for your team. Compensation stays with HR.
          </p>
        </Async>
      </section>

      <section className="panel panel-padded reveal">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Approvals</p>
            <h2>Waiting on you</h2>
          </div>
          <span className="count-badge">{pending.length}</span>
        </div>
        <Async loading={queue.loading} error={queue.error} onRetry={queue.reload} rows={4}>
          <div className="notable-list">
            {pending.map((request) => {
              const isOwn = request.employee?.id === selfId
              return (
                <div className="notable-row" key={request.id}>
                  <Avatar employee={request.employee} size="sm" />
                  <span>
                    <strong>{request.employee?.fullName}</strong>
                    <small>
                      {request.subtype} · {request.reference}
                      {request.typeValue === 'LEAVE' ? ` · ${plural(request.days, 'working day')}` : ''}
                    </small>
                  </span>
                  {isOwn ? (
                    // Nobody decides their own request, including a manager. The
                    // API refuses it; showing why is better than a dead button.
                    <small className="muted">Your own request — HR will decide</small>
                  ) : (
                    <div className="row-actions">
                      <button
                        className="icon-button approve"
                        disabled={decidingId === request.id}
                        onClick={() => decide(request, 'approve')}
                        aria-label={`Approve ${request.reference}`}
                      >
                        <CheckCircle2 size={17} />
                      </button>
                      <button
                        className="icon-button reject"
                        disabled={decidingId === request.id}
                        onClick={() => decide(request, 'reject')}
                        aria-label={`Reject ${request.reference}`}
                      >
                        <ChevronRight size={17} />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
            {!pending.length && (
              <div className="empty-state">
                <CheckCircle2 size={25} />
                <h3>Nothing waiting</h3>
                <p>Your team has no requests awaiting a decision.</p>
              </div>
            )}
          </div>
        </Async>
      </section>
    </div>
  )
}
