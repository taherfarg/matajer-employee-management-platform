import { useState } from 'react'
import { ArrowRight, Building2, CalendarDays, CircleDollarSign, Globe2, MapPin, UsersRound, WalletCards } from 'lucide-react'
import { Async, Detail, ErrorState, LoadingState, Modal, RequestFact, StatusPill } from '../components/ui.jsx'
import { useResource } from '../hooks/useResource.js'
import { useOrg } from '../hooks/useOrg.jsx'
import { formatDate, formatMoney } from '../lib/format.js'
import { fetchCompensationOverview, fetchEntity, fetchHolidays } from '../api/endpoints.js'

export default function EntitiesPage() {
  const { entities, loading } = useOrg()
  const [selectedId, setSelectedId] = useState(null)

  /**
   * Payroll cost comes from the API grouped by currency and is never summed
   * across currencies - a single total across AED, SAR and EGP would need an
   * exchange rate the platform does not have.
   */
  const overview = useResource(() => fetchCompensationOverview(), [])
  const costByEntity = new Map((overview.data?.byLegalEntity ?? []).map((row) => [row.legalEntityId, row]))

  const countries = new Set(entities.map((entity) => entity.country))
  const currencies = new Set(entities.map((entity) => entity.currency))

  if (loading) return <LoadingState label="Loading legal entities…" />

  return (
    <div className="page-stack">
      <section className="entity-intro reveal">
        <div>
          <p className="eyebrow">Operating footprint</p>
          <h2>Structured for growth across borders.</h2>
          <p>
            Every employee, contract, currency and approval is anchored to a legal employer—not just a location. The
            working week, holiday calendar and leave policy all follow the entity.
          </p>
        </div>
        <div className="entity-intro-stat">
          <strong>{entities.length}</strong>
          <span>active legal entities</span>
          <small>
            {countries.size} {countries.size === 1 ? 'country' : 'countries'} · {currencies.size}{' '}
            {currencies.size === 1 ? 'currency' : 'currencies'}
          </small>
        </div>
      </section>

      <section className="entity-card-grid">
        {entities.map((entity, index) => {
          const cost = costByEntity.get(entity.id)
          return (
            <article
              className="entity-card reveal"
              style={{ '--delay': `${index * 80}ms`, '--entity-color': entity.color }}
              key={entity.id}
            >
              <div className="entity-card-top">
                <div className="entity-code" style={{ background: entity.accent, color: entity.color }}>
                  {entity.countryCode}
                </div>
                <StatusPill status={entity.status} />
              </div>
              <p className="eyebrow">{entity.code}</p>
              <h2>{entity.name}</h2>
              <p className="entity-location">
                <MapPin size={15} /> {entity.city}, {entity.country}
              </p>
              <div className="entity-card-metrics">
                <div>
                  <span>Headcount</span>
                  <strong>{entity.headcount}</strong>
                </div>
                <div>
                  <span>Monthly payroll</span>
                  <strong>{cost ? formatMoney(cost.monthlyCost, cost.currency) : '—'}</strong>
                </div>
              </div>
              <div className="entity-workweek">
                <CalendarDays size={15} />
                <span>{entity.workWeekLabel.map((day) => day.slice(0, 3)).join(' · ')}</span>
              </div>
              <button className="entity-open" onClick={() => setSelectedId(entity.id)}>
                View entity record <ArrowRight size={16} />
              </button>
            </article>
          )
        })}
      </section>

      <section className="panel model-panel reveal">
        <span className="model-icon">
          <Building2 size={23} />
        </span>
        <div>
          <p className="eyebrow">Data model principle</p>
          <h3>Legal entity is a first-class relationship.</h3>
          <p>
            It controls employment currency, contract ownership, the working week, the public holiday calendar and leave
            entitlement. The same five-day leave request costs a different number of days depending on the entity—and
            that falls out of the data, not conditional code.
          </p>
        </div>
        <div className="model-flow">
          <span>Employee</span>
          <ArrowRight size={15} />
          <span>Employment</span>
          <ArrowRight size={15} />
          <span>Legal entity</span>
        </div>
      </section>

      <EntityDetail entityId={selectedId} onClose={() => setSelectedId(null)} cost={costByEntity.get(selectedId)} />
    </div>
  )
}

function EntityDetail({ entityId, onClose, cost }) {
  const detail = useResource(() => fetchEntity(entityId), [entityId], { enabled: Boolean(entityId) })
  const holidays = useResource(
    () => fetchHolidays(entityId, new Date().getUTCFullYear()),
    [entityId],
    { enabled: Boolean(entityId) },
  )

  if (!entityId) return null
  const entity = detail.data

  return (
    <Modal open={Boolean(entityId)} onClose={onClose} title={entity?.name ?? 'Legal entity'} eyebrow={entity?.code} size="lg">
      {detail.loading && <LoadingState label="Loading entity…" />}
      {detail.error && <ErrorState error={detail.error} onRetry={detail.reload} />}

      {entity && (
        <div className="entity-detail">
          <div className="entity-record">
            <div className="entity-code entity-code-lg" style={{ background: entity.accent, color: entity.color }}>
              {entity.countryCode}
            </div>
            <div>
              <StatusPill status={entity.status} />
              <h3>
                {entity.city}, {entity.country}
              </h3>
              <p>{entity.address}</p>
            </div>
          </div>

          <div className="entity-record-grid">
            <RequestFact icon={UsersRound} label="Headcount" value={`${entity.headcount} employees`} />
            <RequestFact icon={WalletCards} label="Payroll currency" value={entity.currency} />
            <RequestFact
              icon={CircleDollarSign}
              label="Monthly payroll"
              value={cost ? formatMoney(cost.monthlyCost, cost.currency) : 'Restricted'}
            />
            <RequestFact icon={Globe2} label="Time zone" value={entity.timeZone} />
          </div>

          <section className="registration-box">
            <p className="eyebrow">Company registration</p>
            <dl>
              <Detail label="Registration number" value={entity.registration} />
              <Detail label="Legal name" value={entity.name} />
              <Detail label="Established" value={formatDate(entity.establishedOn)} />
              <Detail label="Operating status" value={entity.status} />
            </dl>
          </section>

          <section className="registration-box">
            <p className="eyebrow">Local employment policy</p>
            <dl>
              <Detail label="Working week" value={entity.workWeekLabel.join(', ')} />
              <Detail label="Weekly hours" value={`${entity.weeklyHours} hours`} />
              <Detail label="Probation" value={`${entity.probationMonths} months`} />
              <Detail label="Notice period" value={`${entity.noticePeriodDays} days`} />
            </dl>
          </section>

          {entity.stats && (
            <section>
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Composition</p>
                  <h3>Headcount by department</h3>
                </div>
                <span className="count-badge">{entity.stats.headcount}</span>
              </div>
              <div className="entity-employee-list">
                {entity.stats.byDepartment.map((row) => (
                  <div key={row.departmentId ?? row.name}>
                    <span className="dept-dot" style={{ background: entity.color }} />
                    <span>
                      <strong>{row.name}</strong>
                      <small>{row.headcount} employees</small>
                    </span>
                    <b>{row.headcount}</b>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section>
            <div className="panel-header">
              <div>
                <p className="eyebrow">Local calendar</p>
                <h3>Public holidays</h3>
              </div>
              <span className="count-badge">{holidays.data?.length ?? 0}</span>
            </div>
            <Async loading={holidays.loading} error={holidays.error} onRetry={holidays.reload} rows={3}>
              <div className="holiday-list">
                {(holidays.data ?? []).map((holiday) => (
                  <div key={holiday.id}>
                    <CalendarDays size={15} />
                    <strong>{holiday.name}</strong>
                    <time>{formatDate(holiday.date)}</time>
                  </div>
                ))}
                {!holidays.data?.length && <p className="muted">No holidays recorded for this year.</p>}
              </div>
            </Async>
          </section>
        </div>
      )}
    </Modal>
  )
}
