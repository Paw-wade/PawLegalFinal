'use client';

import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { smsTemplatesAPI, smsHistoryAPI } from '@/lib/api';

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
  context: 'appointment' | 'dossier' | 'message' | 'account' | 'task' | 'otp' | 'manual' | 'other';
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
  const [activeTab, setActiveTab] = useState<'templates' | 'history'>('templates');
  
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

  useEffect(() => {
    if (status === 'loading') return;
    if (status === 'unauthenticated') {
      router.push('/auth/signin');
      return;
    }
    const role = (session?.user as any)?.role;
    if (role !== 'admin' && role !== 'superadmin') {
      router.push('/client');
      return;
    }
    if (activeTab === 'templates') {
      loadTemplates();
      // Initialiser les templates par défaut s'ils n'existent pas
      initDefaultTemplates();
    } else {
      loadHistory();
      loadStats();
    }
  }, [status, session, activeTab, searchTemplate, categoryFilter, isActiveFilter, historyPage, historyFilters]);

  const initDefaultTemplates = async () => {
    try {
      const res = await smsTemplatesAPI.getTemplates();
      // Si aucun template n'existe, initialiser les templates par défaut
      if (res.data.count === 0) {
        try {
          await smsTemplatesAPI.initDefaults();
          // Recharger les templates après initialisation
          setTimeout(() => loadTemplates(), 500);
        } catch (error) {
          console.error('Erreur lors de l\'initialisation des templates:', error);
        }
      }
    } catch (error) {
      console.error('Erreur lors de la vérification des templates:', error);
    }
  };

  const loadTemplates = async () => {
    try {
      setLoadingTemplates(true);
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
    setVariables(template.variables || []);
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
    <div className="min-h-screen bg-gradient-to-br from-primary/5 via-background to-primary/10 p-4 md:p-8">
      <div className="w-full">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">Gestion des SMS</h1>
          <p className="text-muted-foreground">Gérez les templates de messages SMS et consultez l'historique</p>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-xl border border-border mb-6">
          <div className="border-b border-border">
            <div className="flex">
              <button
                onClick={() => setActiveTab('templates')}
                className={`px-6 py-4 font-semibold transition-colors ${
                  activeTab === 'templates'
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                📝 Templates
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={`px-6 py-4 font-semibold transition-colors ${
                  activeTab === 'history'
                    ? 'border-b-2 border-primary text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                📊 Historique
              </button>
            </div>
          </div>

          <div className="p-6">
            {activeTab === 'templates' ? (
              <div className="space-y-6">
                {/* Filters */}
                <div className="flex flex-wrap gap-4 items-end">
                  <div className="flex-1 min-w-[200px]">
                    <Label>Rechercher</Label>
                    <Input
                      placeholder="Nom, code, description..."
                      value={searchTemplate}
                      onChange={(e) => setSearchTemplate(e.target.value)}
                    />
                  </div>
                  <div className="min-w-[150px]">
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
                  <div className="min-w-[150px]">
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
                  <div className="flex gap-2">
                    <Button 
                      variant="outline" 
                      onClick={async () => {
                        try {
                          await smsTemplatesAPI.initDefaults();
                          loadTemplates();
                          alert('Templates par défaut initialisés avec succès !');
                        } catch (error: any) {
                          alert(error.response?.data?.message || 'Erreur lors de l\'initialisation');
                        }
                      }}
                    >
                      🔄 Initialiser les templates par défaut
                    </Button>
                    <Button onClick={() => setShowCreateModal(true)}>+ Nouveau Template</Button>
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
                      <div key={template._id} className="border border-border rounded-lg p-4 hover:shadow-md transition-shadow">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h3 className="font-semibold text-lg">{template.name}</h3>
                              <span className="px-2 py-1 rounded-full text-xs bg-primary/10 text-primary">
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
                              <p className="text-sm text-muted-foreground mb-2">{template.description}</p>
                            )}
                            <p className="text-sm bg-gray-50 p-2 rounded border font-mono mb-2">
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
                          <div className="flex gap-2 ml-4">
                            <Button variant="outline" className="text-xs px-3 py-1" onClick={() => startEdit(template)}>
                              ✏️ Modifier
                            </Button>
                            {!template.isSystem && (
                              <Button variant="danger" className="text-xs px-3 py-1" onClick={() => handleDeleteTemplate(template._id)}>
                                🗑️ Supprimer
                              </Button>
                            )}
                            <Button variant="outline" className="text-xs px-3 py-1" onClick={() => handleTestTemplate(template)}>
                              🧪 Tester
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
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
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-border bg-gray-50">
                            <th className="p-3 text-left text-sm font-semibold">Date</th>
                            <th className="p-3 text-left text-sm font-semibold">Destinataire</th>
                            <th className="p-3 text-left text-sm font-semibold">Template</th>
                            <th className="p-3 text-left text-sm font-semibold">Contexte</th>
                            <th className="p-3 text-left text-sm font-semibold">Statut</th>
                            <th className="p-3 text-left text-sm font-semibold">Message</th>
                          </tr>
                        </thead>
                        <tbody>
                          {history.map((sms) => (
                            <tr key={sms._id} className="border-b border-border hover:bg-gray-50">
                              <td className="p-3 text-sm">
                                {new Date(sms.sentAt).toLocaleString('fr-FR')}
                              </td>
                              <td className="p-3 text-sm">
                                <div>
                                  <div>{sms.to}</div>
                                  {sms.sentToUser && (
                                    <div className="text-xs text-muted-foreground">
                                      {sms.sentToUser.firstName} {sms.sentToUser.lastName}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="p-3 text-sm">
                                {sms.templateName || '-'}
                              </td>
                              <td className="p-3 text-sm">
                                {getContextBadge(sms.context)}
                              </td>
                              <td className="p-3 text-sm">
                                {getStatusBadge(sms.status)}
                              </td>
                              <td className="p-3 text-sm max-w-xs truncate" title={sms.message}>
                                {sms.message}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex items-center justify-between mt-4">
                      <div className="text-sm text-muted-foreground">
                        Page {historyPage} sur {Math.ceil(historyTotal / 50)}
                      </div>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          disabled={historyPage === 1}
                          onClick={() => setHistoryPage(historyPage - 1)}
                        >
                          Précédent
                        </Button>
                        <Button
                          variant="outline"
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
            )}
          </div>
        </div>

        {/* Create/Edit Modal */}
        {(showCreateModal || editingTemplate) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold">
                  {editingTemplate ? 'Modifier le template' : 'Nouveau template'}
                </h2>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingTemplate(null);
                    resetForm();
                  }}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
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
                  <div className="flex items-center justify-between mb-2">
                    <Label>Variables</Label>
                    <Button variant="outline" className="text-xs px-3 py-1" onClick={addVariable}>
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
                <div className="flex gap-2 justify-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowCreateModal(false);
                      setEditingTemplate(null);
                      resetForm();
                    }}
                  >
                    Annuler
                  </Button>
                  <Button
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
            <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between">
                <h2 className="text-2xl font-bold">Test du template: {testingTemplate.name}</h2>
                <button
                  onClick={() => {
                    setTestingTemplate(null);
                    setTestResult('');
                    setTestVariables({});
                    setTestPhone('');
                  }}
                  className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
                >
                  ×
                </button>
              </div>
              <div className="p-6 space-y-4">
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
                    <div className="bg-gray-50 p-4 rounded border font-mono text-sm whitespace-pre-wrap">
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
                <div className="flex gap-2 justify-end pt-4 border-t">
                  <Button 
                    variant="outline" 
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

