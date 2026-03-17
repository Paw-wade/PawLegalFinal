import api from './api';

export const recoursAPI = {
  getTypes: () => api.get('/recours/types'),
  createType: (data: any) => api.post('/recours/types', data),
  getTemplates: (params?: { typeId?: string }) =>
    api.get('/recours/templates', { params }),
  createTemplate: (data: any) => api.post('/recours/templates', data),
  updateTemplateShare: (id: string, data: any) =>
    api.patch(`/recours/templates/${id}/share`, data),
  sendTemplateToDossier: (id: string, data: { dossierId: string }) =>
    api.post(`/recours/templates/${id}/send-to-dossier`, data),
};

