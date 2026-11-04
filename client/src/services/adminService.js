import api from './api';

export const login = (email, password) => api.post('/auth/login', { email, password }).then((r) => r.data);
export const getStats = () => api.get('/admin/dashboard/stats').then((r) => r.data);
export const getVisitors = (params) => api.get('/admin/visitors', { params }).then((r) => r.data);
export const getVisitor = (id) => api.get(`/admin/visitors/${id}`).then((r) => r.data.visitor);
export const deleteVisitor = (id) => api.delete(`/admin/visitors/${id}`).then((r) => r.data);
export const getEvents = () => api.get('/admin/events').then((r) => r.data);
export const getSettings = () => api.get('/admin/settings').then((r) => r.data);
export const purgeVisitors = (body) => api.post('/admin/retention/purge', body).then((r) => r.data);
export const getLiveStreams = () => api.get('/admin/live-streams').then((r) => r.data);
export const getLiveSession = (id) => api.get(`/admin/live-sessions/${id}`).then((r) => r.data);
export const getVisitorLocation = (id) => api.get(`/admin/visitors/${id}/location`).then((r) => r.data);
export const getAccessRequests = () => api.get('/admin/access-requests').then((r) => r.data);

