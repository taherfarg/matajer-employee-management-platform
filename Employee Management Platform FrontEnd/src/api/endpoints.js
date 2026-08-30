/**
 * One function per API operation, each returning already-adapted UI shapes.
 *
 * Components never build a URL or know a backend field name - they call these.
 */
import { api, apiRequest, tokenStore } from './client.js'
import {
  adaptEmployee,
  adaptEmployees,
  adaptEntities,
  adaptEntity,
  adaptLeaveBalances,
  adaptRequest,
  adaptRequests,
  adaptSession,
  adaptTimeline,
} from './adapters.js'

// --- Auth -----------------------------------------------------------------

export async function login(email, password) {
  const response = await apiRequest('/auth/login', {
    method: 'POST',
    body: { email, password },
    auth: false,
  })
  const payload = response.data
  tokenStore.set({ accessToken: payload.accessToken, refreshToken: payload.refreshToken })
  return adaptSession(payload)
}

/** Restores a session from a stored token on page load. */
export async function fetchProfile() {
  const response = await api.get('/auth/me')
  return adaptSession(response.data)
}

export async function logout() {
  const refreshToken = tokenStore.refresh
  try {
    await apiRequest('/auth/logout', { method: 'POST', body: { refreshToken } })
  } catch {
    // A failed logout must never trap the user in the app; the local tokens are
    // cleared regardless and the server-side session expires on its own.
  } finally {
    tokenStore.clear()
  }
}

export async function changePassword(currentPassword, newPassword) {
  const response = await api.post('/auth/change-password', { currentPassword, newPassword })
  return response.data
}

// --- Legal entities -------------------------------------------------------

export async function fetchEntities() {
  const response = await api.get('/legal-entities')
  return adaptEntities(response.data)
}

export async function fetchEntity(id) {
  const response = await api.get(`/legal-entities/${id}`)
  return adaptEntity(response.data)
}

export async function fetchDepartments() {
  const response = await api.get('/departments')
  return response.data
}

// --- Employees ------------------------------------------------------------

export async function fetchEmployees(query = {}) {
  const response = await api.get('/employees', {
    q: query.q,
    legalEntityId: query.legalEntityId,
    departmentId: query.departmentId,
    status: query.status,
    employmentType: query.employmentType,
    includeOffboarded: query.includeOffboarded ? 'true' : undefined,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
    page: query.page,
    pageSize: query.pageSize,
  })
  return { items: adaptEmployees(response.data), meta: response.meta }
}

export async function fetchEmployee(id) {
  const response = await api.get(`/employees/${id}`)
  return adaptEmployee(response.data)
}

export async function createEmployee(payload) {
  const response = await api.post('/employees', payload)
  return {
    employee: adaptEmployee(response.data.employee),
    temporaryPassword: response.data.temporaryPassword,
  }
}

export async function updateEmployee(id, payload) {
  const response = await api.patch(`/employees/${id}`, payload)
  return adaptEmployee(response.data)
}

export async function changeEmployeeStatus(id, payload) {
  const response = await api.post(`/employees/${id}/status`, payload)
  return adaptEmployee(response.data)
}

export async function fetchEmployeeTimeline(id) {
  const response = await api.get(`/employees/${id}/timeline`)
  return adaptTimeline(response.data)
}

/**
 * Compensation is a separate call on purpose: the API gates it independently,
 * so the UI asks for it only when a section that shows pay is actually opened,
 * and a 403 there degrades that one panel rather than the whole profile.
 */
export async function fetchCompensation(id) {
  const response = await api.get(`/employees/${id}/compensation`)
  return response.data
}

export async function addCompensation(id, payload) {
  const response = await api.post(`/employees/${id}/compensation`, payload)
  return response.data
}

export async function fetchEmployeeDocuments(id) {
  const response = await api.get(`/employees/${id}/documents`)
  return response.data
}

/**
 * Letter body for an issued document. Fetched separately from the document list
 * because the text is large and only wanted when someone opens the letter.
 */
export async function fetchDocumentContent(documentId) {
  const response = await api.get(`/documents/${documentId}`)
  return response.data
}

export async function fetchEmployeeBalances(id, year) {
  const response = await api.get(`/employees/${id}/leave-balances`, { year })
  return adaptLeaveBalances(response.data)
}

// --- Requests -------------------------------------------------------------

export async function fetchRequests(query = {}) {
  const response = await api.get('/requests', {
    type: query.type,
    status: query.status,
    employeeId: query.employeeId,
    legalEntityId: query.legalEntityId,
    myTeamOnly: query.myTeamOnly ? 'true' : undefined,
    q: query.q,
    page: query.page,
    pageSize: query.pageSize,
    sortBy: query.sortBy,
    sortOrder: query.sortOrder,
  })
  return {
    items: adaptRequests(response.data),
    meta: response.meta,
    summary: response.summary ?? {},
  }
}

export async function fetchRequest(id) {
  const response = await api.get(`/requests/${id}`)
  return adaptRequest(response.data)
}

/** Chargeable days for a date range, using the employee's own entity calendar. */
export async function previewLeave(payload) {
  const response = await api.post('/requests/leave/preview', payload)
  return response.data
}

export async function submitLeaveRequest(payload) {
  const response = await api.post('/requests/leave', payload)
  return adaptRequest(response.data)
}

export async function submitDocumentRequest(payload) {
  const response = await api.post('/requests/document', payload)
  return adaptRequest(response.data)
}

export async function submitProfileChangeRequest(changes) {
  const response = await api.post('/requests/profile-change', { changes })
  return adaptRequest(response.data)
}

export async function approveRequest(id, note) {
  const response = await api.post(`/requests/${id}/approve`, { note: note || undefined })
  return adaptRequest(response.data)
}

export async function rejectRequest(id, note) {
  const response = await api.post(`/requests/${id}/reject`, { note })
  return adaptRequest(response.data)
}

export async function cancelRequest(id, note) {
  const response = await api.post(`/requests/${id}/cancel`, { note: note || undefined })
  return adaptRequest(response.data)
}

// --- Leave configuration --------------------------------------------------

export async function fetchLeaveTypes(legalEntityId) {
  const response = await api.get('/leave/types', { legalEntityId })
  return response.data
}

export async function fetchHolidays(legalEntityId, year) {
  const response = await api.get('/leave/holidays', { legalEntityId, year })
  return response.data
}

export async function fetchLeaveCalendar(from, to, legalEntityId) {
  const response = await api.get('/leave/calendar', { from, to, legalEntityId })
  return response.data
}

// --- Self-service ---------------------------------------------------------

export async function fetchMyProfile() {
  const response = await api.get('/me/profile')
  return adaptEmployee(response.data)
}

export async function fetchMyBalances(year) {
  const response = await api.get('/me/leave-balances', { year })
  return adaptLeaveBalances(response.data)
}

export async function fetchMyRequests(query = {}) {
  const response = await api.get('/me/requests', {
    status: query.status,
    type: query.type,
    pageSize: query.pageSize ?? 50,
    page: query.page,
  })
  return { items: adaptRequests(response.data), meta: response.meta, summary: response.summary ?? {} }
}

export async function fetchMyDocuments() {
  const response = await api.get('/me/documents')
  return response.data
}

export async function fetchMyTimeline() {
  const response = await api.get('/me/timeline')
  return adaptTimeline(response.data)
}

// --- Dashboard, notifications and audit -----------------------------------

export async function fetchDashboard() {
  const response = await api.get('/dashboard')
  return response.data
}

export async function fetchAlerts() {
  const response = await api.get('/dashboard/alerts')
  return response.data
}

export async function fetchCompensationOverview() {
  const response = await api.get('/dashboard/compensation-overview')
  return response.data
}

export async function fetchNotifications(unreadOnly = false) {
  const response = await api.get('/notifications', {
    unreadOnly: unreadOnly ? 'true' : undefined,
    pageSize: 20,
  })
  return { items: response.data, unreadCount: response.unreadCount ?? 0 }
}

export async function markAllNotificationsRead() {
  const response = await api.post('/notifications/read-all')
  return response.data
}

export async function markNotificationRead(id) {
  const response = await api.post(`/notifications/${id}/read`)
  return response.data
}

export async function fetchAuditLogs(query = {}) {
  const response = await api.get('/audit-logs', {
    entityType: query.entityType,
    entityId: query.entityId,
    pageSize: query.pageSize ?? 10,
    page: query.page,
  })
  return { items: response.data, meta: response.meta }
}
