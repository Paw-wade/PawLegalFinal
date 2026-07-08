'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { smsTemplatesAPI, smsHistoryAPI, smsAPI, userAPI } from '@/lib/api';

type SmsTemplate = {
  _id: string;
  code: string;
  name: string;
  description?: string;
  message: string;
  variables?: Array<{ name: string; description?: string; example?: string }>;
  category: 'appointment' | 'dossier' | 'message' | 'account' | 'task' | 'other';
  isActive: boolean;
  isSystem: boolean;
  createdBy?: { _id: string; firstName?: string; lastName?: string; email?: string };
  updatedBy?: { _id: string; firstName?: string; lastName?: string; email?: string };
  createdAt: string;
  updatedAt: string;
};

type SmsHistory = {
  _id: string;
  to: string;
  message: string;
  templateCode?: string;
  templateName?: string;
  variables?: Record<string, any>;
  status: 'pending' | 'sent' | 'delivered' | 'failed' | 'undelivered';
  twilioSid?: string;
  twilioStatus?: string;
  error?: string;
  sentBy?: { _id: string; firstName?: string; lastName?: string; email?: string };
  sentToUser?: { _id: string; firstName?: string; lastName?: string; phone?: string };
  context: 'appointment' | 'dossier' | 'document_request' | 'message' | 'account' | 'task' | 'otp' | 'manual' | 'other';
  contextId?: string;
  cost?: number;
  sentAt: string;
  deliveredAt?: string;
};

function Button({ children, variant = 'default', className = '', ...props }: any) {
  const baseClasses = 'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50 disabled:cursor-not-allowed';
  const variantClasses = {
    default: 'bg-primary text-white hover:bg-primary/90 shadow-sm hover:shadow',
    outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
    ghost: 'hover:bg-accent hover:text-accent-foreground',
    danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm hover:shadow',
  };
  return <button className={`${baseClasses} ${variantClasses[variant]} ${className}`} {...props}>{children}</button>;
}

function Input({ className = '', ...props }: any) {
  return <input className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`} {...props} />;
}

function Label({ htmlFor, children, className = '' }: any) {
  return <label htmlFor={htmlFor} className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 mb-2 block ${className}`}>{children}</label>;
}

function Textarea({ className = '', ...props }: any) {
  return <textarea className={`flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`} {...props} />;
}

export default function AdminSmsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'templates' | 'history' | 'send'>('templates');
  
  // Templates state
  const [templates, setTemplates] = useState<SmsTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [searchTemplate, setSearchTemplate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');
  const [isActiveFilter, setIsActiveFilter] = useState<string>('');
  const [editingTemplate, setEditingTemplate] = useState<SmsTemplate | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    description: '',
    message: '',
    category: 'other' as SmsTemplate['category'],
    isActive: true,
  });
  const [variables, setVariables] = useState<Array<{ name: string; description: string; example: string }>>([]);
  const [testVariables, setTestVariables] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<string>('');
  const [testPhone, setTestPhone] = useState<string>('');
  const [testingTemplate, setTestingTemplate] = useState<SmsTemplate | null>(null);
  const [isSendingTest, setIsSendingTest] = useState(false);
  
  // History state
  const [history, setHistory] = useState<SmsHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyStats, setHistoryStats] = useState<any>(null);
  const [historyFilters, setHistoryFilters] = useState({
    to: '',
    status: '',
    context: '',
    templateCode: '',
    startDate: '',
    endDate: '',
  });

  // Send SMS state
  const [allTemplates, setAllTemplates] = useState<SmsTemplate[]>([]);
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [loadingSendData, setLoadingSendData] = useState(false);
  const [sendMode, setSendMode] = useState<'template' | 'manual'>('template');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [manualMessage, setManualMessage] = useState('');
  const [templateVariablesSend, setTemplateVariablesSend] = useState<Record<string, string>>({});
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [isSendingSms, setIsSendingSms] = useState(false);

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    const role = (session?.user as any)?.role;
    const isAuthorized = role === 'admin' || role === 'superadmin';
    if (!isAuthorized) {
      router.push('/client');
      return;
    }
    if (activeTab === 'templates') {
      loadTemplates();
    } else if (activeTab === 'history') {
      loadHistory();
      loadStats();
    } else if (activeTab === 'send') {
      loadSendData();
    }
  }, [status, session, activeTab, searchTemplate, categoryFilter, isActiveFilter, historyPage, historyFilters]);

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);
      try {
        await smsTemplatesAPI.initDefaults();
      } catch (syncErr) {
        console.warn('Synchronisation des modèles SMS (init-defaults):', syncErr);
      }
      const params: any = {};
      if (searchTemplate) params.search = searchTemplate;
      if (categoryFilter) params.category = categoryFilter;
      if (isActiveFilter) params.isActive = isActiveFilter === 'true';
      const res = await smsTemplatesAPI.getTemplates(params);
      setTemplates(res.data.templates || []);
    } catch (error: any) {
      console.error('Erreur lors du chargement des templates:', error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const loadHistory = async () => {
    try {
      setLoadingHistory(true);
      const params: any = { page: historyPage, limit: 50 };
      if (historyFilters.to) params.to = historyFilters.to;
      if (historyFilters.status) params.status = historyFilters.status;
      if (historyFilters.context) params.context = historyFilters.context;
      if (historyFilters.templateCode) params.templateCode = historyFilters.templateCode;
      if (historyFilters.startDate) params.startDate = historyFilters.startDate;
      if (historyFilters.endDate) params.endDate = historyFilters.endDate;
      const res = await smsHistoryAPI.getHistory(params);
      setHistory(res.data.history || []);
      setHistoryTotal(res.data.total || 0);
    } catch (error: any) {
      console.error('Erreur lors du chargement de l\'historique:', error);
    } finally {
      setLoadingHistory(false);
    }
  };

  const loadStats = async () => {
    try {
      const params: any = {};
      if (historyFilters.startDate) params.startDate = historyFilters.startDate;
      if (historyFilters.endDate) params.endDate = historyFilters.endDate;
      const res = await smsHistoryAPI.getStats(params);
      setHistoryStats(res.data);
    } catch (error: any) {
      console.error('Erreur lors du chargement des stats:', error);
    }
  };

  const loadSendData = async () => {
    try {
      setLoadingSendData(true);
      try {
        await smsTemplatesAPI.initDefaults();
      } catch (syncErr) {
        console.warn('Synchronisation des modèles SMS:', syncErr);
      }
      const [tplRes, usersRes] = await Promise.all([
        smsTemplatesAPI.getTemplates({}),
        userAPI.getAllUsers(),
      ]);

      const tplList = Array.isArray(tplRes.data?.templates) ? tplRes.data.templates : [];
      const usersList = Array.isArray(usersRes.data?.users)
        ? usersRes.data.users
        : Array.isArray(usersRes.data?.data?.users)
          ? usersRes.data.data.users
          : Array.isArray(usersRes.data?.data)
            ? usersRes.data.data
            : [];

      setAllTemplates(tplList);
      setAllUsers(usersList);
    } catch (error) {
      console.error('Erreur lors du chargement des données d’envoi SMS:', error);
    } finally {
      setLoadingSendData(false);
    }
  };

  const selectedTemplate = allTemplates.find((t) => t._id === selectedTemplateId) || null;

  const applyVars = (message: string, vars: Record<string, string>) =>
    String(message || '').replace(/\{\{(.*?)\}\}/g, (_, k) => vars[String(k).trim()] || '');

  const previewMessage =
    sendMode === 'manual'
      ? manualMessage
      : selectedTemplate
        ? applyVars(selectedTemplate.message, templateVariablesSend)
        : '';

  const visibleUsers = allUsers.filter((u: any) => {
    const q = userSearch.trim().toLowerCase();
    if (!q) return true;
    const name = `${u.firstName || ''} ${u.lastName || ''}`.trim().toLowerCase();
    const email = String(u.email || '').toLowerCase();
    const phone = String(u.phone || u.telephone || '').toLowerCase();
    return name.includes(q) || email.includes(q) || phone.includes(q);
  });

  const toggleUser = (id: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSendSms = async () => {
    if (selectedUserIds.length === 0) {
      alert('Sélectionnez au moins un utilisateur.');
      return;
    }
    if (sendMode === 'template' && !selectedTemplate) {
      alert('Sélectionnez un template.');
      return;
    }
    if (sendMode === 'manual' && !manualMessage.trim()) {
      alert('Saisissez le message SMS.');
      return;
    }

    const selectedUsers = allUsers.filter((u: any) => selectedUserIds.includes(String(u._id || u.id)));
    const withPhones = selectedUsers.filter((u: any) => String(u.phone || u.telephone || '').trim());
    const withoutPhones = selectedUsers.length - withPhones.length;

    if (withPhones.length === 0) {
      alert('Aucun utilisateur sélectionné ne possède de numéro de téléphone.');
      return;
    }

    setIsSendingSms(true);
    try {
      if (sendMode === 'manual') {
        const recipients = withPhones.map((u: any) => ({
          phone: String(u.phone || u.telephone || '').trim(),
          name: `${u.firstName || ''} ${u.lastName || ''}`.trim() || u.email || 'Utilisateur',
        }));
        const res = await smsAPI.sendBulk({
          recipients,
          message: manualMessage.trim(),
        });
        alert(
          `✅ Envoi terminé. Réussis: ${res.data?.data?.success ?? recipients.length}, échoués: ${res.data?.data?.failed ?? 0}${withoutPhones > 0 ? `, sans téléphone: ${withoutPhones}` : ''}.`
        );
      } else {
        let ok = 0;
        let ko = 0;
        for (const u of withPhones) {
          const to = String(u.phone || u.telephone || '').trim();
          const data = {
            ...templateVariablesSend,
            name: templateVariablesSend.name || `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Client',
          };
          try {
            await smsAPI.sendNotification({
              to,
              type: selectedTemplate!.code,
              data,
            });
            ok += 1;
          } catch (e) {
            ko += 1;
          }
        }
        alert(`✅ Envoi terminé. Réussis: ${ok}, échoués: ${ko}${withoutPhones > 0 ? `, sans téléphone: ${withoutPhones}` : ''}.`);
      }
    } catch (error: any) {
      console.error('Erreur lors de l’envoi SMS:', error);
      alert(error?.response?.data?.message || 'Erreur lors de l’envoi des SMS');
    } finally {
      setIsSendingSms(false);
    }
  };

  const handleCreateTemplate = async () => {
    try {
      await smsTemplatesAPI.createTemplate({
        ...formData,
        variables: variables.filter(v => v.name.trim()),
      });
      setShowCreateModal(false);
      resetForm();
      loadTemplates();
    } catch (error: any) {
      console.error('Erreur lors de la création:', error);
      alert(error.response?.data?.message || 'Erreur lors de la création');
    }
  };

  const handleUpdateTemplate = async () => {
    if (!editingTemplate) return;
    try {
      await smsTemplatesAPI.updateTemplate(editingTemplate._id, {
        ...formData,
        variables: variables.filter(v => v.name.trim()),
      });
      setEditingTemplate(null);
      resetForm();
      loadTemplates();
    } catch (error: any) {
      console.error('Erreur lors de la mise à jour:', error);
      alert(error.response?.data?.message || 'Erreur lors de la mise à jour');
    }
  };

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce template ?')) return;
    try {
      await smsTemplatesAPI.deleteTemplate(id);
      loadTemplates();
    } catch (error: any) {
      console.error('Erreur lors de la suppression:', error);
      alert(error.response?.data?.message || 'Erreur lors de la suppression');
    }
  };

  const handleTestTemplate = async (template: SmsTemplate) => {
    try {
      setTestingTemplate(template);
      setTestVariables({});
      setTestResult('');
      setTestPhone('');
      // Pré-remplir les variables avec les exemples si disponibles
      if (template.variables && template.variables.length > 0) {
        const initialVars: Record<string, string> = {};
        template.variables.forEach(v => {
          if (v.example) {
            initialVars[v.name] = v.example;
          }
        });
        setTestVariables(initialVars);
        // Générer un aperçu immédiat
        const res = await smsTemplatesAPI.testTemplate(template._id, initialVars);
        setTestResult(res.data.testMessage);
      }
    } catch (error: any) {
      console.error('Erreur lors du test:', error);
      alert(error.response?.data?.message || 'Erreur lors du test');
    }
  };

  const handlePreviewTest = async () => {
    if (!testingTemplate) return;
    try {
      const res = await smsTemplatesAPI.testTemplate(testingTemplate._id, testVariables);
      setTestResult(res.data.testMessage);
    } catch (error: any) {
      console.error('Erreur lors de la prévisualisation:', error);
      alert(error.response?.data?.message || 'Erreur lors de la prévisualisation');
    }
  };

  const handleSendTestSMS = async () => {
    if (!testingTemplate) return;
    if (!testPhone.trim()) {
      alert('Veuillez saisir un numéro de téléphone');
      return;
    }
    if (!testResult) {
      alert('Veuillez d\'abord générer un aperçu du message');
      return;
    }
    if (!confirm(`Êtes-vous sûr de vouloir envoyer ce SMS de test au numéro ${testPhone} ?`)) {
      return;
    }
    try {
      setIsSendingTest(true);
      const res = await smsTemplatesAPI.sendTestSMS(testingTemplate._id, testPhone, testVariables);
      alert('✅ SMS de test envoyé avec succès !');
      setTestingTemplate(null);
      setTestResult('');
      setTestVariables({});
      setTestPhone('');
      // Recharger l'historique pour voir le SMS envoyé
      if (activeTab === 'history') {
        loadHistory();
      }
    } catch (error: any) {
      console.error('Erreur lors de l\'envoi du SMS:', error);
      alert(error.response?.data?.message || 'Erreur lors de l\'envoi du SMS');
    } finally {
      setIsSendingTest(false);
    }
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      description: '',
      message: '',
      category: 'other',
      isActive: true,
    });
    setVariables([]);
    setTestVariables({});
    setTestResult('');
    setTestPhone('');
    setTestingTemplate(null);
  };

  const startEdit = (template: SmsTemplate) => {
    setEditingTemplate(template);
    setFormData({
      code: template.code,
      name: template.name,
      description: template.description || '',
      message: template.message,
      category: template.category,
      isActive: template.isActive,
    });
    setVariables((template.variables || []).map((v: { name: string; description?: string; example?: string }) => ({
      name: v.name,
      description: v.description ?? '',
      example: v.example ?? ''
    })));
  };

  const addVariable = () => {
    setVariables([...variables, { name: '', description: '', example: '' }]);
  };

  const removeVariable = (index: number) => {
    setVariables(variables.filter((_, i) => i !== index));
  };

  const updateVariable = (index: number, field: string, value: string) => {
    const updated = [...variables];
    updated[index] = { ...updated[index], [field]: value };
    setVariables(updated);
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      sent: 'bg-green-100 text-green-800',
      delivered: 'bg-blue-100 text-blue-800',
      failed: 'bg-red-100 text-red-800',
      pending: 'bg-yellow-100 text-yellow-800',
      undelivered: 'bg-orange-100 text-orange-800',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${colors[status] || 'bg-gray-100 text-gray-800'}`}>
        {status}
      </span>
    );
  };

  const getContextBadge = (context: string) => {
    const icons: Record<string, string> = {
      appointment: '📅',
      dossier: '📁',
      document_request: '📄',
      message: '💬',
      account: '👤',
      task: '✅',
      otp: '🔐',
      manual: '✍️',
      other: '📱',
    };
    return (
      <span className="flex items-center gap-1 text-xs">
        <span>{icons[context] || '📱'}</span>
        <span className="capitalize">{context}</span>
      </span>
    );
  };

  if (status === 'loading') {
    return <div className="flex items-center justify-center min-h-screen">Chargement...</div>;
  }

  return (
    <div className="min-h-screen min-w-0 max-w-[100vw] overflow-x-hidden bg-gradient-to-br from-primary/5 via-background to-primary/10 px-3 py-4 md:px-6 md:py-8">
      <div className="mx-auto w-full min-w-0 max-w-7xl">
        <div className="mb-4 sm:mb-6">
          <h1 className="mb-2 text-2xl font-bold text-foreground sm:text-3xl">Gestion des SMS</h1>
          <p className="text-sm text-muted-foreground sm:text-base">Gérez les templates de messages SMS et consultez l'historique</p>
        </div>

        {/* Tabs */}
        <div className="mb-6 min-w-0 overflow-hidden rounded-xl border border-border bg-white shadow-xl">
          <div className="border-b border-border">
            <div className="-mb-px flex min-w-0 flex-wrap overflow-x-auto sm:flex-nowrap">
              <button
                onClick={() => setActiveTab('templates')}
                type="button"
                className={`min-w-0 shrink-0 whitespace-nowrap px-4 py-3 text-sm font-semibold transition-colors sm:px-6 sm:py-4 sm:text-base ${
                  activeTab === 'templates'
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                📝 Templates
              </button>
              <button
                onClick={() => setActiveTab('history')}
                type="button"
                className={`min-w-0 shrink-0 whitespace-nowrap px-4 py-3 text-sm font-semibold transition-colors sm:px-6 sm:py-4 sm:text-base ${
                  activeTab === 'history'
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                📊 Historique
              </button>
              <button
                onClick={() => setActiveTab('send')}
                type="button"
                className={`min-w-0 shrink-0 whitespace-nowrap px-4 py-3 text-sm font-semibold transition-colors sm:px-6 sm:py-4 sm:text-base ${
                  activeTab === 'send'
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                📤 Envoi
              </button>
            </div>
          </div>

          <div className="min-w-0 p-3 sm:p-6">
            {activeTab === 'templates' ? (
              <div className="space-y-6">
                <p className="rounded-lg border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground break-words">
                  La liste inclut tous les codes utilisés par l'application. À l'ouverture de cet onglet, les modèles
                  système manquants sont ajoutés automatiquement (sans écraser vos textes déjà enregistrés). Utilisez le bouton
                  « Synchroniser » pour forcer une mise à jour après déploiement.
                </p>
                {/* Filters */}
                <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end">
                  <div className="min-w-0 flex-1 sm:min-w-[200px]">
                    <Label>Rechercher</Label>
                    <Input
                      placeholder="Nom, code, description..."
                      value={searchTemplate}
                      onChange={(e) => setSearchTemplate(e.target.value)}
                    />
                  </div>
                  <div className="w-full min-w-0 sm:min-w-[150px] sm:w-auto">
                    <Label>Catégorie</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value)}
                    >
                      <option value="">Toutes</option>
                      <option value="appointment">Rendez-vous</option>
                      <option value="dossier">Dossier</option>
                      <option value="message">Message</option>
                      <option value="account">Compte</option>
                      <option value="task">Tâche</option>
                      <option value="other">Autre</option>
                    </select>
                  </div>
                  <div className="w-full min-w-0 sm:min-w-[150px] sm:w-auto">
                    <Label>Statut</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={isActiveFilter}
                      onChange={(e) => setIsActiveFilter(e.target.value)}
                    >
                      <option value="">Tous</option>
                      <option value="true">Actifs</option>
                      <option value="false">Inactifs</option>
                    </select>
                  </div>
                  <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                    <Button 
                      variant="outline"
                      className="w-full shrink-0 whitespace-normal text-xs sm:w-auto sm:text-sm"
                      onClick={async () => {
                        try {
                          await smsTemplatesAPI.initDefaults();
                          loadTemplates();
                          alert('Modèles système synchronisés : les entrées manquantes ont été ajoutées (les modèles existants ne sont pas écrasés).');
                        } catch (error: any) {
                          alert(error.response?.data?.message || 'Erreur lors de l\'initialisation');
                        }
                      }}
                    >
                      🔄 Synchroniser les modèles système
                    </Button>
                    <Button className="w-full sm:w-auto" onClick={() => setShowCreateModal(true)}>+ Nouveau Template</Button>
                  </div>
                </div>

                {/* Templates List */}
                {loadingTemplates ? (
                  <div className="text-center py-8">Chargement...</div>
                ) : templates.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">Aucun template trouvé</div>
                ) : (
                  <div className="space-y-4">
                    {templates.map((template) => (
                      <div key={template._id} className="rounded-lg border border-border p-3 transition-shadow hover:shadow-md sm:p-4">
                        <div className="flex min-w-0 flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              <h3 className="min-w-0 break-words text-base font-semibold sm:text-lg">{template.name}</h3>
                              <span className="max-w-full rounded-full bg-primary/10 px-2 py-1 text-xs text-primary break-all">
                                {template.code}
                              </span>
                              {template.isSystem && (
                                <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-800">
                                  Système
                                </span>
                              )}
                              {template.isActive ? (
                                <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-800">
                                  Actif
                                </span>
                              ) : (
                                <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-800">
                                  Inactif
                                </span>
                              )}
                              <span className="px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-800 capitalize">
                                {template.category}
                              </span>
                            </div>
                            {template.description && (
                              <p className="mb-2 text-sm text-muted-foreground break-words">{template.description}</p>
                            )}
                            <p className="mb-2 break-words rounded border bg-gray-50 p-2 font-mono text-sm [overflow-wrap:anywhere]">
                              {template.message}
                            </p>
                            {template.variables && template.variables.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs font-semibold text-muted-foreground mb-1">Variables disponibles:</p>
                                <div className="flex flex-wrap gap-2">
                                  {template.variables.map((v, i) => (
                                    <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded">
                                      {`{{${v.name}}}`}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex w-full shrink-0 flex-row flex-wrap gap-2 lg:ml-4 lg:w-auto lg:flex-col lg:flex-nowrap">
                            <Button variant="outline" className="min-h-[40px] flex-1 text-xs sm:flex-none lg:w-full" onClick={() => startEdit(template)}>
                              ✏️ Modifier
                            </Button>
                            {!template.isSystem && (
                              <Button variant="danger" className="min-h-[40px] flex-1 text-xs sm:flex-none lg:w-full" onClick={() => handleDeleteTemplate(template._id)}>
                                🗑️ Supprimer
                              </Button>
                            )}
                            <Button variant="outline" className="min-h-[40px] flex-1 text-xs sm:flex-none lg:w-full" onClick={() => handleTestTemplate(template)}>
                              🧪 Tester
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : activeTab === 'history' ? (
              <div className="space-y-6">
                {/* Stats */}
                {historyStats && (
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                      <div className="text-sm text-blue-600 font-semibold mb-1">Total</div>
                      <div className="text-2xl font-bold text-blue-900">{historyStats.overall?.total || 0}</div>
                    </div>
                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4 border border-green-200">
                      <div className="text-sm text-green-600 font-semibold mb-1">Envoyés</div>
                      <div className="text-2xl font-bold text-green-900">{historyStats.overall?.sent || 0}</div>
                    </div>
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4 border border-blue-200">
                      <div className="text-sm text-blue-600 font-semibold mb-1">Livrés</div>
                      <div className="text-2xl font-bold text-blue-900">{historyStats.overall?.delivered || 0}</div>
                    </div>
                    <div className="bg-gradient-to-br from-red-50 to-red-100 rounded-lg p-4 border border-red-200">
                      <div className="text-sm text-red-600 font-semibold mb-1">Échecs</div>
                      <div className="text-2xl font-bold text-red-900">{historyStats.overall?.failed || 0}</div>
                    </div>
                  </div>
                )}

                {/* Filters */}
                <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
                  <div>
                    <Label>Numéro</Label>
                    <Input
                      placeholder="Rechercher..."
                      value={historyFilters.to}
                      onChange={(e) => setHistoryFilters({ ...historyFilters, to: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Statut</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={historyFilters.status}
                      onChange={(e) => setHistoryFilters({ ...historyFilters, status: e.target.value })}
                    >
                      <option value="">Tous</option>
                      <option value="sent">Envoyé</option>
                      <option value="delivered">Livré</option>
                      <option value="failed">Échec</option>
                      <option value="pending">En attente</option>
                    </select>
                  </div>
                  <div>
                    <Label>Contexte</Label>
                    <select
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={historyFilters.context}
                      onChange={(e) => setHistoryFilters({ ...historyFilters, context: e.target.value })}
                    >
                      <option value="">Tous</option>
                      <option value="appointment">Rendez-vous</option>
                      <option value="dossier">Dossier</option>
                      <option value="document_request">Demande document</option>
                      <option value="message">Message</option>
                      <option value="otp">OTP</option>
                      <option value="manual">Manuel</option>
                    </select>
                  </div>
                  <div>
                    <Label>Date début</Label>
                    <Input
                      type="date"
                      value={historyFilters.startDate}
                      onChange={(e) => setHistoryFilters({ ...historyFilters, startDate: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Date fin</Label>
                    <Input
                      type="date"
                      value={historyFilters.endDate}
                      onChange={(e) => setHistoryFilters({ ...historyFilters, endDate: e.target.value })}
                    />
                  </div>
                  <div className="flex items-end">
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => setHistoryFilters({ to: '', status: '', context: '', templateCode: '', startDate: '', endDate: '' })}
                    >
                      Réinitialiser
                    </Button>
                  </div>
                </div>

                {/* History Table */}
                {loadingHistory ? (
                  <div className="text-center py-8">Chargement...</div>
                ) : history.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">Aucun SMS trouvé</div>
                ) : (
                  <>
                    <div className="min-w-0 max-w-full overflow-x-auto rounded-lg border border-border">
                      <table className="w-full min-w-[min(100%,720px)] border-collapse text-left sm:min-w-[860px]">
                        <thead>
                          <tr className="border-b border-border bg-gray-50">
                            <th className="whitespace-nowrap p-2 text-xs font-semibold sm:p-3 sm:text-sm">Date</th>
                            <th className="p-2 text-xs font-semibold sm:p-3 sm:text-sm">Destinataire</th>
                            <th className="p-2 text-xs font-semibold sm:p-3 sm:text-sm">Template</th>
                            <th className="p-2 text-xs font-semibold sm:p-3 sm:text-sm">Contexte</th>
                            <th className="p-2 text-xs font-semibold sm:p-3 sm:text-sm">Statut</th>
                            <th className="min-w-[12rem] max-w-xs p-2 text-xs font-semibold sm:min-w-[16rem] sm:max-w-md sm:p-3 sm:text-sm">Message</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((sms) => (
                            <tr key={sms._id} className="border-b border-border hover:bg-gray-50">
                              <td className="whitespace-normal p-2 align-top text-xs sm:p-3 sm:text-sm break-words">
                                {new Date(sms.sentAt).toLocaleString('fr-FR')}
                              </td>
                              <td className="min-w-0 p-2 align-top text-xs sm:p-3 sm:text-sm">
                                <div className="min-w-0 max-w-[10rem] break-all sm:max-w-[11rem]">
                                  <div>{sms.to}</div>
                                  {sms.sentToUser && (
                                    <div className="text-xs text-muted-foreground break-words">
                                      {sms.sentToUser.firstName} {sms.sentToUser.lastName}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="min-w-0 max-w-[8rem] p-2 align-top text-xs break-words sm:max-w-[10rem] sm:p-3 sm:text-sm">
                                {sms.templateName || '-'}
                              </td>
                              <td className="min-w-0 p-2 align-top text-xs sm:p-3 sm:text-sm">
                                <div className="break-words">{getContextBadge(sms.context)}</div>
                              </td>
                              <td className="min-w-0 p-2 align-top sm:p-3">
                                <div className="flex flex-wrap gap-1">{getStatusBadge(sms.status)}</div>
                              </td>
                              <td className="min-w-0 max-w-xs p-2 align-top text-xs sm:max-w-md sm:p-3 sm:text-sm">
                                <p className="line-clamp-5 break-words [overflow-wrap:anywhere]" title={sms.message}>
                                  {sms.message}
                                </p>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-sm text-muted-foreground">
                        Page {historyPage} sur {Math.ceil(historyTotal / 50)}
                      </div>
                      <div className="flex w-full gap-2 sm:w-auto">
                        <Button
                          variant="outline"
                          className="min-h-[44px] flex-1 sm:flex-none"
                          disabled={historyPage === 1}
                          onClick={() => setHistoryPage(historyPage - 1)}
                        >
                          Précédent
                        </Button>
                        <Button
                          variant="outline"
                          className="min-h-[44px] flex-1 sm:flex-none"
                          disabled={historyPage >= Math.ceil(historyTotal / 50)}
                          onClick={() => setHistoryPage(historyPage + 1)}
                        >
                          Suivant
                        </Button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                {loadingSendData ? (
                  <div className="text-center py-8">Chargement...</div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                      <div className="min-w-0">
                        <Label>Mode d’envoi</Label>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant={sendMode === 'template' ? 'default' : 'outline'}
                            onClick={() => setSendMode('template')}
                            className="min-h-[44px] flex-1 text-xs sm:flex-none"
                          >
                            Avec template
                          </Button>
                          <Button
                            variant={sendMode === 'manual' ? 'default' : 'outline'}
                            onClick={() => setSendMode('manual')}
                            className="min-h-[44px] flex-1 text-xs sm:flex-none"
                          >
                            Sans template
                          </Button>
                        </div>
                      </div>
                      {sendMode === 'template' ? (
                        <div className="lg:col-span-2">
                          <Label>Template SMS</Label>
                          <select
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={selectedTemplateId}
                            onChange={(e) => {
                              const id = e.target.value;
                              setSelectedTemplateId(id);
                              const t = allTemplates.find((x) => x._id === id);
                              const vars: Record<string, string> = {};
                              (t?.variables || []).forEach((v) => {
                                vars[v.name] = v.example || '';
                              });
                              setTemplateVariablesSend(vars);
                            }}
                          >
                            <option value="">Sélectionner un template</option>
                            {allTemplates.map((t) => (
                              <option key={t._id} value={t._id}>
                                {t.name} ({t.code}) {t.isActive ? '' : ' - inactif'}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div className="lg:col-span-2">
                          <Label>Message SMS (sans template)</Label>
                          <Textarea
                            rows={4}
                            value={manualMessage}
                            onChange={(e) => setManualMessage(e.target.value)}
                            placeholder="Votre message SMS..."
                          />
                        </div>
                      )}
                    </div>

                    {sendMode === 'template' && selectedTemplate && selectedTemplate.variables && selectedTemplate.variables.length > 0 && (
                      <div className="border border-border rounded-lg p-4 bg-gray-50">
                        <p className="text-sm font-semibold mb-3">Variables du template</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {selectedTemplate.variables.map((v) => (
                            <div key={v.name}>
                              <Label className="text-xs">{v.name}</Label>
                              <Input
                                value={templateVariablesSend[v.name] || ''}
                                onChange={(e) =>
                                  setTemplateVariablesSend((prev) => ({ ...prev, [v.name]: e.target.value }))
                                }
                                placeholder={v.example || ''}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="min-w-0 rounded-lg border border-border p-3 sm:p-4">
                      <Label>Aperçu du SMS</Label>
                      <div className="min-h-[70px] rounded border bg-gray-50 p-3 text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                        {previewMessage || 'Sélectionnez un template ou écrivez un message manuel.'}
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Longueur: {previewMessage.length} caractères
                      </p>
                    </div>

                    <div className="border border-border rounded-lg p-4">
                      <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-3">
                        <div className="flex-1">
                          <Label>Utilisateurs destinataires</Label>
                          <Input
                            placeholder="Rechercher utilisateur (nom, email, téléphone)..."
                            value={userSearch}
                            onChange={(e) => setUserSearch(e.target.value)}
                          />
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            className="text-xs"
                            onClick={() =>
                              setSelectedUserIds(visibleUsers.map((u: any) => String(u._id || u.id)))
                            }
                          >
                            Tout sélectionner
                          </Button>
                          <Button variant="outline" className="text-xs" onClick={() => setSelectedUserIds([])}>
                            Tout désélectionner
                          </Button>
                        </div>
                      </div>

                      <div className="max-h-72 overflow-y-auto border rounded">
                        {visibleUsers.length === 0 ? (
                          <div className="p-3 text-sm text-muted-foreground">Aucun utilisateur trouvé.</div>
                        ) : (
                          <ul className="divide-y">
                            {visibleUsers.map((u: any) => {
                              const id = String(u._id || u.id);
                              const checked = selectedUserIds.includes(id);
                              const phone = u.phone || u.telephone || '';
                              return (
                                <li key={id} className="p-2">
                                  <label className="flex items-start gap-2 cursor-pointer">
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      onChange={() => toggleUser(id)}
                                      className="mt-1"
                                    />
                                    <div className="min-w-0">
                                      <p className="text-sm font-medium">
                                        {`${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Utilisateur'}
                                      </p>
                                      <p className="text-xs text-muted-foreground break-all">
                                        {u.email || 'Sans email'} • {phone || 'Sans téléphone'}
                                      </p>
                                    </div>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-muted-foreground">
                        {selectedUserIds.length} utilisateur(s) sélectionné(s)
                      </p>
                      <Button className="w-full min-h-[44px] sm:w-auto shrink-0" onClick={handleSendSms} disabled={isSendingSms}>
                        {isSendingSms ? 'Envoi...' : '📨 Envoyer SMS'}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Create/Edit Modal */}
        {(showCreateModal || editingTemplate) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4">
            <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-xl bg-white shadow-2xl">
              <div className="sticky top-0 flex items-start justify-between gap-3 border-b bg-white px-4 py-4 sm:items-center sm:px-6">
                <h2 className="min-w-0 flex-1 break-words text-lg font-bold sm:text-2xl">
                  {editingTemplate ? 'Modifier le template' : 'Nouveau template'}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingTemplate(null);
                    resetForm();
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-2xl leading-none text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
              <div className="space-y-4 p-4 sm:p-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="code">Code *</Label>
                    <Input
                      id="code"
                      value={formData.code}
                      onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                      placeholder="appointment_confirmed"
                      disabled={!!editingTemplate && editingTemplate.isSystem}
                    />
                  </div>
                  <div>
                    <Label htmlFor="category">Catégorie</Label>
                    <select
                      id="category"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={formData.category}
                      onChange={(e) => setFormData({ ...formData, category: e.target.value as any })}
                    >
                      <option value="appointment">Rendez-vous</option>
                      <option value="dossier">Dossier</option>
                      <option value="message">Message</option>
                      <option value="account">Compte</option>
                      <option value="task">Tâche</option>
                      <option value="other">Autre</option>
                    </select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="name">Nom *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Confirmation de rendez-vous"
                  />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Input
                    id="description"
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="Message envoyé lors de la confirmation..."
                  />
                </div>
                <div>
                  <Label htmlFor="message">Message *</Label>
                  <Textarea
                    id="message"
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    placeholder="Bonjour {{name}}, votre rendez-vous est confirmé le {{date}} à {{time}}. Paw Legal."
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Utilisez {'{{variable}}'} pour insérer des variables dynamiques
                  </p>
                </div>
                <div>
                  <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <Label className="mb-0">Variables</Label>
                    <Button variant="outline" className="w-full text-xs px-3 py-1 sm:w-auto" onClick={addVariable}>
                      + Ajouter
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {variables.map((v, i) => (
                      <div key={i} className="flex gap-2">
                        <Input
                          placeholder="Nom de la variable"
                          value={v.name}
                          onChange={(e) => updateVariable(i, 'name', e.target.value)}
                        />
                        <Input
                          placeholder="Description"
                          value={v.description}
                          onChange={(e) => updateVariable(i, 'description', e.target.value)}
                        />
                        <Input
                          placeholder="Exemple"
                          value={v.example}
                          onChange={(e) => updateVariable(i, 'example', e.target.value)}
                        />
                        <Button variant="danger" className="text-xs px-3 py-1" onClick={() => removeVariable(i)}>
                          ×
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    className="w-4 h-4"
                  />
                  <Label htmlFor="isActive" className="mb-0">Template actif</Label>
                </div>
                <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end sm:gap-3">
                  <Button
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      setShowCreateModal(false);
                      setEditingTemplate(null);
                      resetForm();
                    }}
                  >
                    Annuler
                  </Button>
                  <Button
                    className="w-full sm:w-auto"
                    onClick={editingTemplate ? handleUpdateTemplate : handleCreateTemplate}
                  >
                    {editingTemplate ? 'Enregistrer' : 'Créer'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Test Modal */}
        {testingTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-3 sm:p-4">
            <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white shadow-2xl">
              <div className="sticky top-0 flex items-start justify-between gap-3 border-b bg-white px-4 py-4 sm:items-center sm:px-6">
                <h2 className="min-w-0 flex-1 break-words text-lg font-bold sm:text-2xl">
                  Test du template: {testingTemplate.name}
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setTestingTemplate(null);
                    setTestResult('');
                    setTestVariables({});
                    setTestPhone('');
                  }}
                  className="flex h-8 w-8 shrink-0 items-center justify-center text-2xl leading-none text-gray-400 hover:text-gray-600"
                >
                  ×
                </button>
              </div>
              <div className="space-y-4 p-4 sm:p-6">
                {/* Variables de test */}
                {testingTemplate.variables && testingTemplate.variables.length > 0 && (
                  <div>
                    <Label>Variables de test</Label>
                    <div className="space-y-2">
                      {testingTemplate.variables.filter(v => v.name.trim()).map((v) => (
                        <div key={v.name}>
                          <Label htmlFor={`test-${v.name}`} className="text-xs">
                            {v.name} {v.example && `(ex: ${v.example})`}
                          </Label>
                          <Input
                            id={`test-${v.name}`}
                            value={testVariables[v.name] || ''}
                            onChange={(e) => {
                              const newVars = { ...testVariables, [v.name]: e.target.value };
                              setTestVariables(newVars);
                            }}
                            placeholder={v.example || `Valeur pour ${v.name}`}
                          />
                        </div>
                      ))}
                    </div>
                    <Button 
                      variant="outline" 
                      className="mt-2 text-xs"
                      onClick={handlePreviewTest}
                    >
                      🔍 Générer l'aperçu
                    </Button>
                  </div>
                )}

                {/* Aperçu du message */}
                {testResult && (
                  <div>
                    <Label>Aperçu du message</Label>
                    <div className="rounded border bg-gray-50 p-4 font-mono text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                      {testResult}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Longueur: {testResult.length} caractères
                    </p>
                  </div>
                )}

                {/* Numéro de téléphone pour l'envoi réel */}
                <div>
                  <Label htmlFor="test-phone">Numéro de téléphone pour l'envoi de test *</Label>
                  <Input
                    id="test-phone"
                    type="tel"
                    value={testPhone}
                    onChange={(e) => setTestPhone(e.target.value)}
                    placeholder="+33612345678 ou 0612345678"
                    className="font-mono"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Format: +33612345678 ou 0612345678 (format français)
                  </p>
                </div>

                {/* Actions */}
                <div className="flex flex-col-reverse gap-2 border-t pt-4 sm:flex-row sm:justify-end sm:gap-3">
                  <Button 
                    variant="outline"
                    className="w-full sm:w-auto"
                    onClick={() => {
                      setTestingTemplate(null);
                      setTestResult('');
                      setTestVariables({});
                      setTestPhone('');
                    }}
                  >
                    Fermer
                  </Button>
                  <Button 
                    variant="default"
                    className="w-full min-h-[44px] sm:w-auto"
                    onClick={handleSendTestSMS}
                    disabled={!testPhone.trim() || !testResult || isSendingTest}
                  >
                    {isSendingTest ? 'Envoi...' : '📤 Envoyer le SMS de test'}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

