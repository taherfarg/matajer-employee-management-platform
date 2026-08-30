import { useState } from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CalendarClock,
  Check,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  FileWarning,
  Globe2,
  MoreHorizontal,
  Pencil,
  Plane,
  ShieldCheck,
  Sparkles,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react'
import { Async, Avatar, EmptyMini, ErrorState, LoadingState, StatusPill } from '../components/ui.jsx'
import { useResource } from '../hooks/useResource.js'
import { formatDate, relativeTime } from '../lib/format.js'
import {
  approveRequest,
  fetchAuditLogs,
  fetchDashboard,
  fetchEmployees,
  fetchRequests,
  rejectRequest,
} from '../api/endpoints.js'

export default function AdminOverview({ onNavigate, onToast }) {
  const dashboard = useResource(() => fetchDashboard(), [])
  const pendingQueue = useResource(() => fetchRequests({ status: 'PENDING', pageSize: 4 }), [])
  const recentHires = useResource(
    () => fetchEmployees({ sortBy: 'hireDate', sortOrder: 'desc', pageSize: 4 }),
    [],
  )
  const auditTrail = useResource(() => fetchAuditLogs({ pageSize: 4 }), [])

  const [decidingId, setDecidingId] = useState(null)

  const decide = async (request, action) => {
    setDecidingId(request.id)
    try {
      if (action === 'approve') {
        await approveRequest(request.id, 'Approved from the overview queue.')
        onToast(`${request.reference} approved.`)
      } else {
        await rejectRequest(request.id, 'Unable to approve this request at this time.')
        onToast(`${request.reference} rejected.`)
      }
      // The decision changes both the queue and the dashboard counters.
      pendingQueue.reload()
      dashboard.reload()
      auditTrail.reload()
    } catch (error) {
      onToast(error.detailSummary || error.message, 'error')
    } finally {
      setDecidingId(null)
    }
  }

  if (dashboard.loading) return <LoadingState label="Loading your workspace…" />
  if (dashboard.error) return <ErrorState error={dashboard.error} onRetry={dashboard.reload} />

  const data = dashboard.data ?? {}
  const headcount = data.headcount ?? { total: 0, byStatus: {}, byLegalEntity: [] }
  const movement = data.movement ?? {}
  const alerts = data.alerts ?? {}

  const total = headcount.total || 0
  const activeCount = headcount.byStatus?.ACTIVE ?? 0
  const pendingTotal = data.requests?.pendingTotal ?? 0
  const entityStats = headcount.byLegalEntity ?? []

  const kpis = [
    {
      label: 'Total headcount',
      value: total,
      meta: movement.hiresLast30Days ? `+${movement.hiresLast30Days} in the last 30 days` : 'No new hires this month',
      icon: UsersRound,
      tone: 'coral',
    },
    {
      label: 'Active employees',
      value: activeCount,
      meta: total ? `${Math.round((activeCount / total) * 100)}% of workforce` : '—',
      icon: BadgeCheck,
      tone: 'teal',
    },
    {
      label: 'Open requests',
      value: pendingTotal,
      meta: pendingTotal ? 'Awaiting a decision' : 'All caught up',
      icon: ClipboardCheck,
      tone: 'gold',
    },
    {
      label: 'On leave today',
      value: data.absence?.onLeaveToday ?? 0,
      meta: `${data.absence?.onLeaveTodayPercent ?? 0}% of the workforce`,
      icon: Plane,
      tone: 'violet',
    },
  ]

  // The alert lists the API returns, flattened into one ranked feed.
  const attentionItems = [
    ...(alerts.probationEnding ?? []).map((item) => ({
      key: `probation-${item.employee.id}`,
      icon: CalendarClock,
      tone: 'gold',
      text: `${item.employee.fullName}'s probation ends`,
      detail: `${formatDate(item.date)} · ${item.daysRemaining} days remaining`,
    })),
    ...(alerts.contractsEnding ?? []).map((item) => ({
      key: `contract-${item.employee.id}`,
      icon: FileWarning,
      tone: 'coral',
      text: `${item.employee.fullName}'s contract ends`,
      detail: `${formatDate(item.date)} · ${item.daysRemaining} days remaining`,
    })),
    ...(alerts.expiringDocuments ?? []).slice(0, 4).map((item) => ({
      key: `document-${item.documentId}`,
      icon: FileCheck2,
      tone: 'violet',
      text: `${item.title} expiring`,
      detail: `${item.employee.fullName} · ${formatDate(item.date)}`,
    })),
    ...(alerts.staleRequests ?? []).slice(0, 3).map((item) => ({
      key: `stale-${item.requestId}`,
      icon: Clock3,
      tone: 'teal',
      text: `${item.reference} has been waiting ${item.daysWaiting} days`,
      detail: `${item.employee.fullName} · ${item.type.replace('_', ' ').toLowerCase()}`,
    })),
  ]

  return (
    <div className="page-stack">
      <section className="attention-banner reveal">
        <div className="attention-icon">
          <Sparkles size={22} />
        </div>
        <div>
          <p className="eyebrow">Today’s focus</p>
          <h2>
            {pendingTotal} {pendingTotal === 1 ? 'request needs' : 'requests need'} a decision
          </h2>
          <p>
            {attentionItems.length
              ? `${attentionItems.length} time-sensitive items also need review.`
              : 'Nothing else needs your attention right now.'}
          </p>
        </div>
        <button className="button button-dark" onClick={() => onNavigate('requests')}>
          Review inbox <ArrowRight size={17} />
        </button>
      </section>

      <section className="metric-grid" aria-label="Organization summary">
        {kpis.map(({ label, value, meta, icon: Icon, tone }, index) => (
          <article className="metric-card reveal" style={{ '--delay': `${index * 55}ms` }} key={label}>
            <div className={`metric-icon tone-${tone}`}>
              <Icon size={20} />
            </div>
            <p>{label}</p>
            <strong>{String(value).padStart(2, '0')}</strong>
            <span>{meta}</span>
          </article>
        ))}
      </section>

      <div className="dashboard-grid">
        <section className="panel workforce-panel reveal">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Organization map</p>
              <h2>Workforce by entity</h2>
            </div>
            <button className="text-button" onClick={() => onNavigate('entities')}>
              View entities <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="entity-distribution" aria-label="Employee distribution by legal entity">
            {entityStats.map((entity, index) => (
              <span
                key={entity.legalEntityId}
                style={{
                  width: `${total ? (entity.headcount / total) * 100 : 0}%`,
                  background: ['#ee6a45', '#20786e', '#6d5bd0', '#b5762a'][index % 4],
                }}
              />
            ))}
          </div>
          <div className="entity-stat-list">
            {entityStats.map((entity, index) => (
              <div className="entity-stat" key={entity.legalEntityId}>
                <div
                  className="entity-monogram"
                  style={{
                    background: ['#fee6dc', '#dcefeb', '#e6e2fb', '#f8ebd8'][index % 4],
                    color: ['#ee6a45', '#20786e', '#6d5bd0', '#b5762a'][index % 4],
                  }}
                >
                  {entity.countryCode || entity.code?.slice(0, 3)}
                </div>
                <div>
                  <strong>{entity.name}</strong>
                  <span>{entity.code}</span>
                </div>
                <b>{entity.headcount}</b>
                <small>{total ? Math.round((entity.headcount / total) * 100) : 0}%</small>
              </div>
            ))}
          </div>
          <div className="workforce-foot">
            <Globe2 size={18} />
            <span>
              <strong>{entityStats.length} legal entities</strong>
              <small>One consistent people data model</small>
            </span>
            <span className="data-health">
              <i /> Avg tenure {movement.averageTenureMonths ?? 0} months
            </span>
          </div>
        </section>

        <section className="panel queue-panel reveal">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Approvals</p>
              <h2>Waiting on you</h2>
            </div>
            <span className="count-badge">{pendingTotal}</span>
          </div>
          <div className="mini-request-list">
            <Async
              loading={pendingQueue.loading}
              error={pendingQueue.error}
              onRetry={pendingQueue.reload}
              rows={3}
              empty={
                !pendingQueue.loading && !pendingQueue.data?.items.length ? (
                  <EmptyMini icon={CheckCircle2} title="Inbox clear" text="There are no requests waiting for a decision." />
                ) : null
              }
            >
              {(pendingQueue.data?.items ?? []).slice(0, 3).map((request) => (
                <article className="mini-request" key={request.id}>
                  <Avatar employee={request.employee} size="sm" />
                  <div>
                    <strong>{request.employee?.fullName ?? 'Unknown'}</strong>
                    <span>
                      {request.subtype} ·{' '}
                      {request.typeValue === 'LEAVE'
                        ? `${request.days} days`
                        : request.typeValue === 'DOCUMENT'
                          ? request.language
                          : `${request.changeCount} field(s)`}
                    </span>
                  </div>
                  <div className="quick-actions">
                    <button
                      className="quick-approve"
                      onClick={() => decide(request, 'approve')}
                      disabled={decidingId === request.id}
                      aria-label={`Approve ${request.reference}`}
                    >
                      <Check size={16} />
                    </button>
                    <button
                      className="quick-reject"
                      onClick={() => decide(request, 'reject')}
                      disabled={decidingId === request.id}
                      aria-label={`Reject ${request.reference}`}
                    >
                      <X size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </Async>
          </div>
          <button className="panel-footer-button" onClick={() => onNavigate('requests')}>
            Open request inbox <ArrowRight size={16} />
          </button>
        </section>
      </div>

      <div className="dashboard-grid dashboard-grid-bottom">
        <section className="panel people-panel reveal">
          <div className="panel-header">
            <div>
              <p className="eyebrow">People signals</p>
              <h2>Recently joined</h2>
            </div>
            <button className="text-button" onClick={() => onNavigate('people')}>
              Directory <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="notable-list">
            <Async loading={recentHires.loading} error={recentHires.error} onRetry={recentHires.reload} rows={4}>
              {(recentHires.data?.items ?? []).map((employee) => (
                <div className="notable-person" key={employee.id}>
                  <Avatar employee={employee} size="sm" />
                  <div>
                    <strong>{employee.fullName}</strong>
                    <span>{employee.role}</span>
                  </div>
                  <StatusPill status={employee.status} />
                  <time>{formatDate(employee.joinDate, { year: undefined })}</time>
                </div>
              ))}
            </Async>
          </div>
        </section>

        <section className="panel activity-panel reveal">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Needs attention</p>
              <h2>Upcoming & overdue</h2>
            </div>
            <span className="icon-button" aria-hidden="true">
              <MoreHorizontal size={19} />
            </span>
          </div>
          <div className="activity-list">
            {attentionItems.slice(0, 4).map((item) => {
              const Icon = item.icon
              return (
                <div className="activity-item" key={item.key}>
                  <span className={`activity-icon activity-${item.tone}`}>
                    <Icon size={16} />
                  </span>
                  <div>
                    <strong>{item.text}</strong>
                    <span>{item.detail}</span>
                  </div>
                </div>
              )
            })}
            {!attentionItems.length && (
              <EmptyMini icon={ShieldCheck} title="Nothing overdue" text="No probations, contracts or documents need action." />
            )}
          </div>
        </section>
      </div>

      <section className="panel activity-panel reveal">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Audit trail</p>
            <h2>Recent activity</h2>
          </div>
          <span className="privacy-chip">
            <ShieldCheck size={14} /> Immutable record
          </span>
        </div>
        <div className="activity-list">
          <Async loading={auditTrail.loading} error={auditTrail.error} onRetry={auditTrail.reload} rows={4}>
            {(auditTrail.data?.items ?? []).map((entry) => {
              const icons = { CREATE: UserPlus, UPDATE: Pencil, APPROVE: ClipboardCheck, REJECT: X, LOGIN: ShieldCheck }
              const Icon = icons[entry.action] || FileCheck2
              return (
                <div className="activity-item" key={entry.id}>
                  <span className="activity-icon activity-request">
                    <Icon size={16} />
                  </span>
                  <div>
                    <strong>{entry.summary}</strong>
                    <span>{entry.actorLabel}</span>
                  </div>
                  <time>{relativeTime(entry.createdAt)}</time>
                </div>
              )
            })}
          </Async>
        </div>
      </section>
    </div>
  )
}
