import { useState } from 'react'
import {
  ArrowUpRight,
  BriefcaseBusiness,
  Building2,
  CalendarCheck2,
  CalendarDays,
  FileText,
  MapPin,
  Plane,
  UserRound,
  UsersRound,
} from 'lucide-react'
import { Async, Avatar, EmptyMini, ErrorState, LoadingState, RequestFact, StatusPill } from '../components/ui.jsx'
import RequestFormModal from '../components/RequestFormModal.jsx'
import { useResource } from '../hooks/useResource.js'
import { formatDate } from '../lib/format.js'
import { adaptLeaveBalances, headlineBalance } from '../api/adapters.js'
import { fetchDashboard, fetchMyProfile } from '../api/endpoints.js'

export default function EmployeeHome({ session, onNavigate, onToast }) {
  const [requestType, setRequestType] = useState(null)

  // One call returns balances, live requests, upcoming leave and who else is off.
  const dashboard = useResource(() => fetchDashboard(), [])
  const profile = useResource(() => fetchMyProfile(), [])

  if (dashboard.loading) return <LoadingState label="Loading your workspace…" />
  if (dashboard.error) return <ErrorState error={dashboard.error} onRetry={dashboard.reload} />

  const data = dashboard.data ?? {}

  if (data.linkedEmployee === false) {
    return (
      <div className="page-stack">
        <EmptyMini
          icon={UserRound}
          title="No employee record linked"
          text="This login is not attached to an employee profile. Contact People Operations."
        />
      </div>
    )
  }

  const balances = adaptLeaveBalances(data.leaveBalances ?? [])
  const headline = headlineBalance(balances)
  const pendingRequests = data.pendingRequests ?? []
  const upcomingLeave = data.upcomingLeave ?? []
  const employee = profile.data
  const firstName = session.employee?.firstName ?? 'there'

  // The ring shows how much of the entitlement is spent, so it needs the total.
  const totalDays = headline.entitled || headline.available + headline.used
  const usedRatio = totalDays > 0 ? headline.used / totalDays : 0

  const refresh = () => {
    dashboard.reload()
    profile.reload()
  }

  return (
    <div className="page-stack employee-home">
      <section className="employee-hero reveal">
        <div className="employee-hero-copy">
          <p className="eyebrow">Your work snapshot</p>
          <h2>
            Hi {firstName}, you have <em>{headline.available} days</em> available.
          </h2>
          <p>
            {pendingRequests.length
              ? `${pendingRequests.length} request${pendingRequests.length === 1 ? '' : 's'} awaiting a decision.`
              : 'You have no open requests.'}
            {headline.pending > 0 ? ` ${headline.pending} day(s) are held pending approval.` : ''}
          </p>
          <div className="hero-actions">
            <button className="button button-light" onClick={() => setRequestType('Leave')}>
              <Plane size={17} /> Request leave
            </button>
            <button className="button button-outline-light" onClick={() => setRequestType('Document')}>
              <FileText size={17} /> Request a document
            </button>
          </div>
        </div>
        <div className="leave-orbit">
          <div className="leave-ring" style={{ '--progress': `${Math.min(360, usedRatio * 360)}deg` }}>
            <span>
              <strong>{headline.available}</strong>
              <small>days left</small>
            </span>
          </div>
          <div className="leave-key">
            <span>
              <i className="used" /> {headline.used} used
            </span>
            <span>
              <i className="available" /> {headline.available} available
            </span>
          </div>
        </div>
      </section>

      <section className="employee-quick-grid">
        <button className="quick-card reveal" onClick={() => setRequestType('Leave')}>
          <span className="quick-card-icon quick-leave">
            <CalendarDays size={21} />
          </span>
          <div>
            <p>Time away</p>
            <h3>Plan your leave</h3>
            <span>View balance &amp; request days</span>
          </div>
          <ArrowUpRight size={19} />
        </button>
        <button className="quick-card reveal" onClick={() => setRequestType('Document')}>
          <span className="quick-card-icon quick-document">
            <FileText size={21} />
          </span>
          <div>
            <p>HR documents</p>
            <h3>Get an official letter</h3>
            <span>Employment or salary certificate</span>
          </div>
          <ArrowUpRight size={19} />
        </button>
        <button className="quick-card reveal" onClick={() => onNavigate('profile')}>
          <span className="quick-card-icon quick-profile">
            <UserRound size={21} />
          </span>
          <div>
            <p>Your details</p>
            <h3>Review your profile</h3>
            <span>Personal &amp; employment info</span>
          </div>
          <ArrowUpRight size={19} />
        </button>
      </section>

      {/* Every leave type the entity offers, not just the annual headline. */}
      <section className="panel panel-padded balance-panel reveal">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Entitlement</p>
            <h2>Your leave balances</h2>
          </div>
          <span className="privacy-chip">{new Date().getUTCFullYear()}</span>
        </div>
        <div className="balance-grid">
          {balances.map((balance) => (
            <article className="balance-card" key={balance.id} style={{ '--balance-color': balance.color }}>
              <span className="balance-dot" />
              <strong>{balance.name}</strong>
              <b>{balance.available}</b>
              <small>
                of {balance.entitled} days
                {balance.pending > 0 ? ` · ${balance.pending} pending` : ''}
              </small>
            </article>
          ))}
          {!balances.length && <p className="muted">No leave balances configured yet.</p>}
        </div>
      </section>

      <div className="dashboard-grid employee-dashboard-grid">
        <section className="panel employee-snapshot reveal">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Employment</p>
              <h2>Your current role</h2>
            </div>
            <button className="text-button" onClick={() => onNavigate('profile')}>
              Full profile <ArrowUpRight size={15} />
            </button>
          </div>
          <Async loading={profile.loading} error={profile.error} onRetry={profile.reload} rows={3}>
            {employee && (
              <>
                <div className="role-card">
                  <Avatar employee={employee} size="lg" />
                  <div>
                    <StatusPill status={employee.status} />
                    <h3>{employee.role}</h3>
                    <p>{employee.department}</p>
                  </div>
                </div>
                <div className="snapshot-list">
                  <RequestFact icon={Building2} label="Legal employer" value={employee.entityName} />
                  <RequestFact icon={MapPin} label="Work mode" value={employee.workMode} />
                  <RequestFact icon={BriefcaseBusiness} label="Manager" value={employee.managerName ?? 'Executive team'} />
                  <RequestFact icon={CalendarCheck2} label="Joined" value={formatDate(employee.joinDate)} />
                </div>
              </>
            )}
          </Async>
        </section>

        <section className="panel employee-requests-panel reveal">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Activity</p>
              <h2>Upcoming &amp; open</h2>
            </div>
            <button className="text-button" onClick={() => onNavigate('my-requests')}>
              View all <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="employee-request-mini-list">
            {upcomingLeave.map((leave) => (
              <div key={leave.requestId}>
                <span className="request-type-icon leave">
                  <CalendarDays size={17} />
                </span>
                <div>
                  <strong>{leave.leaveType.name}</strong>
                  <span>
                    {formatDate(leave.startDate, { year: undefined })} — {formatDate(leave.endDate, { year: undefined })} ·{' '}
                    {leave.workingDays} days
                  </span>
                </div>
                <StatusPill status="Approved" />
              </div>
            ))}
            {pendingRequests.map((request) => (
              <div key={request.id}>
                <span className={`request-type-icon ${request.type === 'LEAVE' ? 'leave' : 'document'}`}>
                  {request.type === 'LEAVE' ? <CalendarDays size={17} /> : <FileText size={17} />}
                </span>
                <div>
                  <strong>{request.reference}</strong>
                  <span>Submitted {formatDate(request.submittedAt, { year: undefined })}</span>
                </div>
                <StatusPill status="Pending" />
              </div>
            ))}
            {!upcomingLeave.length && !pendingRequests.length && (
              <EmptyMini icon={CalendarCheck2} title="Nothing scheduled" text="You have no upcoming leave or open requests." />
            )}
          </div>
        </section>
      </div>

      <div className="dashboard-grid employee-dashboard-grid">
        <section className="panel panel-padded reveal">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Your entity calendar</p>
              <h2>Upcoming public holidays</h2>
            </div>
          </div>
          <div className="holiday-list">
            {(data.upcomingHolidays ?? []).map((holiday) => (
              <div key={`${holiday.date}-${holiday.name}`}>
                <CalendarDays size={15} />
                <strong>{holiday.name}</strong>
                <time>{formatDate(holiday.date)}</time>
              </div>
            ))}
            {!data.upcomingHolidays?.length && <p className="muted">No holidays in the next 90 days.</p>}
          </div>
        </section>

        <section className="panel panel-padded reveal">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Team</p>
              <h2>Away today</h2>
            </div>
            <span className="count-badge">{data.teamOnLeaveToday?.length ?? 0}</span>
          </div>
          <div className="notable-list">
            {(data.teamOnLeaveToday ?? []).map((entry) => (
              <div className="notable-person" key={entry.employee.id}>
                <Avatar
                  employee={{ initials: initialsOf(entry.employee.fullName), color: '#cfd6d3' }}
                  size="sm"
                />
                <div>
                  <strong>{entry.employee.fullName}</strong>
                  <span>{entry.employee.jobTitle}</span>
                </div>
                <time>Back {formatDate(entry.returnsOn, { year: undefined })}</time>
              </div>
            ))}
            {!data.teamOnLeaveToday?.length && (
              <EmptyMini icon={UsersRound} title="Everyone is in" text="No one from your entity is on leave today." />
            )}
          </div>
        </section>
      </div>

      <RequestFormModal
        type={requestType}
        profile={employee}
        balances={balances}
        onClose={() => setRequestType(null)}
        onSubmitted={() => {
          setRequestType(null)
          refresh()
        }}
        onToast={onToast}
      />
    </div>
  )
}

function initialsOf(fullName = '') {
  const parts = fullName.trim().split(/\s+/)
  return `${parts[0]?.[0] ?? ''}${parts[parts.length - 1]?.[0] ?? ''}`.toUpperCase()
}
