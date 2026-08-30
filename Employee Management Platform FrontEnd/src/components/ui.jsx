import { useEffect } from 'react'
import { AlertTriangle, CheckCircle2, Loader2, LockKeyhole, RotateCcw, X, XCircle } from 'lucide-react'
import { useOrg } from '../hooks/useOrg.jsx'

/** Shared presentational primitives used across every page. */

export function BrandMark() {
  return (
    <span className="brand-mark" aria-hidden="true">
      <i />
      <i />
      <i />
    </span>
  )
}

export function Avatar({ employee, size = 'md' }) {
  // Requests and directory rows can reference a person the caller may not be
  // able to load in full, so render a neutral placeholder instead of crashing.
  if (!employee) {
    return <span className={`avatar avatar-${size}`} style={{ background: '#d7d3cc' }} aria-hidden="true">—</span>
  }
  return (
    <span className={`avatar avatar-${size}`} style={{ background: employee.color }} aria-hidden="true">
      {employee.initials}
    </span>
  )
}

export function StatusPill({ status, children }) {
  if (!status) return null
  const key = String(status).toLowerCase().replaceAll(' ', '-')
  return (
    <span className={`status-pill status-${key}`}>
      <span />
      {children || status}
    </span>
  )
}

export function EntityBadge({ entityId, entityCode, entityName, full = false }) {
  const { getEntity } = useOrg()
  const entity = getEntity(entityId)

  // Falls back to the code and name embedded in the payload, so a badge still
  // renders for an entity outside the caller's scope.
  const code = entity?.code ?? entityCode
  const name = entity?.name ?? entityName ?? code
  if (!code && !name) return null

  return (
    <span className="entity-badge" title={name}>
      <i style={{ background: entity?.color ?? '#8a8a8a' }} />
      {full ? name : code}
    </span>
  )
}

export function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return undefined
    // Errors stay longer - they usually carry something the user must read.
    const timeout = window.setTimeout(onClose, toast.type === 'error' ? 6000 : 3600)
    return () => window.clearTimeout(timeout)
  }, [toast, onClose])

  if (!toast) return null
  return (
    <div className={`toast toast-${toast.type || 'success'}`} role="status" aria-live="polite">
      {toast.type === 'error' ? <XCircle size={19} /> : <CheckCircle2 size={19} />}
      <span>{toast.message}</span>
      <button onClick={onClose} aria-label="Dismiss notification">
        <X size={16} />
      </button>
    </div>
  )
}

export function Modal({ open, onClose, title, eyebrow, children, size = 'md', dismissible = true }) {
  useEffect(() => {
    if (!open) return undefined
    const handleKey = (event) => event.key === 'Escape' && dismissible && onClose()
    document.addEventListener('keydown', handleKey)
    document.body.classList.add('modal-open')
    return () => {
      document.removeEventListener('keydown', handleKey)
      document.body.classList.remove('modal-open')
    }
  }, [open, onClose, dismissible])

  if (!open) return null
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(event) => event.target === event.currentTarget && dismissible && onClose()}
    >
      <section className={`modal modal-${size}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <header className="modal-header">
          <div>
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            <h2 id="modal-title">{title}</h2>
          </div>
          {dismissible && (
            <button className="icon-button" onClick={onClose} aria-label="Close">
              <X size={20} />
            </button>
          )}
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  )
}

export function FormField({ label, error, hint, children }) {
  return (
    <label className={`field ${error ? 'field-error' : ''}`}>
      <span>
        {label}
        {error && <em>{error}</em>}
      </span>
      {children}
      {hint && !error && <small className="field-hint">{hint}</small>}
    </label>
  )
}

export function Detail({ label, value, icon: Icon }) {
  return (
    <div>
      {Icon && <Icon size={15} />}
      <dt>{label}</dt>
      <dd>{value ?? '—'}</dd>
    </div>
  )
}

export function RequestFact({ icon: Icon, label, value }) {
  return (
    <div>
      <span>
        <Icon size={17} />
      </span>
      <p>{label}</p>
      <strong>{value ?? '—'}</strong>
    </div>
  )
}

export function History({ text, date }) {
  return (
    <div>
      <i />
      <span>
        <strong>{text}</strong>
        <small>{date}</small>
      </span>
    </div>
  )
}

export function EmptyMini({ icon: Icon, title, text }) {
  return (
    <div className="empty-mini">
      <span>
        <Icon size={20} />
      </span>
      <div>
        <strong>{title}</strong>
        <p>{text}</p>
      </div>
    </div>
  )
}

// --- Async states ---------------------------------------------------------

export function Spinner({ size = 20 }) {
  return <Loader2 size={size} className="spin" aria-hidden="true" />
}

export function LoadingState({ label = 'Loading…', rows = 0 }) {
  if (rows > 0) {
    return (
      <div className="skeleton-list" aria-busy="true" aria-label={label}>
        {Array.from({ length: rows }).map((_, index) => (
          <div className="skeleton-row" key={index} />
        ))}
      </div>
    )
  }
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <Spinner size={22} />
      <span>{label}</span>
    </div>
  )
}

/**
 * One error surface for every failed load.
 *
 * A 403 is not a fault the user can retry away from, so it reads as a
 * permission message with no retry button. Everything else offers a retry.
 */
export function ErrorState({ error, onRetry, compact = false }) {
  const isForbidden = error?.status === 403
  const isNotFound = error?.status === 404

  const title = isForbidden
    ? 'You do not have access to this'
    : isNotFound
      ? 'Not found'
      : 'Could not load this'

  return (
    <div className={`error-state ${compact ? 'error-state-compact' : ''}`} role="alert">
      <span className="error-state-icon">{isForbidden ? <LockKeyhole size={22} /> : <AlertTriangle size={22} />}</span>
      <div>
        <strong>{title}</strong>
        <p>{error?.message || 'Something went wrong.'}</p>
        {error?.requestId && <small className="error-ref">Reference {error.requestId}</small>}
      </div>
      {onRetry && !isForbidden && (
        <button className="button button-secondary" onClick={onRetry} type="button">
          <RotateCcw size={15} /> Try again
        </button>
      )}
    </div>
  )
}

/**
 * Renders whichever of loading / error / content applies, so pages express
 * `<Async …>` once instead of repeating the same three-way branch.
 */
export function Async({ loading, error, onRetry, children, label, rows, empty }) {
  if (loading) return <LoadingState label={label} rows={rows} />
  if (error) return <ErrorState error={error} onRetry={onRetry} />
  if (empty) return empty
  return children
}

/** Inline form-level error, used for a failed submit inside a modal. */
export function FormError({ error }) {
  if (!error) return null
  const message = typeof error === 'string' ? error : error.detailSummary || error.message
  return (
    <div className="form-error" role="alert">
      <XCircle size={17} />
      {message}
    </div>
  )
}
