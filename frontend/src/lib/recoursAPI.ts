import api from './api';

export const recoursAPI = {
  getTypes: () => api.get('/recours/types'),
  createType: (data: any) => api.post('/recours/types', data),
  reorderTypes: (orderedTypeIds: string[]) =>
    api.patch('/recours/types/reorder', { orderedTypeIds }),
  deleteType: (id: string) => api.delete(`/recours/types/${id}`),
  getTemplates: (params?: { typeId?: string }) =>
    api.get('/recours/templates', { params }),
  createTemplate: (data: any) => api.post('/recours/templates', data),
  deleteTemplate: (id: string) => api.delete(`/recours/templates/${id}`),
  moveTemplateToType: (id: string, data: { typeId: string }) =>
    api.patch(`/recours/templates/${id}/type`, data),
  updateTemplate: (id: string, data: { title?: string; description?: string }) =>
    api.patch(`/recours/templates/${id}`, data),
  sendTemplateToDossier: (id: string, data: { dossierId: string; visibleToClient?: boolean }) =>
    api.post(`/recours/templates/${id}/send-to-dossier`, data),
  updateTemplateShare: (id: string, data: any) =>
    api.patch(`/recours/templates/${id}/share`, data),
};

