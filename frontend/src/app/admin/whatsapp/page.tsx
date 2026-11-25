'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { whatsappAdminAPI, dossiersAPI, userAPI, appointmentsAPI, tasksAPI } from '@/lib/api';
import { Toast } from '@/components/Toast';
import {
  MessageCircle,
  Send,
  Search,
  Link2,
  Trash2,
  RefreshCw,
  CheckCheck,
  FileText,
  Image,
  Mic,
  Video,
  File,
  MapPin,
  Sticker,
  X,
  User,
  Phone,
  Bot,
  UserCheck,
  Pencil,
  Check,
  Download,
  Paperclip,
  Square,
  Bell,
  BellOff,
  StickyNote,
  Pin,
  Tag,
  ChevronDown,
  SearchIcon,
  Play,
  ArrowLeft,
  MoreVertical,
  Zap,
  Calendar,
  ListTodo,
  FolderPlus,
} from 'lucide-react';

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function formatTime(ts: string | Date) {
  const d = new Date(ts);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60_000) return 'à l\'instant';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min`;
  if (diff < 86_400_000) {
    return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
}

function getConvName(conv: any): string {
  if (conv.customName) return conv.customName;
  if (conv.clientId?.prenom || conv.clientId?.nom) {
    return `${conv.clientId.prenom || ''} ${conv.clientId.nom || ''}`.trim();
  }
  const d0 = conv.dossierIds?.[0];
  if (d0?.user?.prenom || d0?.user?.nom) {
    return `${d0.user.prenom || ''} ${d0.user.nom || ''}`.trim();
  }
  if (d0?.clientPrenom || d0?.clientNom) {
    return `${d0.clientPrenom || ''} ${d0.clientNom || ''}`.trim();
  }
  return conv.contactName || '';
}

function formatPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('33') && digits.length === 11) {
    return `+33 ${digits.slice(2, 3)} ${digits.slice(3, 5)} ${digits.slice(5, 7)} ${digits.slice(7, 9)} ${digits.slice(9, 11)}`;
  }
  return phone;
}

function MediaIcon({ type }: { type: string }) {
  const cls = 'w-4 h-4 inline mr-1 text-muted-foreground';
  if (type === 'image') return <Image className={cls} />;
  if (type === 'document') return <File className={cls} />;
  if (type === 'audio') return <Mic className={cls} />;
  if (type === 'video') return <Video className={cls} />;
  if (type === 'sticker') return <Sticker className={cls} />;
  if (type === 'location') return <MapPin className={cls} />;
  return <FileText className={cls} />;
}

const QUICK_REPLIES = [
  { label: 'Accusé réception', text: "Bonjour, nous avons bien reçu votre message et allons vous répondre dans les plus brefs délais." },
  { label: 'Documents requis', text: "Pour traiter votre dossier, nous avons besoin des documents suivants : " },
  { label: 'RDV confirmé', text: "Votre rendez-vous est bien confirmé. Nous vous attendons à la date convenue." },
  { label: 'En cours d\'examen', text: "Votre dossier est actuellement en cours d\'examen par notre équipe. Nous reviendrons vers vous sous 48h." },
  { label: 'Délai traitement', text: "Le traitement de votre dossier prend un peu plus de temps que prévu. Nous vous remercions de votre patience." },
  { label: 'Pièces manquantes', text: "Votre dossier est incomplet. Merci de nous transmettre les pièces manquantes dans les meilleurs délais." },
  { label: 'Convocation cabinet', text: "Nous vous invitons à vous présenter à notre cabinet pour un entretien. Merci de confirmer votre disponibilité." },
  { label: 'Décision favorable', text: "Nous avons le plaisir de vous informer d\'une décision favorable concernant votre dossier." },
];

const FOLLOW_UP_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  none: { label: 'Sans statut', color: '#6b7280', bg: 'transparent' },
  en_attente_client: { label: 'En attente client', color: '#d97706', bg: '#fef3c7' },
  en_attente_document: { label: 'En attente doc.', color: '#ea580c', bg: '#fff7ed' },
  en_cours: { label: 'En cours', color: '#2563eb', bg: '#eff6ff' },
  resolu: { label: 'Résolu', color: '#16a34a', bg: '#f0fdf4' },
};

function getLastMessagePreview(conv: any) {
  if (!conv.messages || conv.messages.length === 0) return { text: 'Aucun message', time: conv.lastActivity };
  const last = conv.messages[conv.messages.length - 1];
  let text = last.content || '';
  if (!text) {
    const labels: Record<string, string> = { image: 'Photo', document: 'Document', audio: 'Message vocal', video: 'Vidéo', sticker: 'Sticker', location: 'Localisation' };
    text = labels[last.type] || 'Fichier';
  }
  if (text.length > 60) text = text.slice(0, 60) + '…';
  return { text, time: last.timestamp || conv.lastActivity, outbound: last.direction === 'outbound', type: last.type };
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

export default function AdminWhatsAppPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConv, setSelectedConv] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [search, setSearch] = useState('');
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [dossiers, setDossiers] = useState<any[]>([]);
  const [clients, setClients] = useState<any[]>([]);
  const [linkDossierIds, setLinkDossierIds] = useState<string[]>([]);
  const [linkClientId, setLinkClientId] = useState('');
  const [showProactiveModal, setShowProactiveModal] = useState(false);
  const [proactivePhone, setProactivePhone] = useState('');
  const [proactiveText, setProactiveText] = useState('');
  const [clientDossiers, setClientDossiers] = useState<any[]>([]);
  const [isRenamingContact, setIsRenamingContact] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [filterAssign, setFilterAssign] = useState<'all' | 'mine' | 'unassigned'>('all');
  const [advisors, setAdvisors] = useState<any[]>([]);
  const [showAssignDropdown, setShowAssignDropdown] = useState(false);
  const [isSendingFile, setIsSendingFile] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [micPermission, setMicPermission] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedConvIdRef = useRef<string | null>(null);
  const assignDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Fonctionnalites avancees
  const [replyingTo, setReplyingTo] = useState<any>(null);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isAddingNote, setIsAddingNote] = useState(false);
  const [msgSearch, setMsgSearch] = useState('');
  const [showMsgSearch, setShowMsgSearch] = useState(false);
  const [showReminderModal, setShowReminderModal] = useState(false);
  const [reminderDate, setReminderDate] = useState('');
  const [reminderNoteText, setReminderNoteText] = useState('');
  const [showQRMenu, setShowQRMenu] = useState(false);
  const [qrFilter, setQrFilter] = useState('');
  const [mediaUrlCache, setMediaUrlCache] = useState<Record<string, string>>({});
  const [showPinned, setShowPinned] = useState(true);
  const [showAttachmentsPanel, setShowAttachmentsPanel] = useState(false);
  const [showDossierPanel, setShowDossierPanel] = useState(false);
  const [dossierPanelData, setDossierPanelData] = useState<any>(null);
  const [loadingDossierPanel, setLoadingDossierPanel] = useState(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showMobileMore, setShowMobileMore] = useState(false);
  const [saveToDossierMsg, setSaveToDossierMsg] = useState<any>(null);
  const [saveToDossierName, setSaveToDossierName] = useState('');
  const [saveToDossierCategorie, setSaveToDossierCategorie] = useState('autre');
  const [saveToDossierDossierId, setSaveToDossierDossierId] = useState('');
  const [isSavingToDossier, setIsSavingToDossier] = useState(false);

  // Actions rapides
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [showMobileQuickActions, setShowMobileQuickActions] = useState(false);
  const [showRdvModal, setShowRdvModal] = useState(false);
  const [rdvForm, setRdvForm] = useState({ nom: '', prenom: '', email: '', telephone: '', date: '', heure: '09:00', motif: 'premiere_demande_titre', description: '' });
  const [isCreatingRdv, setIsCreatingRdv] = useState(false);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({ titre: '', description: '', priorite: 'normale', dateEcheance: '', dossier: '' });
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const [showDossierModal, setShowDossierModal] = useState(false);
  const [dossierForm, setDossierForm] = useState({ clientNom: '', clientPrenom: '', clientEmail: '', clientTelephone: '', titre: '', categorie: 'sejour_titres', description: '' });
  const [isCreatingDossier, setIsCreatingDossier] = useState(false);
  const [showAppelModal, setShowAppelModal] = useState(false);
  const [appelForm, setAppelForm] = useState({ date: '', heure: '', note: '' });
  const [isCreatingAppel, setIsCreatingAppel] = useState(false);
  const [convAppels, setConvAppels] = useState<any[]>([]);
  const quickActionsRef = useRef<HTMLDivElement>(null);
  const mobileQuickActionsRef = useRef<HTMLDivElement>(null);

  const qrMenuRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const mobileMoreRef = useRef<HTMLDivElement>(null);

  // Notifications de rappel actives (polling toutes les 30s)
  useEffect(() => {
    const notified = new Set<string>();

    // Demander la permission de notification navigateur au montage
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }

    const checkReminders = () => {
      const now = Date.now();
      conversations.forEach((conv: any) => {
        if (!conv.reminderAt) return;
        const t = new Date(conv.reminderAt).getTime();
        const elapsed = now - t;
        const key = `${conv._id}|${conv.reminderAt}`;
        // Fenetre : rappel declenche il y a moins de 2 minutes et pas encore notifie
        if (elapsed >= 0 && elapsed < 2 * 60_000 && !notified.has(key)) {
          notified.add(key);
          const name = getConvName(conv) || conv.phone || 'Contact';
          const note = conv.reminderNote ? ` — ${conv.reminderNote}` : '';
          setToast({ message: `Rappel : ${name}${note}`, type: 'info' });
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(`Rappel WhatsApp — ${name}`, {
              body: conv.reminderNote || 'Rappel de suivi',
              icon: '/favicon.ico',
            });
          }
        }
      });
    };

    const notifiedAppels = new Set<string>();
    const checkAppels = () => {
      const now = Date.now();
      convAppels.forEach((task: any) => {
        if (!task?.dateEcheance) return;
        const t = new Date(task.dateEcheance).getTime();
        const diff = t - now;
        const key = `appel|${task._id}|${task.dateEcheance}`;
        // Fenetre : dans les 2 minutes qui precedent ou suivent l'heure prevue
        if (diff <= 2 * 60_000 && diff >= -2 * 60_000 && !notifiedAppels.has(key)) {
          notifiedAppels.add(key);
          const label = task.titre || 'Appel planifie';
          setToast({ message: `Appel prevu maintenant : ${label}`, type: 'info' });
          if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
            new Notification(`Appel planifie - Ada Papers`, {
              body: `${label}${task.phone ? ' - ' + task.phone : ''}`,
              icon: '/favicon.ico',
            });
          }
        }
      });
    };

    checkReminders();
    checkAppels();
    const interval = setInterval(() => { checkReminders(); checkAppels(); }, 30_000);
    return () => clearInterval(interval);
  }, [conversations, convAppels]);

  // Verification et suivi de la permission microphone
  useEffect(() => {
    if (!navigator.permissions) return;
    let permStatus: PermissionStatus | null = null;
    navigator.permissions.query({ name: 'microphone' as PermissionName }).then((status) => {
      permStatus = status;
      setMicPermission(status.state as 'granted' | 'denied' | 'prompt');
      status.onchange = () => setMicPermission(status.state as 'granted' | 'denied' | 'prompt');
    }).catch(() => setMicPermission('unknown'));
    return () => {
      if (permStatus) permStatus.onchange = null;
    };
  }, []);

  // Auth guard
  useEffect(() => {
    if (status === 'unauthenticated') router.push('/auth/login');
  }, [status, router]);

  // Fermeture dropdown QR, statut et menu mobile au clic exterieur
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (qrMenuRef.current && !qrMenuRef.current.contains(e.target as Node)) setShowQRMenu(false);
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target as Node)) setShowStatusDropdown(false);
      if (mobileMoreRef.current && !mobileMoreRef.current.contains(e.target as Node)) setShowMobileMore(false);
      if (quickActionsRef.current && !quickActionsRef.current.contains(e.target as Node)) setShowQuickActions(false);
      if (mobileQuickActionsRef.current && !mobileQuickActionsRef.current.contains(e.target as Node)) setShowMobileQuickActions(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Auto-fetch URLs media (images + audio) quand la conversation change
  useEffect(() => {
    if (!selectedConv?.messages) return;
    const toFetch = (selectedConv.messages as any[]).filter(
      (m) => (m.type === 'image' || m.type === 'audio') && m.mediaId && !mediaUrlCache[m.mediaId]
    );
    if (!toFetch.length) return;
    toFetch.forEach(async (m) => {
      try {
        const r = await whatsappAdminAPI.getMedia(m.mediaId, {
          convId: selectedConv._id,
          filename: m.filename || undefined,
          mimeType: m.mimeType || undefined,
        });
        if (r.data?.url) {
          setMediaUrlCache((prev) => ({ ...prev, [m.mediaId]: r.data.url }));
        }
      } catch {}
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConv?._id, selectedConv?.messages?.length]);

  const loadConversations = useCallback(async (filter?: 'all' | 'mine' | 'unassigned') => {
    try {
      const assignedTo = (filter ?? filterAssign) === 'mine' ? 'me' : (filter ?? filterAssign) === 'unassigned' ? 'none' : undefined;
      const res = await whatsappAdminAPI.listConversations({ limit: 100, ...(assignedTo ? { assignedTo } : {}) } as any);
      setConversations(res.data.conversations || []);
      setUnreadTotal(res.data.unreadTotal || 0);
    } catch {
      // Silencieux lors du polling
    } finally {
      setIsLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterAssign]);

  useEffect(() => {
    if (status === 'authenticated') {
      loadConversations();
      whatsappAdminAPI.getAdvisors().then((r: any) => setAdvisors(r.data.advisors || [])).catch(() => {});
    }
  }, [status, loadConversations]);

  // Polling automatique — liste toutes les 10 secondes
  useEffect(() => {
    if (status !== 'authenticated') return;
    const interval = setInterval(() => loadConversations(), 10000);
    return () => clearInterval(interval);
  }, [status, loadConversations]);

  // Polling automatique — detail conversation ouverte toutes les 10 secondes
  useEffect(() => {
    if (!selectedConv?._id) return;
    selectedConvIdRef.current = selectedConv._id;
    const interval = setInterval(async () => {
      const id = selectedConvIdRef.current;
      if (!id) return;
      try {
        const res = await whatsappAdminAPI.getConversation(id);
        const fresh = res.data.conversation;
        setSelectedConv((prev: any) => {
          if (!prev || prev._id !== id) return prev;
          // Ne mettre a jour que si de nouveaux messages sont arrives
          if ((fresh.messages?.length || 0) > (prev.messages?.length || 0)) return fresh;
          return prev;
        });
      } catch { /* ignore */ }
    }, 10000);
    return () => clearInterval(interval);
  }, [selectedConv?._id]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [selectedConv?.messages]);

  // Fermer dropdown assignation au clic exterieur
  useEffect(() => {
    if (!showAssignDropdown) return;
    function handler(e: MouseEvent) {
      if (assignDropdownRef.current && !assignDropdownRef.current.contains(e.target as Node)) {
        setShowAssignDropdown(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAssignDropdown]);

  async function openConversation(conv: any) {
    try {
      const res = await whatsappAdminAPI.getConversation(conv._id);
      setSelectedConv(res.data.conversation);
      setClientDossiers(res.data.clientDossiers || []);
      setShowAttachmentsPanel(false);
      setShowDossierPanel(false);
      setDossierPanelData(null);
      setIsRenamingContact(false);
      fetchConvAppels(conv._id);
      if (conv.unreadAdmin > 0) {
        await whatsappAdminAPI.markRead(conv._id);
        setConversations((prev) =>
          prev.map((c) => (c._id === conv._id ? { ...c, unreadAdmin: 0 } : c))
        );
        setUnreadTotal((n) => Math.max(0, n - (conv.unreadAdmin || 0)));
      }
    } catch {
      setToast({ message: 'Erreur chargement conversation', type: 'error' });
    }
  }

  function startRename() {
    setRenameValue(selectedConv?.customName || getConvName(selectedConv) || '');
    setIsRenamingContact(true);
  }

  async function saveRename() {
    if (!selectedConv) return;
    try {
      await whatsappAdminAPI.rename(selectedConv._id, renameValue);
      const updated = { ...selectedConv, customName: renameValue.trim() };
      setSelectedConv(updated);
      setConversations((prev) =>
        prev.map((c) => (c._id === selectedConv._id ? { ...c, customName: renameValue.trim() } : c))
      );
      setIsRenamingContact(false);
    } catch {
      setToast({ message: 'Erreur lors du renommage', type: 'error' });
    }
  }

  async function assignConversation(userId: string | null) {
    if (!selectedConv) return;
    setShowAssignDropdown(false);
    try {
      const res = await whatsappAdminAPI.assign(selectedConv._id, userId);
      const assignedTo = res.data.assignedTo;
      setSelectedConv((c: any) => ({ ...c, assignedTo }));
      setConversations((prev) =>
        prev.map((c) => (c._id === selectedConv._id ? { ...c, assignedTo } : c))
      );
      setToast({ message: userId ? `Assigné à ${assignedTo?.prenom || ''}` : 'Conversation désassignée', type: 'info' });
    } catch {
      setToast({ message: 'Erreur assignation', type: 'error' });
    }
  }

  async function toggleHumanMode() {
    if (!selectedConv) return;
    const next = !selectedConv.humanMode;
    try {
      const res = await whatsappAdminAPI.setHumanMode(selectedConv._id, next);
      const assignedTo = res.data.assignedTo ?? selectedConv.assignedTo;
      setSelectedConv((c: any) => ({ ...c, humanMode: next, assignedTo }));
      setConversations((prev) =>
        prev.map((c) => (c._id === selectedConv._id ? { ...c, humanMode: next, assignedTo } : c))
      );
      setToast({ message: next ? 'Mode conseiller actif — le bot ne répond plus' : 'Bot réactivé', type: 'info' });
    } catch {
      setToast({ message: 'Erreur changement de mode', type: 'error' });
    }
  }

  async function sendReply() {
    if (!replyText.trim() || !selectedConv) return;
    setIsSending(true);
    try {
      // Activer le mode conseiller si ce n'est pas encore fait
      if (!selectedConv.humanMode) {
        await whatsappAdminAPI.setHumanMode(selectedConv._id, true);
        setSelectedConv((c: any) => ({ ...c, humanMode: true }));
        setConversations((prev) =>
          prev.map((c) => (c._id === selectedConv._id ? { ...c, humanMode: true } : c))
        );
      }
      const replyOpts = replyingTo?.waMessageId
        ? { replyToWaId: replyingTo.waMessageId, replyToContent: replyingTo.content || `(${replyingTo.type})` }
        : {};
      await whatsappAdminAPI.send(selectedConv.phone, replyText.trim(), replyOpts);
      const res = await whatsappAdminAPI.getConversation(selectedConv._id);
      setSelectedConv(res.data.conversation);
      setClientDossiers(res.data.clientDossiers || clientDossiers);
      setReplyText('');
      setReplyingTo(null);
      loadConversations();
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Erreur envoi', type: 'error' });
    } finally {
      setIsSending(false);
    }
  }

  async function sendFile(file: File) {
    if (!selectedConv) return;
    setIsSendingFile(true);
    try {
      await whatsappAdminAPI.sendMedia(selectedConv.phone, file);
      const res = await whatsappAdminAPI.getConversation(selectedConv._id);
      setSelectedConv(res.data.conversation);
      setClientDossiers(res.data.clientDossiers || clientDossiers);
      loadConversations();
      setToast({ message: `${file.name} envoyé`, type: 'success' });
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Erreur envoi fichier', type: 'error' });
    } finally {
      setIsSendingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  async function startRecording() {
    if (!selectedConv) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      setMicPermission('granted');
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
        ? 'audio/ogg;codecs=opus'
        : 'audio/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      recordingChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const ext = mimeType.includes('ogg') ? 'ogg' : 'webm';
        const blob = new Blob(recordingChunksRef.current, { type: mimeType });
        const file = new globalThis.File([blob], `vocal_${Date.now()}.${ext}`, { type: mimeType });
        await sendFile(file);
      };
      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingSeconds(0);
      recordingTimerRef.current = setInterval(() => setRecordingSeconds((s) => s + 1), 1000);
    } catch (err: any) {
      if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
        setMicPermission('denied');
        setToast({
          message: "Acces au microphone refuse. Autorisez-le dans les reglages du navigateur (cadenas dans la barre d'adresse).",
          type: 'error',
        });
      } else {
        setToast({ message: "Impossible d'acceder au microphone", type: 'error' });
      }
    }
  }

  function stopRecording() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
    }
    if (recordingTimerRef.current) {
      clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }
    setIsRecording(false);
  }

  async function handleAddNote() {
    if (!noteText.trim() || !selectedConv) return;
    setIsAddingNote(true);
    try {
      const res = await whatsappAdminAPI.addNote(selectedConv._id, noteText.trim());
      setSelectedConv(res.data.conversation);
      setNoteText('');
      setShowNoteInput(false);
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Erreur note', type: 'error' });
    } finally {
      setIsAddingNote(false);
    }
  }

  async function handleSetReminder() {
    if (!selectedConv) return;
    try {
      const r = await whatsappAdminAPI.setReminder(selectedConv._id, reminderDate || null, reminderNoteText);
      setSelectedConv((c: any) => ({ ...c, reminderAt: r.data.reminderAt, reminderNote: r.data.reminderNote }));
      setConversations((prev) => prev.map((c) => c._id === selectedConv._id
        ? { ...c, reminderAt: r.data.reminderAt, reminderNote: r.data.reminderNote }
        : c));
      setShowReminderModal(false);
      setReminderDate('');
      setReminderNoteText('');
      setToast({ message: reminderDate ? 'Rappel enregistré' : 'Rappel supprimé', type: 'success' });
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Erreur rappel', type: 'error' });
    }
  }

  async function handleDismissReminder(convId: string) {
    try {
      await whatsappAdminAPI.setReminder(convId, null, '');
      setConversations((prev) => prev.map((c) => c._id === convId ? { ...c, reminderAt: null, reminderNote: '' } : c));
      if (selectedConv?._id === convId) setSelectedConv((c: any) => ({ ...c, reminderAt: null, reminderNote: '' }));
    } catch {
      setToast({ message: 'Erreur lors de la suppression du rappel', type: 'error' });
    }
  }

  async function handleSetStatus(followUpStatus: string) {
    if (!selectedConv) return;
    try {
      await whatsappAdminAPI.setFollowUpStatus(selectedConv._id, followUpStatus);
      setSelectedConv((c: any) => ({ ...c, followUpStatus }));
      setConversations((prev) => prev.map((c) => c._id === selectedConv._id ? { ...c, followUpStatus } : c));
      setShowStatusDropdown(false);
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Erreur statut', type: 'error' });
    }
  }

  async function handlePinMessage(msg: any) {
    if (!selectedConv) return;
    const newPinned = !msg.pinned;
    try {
      await whatsappAdminAPI.pinMessage(selectedConv._id, msg._id, newPinned);
      setSelectedConv((c: any) => ({
        ...c,
        messages: c.messages.map((m: any) => m._id === msg._id ? { ...m, pinned: newPinned } : m),
      }));
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Erreur epinglage', type: 'error' });
    }
  }

  function openSaveToDossierModal(msg: any) {
    const name = msg.filename || (msg.type === 'image' ? 'photo.jpg' : msg.type === 'audio' ? 'audio.ogg' : 'document');
    setSaveToDossierMsg(msg);
    setSaveToDossierName(name);
    setSaveToDossierCategorie('autre');
    const firstDossier = selectedConv?.dossierIds?.[0];
    const linkedId = firstDossier?._id || firstDossier || '';
    setSaveToDossierDossierId(typeof linkedId === 'string' ? linkedId : '');
  }

  async function handleSaveToDossier() {
    if (!saveToDossierMsg || !saveToDossierDossierId || !selectedConv) return;
    setIsSavingToDossier(true);
    try {
      const payload: any = {
        dossierId: saveToDossierDossierId,
        nom: saveToDossierName,
        categorie: saveToDossierCategorie,
        mimeType: saveToDossierMsg.mimeType || undefined,
        filename: saveToDossierMsg.filename || undefined,
      };
      if (saveToDossierMsg.mediaUri) {
        payload.mediaUri = saveToDossierMsg.mediaUri;
      } else if (saveToDossierMsg.mediaId) {
        payload.mediaId = saveToDossierMsg.mediaId;
      }
      const { default: axios } = await import('axios');
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || '';
      await axios.post(`${apiUrl}/api/whatsapp-admin/conversations/${selectedConv._id}/save-to-dossier`, payload, {
        withCredentials: true,
      });
      setToast({ message: 'Document enregistre dans le dossier', type: 'success' });
      setSaveToDossierMsg(null);
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Erreur lors de l\'enregistrement', type: 'error' });
    } finally {
      setIsSavingToDossier(false);
    }
  }

  function openRdvModal() {
    if (!selectedConv) return;
    const name = getConvName(selectedConv);
    const parts = name.trim().split(/\s+/);
    setRdvForm({
      nom: parts.length > 1 ? parts[parts.length - 1] : (parts[0] || ''),
      prenom: parts.length > 1 ? parts.slice(0, -1).join(' ') : '',
      email: selectedConv.clientId?.email || '',
      telephone: formatPhone(selectedConv.phone),
      date: new Date().toISOString().slice(0, 10),
      heure: '09:00',
      motif: 'premiere_demande_titre',
      description: 'Prise de contact via WhatsApp',
    });
    setShowQuickActions(false);
    setShowMobileQuickActions(false);
    setShowRdvModal(true);
  }

  function openTaskModal() {
    if (!selectedConv) return;
    const fd = selectedConv.dossierIds?.[0];
    const linkedDossierId = fd?._id || (typeof fd === 'string' ? fd : '');
    setTaskForm({
      titre: `Suivi WhatsApp - ${getConvName(selectedConv) || selectedConv.phone}`,
      description: '',
      priorite: 'normale',
      dateEcheance: '',
      dossier: linkedDossierId,
    });
    setShowQuickActions(false);
    setShowMobileQuickActions(false);
    setShowTaskModal(true);
  }

  function openDossierModal() {
    if (!selectedConv) return;
    const name = getConvName(selectedConv);
    const parts = name.trim().split(/\s+/);
    setDossierForm({
      clientNom: parts.length > 1 ? parts[parts.length - 1] : (parts[0] || ''),
      clientPrenom: parts.length > 1 ? parts.slice(0, -1).join(' ') : '',
      clientEmail: selectedConv.clientId?.email || '',
      clientTelephone: formatPhone(selectedConv.phone),
      titre: '',
      categorie: 'sejour_titres',
      description: '',
    });
    setShowQuickActions(false);
    setShowMobileQuickActions(false);
    setShowDossierModal(true);
  }

  async function handleCreateRdv() {
    if (!rdvForm.nom || !rdvForm.date || !rdvForm.heure || !rdvForm.motif) return;
    setIsCreatingRdv(true);
    try {
      const fd0 = selectedConv?.dossierIds?.[0];
      const dossierId = fd0?._id || (typeof fd0 === 'string' ? fd0 : undefined);
      await appointmentsAPI.createAppointment({
        nom: rdvForm.nom,
        prenom: rdvForm.prenom,
        email: rdvForm.email || undefined,
        telephone: rdvForm.telephone,
        date: rdvForm.date,
        heure: rdvForm.heure,
        motif: rdvForm.motif,
        description: rdvForm.description,
        dossierId: dossierId || undefined,
      } as any);
      setToast({ message: 'Rendez-vous cree avec succes', type: 'success' });
      setShowRdvModal(false);
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Erreur creation rendez-vous', type: 'error' });
    } finally {
      setIsCreatingRdv(false);
    }
  }

  async function handleCreateTask() {
    if (!taskForm.titre) return;
    setIsCreatingTask(true);
    try {
      await tasksAPI.createTask({
        titre: taskForm.titre,
        description: taskForm.description,
        priorite: taskForm.priorite,
        dateEcheance: taskForm.dateEcheance || undefined,
        dossier: taskForm.dossier || undefined,
        assignedTo: (session?.user as any)?.id || '',
      });
      setToast({ message: 'Tache creee avec succes', type: 'success' });
      setShowTaskModal(false);
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Erreur creation tache', type: 'error' });
    } finally {
      setIsCreatingTask(false);
    }
  }

  async function handleCreateDossier() {
    if (!dossierForm.clientNom) return;
    setIsCreatingDossier(true);
    try {
      await dossiersAPI.createDossier({
        clientNom: dossierForm.clientNom,
        clientPrenom: dossierForm.clientPrenom || undefined,
        clientEmail: dossierForm.clientEmail || undefined,
        clientTelephone: dossierForm.clientTelephone || undefined,
        titre: dossierForm.titre || `Dossier ${dossierForm.clientPrenom} ${dossierForm.clientNom}`.trim(),
        categorie: dossierForm.categorie,
        description: dossierForm.description || undefined,
      });
      setToast({ message: 'Dossier cree avec succes', type: 'success' });
      setShowDossierModal(false);
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Erreur creation dossier', type: 'error' });
    } finally {
      setIsCreatingDossier(false);
    }
  }

  function openAppelModal() {
    if (!selectedConv) return;
    const now = new Date();
    now.setMinutes(now.getMinutes() + 30);
    const dateStr = now.toISOString().slice(0, 10);
    const heureStr = now.toTimeString().slice(0, 5);
    setAppelForm({ date: dateStr, heure: heureStr, note: '' });
    setShowAppelModal(true);
    setShowQuickActions(false);
    setShowMobileQuickActions(false);
  }

  async function handleCreateAppel() {
    if (!selectedConv || !appelForm.date || !appelForm.heure) return;
    setIsCreatingAppel(true);
    try {
      const dateEcheance = new Date(`${appelForm.date}T${appelForm.heure}`).toISOString();
      const name = getConvName(selectedConv) || selectedConv.phone;
      const task = await tasksAPI.createTask({
        titre: `Appel - ${name}`,
        description: appelForm.note || undefined,
        statut: 'a_faire',
        priorite: 'haute',
        assignedTo: session?.user?.id as string,
        dateEcheance,
        type: 'appel_planifie',
        phone: selectedConv.phone,
        whatsappConvId: selectedConv._id,
        dossier: (() => { const d = selectedConv.dossierIds?.[0]; return d?._id || (typeof d === 'string' ? d : undefined); })(),
      });
      setConvAppels((prev) => [...prev, task.data?.task || task.data?.data || task.data]);
      setToast({ message: 'Appel planifie - rappel 1 minute avant', type: 'success' });
      setShowAppelModal(false);
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Erreur creation appel', type: 'error' });
    } finally {
      setIsCreatingAppel(false);
    }
  }

  useEffect(() => {
    if (!showDossierPanel || !selectedConv?.dossierIds?.length) return;
    const ids = (selectedConv.dossierIds as any[]).map((d: any) => typeof d === 'object' ? d._id : d).filter(Boolean);
    if (!ids.length) return;
    setLoadingDossierPanel(true);
    Promise.all(ids.map((id: string) =>
      dossiersAPI.getDossierById(id).then((r: any) => r.data?.dossier || r.data || null).catch(() => null)
    ))
      .then((results) => setDossierPanelData(results.filter(Boolean)))
      .finally(() => setLoadingDossierPanel(false));
  }, [showDossierPanel, selectedConv?._id]);

  async function fetchConvAppels(convId: string) {
    try {
      const res = await tasksAPI.getAllTasks({ statut: 'a_faire' });
      const all: any[] = res.data?.tasks || res.data?.data || [];
      setConvAppels(all.filter((t: any) => t.type === 'appel_planifie' && String(t.whatsappConvId) === convId && t.statut !== 'termine' && t.statut !== 'annule'));
    } catch { /* silencieux */ }
  }

  async function sendProactive() {
    if (!proactivePhone.trim() || !proactiveText.trim()) return;
    setIsSending(true);
    try {
      const res = await whatsappAdminAPI.send(proactivePhone.trim(), proactiveText.trim());
      setToast({ message: 'Message envoyé', type: 'success' });
      setShowProactiveModal(false);
      setProactivePhone('');
      setProactiveText('');
      loadConversations();
      if (res.data.conversation) openConversation(res.data.conversation);
    } catch (err: any) {
      setToast({ message: err?.response?.data?.message || 'Erreur envoi', type: 'error' });
    } finally {
      setIsSending(false);
    }
  }

  async function openLinkModal() {
    setShowLinkModal(true);
    const existingIds = (selectedConv?.dossierIds || []).map((d: any) => d?._id || d).filter(Boolean);
    setLinkDossierIds(existingIds);
    setLinkClientId(selectedConv?.clientId?._id || selectedConv?.clientId || '');
    if (dossiers.length === 0) {
      try {
        const r = await dossiersAPI.getAllDossiers({ limit: 200 } as any);
        setDossiers(r.data?.dossiers || r.data || []);
      } catch { /* ignore */ }
    }
    if (clients.length === 0) {
      try {
        const r = await userAPI.getAllUsers();
        setClients(r.data?.users || r.data || []);
      } catch { /* ignore */ }
    }
  }

  async function saveLink() {
    if (!selectedConv) return;
    try {
      const res = await whatsappAdminAPI.link(selectedConv._id, {
        clientId: linkClientId || null,
        dossierIds: linkDossierIds,
      });
      setSelectedConv(res.data.conversation);
      setShowLinkModal(false);
      setToast({ message: 'Lien mis à jour', type: 'success' });
      loadConversations();
    } catch {
      setToast({ message: 'Erreur lors du lien', type: 'error' });
    }
  }

  async function deleteConversation(id: string) {
    if (!confirm('Supprimer cette conversation ?')) return;
    try {
      await whatsappAdminAPI.remove(id);
      setConversations((prev) => prev.filter((c) => c._id !== id));
      if (selectedConv?._id === id) { setSelectedConv(null); setClientDossiers([]); }
      setToast({ message: 'Conversation supprimée', type: 'info' });
    } catch {
      setToast({ message: 'Erreur suppression', type: 'error' });
    }
  }

  function changeFilter(f: 'all' | 'mine' | 'unassigned') {
    setFilterAssign(f);
    setIsLoading(true);
    loadConversations(f);
  }

  const filtered = conversations.filter((c) => {
    if (filterStatus !== 'all') {
      const st = c.followUpStatus || 'none';
      if (st !== filterStatus) return false;
    }
    if (!search) return true;
    const q = search.toLowerCase();
    const name = getConvName(c).toLowerCase();
    return (c.phone || '').includes(q) || name.includes(q) || (c.contactName || '').toLowerCase().includes(q);
  });

  if (status === 'loading' || isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 bg-background overflow-hidden">
      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />
      )}

      {/* ── Panneau gauche : liste des conversations ── */}
      <div className={`flex flex-col border-r border-border shrink-0 w-full md:w-80 ${selectedConv ? 'hidden md:flex' : 'flex'}`}>
        {/* Header */}
        <div className="p-4 border-b border-border">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-5 h-5 text-green-500" />
              <h1 className="font-semibold text-sm">WhatsApp</h1>
              {unreadTotal > 0 && (
                <span className="bg-green-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold">
                  {unreadTotal}
                </span>
              )}
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setShowProactiveModal(true)}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="Nouveau message"
              >
                <Send className="w-4 h-4" />
              </button>
              <button
                onClick={() => loadConversations()}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="Actualiser"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="relative mb-2">
            <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Rechercher..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div className="flex gap-1">
            {(['all', 'mine', 'unassigned'] as const).map((f) => (
              <button
                key={f}
                onClick={() => changeFilter(f)}
                style={{
                  flex: 1,
                  padding: '0.25rem 0',
                  fontSize: '0.7rem',
                  fontWeight: filterAssign === f ? 600 : 400,
                  borderRadius: '0.375rem',
                  border: filterAssign === f ? '1px solid #f97316' : '1px solid #e5e7eb',
                  background: filterAssign === f ? '#fff7ed' : 'transparent',
                  color: filterAssign === f ? '#ea580c' : '#6b7280',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {f === 'all' ? 'Toutes' : f === 'mine' ? 'Miennes' : 'Non assignées'}
              </button>
            ))}
          </div>

          {/* Filtre par statut de suivi */}
          <div style={{ display: 'flex', gap: '0.3rem', marginTop: '0.5rem', overflowX: 'auto', paddingBottom: '0.1rem' }}>
            {[{ key: 'all', label: 'Tous', color: '#6b7280', bg: 'transparent', border: '#e5e7eb' },
              ...Object.entries(FOLLOW_UP_STATUS)
                .filter(([k]) => k !== 'none')
                .map(([k, v]) => ({ key: k, label: v.label, color: v.color, bg: v.bg, border: v.color })),
              { key: 'none', label: 'Sans statut', color: '#6b7280', bg: 'transparent', border: '#e5e7eb' },
            ].map(({ key, label, color, bg, border }) => {
              const active = filterStatus === key;
              const count = key === 'all'
                ? conversations.length
                : conversations.filter((c) => (c.followUpStatus || 'none') === key).length;
              if (key !== 'all' && count === 0) return null;
              return (
                <button
                  key={key}
                  onClick={() => setFilterStatus(key)}
                  style={{
                    flexShrink: 0,
                    fontSize: '0.65rem',
                    padding: '0.15rem 0.45rem',
                    borderRadius: '9999px',
                    border: `1px solid ${active ? border : '#e5e7eb'}`,
                    background: active ? bg || '#f3f4f6' : 'transparent',
                    color: active ? color : '#9ca3af',
                    fontWeight: active ? 600 : 400,
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {label}
                  {count > 0 && key !== 'all' && (
                    <span style={{
                      marginLeft: '0.25rem',
                      background: active ? color : '#e5e7eb',
                      color: active ? '#fff' : '#6b7280',
                      borderRadius: '9999px',
                      padding: '0 0.3rem',
                      fontSize: '0.6rem',
                      fontWeight: 700,
                    }}>{count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Rappels epingles ── */}
        {conversations.some((c: any) => c.reminderAt) && (
          <div style={{ borderBottom: '1px solid #e5e7eb', background: '#fffbeb' }}>
            <div style={{ padding: '0.4rem 0.75rem 0.2rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <Bell style={{ width: '0.7rem', height: '0.7rem', color: '#d97706' }} />
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#d97706', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Rappels
              </span>
              <span style={{ fontSize: '0.6rem', background: '#fef3c7', color: '#d97706', border: '1px solid #fcd34d', borderRadius: '9999px', padding: '0 0.35rem', fontWeight: 700 }}>
                {conversations.filter((c: any) => c.reminderAt).length}
              </span>
            </div>
            {[...conversations]
              .filter((c: any) => c.reminderAt)
              .sort((a: any, b: any) => new Date(a.reminderAt).getTime() - new Date(b.reminderAt).getTime())
              .map((conv: any) => {
                const overdue = new Date(conv.reminderAt) < new Date();
                const name = getConvName(conv) || conv.phone || 'Contact';
                const dateStr = new Date(conv.reminderAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={conv._id} style={{
                    display: 'flex', alignItems: 'center', gap: '0.5rem',
                    padding: '0.35rem 0.75rem',
                    background: overdue ? '#fef2f2' : '#fefce8',
                    borderLeft: `3px solid ${overdue ? '#dc2626' : '#f59e0b'}`,
                    marginBottom: '1px',
                  }}>
                    <button
                      onClick={() => {
                        const c = conversations.find((x: any) => x._id === conv._id);
                        if (c) setSelectedConv(c);
                      }}
                      style={{ flex: 1, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', minWidth: 0 }}
                    >
                      <div style={{ fontSize: '0.75rem', fontWeight: 600, color: overdue ? '#dc2626' : '#92400e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {overdue && <span style={{ marginRight: '0.3rem' }}>!</span>}
                        {name}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: overdue ? '#dc2626' : '#d97706', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                        <Bell style={{ width: '0.6rem', height: '0.6rem', flexShrink: 0 }} />
                        {dateStr}
                        {conv.reminderNote && <span style={{ color: '#6b7280' }}> - {conv.reminderNote}</span>}
                      </div>
                    </button>
                    <button
                      onClick={() => handleDismissReminder(conv._id)}
                      title="Supprimer ce rappel"
                      style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', color: overdue ? '#dc2626' : '#d97706', padding: '0.2rem', borderRadius: '0.25rem', display: 'flex' }}
                    >
                      <X style={{ width: '0.75rem', height: '0.75rem' }} />
                    </button>
                  </div>
                );
              })}
          </div>
        )}

        {/* Liste */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              {search ? 'Aucun résultat' : 'Aucune conversation'}
            </div>
          ) : (
            filtered.map((conv) => {
              const preview = getLastMessagePreview(conv);
              const isSelected = selectedConv?._id === conv._id;
              return (
                <button
                  key={conv._id}
                  onClick={() => openConversation(conv)}
                  className={`w-full text-left px-4 py-3 border-b border-border/50 hover:bg-accent/50 transition-colors ${isSelected ? 'bg-accent' : ''}`}
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                      <MessageCircle className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-medium text-sm truncate">
                          {getConvName(conv) || formatPhone(conv.phone)}
                        </span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatTime(preview.time)}
                        </span>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatPhone(conv.phone)}
                        {conv.clientId && conv.contactName && conv.contactName !== `${conv.clientId.prenom || ''} ${conv.clientId.nom || ''}`.trim() && (
                          <span className="ml-1 opacity-60">({conv.contactName})</span>
                        )}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-xs text-muted-foreground truncate flex items-center gap-1">
                          {preview.outbound && <CheckCheck className="w-3 h-3 text-blue-400 shrink-0" />}
                          {preview.type && preview.type !== 'text' && <MediaIcon type={preview.type} />}
                          {preview.text}
                        </span>
                        {conv.unreadAdmin > 0 && (
                          <span className="bg-green-500 text-white text-xs rounded-full px-1.5 py-0.5 font-bold shrink-0 ml-1">
                            {conv.unreadAdmin}
                          </span>
                        )}
                      </div>
                      {(conv.dossierIds?.length || conv.humanMode || conv.assignedTo) && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {conv.assignedTo && (
                            <span className="text-xs bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 px-1.5 py-0.5 rounded flex items-center gap-0.5 max-w-[130px] truncate">
                              <UserCheck className="w-2.5 h-2.5 shrink-0" />
                              {conv.assignedTo.prenom} {(conv.assignedTo.nom || '').charAt(0)}.
                            </span>
                          )}
                          {conv.humanMode && (
                            <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                              <Bot className="w-2.5 h-2.5" />
                              Off
                            </span>
                          )}
                          {conv.dossierIds?.length > 0 && (
                            <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded truncate max-w-[100px]">
                              <FileText className="w-2.5 h-2.5 inline mr-0.5" />
                              {conv.dossierIds[0]?.titre || conv.dossierIds[0]?.reference || 'Dossier'}
                              {conv.dossierIds.length > 1 ? ` +${conv.dossierIds.length - 1}` : ''}
                            </span>
                          )}
                          {conv.followUpStatus && conv.followUpStatus !== 'none' && (
                            <span style={{
                              fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '0.25rem',
                              background: FOLLOW_UP_STATUS[conv.followUpStatus]?.bg || 'transparent',
                              color: FOLLOW_UP_STATUS[conv.followUpStatus]?.color || '#6b7280',
                              border: `1px solid ${FOLLOW_UP_STATUS[conv.followUpStatus]?.color || '#6b7280'}40`,
                            }}>
                              {FOLLOW_UP_STATUS[conv.followUpStatus]?.label}
                            </span>
                          )}
                          {conv.reminderAt && (
                            <span style={{
                              fontSize: '0.65rem', padding: '0.1rem 0.4rem', borderRadius: '0.25rem',
                              background: new Date(conv.reminderAt) < new Date() ? '#fef2f2' : '#fef3c7',
                              color: new Date(conv.reminderAt) < new Date() ? '#dc2626' : '#d97706',
                              display: 'flex', alignItems: 'center', gap: '0.2rem',
                            }}>
                              <Bell style={{ width: '0.6rem', height: '0.6rem', display: 'inline' }} />
                              {new Date(conv.reminderAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── Panneau droit : conversation ── */}
      {selectedConv ? (
        <div className="flex-1 flex min-w-0 overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header conversation */}
          <div className="px-2 md:px-4 py-2 md:py-3 border-b border-border flex items-center gap-1 md:gap-2">
            {/* Bouton retour (mobile uniquement) */}
            <button
              className="md:hidden p-2 -ml-1 rounded-md text-muted-foreground hover:bg-accent shrink-0"
              onClick={() => setSelectedConv(null)}
              title="Retour"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2 group min-w-0 flex-1">
              <div className="w-8 h-8 md:w-9 md:h-9 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center shrink-0">
                {selectedConv.clientId ? (
                  <User className="w-4 h-4 text-blue-600" />
                ) : (
                  <MessageCircle className="w-4 h-4 text-green-600" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm flex items-center gap-1 min-w-0">
                  {isRenamingContact ? (
                    <>
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveRename(); if (e.key === 'Escape') setIsRenamingContact(false); }}
                        className="border border-input rounded px-2 py-0.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring w-32 md:w-44"
                        placeholder="Nom du contact"
                      />
                      <button onClick={saveRename} className="p-1 rounded text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 shrink-0">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setIsRenamingContact(false)} className="p-1 rounded text-muted-foreground hover:bg-accent shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="truncate">{getConvName(selectedConv) || formatPhone(selectedConv.phone)}</span>
                      <button onClick={startRename} className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-accent opacity-0 group-hover:opacity-100 transition-opacity shrink-0" title="Renommer">
                        <Pencil className="w-3 h-3" />
                      </button>
                    </>
                  )}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-1 md:gap-2 min-w-0">
                  <Phone className="w-3 h-3 shrink-0" />
                  <span className="truncate">{formatPhone(selectedConv.phone)}</span>
                  {selectedConv.clientId?.email && (
                    <span className="opacity-70 truncate hidden md:inline">· {selectedConv.clientId.email}</span>
                  )}
                </div>
                {clientDossiers.length > 0 && (
                  <div className="hidden md:flex flex-wrap gap-1 mt-1">
                    {clientDossiers.map((d: any) => (
                      <a
                        key={d._id}
                        href={`/admin/dossiers/${d._id}`}
                        className="inline-flex items-center gap-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded hover:bg-purple-200 dark:hover:bg-purple-800/40 transition-colors"
                      >
                        <FileText className="w-3 h-3 shrink-0" />
                        <span className="truncate max-w-[120px]">{d.titre || d.reference || 'Dossier'}</span>
                        <span className="opacity-60 shrink-0">· {d.statut}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions desktop (toutes les actions) */}
            <div className="hidden md:flex gap-1 items-center shrink-0">
              {/* Assignation */}
              <div ref={assignDropdownRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowAssignDropdown((v) => !v)}
                  title="Assigner à un conseiller"
                  style={{
                    padding: '0.375rem 0.5rem',
                    borderRadius: '0.375rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.25rem',
                    fontSize: '0.7rem',
                    fontWeight: 500,
                    border: selectedConv.assignedTo ? '1px solid #f97316' : '1px solid #d1d5db',
                    background: selectedConv.assignedTo ? '#fff7ed' : 'transparent',
                    color: selectedConv.assignedTo ? '#ea580c' : '#6b7280',
                    cursor: 'pointer',
                  }}
                >
                  <User style={{ width: '0.875rem', height: '0.875rem' }} />
                  {selectedConv.assignedTo
                    ? `${selectedConv.assignedTo.prenom} ${(selectedConv.assignedTo.nom || '').charAt(0)}.`
                    : 'Assigner'}
                </button>
                {showAssignDropdown && (
                  <div style={{
                    position: 'absolute', top: '110%', right: 0, zIndex: 50, minWidth: '180px',
                    background: '#ffffff', border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden',
                  }}>
                    <button
                      onClick={() => assignConversation(null)}
                      style={{ width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer' }}
                    >
                      Non assigné
                    </button>
                    {advisors.map((a: any) => (
                      <button
                        key={a._id}
                        onClick={() => assignConversation(a._id)}
                        style={{
                          width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.8rem',
                          fontWeight: selectedConv.assignedTo?._id === a._id ? 600 : 400,
                          color: selectedConv.assignedTo?._id === a._id ? '#ea580c' : 'inherit',
                          background: selectedConv.assignedTo?._id === a._id ? '#fff7ed' : 'none',
                          border: 'none', cursor: 'pointer',
                        }}
                      >
                        {a.prenom} {a.nom}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={toggleHumanMode}
                title={selectedConv.humanMode ? 'Réactiver le bot' : 'Prendre la main (désactiver le bot)'}
                style={{
                  padding: '0.375rem',
                  borderRadius: '0.375rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontSize: '0.75rem',
                  fontWeight: 500,
                  border: selectedConv.humanMode ? '1px solid #22c55e' : '1px solid #d1d5db',
                  background: selectedConv.humanMode ? '#f0fdf4' : 'transparent',
                  color: selectedConv.humanMode ? '#16a34a' : '#6b7280',
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {selectedConv.humanMode ? (
                  <><UserCheck style={{ width: '0.875rem', height: '0.875rem' }} /><span>Conseiller</span></>
                ) : (
                  <><Bot style={{ width: '0.875rem', height: '0.875rem' }} /><span>Bot</span></>
                )}
              </button>
              {/* Statut de suivi */}
              <div ref={statusDropdownRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowStatusDropdown((v) => !v)}
                  title="Statut de suivi"
                  style={{
                    padding: '0.3rem 0.5rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center',
                    gap: '0.2rem', fontSize: '0.7rem', fontWeight: 500, cursor: 'pointer',
                    border: `1px solid ${FOLLOW_UP_STATUS[selectedConv.followUpStatus || 'none']?.color || '#9ca3af'}`,
                    background: FOLLOW_UP_STATUS[selectedConv.followUpStatus || 'none']?.bg || 'transparent',
                    color: FOLLOW_UP_STATUS[selectedConv.followUpStatus || 'none']?.color || '#6b7280',
                  }}
                >
                  <Tag style={{ width: '0.75rem', height: '0.75rem' }} />
                  {FOLLOW_UP_STATUS[selectedConv.followUpStatus || 'none']?.label || 'Statut'}
                  <ChevronDown style={{ width: '0.65rem', height: '0.65rem' }} />
                </button>
                {showStatusDropdown && (
                  <div style={{
                    position: 'absolute', top: '110%', right: 0, zIndex: 50, minWidth: '170px',
                    background: '#ffffff', border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem', boxShadow: '0 4px 16px rgba(0,0,0,0.15)', overflow: 'hidden',
                  }}>
                    {Object.entries(FOLLOW_UP_STATUS).map(([k, v]) => (
                      <button
                        key={k}
                        onClick={() => handleSetStatus(k)}
                        style={{
                          width: '100%', textAlign: 'left', padding: '0.45rem 0.75rem', fontSize: '0.78rem',
                          color: v.color, fontWeight: selectedConv.followUpStatus === k ? 600 : 400,
                          background: selectedConv.followUpStatus === k ? v.bg : 'none',
                          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                        }}
                      >
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: v.color, display: 'inline-block', flexShrink: 0 }} />
                        {v.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Rappel */}
              <button
                onClick={() => {
                  if (selectedConv.reminderAt) {
                    const d = new Date(selectedConv.reminderAt);
                    setReminderDate(d.toISOString().slice(0, 16));
                    setReminderNoteText(selectedConv.reminderNote || '');
                  } else {
                    setReminderDate('');
                    setReminderNoteText('');
                  }
                  setShowReminderModal(true);
                }}
                title={selectedConv.reminderAt ? `Rappel: ${new Date(selectedConv.reminderAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}` : 'Poser un rappel'}
                style={{
                  padding: '0.375rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center',
                  border: selectedConv.reminderAt ? '1px solid #f59e0b' : '1px solid #d1d5db',
                  background: selectedConv.reminderAt && new Date(selectedConv.reminderAt) < new Date() ? '#fef2f2' : selectedConv.reminderAt ? '#fef3c7' : 'transparent',
                  color: selectedConv.reminderAt && new Date(selectedConv.reminderAt) < new Date() ? '#dc2626' : selectedConv.reminderAt ? '#d97706' : '#6b7280',
                  cursor: 'pointer',
                }}
              >
                {selectedConv.reminderAt && new Date(selectedConv.reminderAt) < new Date()
                  ? <BellOff style={{ width: '0.875rem', height: '0.875rem' }} />
                  : <Bell style={{ width: '0.875rem', height: '0.875rem' }} />
                }
              </button>

              {/* Recherche dans le fil */}
              <button
                onClick={() => { setShowMsgSearch((v) => !v); setMsgSearch(''); }}
                title="Rechercher dans la conversation"
                style={{
                  padding: '0.375rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center',
                  border: showMsgSearch ? '1px solid #3b82f6' : '1px solid #d1d5db',
                  background: showMsgSearch ? '#eff6ff' : 'transparent',
                  color: showMsgSearch ? '#2563eb' : '#6b7280', cursor: 'pointer',
                }}
              >
                <SearchIcon style={{ width: '0.875rem', height: '0.875rem' }} />
              </button>

              {/* Pieces jointes */}
              <button
                onClick={() => setShowAttachmentsPanel((v) => !v)}
                title="Pieces jointes"
                style={{
                  padding: '0.375rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center',
                  border: showAttachmentsPanel ? '1px solid #e96d2b' : '1px solid #d1d5db',
                  background: showAttachmentsPanel ? '#fff3ed' : 'transparent',
                  color: showAttachmentsPanel ? '#e96d2b' : '#6b7280', cursor: 'pointer',
                }}
              >
                <Paperclip style={{ width: '0.875rem', height: '0.875rem' }} />
              </button>

              {/* Fiche dossier */}
              {selectedConv.dossierIds?.length > 0 && (
                <button
                  onClick={() => setShowDossierPanel((v) => !v)}
                  title="Fiche dossier"
                  style={{
                    padding: '0.375rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center',
                    border: showDossierPanel ? '1px solid #8b5cf6' : '1px solid #d1d5db',
                    background: showDossierPanel ? '#f5f3ff' : 'transparent',
                    color: showDossierPanel ? '#8b5cf6' : '#6b7280', cursor: 'pointer',
                  }}
                >
                  <FileText style={{ width: '0.875rem', height: '0.875rem' }} />
                </button>
              )}

              <button
                onClick={openLinkModal}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="Lier à un dossier / client"
              >
                <Link2 className="w-4 h-4" />
              </button>
              <a
                href={`tel:+${selectedConv.phone.replace(/\D/g, '')}`}
                className="p-1.5 rounded-md hover:bg-green-50 dark:hover:bg-green-900/20 text-muted-foreground hover:text-green-600 transition-colors"
                title={`Appeler ${formatPhone(selectedConv.phone)}`}
              >
                <Phone className="w-4 h-4" />
              </a>
              {/* Actions rapides */}
              <div ref={quickActionsRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowQuickActions((v) => !v)}
                  title="Actions rapides"
                  style={{
                    padding: '0.375rem 0.5rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center', gap: '0.25rem',
                    fontSize: '0.7rem', fontWeight: 500,
                    border: showQuickActions ? '1px solid #e96d2b' : '1px solid #d1d5db',
                    background: showQuickActions ? '#fff3ed' : 'transparent',
                    color: showQuickActions ? '#e96d2b' : '#6b7280', cursor: 'pointer',
                  }}
                >
                  <Zap style={{ width: '0.875rem', height: '0.875rem' }} />
                  <span>Actions</span>
                </button>
                {showQuickActions && (
                  <div style={{
                    position: 'absolute', top: '110%', right: 0, zIndex: 50, minWidth: '190px',
                    background: '#ffffff', border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden',
                  }}>
                    <button onClick={openAppelModal} style={{ width: '100%', textAlign: 'left', padding: '0.6rem 0.85rem', fontSize: '0.8rem', color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem', borderBottom: '1px solid #f3f4f6' }}>
                      <Phone style={{ width: '0.9rem', height: '0.9rem', flexShrink: 0 }} />
                      Planifier un appel
                    </button>
                    <button onClick={openRdvModal} style={{ width: '100%', textAlign: 'left', padding: '0.6rem 0.85rem', fontSize: '0.8rem', color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem', borderBottom: '1px solid #f3f4f6' }}>
                      <Calendar style={{ width: '0.9rem', height: '0.9rem', flexShrink: 0 }} />
                      Creer un rendez-vous
                    </button>
                    <button onClick={openTaskModal} style={{ width: '100%', textAlign: 'left', padding: '0.6rem 0.85rem', fontSize: '0.8rem', color: '#d97706', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem', borderBottom: '1px solid #f3f4f6' }}>
                      <ListTodo style={{ width: '0.9rem', height: '0.9rem', flexShrink: 0 }} />
                      Creer une tache
                    </button>
                    <button onClick={openDossierModal} style={{ width: '100%', textAlign: 'left', padding: '0.6rem 0.85rem', fontSize: '0.8rem', color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <FolderPlus style={{ width: '0.9rem', height: '0.9rem', flexShrink: 0 }} />
                      Creer un dossier
                    </button>
                  </div>
                )}
              </div>
              <button
                onClick={() => deleteConversation(selectedConv._id)}
                className="p-1.5 rounded-md hover:bg-red-50 dark:hover:bg-red-900/20 text-muted-foreground hover:text-red-600 transition-colors"
                title="Supprimer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>

            {/* Actions mobiles (3 boutons + menu "plus") */}
            <div className="flex md:hidden gap-1 items-center shrink-0">
              {/* Bouton appel direct */}
              <a
                href={`tel:+${selectedConv.phone.replace(/\D/g, '')}`}
                title={`Appeler ${formatPhone(selectedConv.phone)}`}
                style={{
                  padding: '0.375rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center',
                  border: '1px solid #16a34a', background: '#f0fdf4', color: '#16a34a', textDecoration: 'none',
                }}
              >
                <Phone style={{ width: '1rem', height: '1rem' }} />
              </a>
              {/* Actions rapides mobile */}
              <div ref={mobileQuickActionsRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => { setShowMobileQuickActions((v) => !v); setShowMobileMore(false); }}
                  title="Actions rapides"
                  style={{
                    padding: '0.375rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center',
                    border: showMobileQuickActions ? '1px solid #e96d2b' : '1px solid #d1d5db',
                    background: showMobileQuickActions ? '#fff3ed' : 'transparent',
                    color: showMobileQuickActions ? '#e96d2b' : '#6b7280', cursor: 'pointer',
                  }}
                >
                  <Zap style={{ width: '1rem', height: '1rem' }} />
                </button>
                {showMobileQuickActions && (
                  <div style={{
                    position: 'absolute', top: '110%', right: 0, zIndex: 100, minWidth: '190px',
                    background: '#ffffff', border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', overflow: 'hidden',
                  }}>
                    <button onClick={openAppelModal} style={{ width: '100%', textAlign: 'left', padding: '0.65rem 0.9rem', fontSize: '0.82rem', color: '#16a34a', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem', borderBottom: '1px solid #f3f4f6' }}>
                      <Phone style={{ width: '0.9rem', height: '0.9rem', flexShrink: 0 }} />
                      Planifier un appel
                    </button>
                    <button onClick={openRdvModal} style={{ width: '100%', textAlign: 'left', padding: '0.65rem 0.9rem', fontSize: '0.82rem', color: '#1d4ed8', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem', borderBottom: '1px solid #f3f4f6' }}>
                      <Calendar style={{ width: '0.9rem', height: '0.9rem', flexShrink: 0 }} />
                      Creer un rendez-vous
                    </button>
                    <button onClick={openTaskModal} style={{ width: '100%', textAlign: 'left', padding: '0.65rem 0.9rem', fontSize: '0.82rem', color: '#d97706', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem', borderBottom: '1px solid #f3f4f6' }}>
                      <ListTodo style={{ width: '0.9rem', height: '0.9rem', flexShrink: 0 }} />
                      Creer une tache
                    </button>
                    <button onClick={openDossierModal} style={{ width: '100%', textAlign: 'left', padding: '0.65rem 0.9rem', fontSize: '0.82rem', color: '#7c3aed', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                      <FolderPlus style={{ width: '0.9rem', height: '0.9rem', flexShrink: 0 }} />
                      Creer un dossier
                    </button>
                  </div>
                )}
              </div>
              {/* Bot/Conseiller icone seulement */}
              <button
                onClick={toggleHumanMode}
                title={selectedConv.humanMode ? 'Réactiver le bot' : 'Prendre la main'}
                style={{
                  padding: '0.375rem',
                  borderRadius: '0.375rem',
                  display: 'flex', alignItems: 'center',
                  border: selectedConv.humanMode ? '1px solid #22c55e' : '1px solid #d1d5db',
                  background: selectedConv.humanMode ? '#f0fdf4' : 'transparent',
                  color: selectedConv.humanMode ? '#16a34a' : '#6b7280',
                  cursor: 'pointer',
                }}
              >
                {selectedConv.humanMode
                  ? <UserCheck style={{ width: '1rem', height: '1rem' }} />
                  : <Bot style={{ width: '1rem', height: '1rem' }} />
                }
              </button>

              {/* Recherche */}
              <button
                onClick={() => { setShowMsgSearch((v) => !v); setMsgSearch(''); }}
                title="Rechercher"
                style={{
                  padding: '0.375rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center',
                  border: showMsgSearch ? '1px solid #3b82f6' : '1px solid #d1d5db',
                  background: showMsgSearch ? '#eff6ff' : 'transparent',
                  color: showMsgSearch ? '#2563eb' : '#6b7280', cursor: 'pointer',
                }}
              >
                <SearchIcon style={{ width: '1rem', height: '1rem' }} />
              </button>

              {/* Menu plus (mobile) */}
              <div ref={mobileMoreRef} style={{ position: 'relative' }}>
                <button
                  onClick={() => setShowMobileMore((v) => !v)}
                  style={{
                    padding: '0.375rem', borderRadius: '0.375rem', display: 'flex', alignItems: 'center',
                    border: showMobileMore ? '1px solid #6b7280' : '1px solid #d1d5db',
                    background: showMobileMore ? '#f3f4f6' : 'transparent',
                    color: '#6b7280', cursor: 'pointer',
                  }}
                  title="Plus d'actions"
                >
                  <MoreVertical style={{ width: '1rem', height: '1rem' }} />
                </button>
                {showMobileMore && (
                  <div style={{
                    position: 'absolute', top: '110%', right: 0, zIndex: 100, minWidth: '200px',
                    background: '#ffffff', border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem', boxShadow: '0 8px 24px rgba(0,0,0,0.15)', overflow: 'hidden',
                  }}>
                    {/* Statut */}
                    <div style={{ borderBottom: '1px solid #f3f4f6', padding: '0.3rem 0' }}>
                      {Object.entries(FOLLOW_UP_STATUS).map(([k, v]) => (
                        <button key={k} onClick={() => { handleSetStatus(k); setShowMobileMore(false); }} style={{
                          width: '100%', textAlign: 'left', padding: '0.45rem 0.75rem', fontSize: '0.78rem',
                          color: v.color, fontWeight: (selectedConv.followUpStatus || 'none') === k ? 600 : 400,
                          background: (selectedConv.followUpStatus || 'none') === k ? v.bg : 'none',
                          border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.4rem',
                        }}>
                          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: v.color, flexShrink: 0 }} />
                          {v.label}
                        </button>
                      ))}
                    </div>
                    {/* Rappel */}
                    <button onClick={() => {
                      setShowMobileMore(false);
                      if (selectedConv.reminderAt) { setReminderDate(new Date(selectedConv.reminderAt).toISOString().slice(0, 16)); setReminderNoteText(selectedConv.reminderNote || ''); } else { setReminderDate(''); setReminderNoteText(''); }
                      setShowReminderModal(true);
                    }} style={{ width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: selectedConv.reminderAt ? '#d97706' : '#6b7280', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Bell style={{ width: '0.875rem', height: '0.875rem' }} />
                      {selectedConv.reminderAt ? 'Modifier le rappel' : 'Poser un rappel'}
                    </button>
                    {/* Assigner */}
                    <button onClick={() => { setShowMobileMore(false); setShowAssignDropdown(true); }} style={{ width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <User style={{ width: '0.875rem', height: '0.875rem' }} />
                      {selectedConv.assignedTo ? `Assigné: ${selectedConv.assignedTo.prenom}` : 'Assigner'}
                    </button>
                    {/* Lier dossier */}
                    <button onClick={() => { setShowMobileMore(false); openLinkModal(); }} style={{ width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Link2 style={{ width: '0.875rem', height: '0.875rem' }} />
                      Lier à un dossier
                    </button>
                    {/* Supprimer */}
                    <button onClick={() => { setShowMobileMore(false); deleteConversation(selectedConv._id); }} style={{ width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', fontSize: '0.8rem', color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Trash2 style={{ width: '0.875rem', height: '0.875rem' }} />
                      Supprimer
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Messages */}
          {showAttachmentsPanel && (() => {
            const mediaMessages = (selectedConv.messages || []).filter((m: any) =>
              ['image', 'document', 'audio', 'video'].includes(m.type) && (m.mediaId || m.mediaUri)
            );
            const groups: Record<string, any[]> = { image: [], document: [], audio: [], video: [] };
            mediaMessages.forEach((m: any) => { const t = m.type in groups ? m.type : 'document'; groups[t].push(m); });
            const groupColors: Record<string, string> = { image: '#3b82f6', document: '#8b5cf6', audio: '#10b981', video: '#f59e0b' };
            const groupLabels: Record<string, string> = { image: 'Images', document: 'Documents', audio: 'Audios', video: 'Videos' };
            return (
                <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: 'var(--background, #ffffff)' }}>
                  {/* Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', flexShrink: 0 }}>
                    <Paperclip style={{ width: '1rem', height: '1rem', color: '#e96d2b' }} />
                    <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                      Pieces jointes ({mediaMessages.length})
                    </span>
                    <button
                      onClick={() => setShowAttachmentsPanel(false)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', display: 'flex', borderRadius: '0.25rem', color: '#6b7280' }}
                    >
                      <X style={{ width: '1rem', height: '1rem' }} />
                    </button>
                  </div>
                  {/* Contenu */}
                  <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
                    {mediaMessages.length === 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', gap: '0.5rem', paddingTop: '3rem' }}>
                        <Paperclip style={{ width: '2rem', height: '2rem', opacity: 0.4 }} />
                        <span style={{ fontSize: '0.85rem' }}>Aucune piece jointe dans cette conversation</span>
                      </div>
                    ) : (
                      Object.entries(groups).map(([type, items]) => {
                        if (!items.length) return null;
                        const color = groupColors[type];
                        const label = groupLabels[type];
                        return (
                          <div key={type} style={{ marginBottom: '1.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                              <MediaIcon type={type} />
                              <span style={{ fontSize: '0.75rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                {label} ({items.length})
                              </span>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                              {items.map((m: any, i: number) => {
                                const cachedUrl = m.mediaId ? mediaUrlCache[m.mediaId] : null;
                                const isOut = m.direction === 'outbound';
                                return (
                                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.5rem 0.65rem', borderRadius: '0.5rem', background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                                    {type === 'image' && cachedUrl ? (
                                      <img src={cachedUrl} alt={m.filename || 'image'} style={{ width: '2.5rem', height: '2.5rem', objectFit: 'cover', borderRadius: '0.25rem', flexShrink: 0 }} />
                                    ) : (
                                      <div style={{ width: '2.5rem', height: '2.5rem', borderRadius: '0.375rem', background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                        <MediaIcon type={type} />
                                      </div>
                                    )}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: '0.78rem', fontWeight: 500, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {m.filename || m.content || `${label.slice(0, -1)} sans nom`}
                                      </div>
                                      <div style={{ fontSize: '0.68rem', color: '#9ca3af', marginTop: '0.1rem' }}>
                                        {isOut ? 'Vous' : getConvName(selectedConv) || formatPhone(selectedConv.phone)}
                                        {' · '}
                                        {new Date(m.timestamp).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                                        {' '}
                                        {new Date(m.timestamp).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                      </div>
                                    </div>
                                    <button
                                      onClick={async () => {
                                        try {
                                          let url = cachedUrl;
                                          if (!url) {
                                            const r = await whatsappAdminAPI.getMedia(m.mediaId, { convId: selectedConv._id, filename: m.filename || undefined, mimeType: m.mimeType || undefined });
                                            url = r.data?.url;
                                            if (url && m.mediaId) setMediaUrlCache((prev: any) => ({ ...prev, [m.mediaId]: url }));
                                          }
                                          if (url) window.open(url, '_blank');
                                        } catch {
                                          setToast({ message: 'Impossible de telecharger le fichier', type: 'error' });
                                        }
                                      }}
                                      title="Telecharger"
                                      style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.3rem', padding: '0.3rem 0.6rem', borderRadius: '0.375rem', fontSize: '0.72rem', fontWeight: 500, border: `1px solid ${color}`, color, background: `${color}10`, cursor: 'pointer' }}
                                    >
                                      <Download style={{ width: '0.7rem', height: '0.7rem' }} />
                                      {cachedUrl || m.mediaUri ? 'Ouvrir' : 'Telecharger'}
                                    </button>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
            );
          })()}

          <div className="flex-1 overflow-y-auto bg-[#e5ddd5] dark:bg-[#0d1117] flex flex-col" style={{ display: showAttachmentsPanel ? 'none' : undefined }}>

            {/* Barre de recherche dans le fil */}
            {showMsgSearch && (
              <div className="sticky top-0 z-10 px-3 py-2 bg-background/95 backdrop-blur border-b border-border">
                <div className="relative">
                  <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <input
                    autoFocus
                    value={msgSearch}
                    onChange={(e) => setMsgSearch(e.target.value)}
                    placeholder="Rechercher dans la conversation…"
                    className="w-full pl-8 pr-3 py-1.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
              </div>
            )}

            {/* ── Banniere rappel ── */}
            {selectedConv.reminderAt && (() => {
              const overdue = new Date(selectedConv.reminderAt) < new Date();
              const dateStr = new Date(selectedConv.reminderAt).toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
              return (
                <div style={{
                  position: 'sticky', top: 0, zIndex: 20,
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.45rem 0.85rem',
                  background: overdue ? '#fef2f2' : '#fefce8',
                  borderBottom: `2px solid ${overdue ? '#dc2626' : '#f59e0b'}`,
                  boxShadow: '0 2px 6px rgba(0,0,0,0.08)',
                }}>
                  <Bell style={{ width: '0.875rem', height: '0.875rem', color: overdue ? '#dc2626' : '#d97706', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: overdue ? '#dc2626' : '#92400e' }}>
                      {overdue ? 'Rappel echu : ' : 'Rappel : '}
                    </span>
                    <span style={{ fontSize: '0.78rem', color: overdue ? '#dc2626' : '#d97706' }}>{dateStr}</span>
                    {selectedConv.reminderNote && (
                      <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '0.4rem' }}>
                        {selectedConv.reminderNote}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => {
                      const d = new Date(selectedConv.reminderAt);
                      setReminderDate(d.toISOString().slice(0, 16));
                      setReminderNoteText(selectedConv.reminderNote || '');
                      setShowReminderModal(true);
                    }}
                    title="Modifier le rappel"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: overdue ? '#dc2626' : '#d97706', display: 'flex', borderRadius: '0.25rem' }}
                  >
                    <Pencil style={{ width: '0.75rem', height: '0.75rem' }} />
                  </button>
                  <button
                    onClick={() => handleDismissReminder(selectedConv._id)}
                    title="Supprimer le rappel"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color: overdue ? '#dc2626' : '#d97706', display: 'flex', borderRadius: '0.25rem' }}
                  >
                    <X style={{ width: '0.75rem', height: '0.75rem' }} />
                  </button>
                </div>
              );
            })()}

            {/* ── Banniere appels planifies ── */}
            {convAppels.length > 0 && convAppels.map((appel: any) => {
              if (!appel?.dateEcheance) return null;
              const appelDate = new Date(appel.dateEcheance);
              const now = new Date();
              const diffMs = appelDate.getTime() - now.getTime();
              const overdue = diffMs < 0;
              const soon = diffMs >= 0 && diffMs < 60 * 60_000;
              const dateStr = appelDate.toLocaleString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
              const bg = overdue ? '#fef2f2' : soon ? '#fefce8' : '#f0fdf4';
              const border = overdue ? '#dc2626' : soon ? '#f59e0b' : '#16a34a';
              const color = overdue ? '#dc2626' : soon ? '#92400e' : '#166534';
              return (
                <div key={appel._id} style={{
                  position: 'sticky', top: 0, zIndex: 19,
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.4rem 0.85rem',
                  background: bg,
                  borderBottom: `2px solid ${border}`,
                  boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                }}>
                  <Phone style={{ width: '0.8rem', height: '0.8rem', color: border, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color }}>
                      {overdue ? 'Appel echu : ' : soon ? 'Appel imminent : ' : 'Appel planifie : '}
                    </span>
                    <span style={{ fontSize: '0.78rem', color }}>{dateStr}</span>
                    {appel.description && (
                      <span style={{ fontSize: '0.75rem', color: '#6b7280', marginLeft: '0.4rem' }}>
                        {appel.description}
                      </span>
                    )}
                  </div>
                  {appel.phone && (
                    <a href={`tel:+${String(appel.phone).replace(/\D/g, '')}`} style={{ flexShrink: 0, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer', padding: '0.2rem 0.5rem', borderRadius: '0.375rem', fontSize: '0.7rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.3rem', textDecoration: 'none' }}>
                      <Phone style={{ width: '0.65rem', height: '0.65rem' }} />
                      Appeler
                    </a>
                  )}
                  <button
                    onClick={async () => {
                      try {
                        await tasksAPI.updateTask(appel._id, { statut: 'termine' });
                        setConvAppels((prev) => prev.filter((a: any) => a._id !== appel._id));
                      } catch { /* silencieux */ }
                    }}
                    title="Marquer comme effectue"
                    style={{ flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: '0.2rem', color, display: 'flex', borderRadius: '0.25rem' }}
                  >
                    <Check style={{ width: '0.75rem', height: '0.75rem' }} />
                  </button>
                </div>
              );
            })}

            {/* ── Banniere messages epingles ── */}
            {(() => {
              const pinned = (selectedConv.messages || []).filter((m: any) => m.pinned);
              if (!pinned.length) return null;
              const single = pinned.length === 1;
              return (
                <div style={{ position: 'sticky', top: 0, zIndex: 18, background: '#fffbeb', borderBottom: '2px solid #f59e0b', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                  <div
                    onClick={() => !single && setShowPinned((v) => !v)}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0.85rem', cursor: single ? 'default' : 'pointer' }}
                  >
                    <Pin style={{ width: '0.8rem', height: '0.8rem', color: '#d97706', flexShrink: 0 }} />
                    {single ? (
                      <span style={{ flex: 1, fontSize: '0.78rem', color: '#92400e', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span style={{ fontWeight: 600, marginRight: '0.4rem' }}>
                          {pinned[0].direction === 'outbound' ? 'Vous :' : `${getConvName(selectedConv) || formatPhone(selectedConv.phone)} :`}
                        </span>
                        {pinned[0].content || `(${pinned[0].type})`}
                      </span>
                    ) : (
                      <span style={{ flex: 1, fontSize: '0.78rem', fontWeight: 600, color: '#92400e' }}>
                        {pinned.length} messages epingles
                      </span>
                    )}
                    {!single && (
                      <ChevronDown style={{ width: '0.75rem', height: '0.75rem', color: '#d97706', flexShrink: 0, transform: showPinned ? 'none' : 'rotate(-90deg)', transition: 'transform 0.15s' }} />
                    )}
                    {single && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handlePinMessage(pinned[0]); }}
                        title="Desepingler"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem', color: '#d97706', display: 'flex', borderRadius: '0.25rem', flexShrink: 0 }}
                      >
                        <X style={{ width: '0.75rem', height: '0.75rem' }} />
                      </button>
                    )}
                  </div>
                  {!single && showPinned && pinned.map((m: any, i: number) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.3rem 0.85rem', borderTop: '1px solid #fde68a' }}>
                      <span style={{ fontSize: '0.72rem', color: '#a16207', flexShrink: 0 }}>
                        {m.direction === 'outbound' ? 'Vous' : getConvName(selectedConv) || formatPhone(selectedConv.phone)}
                      </span>
                      <span style={{ flex: 1, fontSize: '0.75rem', color: '#78350f', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {m.content || `(${m.type})`}
                      </span>
                      <button
                        onClick={() => handlePinMessage(m)}
                        title="Desepingler"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.1rem', color: '#d97706', display: 'flex', borderRadius: '0.25rem', flexShrink: 0, opacity: 0.7 }}
                      >
                        <X style={{ width: '0.7rem', height: '0.7rem' }} />
                      </button>
                    </div>
                  ))}
                </div>
              );
            })()}

            <div className="flex-1 p-4 space-y-2">
              {(() => {
                const allMsgs: any[] = selectedConv.messages || [];
                const filtered = msgSearch.trim()
                  ? allMsgs.filter((m: any) => (m.content || '').toLowerCase().includes(msgSearch.toLowerCase()))
                  : allMsgs;
                if (!filtered.length) {
                  return <div className="text-center text-sm text-muted-foreground py-8">
                    {msgSearch ? 'Aucun résultat' : 'Aucun message'}
                  </div>;
                }
                return filtered.map((msg: any, i: number) => {
                  const isOut = msg.direction === 'outbound';
                  const isNote = !!msg.isInternalNote;
                  const quotedMsg = msg.replyToWaId
                    ? allMsgs.find((m: any) => m.waMessageId === msg.replyToWaId)
                    : null;
                  const cachedUrl = msg.mediaId ? mediaUrlCache[msg.mediaId] : null;

                  return (
                    <div
                      key={msg._id || i}
                      className={`flex group ${isNote ? 'justify-center' : isOut ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`relative ${isNote ? 'max-w-[85%]' : 'max-w-[75%]'}`}>
                        {/* Boutons action au survol */}
                        {!isNote && (
                          <div className={`absolute ${isOut ? 'left-0 -translate-x-full pr-1' : 'right-0 translate-x-full pl-1'} top-1 hidden group-hover:flex gap-0.5 z-10`}>
                            <button
                              onClick={() => setReplyingTo(msg)}
                              title="Répondre"
                              className="p-1 rounded bg-background border border-border shadow-sm hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M9 17H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3" />
                                <path d="m15 18 3 3 3-3" />
                                <path d="M18 21V9" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handlePinMessage(msg)}
                              title={msg.pinned ? 'Désépingler' : 'Épingler'}
                              className={`p-1 rounded border shadow-sm transition-colors ${msg.pinned ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-background border-border text-muted-foreground hover:text-foreground hover:bg-accent'}`}
                            >
                              <Pin className="w-3 h-3" />
                            </button>
                            {msg.type !== 'text' && (msg.mediaId || msg.mediaUri) && (
                              <button
                                onClick={() => openSaveToDossierModal(msg)}
                                title="Enregistrer dans le dossier"
                                className="p-1 rounded bg-background border border-border shadow-sm hover:bg-ds-primary-tint hover:border-ds-primary/40 text-muted-foreground hover:text-ds-primary transition-colors"
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                                  <polyline points="17 21 17 13 7 13 7 21"/>
                                  <polyline points="7 3 7 8 15 8"/>
                                </svg>
                              </button>
                            )}
                          </div>
                        )}

                        <div
                          className={`rounded-lg px-3 py-2 text-sm shadow-sm ${
                            isNote
                              ? 'border border-dashed border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 italic text-xs'
                              : isOut
                              ? 'bg-[#dcf8c6] dark:bg-[#005c4b] text-foreground rounded-br-none'
                              : 'bg-white dark:bg-[#1f2937] text-foreground rounded-bl-none'
                          }`}
                        >
                          {/* Label note interne */}
                          {isNote && (
                            <div className="flex items-center gap-1 mb-1 text-[10px] font-semibold uppercase tracking-wide text-yellow-600 dark:text-yellow-400 not-italic">
                              <StickyNote className="w-3 h-3" />
                              Note interne
                            </div>
                          )}

                          {/* Citation (message auquel on repond) */}
                          {quotedMsg && (
                            <div className="border-l-2 border-green-500 pl-2 mb-1.5 rounded-sm bg-black/5 dark:bg-white/5 py-0.5 pr-1">
                              <div className="text-[10px] font-semibold text-green-700 dark:text-green-400 mb-0.5">
                                {quotedMsg.direction === 'outbound' ? 'Vous' : formatPhone(selectedConv.phone)}
                              </div>
                              <p className="text-xs line-clamp-2 text-muted-foreground">
                                {quotedMsg.content || `(${quotedMsg.type})`}
                              </p>
                            </div>
                          )}

                          {/* Audio player inline */}
                          {msg.type === 'audio' && msg.mediaId && (
                            <div className="mb-1">
                              {cachedUrl ? (
                                <audio controls src={cachedUrl} className="max-w-[220px] h-8" style={{ accentColor: '#22c55e' }} />
                              ) : (
                                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                                  <Play className="w-3.5 h-3.5 animate-pulse" />
                                  <span>Chargement…</span>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Miniature image */}
                          {msg.type === 'image' && msg.mediaId && (
                            <div className="mb-1">
                              {cachedUrl ? (
                                <img
                                  src={cachedUrl}
                                  alt={msg.filename || 'image'}
                                  className="max-w-[200px] rounded cursor-pointer hover:opacity-90 transition-opacity"
                                  onClick={() => window.open(cachedUrl, '_blank')}
                                />
                              ) : (
                                <div className="w-[200px] h-[120px] bg-muted rounded flex items-center justify-center">
                                  <Image className="w-6 h-6 text-muted-foreground opacity-40" />
                                </div>
                              )}
                            </div>
                          )}

                          {/* Autres médias (document, video, sticker, etc.) */}
                          {msg.type !== 'text' && msg.type !== 'audio' && msg.type !== 'image' && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1 flex-wrap">
                              <MediaIcon type={msg.type} />
                              <span className="capitalize">{msg.type}</span>
                              {msg.filename && <span className="truncate max-w-[140px]">· {msg.filename}</span>}
                              {msg.mediaId && (
                                <button
                                  onClick={async () => {
                                    try {
                                      const r = await whatsappAdminAPI.getMedia(msg.mediaId, {
                                        convId: selectedConv._id,
                                        filename: msg.filename || undefined,
                                        mimeType: msg.mimeType || undefined,
                                      });
                                      if (r.data?.url) window.open(r.data.url, '_blank');
                                    } catch {
                                      setToast({ message: 'Impossible de télécharger le fichier', type: 'error' });
                                    }
                                  }}
                                  style={{
                                    display: 'inline-flex', alignItems: 'center', gap: '0.2rem',
                                    fontSize: '0.7rem', padding: '0.1rem 0.4rem', borderRadius: '0.3rem',
                                    border: '1px solid currentColor', opacity: 0.8, cursor: 'pointer',
                                    background: 'transparent', color: 'inherit',
                                  }}
                                >
                                  <Download style={{ width: '0.7rem', height: '0.7rem' }} />
                                  Télécharger
                                </button>
                              )}
                            </div>
                          )}

                          {/* Contenu texte */}
                          {(msg.content || msg.type === 'text') && !isNote && (
                            <p className="whitespace-pre-wrap break-words leading-relaxed">
                              {msg.content || ''}
                            </p>
                          )}
                          {isNote && (
                            <p className="whitespace-pre-wrap break-words leading-relaxed">
                              {msg.content}
                            </p>
                          )}

                          {/* Horodatage */}
                          <div className={`text-[10px] mt-1 flex items-center gap-1 ${isNote ? 'justify-center' : isOut ? 'justify-end' : 'justify-start'} text-muted-foreground`}>
                            {msg.pinned && <Pin className="w-2.5 h-2.5 text-amber-500" />}
                            {formatTime(msg.timestamp)}
                            {isOut && !isNote && <CheckCheck className="w-3 h-3 text-blue-400" />}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Zone de saisie */}
          <div className="border-t border-border bg-background">
            {/* Barre de réponse citée */}
            {replyingTo && (
              <div className="flex items-center gap-2 px-3 pt-2 pb-0">
                <div className="flex-1 border-l-2 border-green-500 pl-2 bg-green-50 dark:bg-green-900/20 rounded-r py-1 pr-2 min-w-0">
                  <div className="text-[10px] font-semibold text-green-700 dark:text-green-400">
                    {replyingTo.direction === 'outbound' ? 'Vous' : formatPhone(selectedConv.phone)}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {replyingTo.content || `(${replyingTo.type})`}
                  </p>
                </div>
                <button onClick={() => setReplyingTo(null)} className="p-1 text-muted-foreground hover:text-foreground shrink-0">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Zone note interne */}
            {showNoteInput && (
              <div className="px-3 pt-2 pb-0">
                <div className="flex gap-2">
                  <textarea
                    autoFocus
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAddNote(); } if (e.key === 'Escape') setShowNoteInput(false); }}
                    placeholder="Note interne (visible uniquement par les conseillers)…"
                    rows={2}
                    className="flex-1 px-3 py-2 text-sm border border-yellow-300 rounded-md bg-yellow-50 dark:bg-yellow-900/20 resize-none focus:outline-none focus:ring-2 focus:ring-yellow-400"
                  />
                  <div className="flex flex-col gap-1">
                    <button
                      onClick={handleAddNote}
                      disabled={isAddingNote || !noteText.trim()}
                      className="p-2 rounded-md bg-yellow-500 text-white hover:bg-yellow-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isAddingNote ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button onClick={() => setShowNoteInput(false)} className="p-2 rounded-md border border-input text-muted-foreground hover:bg-accent">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="px-3 pb-3 pt-2 border-t border-border">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) sendFile(file);
                }}
              />

              {/* Bandeau note interne */}
              {showNoteInput && (
                <div className="flex items-center gap-1.5 mb-2 px-2.5 py-1.5 rounded-lg bg-yellow-50 border border-yellow-200 text-yellow-700">
                  <StickyNote className="w-3 h-3 shrink-0" />
                  <span className="text-xs font-medium">Note interne — visible uniquement par l'equipe</span>
                  <button
                    onClick={() => setShowNoteInput(false)}
                    className="ml-auto p-0.5 rounded hover:bg-yellow-200 transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              )}

              {/* Conteneur integre pleine largeur */}
              <div className={[
                'flex items-end gap-1 rounded-2xl border px-2 py-1.5 transition-all',
                showNoteInput
                  ? 'border-yellow-300 bg-yellow-50/40 focus-within:border-yellow-400'
                  : 'border-input bg-background focus-within:border-ring focus-within:ring-1 focus-within:ring-ring/30',
              ].join(' ')}>

                {/* Gauche : joindre */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isSendingFile || isRecording}
                  title="Joindre un fichier"
                  className="p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0 self-end mb-0.5"
                >
                  {isSendingFile ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : (
                    <Paperclip className="w-4 h-4" />
                  )}
                </button>

                {/* Textarea + dropdown reponses rapides */}
                <div ref={qrMenuRef} className="relative flex-1 min-w-0">
                  {showQRMenu && (
                    <div style={{
                      position: 'absolute', bottom: '110%', left: 0, right: 0, zIndex: 50,
                      background: '#ffffff', border: '1px solid #e5e7eb',
                      borderRadius: '0.5rem', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden',
                    }}>
                      <div className="p-2 border-b border-border">
                        <input
                          autoFocus
                          value={qrFilter}
                          onChange={(e) => setQrFilter(e.target.value)}
                          placeholder="Filtrer…"
                          className="w-full px-2 py-1 text-xs border border-input rounded bg-background focus:outline-none"
                        />
                      </div>
                      <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                        {QUICK_REPLIES.filter((r) => r.label.toLowerCase().includes(qrFilter.toLowerCase()) || r.text.toLowerCase().includes(qrFilter.toLowerCase())).map((r, i) => (
                          <button
                            key={i}
                            onClick={() => { setReplyText(r.text); setShowQRMenu(false); setQrFilter(''); }}
                            style={{ width: '100%', textAlign: 'left', padding: '0.5rem 0.75rem', border: 'none', background: 'none', cursor: 'pointer' }}
                            className="hover:bg-accent"
                          >
                            <div className="text-xs font-semibold text-foreground">{r.label}</div>
                            <div className="text-[11px] text-muted-foreground truncate">{r.text}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <textarea
                    value={replyText}
                    onChange={(e) => {
                      const val = e.target.value;
                      setReplyText(val);
                      const ta = e.target;
                      ta.style.height = 'auto';
                      ta.style.height = Math.min(ta.scrollHeight, 128) + 'px';
                      if (val === '/') { setShowQRMenu(true); setQrFilter(''); }
                      else if (!val.startsWith('/')) setShowQRMenu(false);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') setShowQRMenu(false);
                      if (e.key === 'Enter' && !e.shiftKey && !showQRMenu) {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                    placeholder={showNoteInput ? 'Note interne… (Entree pour enregistrer)' : 'Message… (/ pour reponses rapides)'}
                    rows={1}
                    className="w-full py-2 text-sm bg-transparent resize-none focus:outline-none placeholder:text-muted-foreground/60"
                    style={{ minHeight: '36px', maxHeight: '128px', lineHeight: '1.4' }}
                  />
                </div>

                {/* Droite : note, micro, envoyer */}
                <div className="flex items-center gap-0.5 shrink-0 self-end mb-0.5">
                  {/* Note interne */}
                  <button
                    onClick={() => { setShowNoteInput((v) => !v); setReplyingTo(null); }}
                    title="Note interne"
                    className={[
                      'p-1.5 rounded-full transition-colors',
                      showNoteInput
                        ? 'text-yellow-600 bg-yellow-100'
                        : 'text-muted-foreground hover:text-yellow-600 hover:bg-accent',
                    ].join(' ')}
                  >
                    <StickyNote className="w-4 h-4" />
                  </button>

                  {/* Micro / enregistrement */}
                  {isRecording ? (
                    <button
                      onClick={stopRecording}
                      title="Arreter l'enregistrement"
                      className="flex items-center gap-1 px-2 py-1 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors animate-pulse"
                    >
                      <Square className="w-3 h-3 fill-current" />
                      <span className="text-[11px] font-mono tabular-nums">
                        {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}
                      </span>
                    </button>
                  ) : (
                    <button
                      onClick={startRecording}
                      disabled={isSendingFile || micPermission === 'denied'}
                      title={
                        micPermission === 'denied'
                          ? "Microphone bloque - autorisez l'acces dans les reglages"
                          : "Message vocal"
                      }
                      className={[
                        'relative p-1.5 rounded-full transition-colors',
                        micPermission === 'denied'
                          ? 'text-red-400 cursor-not-allowed'
                          : 'text-muted-foreground hover:text-green-600 hover:bg-accent disabled:opacity-40',
                      ].join(' ')}
                    >
                      <Mic className="w-4 h-4" />
                      {micPermission === 'denied' && (
                        <span style={{
                          position: 'absolute', top: '2px', right: '2px',
                          width: '7px', height: '7px', borderRadius: '50%',
                          background: '#ef4444', border: '1.5px solid white',
                          display: 'block',
                        }} />
                      )}
                    </button>
                  )}

                  {/* Envoyer */}
                  <button
                    onClick={sendReply}
                    disabled={isSending || !replyText.trim()}
                    className="ml-0.5 p-2 rounded-full bg-green-500 text-white hover:bg-green-600 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  >
                    {isSending ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Send className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Panneau mini-dossier ── */}
        {showDossierPanel && selectedConv.dossierIds?.length > 0 && (() => {
          const STATUT_MAP: Record<string, { label: string; color: string; bg: string }> = {
            recu: { label: 'Recu', color: '#2563eb', bg: '#eff6ff' },
            en_cours: { label: 'En cours', color: '#d97706', bg: '#fffbeb' },
            cloture: { label: 'Cloture', color: '#16a34a', bg: '#f0fdf4' },
            refuse: { label: 'Refuse', color: '#dc2626', bg: '#fef2f2' },
            archive: { label: 'Archive', color: '#6b7280', bg: '#f9fafb' },
          };
          const CAT_MAP: Record<string, string> = {
            sejour_titres: 'Titre de sejour',
            contentieux_administratif: 'Contentieux admin.',
            asile: 'Asile',
            regroupement_familial: 'Regroupement familial',
            nationalite_francaise: 'Nationalite francaise',
            eloignement_urgence: 'Eloignement / OQTF',
            constitution_societe: 'Constitution societe',
            constitution_societe_senegal: 'Societe Senegal',
            constitution_societe_france: 'Societe France',
            autre: 'Autre',
          };
          const PRIO_MAP: Record<string, { label: string; color: string }> = {
            basse: { label: 'Basse', color: '#6b7280' },
            normale: { label: 'Normale', color: '#2563eb' },
            haute: { label: 'Haute', color: '#d97706' },
            urgente: { label: 'Urgente', color: '#dc2626' },
          };
          const dossiers = Array.isArray(dossierPanelData) ? dossierPanelData : [];
          return (
            <div style={{ width: '280px', borderLeft: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', background: 'var(--background, #ffffff)', flexShrink: 0, overflowY: 'auto' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem 1rem', borderBottom: '1px solid #e5e7eb', background: '#f9fafb', flexShrink: 0 }}>
                <FileText style={{ width: '1rem', height: '1rem', color: '#8b5cf6', flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                  Dossiers ({selectedConv.dossierIds.length})
                </span>
                <button onClick={() => setShowDossierPanel(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', display: 'flex', borderRadius: '0.25rem', color: '#6b7280' }}>
                  <X style={{ width: '1rem', height: '1rem' }} />
                </button>
              </div>
              {/* Corps */}
              {loadingDossierPanel ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '2rem', color: '#9ca3af' }}>
                  <RefreshCw style={{ width: '1.25rem', height: '1.25rem', animation: 'spin 1s linear infinite' }} />
                </div>
              ) : dossiers.length === 0 ? (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem', color: '#9ca3af', fontSize: '0.8rem', textAlign: 'center' }}>
                  Dossiers introuvables
                </div>
              ) : (
                <div style={{ flex: 1, overflowY: 'auto' }}>
                  {dossiers.map((dos: any, idx: number) => {
                    const statut = STATUT_MAP[dos.statut] || { label: dos.statut || '-', color: '#6b7280', bg: '#f9fafb' };
                    const prio = PRIO_MAP[dos.priorite] || { label: dos.priorite || '-', color: '#6b7280' };
                    const echeance = dos.dateEcheance ? new Date(dos.dateEcheance) : null;
                    const echeancePast = echeance && echeance < new Date();
                    const echeanceSoon = echeance && !echeancePast && (echeance.getTime() - Date.now()) < 7 * 24 * 60 * 60 * 1000;
                    return (
                      <div key={dos._id || idx} style={{ padding: '0.875rem 1rem', borderBottom: idx < dossiers.length - 1 ? '1px solid #f3f4f6' : 'none', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                        {/* Numero + Titre */}
                        <div>
                          {dos.numero && <div style={{ fontSize: '0.65rem', color: '#9ca3af', marginBottom: '0.15rem' }}>N&deg; {dos.numero}</div>}
                          <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>
                            {dos.titre || 'Dossier sans titre'}
                          </div>
                        </div>
                        {/* Statut + priorite */}
                        <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '0.68rem', fontWeight: 600, padding: '0.15rem 0.5rem', borderRadius: '999px', background: statut.bg, color: statut.color }}>
                            {statut.label}
                          </span>
                          <span style={{ fontSize: '0.68rem', fontWeight: 500, padding: '0.15rem 0.5rem', borderRadius: '999px', background: '#f3f4f6', color: prio.color }}>
                            {prio.label}
                          </span>
                        </div>
                        {/* Categorie */}
                        {dos.categorie && (
                          <div style={{ fontSize: '0.74rem', color: '#6b7280' }}>
                            {CAT_MAP[dos.categorie] || dos.categorie}
                          </div>
                        )}
                        {/* Echeance */}
                        {echeance && (
                          <div style={{ fontSize: '0.74rem', fontWeight: 500, color: echeancePast ? '#dc2626' : echeanceSoon ? '#d97706' : '#374151', display: 'flex', alignItems: 'center', gap: '0.3rem', flexWrap: 'wrap' }}>
                            {echeancePast && <span style={{ fontSize: '0.65rem', background: '#fef2f2', color: '#dc2626', padding: '0.1rem 0.35rem', borderRadius: '0.2rem', fontWeight: 700 }}>En retard</span>}
                            {echeanceSoon && !echeancePast && <span style={{ fontSize: '0.65rem', background: '#fffbeb', color: '#d97706', padding: '0.1rem 0.35rem', borderRadius: '0.2rem', fontWeight: 700 }}>Bientot</span>}
                            {echeance.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </div>
                        )}
                        {/* Notes */}
                        {dos.notes && (
                          <div style={{ fontSize: '0.72rem', color: '#374151', lineHeight: 1.45, maxHeight: '3.5rem', overflowY: 'auto', padding: '0.3rem 0.45rem', background: '#fafafa', borderRadius: '0.3rem', border: '1px solid #f3f4f6' }}>
                            {dos.notes}
                          </div>
                        )}
                        {/* Lien */}
                        <a
                          href={`/admin/dossiers/${dos._id}`}
                          target="_blank"
                          rel="noreferrer"
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', padding: '0.4rem', borderRadius: '0.4rem', fontSize: '0.74rem', fontWeight: 500, color: '#8b5cf6', border: '1px solid #e9d5ff', background: '#faf5ff', textDecoration: 'none' }}
                        >
                          <FileText style={{ width: '0.8rem', height: '0.8rem' }} />
                          Ouvrir
                        </a>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}

        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <MessageCircle className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-sm">Sélectionnez une conversation</p>
          </div>
        </div>
      )}

      {/* ── Modal rappel ── */}
      {showReminderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background border border-border rounded-xl shadow-2xl p-5 w-full max-w-sm mx-4">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-4 h-4 text-amber-500" />
              <h3 className="font-semibold text-sm">Poser un rappel</h3>
              <button onClick={() => setShowReminderModal(false)} className="ml-auto p-1 rounded hover:bg-accent text-muted-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Date et heure</label>
                <input
                  type="datetime-local"
                  value={reminderDate}
                  onChange={(e) => setReminderDate(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Note (optionnel)</label>
                <input
                  type="text"
                  value={reminderNoteText}
                  onChange={(e) => setReminderNoteText(e.target.value)}
                  placeholder="Ex : Relancer pour pièces manquantes"
                  className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSetReminder}
                  disabled={!reminderDate}
                  className="flex-1 py-2 rounded-md bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Enregistrer
                </button>
                {selectedConv?.reminderAt && (
                  <button
                    onClick={() => { setReminderDate(''); handleSetReminder(); }}
                    className="px-3 py-2 rounded-md border border-input text-sm text-muted-foreground hover:bg-accent"
                  >
                    Supprimer
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal : lier à un client / dossier ── */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Link2 className="w-4 h-4 text-primary" />
                Lier la conversation
              </h2>
              <button onClick={() => setShowLinkModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const clientDossiers = linkClientId
                ? dossiers.filter((d: any) => {
                    const uid = typeof d.user === 'object' ? d.user?._id : d.user;
                    return uid === linkClientId || d.clientId === linkClientId;
                  })
                : [];
              const toggleDossier = (id: string) => {
                setLinkDossierIds((prev) =>
                  prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
                );
              };
              const handleClientChange = (cid: string) => {
                setLinkClientId(cid);
                if (cid) {
                  const filtered = dossiers.filter((d: any) => {
                    const uid = typeof d.user === 'object' ? d.user?._id : d.user;
                    return uid === cid || d.clientId === cid;
                  });
                  setLinkDossierIds(filtered.map((d: any) => d._id));
                } else {
                  setLinkDossierIds([]);
                }
              };
              return (
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium block mb-1">Client</label>
                    <select
                      value={linkClientId}
                      onChange={(e) => handleClientChange(e.target.value)}
                      className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    >
                      <option value="">Aucun</option>
                      {clients.map((c: any) => (
                        <option key={c._id} value={c._id}>
                          {c.prenom} {c.nom} ({c.email})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="text-sm font-medium block mb-1">
                      Dossiers
                      {linkClientId && clientDossiers.length > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground font-normal">
                          {linkDossierIds.length}/{clientDossiers.length} selectionne{linkDossierIds.length > 1 ? 's' : ''}
                        </span>
                      )}
                    </label>
                    {!linkClientId ? (
                      <p className="text-sm text-muted-foreground italic py-2">
                        Selectionnez un client pour voir ses dossiers.
                      </p>
                    ) : clientDossiers.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic py-2">
                        Aucun dossier pour ce client.
                      </p>
                    ) : (
                      <div className="border border-input rounded-md divide-y divide-border max-h-48 overflow-y-auto">
                        {clientDossiers.map((d: any) => {
                          const checked = linkDossierIds.includes(d._id);
                          return (
                            <label
                              key={d._id}
                              className="flex items-start gap-3 px-3 py-2.5 cursor-pointer hover:bg-accent/50 transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleDossier(d._id)}
                                className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="text-sm font-medium truncate">
                                  {d.titre || d.reference || 'Dossier sans titre'}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {d.numero && <span className="mr-2">N&deg; {d.numero}</span>}
                                  <span>{d.statut}</span>
                                </div>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowLinkModal(false)}
                className="px-4 py-2 text-sm border border-input rounded-md hover:bg-accent transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={saveLink}
                className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
              >
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal : message proactif ── */}
      {showProactiveModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base flex items-center gap-2">
                <Send className="w-4 h-4 text-green-500" />
                Nouveau message WhatsApp
              </h2>
              <button onClick={() => setShowProactiveModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">
                  Numéro de téléphone
                  <span className="text-muted-foreground font-normal ml-1">(format international, ex: 33612345678)</span>
                </label>
                <input
                  type="text"
                  value={proactivePhone}
                  onChange={(e) => setProactivePhone(e.target.value)}
                  placeholder="33612345678"
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1">Message</label>
                <textarea
                  value={proactiveText}
                  onChange={(e) => setProactiveText(e.target.value)}
                  rows={4}
                  placeholder="Votre message…"
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded p-2">
                ⚠️ WhatsApp n'autorise les messages proactifs que via des modèles approuvés (Business Initiated). Ce message ne sera délivré que si le client vous a contacté dans les dernières 24h, ou si vous utilisez un modèle approuvé.
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setShowProactiveModal(false)}
                className="px-4 py-2 text-sm border border-input rounded-md hover:bg-accent transition-colors"
              >
                Annuler
              </button>
              <button
                onClick={sendProactive}
                disabled={isSending || !proactivePhone.trim() || !proactiveText.trim()}
                className="px-4 py-2 text-sm bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 transition-colors flex items-center gap-2"
              >
                {isSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Envoyer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal : Planifier un appel ── */}
      {showAppelModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div style={{ background: '#ffffff' }} className="rounded-lg shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base flex items-center gap-2 text-gray-900">
                <Phone className="w-4 h-4 text-green-600" />
                Planifier un appel
              </h2>
              <button onClick={() => setShowAppelModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            {selectedConv && (
              <p className="text-xs text-gray-500 mb-3">
                Contact : <span className="font-medium text-gray-700">{getConvName(selectedConv) || selectedConv.phone}</span>
                {selectedConv.phone && <span className="ml-1 text-gray-400">({formatPhone(selectedConv.phone)})</span>}
              </p>
            )}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Date *</label>
                  <input type="date" value={appelForm.date} onChange={e => setAppelForm(f => ({ ...f, date: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-400 text-gray-900" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Heure *</label>
                  <input type="time" value={appelForm.heure} onChange={e => setAppelForm(f => ({ ...f, heure: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-400 text-gray-900" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Note <span className="text-gray-400 font-normal">(optionnel)</span></label>
                <input type="text" value={appelForm.note} onChange={e => setAppelForm(f => ({ ...f, note: e.target.value }))} placeholder="Ex: Dossier OQTF, pieces manquantes..." className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-green-400 text-gray-900" />
              </div>
              <p className="text-xs text-gray-400">Une notification push et in-app sera envoyee au moment de l'appel.</p>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowAppelModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700">Annuler</button>
              <button onClick={handleCreateAppel} disabled={isCreatingAppel || !appelForm.date || !appelForm.heure} className="px-4 py-2 text-sm text-white rounded-md disabled:opacity-50 flex items-center gap-2" style={{ background: '#16a34a' }}>
                {isCreatingAppel ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Phone className="w-3.5 h-3.5" />}
                Planifier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal : Creer un rendez-vous ── */}
      {showRdvModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div style={{ background: '#ffffff' }} className="rounded-lg shadow-xl w-full max-w-sm p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base flex items-center gap-2 text-gray-900">
                <Calendar className="w-4 h-4 text-blue-600" />
                Nouveau rendez-vous
              </h2>
              <button onClick={() => setShowRdvModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Prenom</label>
                  <input type="text" value={rdvForm.prenom} onChange={e => setRdvForm(f => ({ ...f, prenom: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-900" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Nom *</label>
                  <input type="text" value={rdvForm.nom} onChange={e => setRdvForm(f => ({ ...f, nom: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-900" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Email <span className="text-gray-400 font-normal">(optionnel)</span></label>
                <input type="email" value={rdvForm.email} onChange={e => setRdvForm(f => ({ ...f, email: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-900" placeholder="Pour confirmation par email" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Telephone</label>
                <input type="text" value={rdvForm.telephone} onChange={e => setRdvForm(f => ({ ...f, telephone: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-900" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Date *</label>
                  <input type="date" value={rdvForm.date} onChange={e => setRdvForm(f => ({ ...f, date: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-900" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Heure *</label>
                  <input type="time" value={rdvForm.heure} onChange={e => setRdvForm(f => ({ ...f, heure: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-900" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Motif *</label>
                <select value={rdvForm.motif} onChange={e => setRdvForm(f => ({ ...f, motif: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-900">
                  <option value="premiere_demande_titre">Premiere demande titre de sejour</option>
                  <option value="renouvellement_titre">Renouvellement titre de sejour</option>
                  <option value="changement_statut">Changement de statut</option>
                  <option value="regroupement_familial">Regroupement familial</option>
                  <option value="nationalite_francaise">Nationalite francaise</option>
                  <option value="demande_visa">Demande de visa</option>
                  <option value="conteste_oqtf">OQTF recue</option>
                  <option value="conteste_refus_titre">Contestation refus titre</option>
                  <option value="constitution_societe_france">Constitution societe (France)</option>
                  <option value="constitution_societe_senegal">Constitution societe (Senegal)</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Note</label>
                <textarea value={rdvForm.description} onChange={e => setRdvForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-400 text-gray-900 resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowRdvModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700">Annuler</button>
              <button onClick={handleCreateRdv} disabled={isCreatingRdv || !rdvForm.nom || !rdvForm.date || !rdvForm.heure} className="px-4 py-2 text-sm text-white rounded-md disabled:opacity-50 flex items-center gap-2" style={{ background: '#1d4ed8' }}>
                {isCreatingRdv ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Calendar className="w-3.5 h-3.5" />}
                Creer le RDV
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal : Creer une tache ── */}
      {showTaskModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div style={{ background: '#ffffff' }} className="rounded-lg shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base flex items-center gap-2 text-gray-900">
                <ListTodo className="w-4 h-4 text-amber-600" />
                Nouvelle tache
              </h2>
              <button onClick={() => setShowTaskModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Titre *</label>
                <input type="text" value={taskForm.titre} onChange={e => setTaskForm(f => ({ ...f, titre: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-400 text-gray-900" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Description</label>
                <textarea value={taskForm.description} onChange={e => setTaskForm(f => ({ ...f, description: e.target.value }))} rows={2} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-400 text-gray-900 resize-none" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Priorite</label>
                  <select value={taskForm.priorite} onChange={e => setTaskForm(f => ({ ...f, priorite: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-400 text-gray-900">
                    <option value="basse">Basse</option>
                    <option value="normale">Normale</option>
                    <option value="haute">Haute</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Echeance</label>
                  <input type="date" value={taskForm.dateEcheance} onChange={e => setTaskForm(f => ({ ...f, dateEcheance: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-400 text-gray-900" />
                </div>
              </div>
              {clientDossiers.length > 0 && (
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Dossier lie</label>
                  <select value={taskForm.dossier} onChange={e => setTaskForm(f => ({ ...f, dossier: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-amber-400 text-gray-900">
                    <option value="">Aucun</option>
                    {clientDossiers.map((d: any) => (
                      <option key={d._id} value={d._id}>{d.numero || d._id.slice(-6)} {d.titre ? `- ${d.titre}` : ''}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowTaskModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700">Annuler</button>
              <button onClick={handleCreateTask} disabled={isCreatingTask || !taskForm.titre} className="px-4 py-2 text-sm text-white rounded-md disabled:opacity-50 flex items-center gap-2" style={{ background: '#d97706' }}>
                {isCreatingTask ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <ListTodo className="w-3.5 h-3.5" />}
                Creer la tache
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal : Creer un dossier ── */}
      {showDossierModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div style={{ background: '#ffffff' }} className="rounded-lg shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base flex items-center gap-2 text-gray-900">
                <FolderPlus className="w-4 h-4 text-purple-600" />
                Nouveau dossier
              </h2>
              <button onClick={() => setShowDossierModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Prenom</label>
                  <input type="text" value={dossierForm.clientPrenom} onChange={e => setDossierForm(f => ({ ...f, clientPrenom: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400 text-gray-900" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-700 block mb-1">Nom *</label>
                  <input type="text" value={dossierForm.clientNom} onChange={e => setDossierForm(f => ({ ...f, clientNom: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400 text-gray-900" />
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Email</label>
                <input type="email" value={dossierForm.clientEmail} onChange={e => setDossierForm(f => ({ ...f, clientEmail: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400 text-gray-900" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Telephone</label>
                <input type="text" value={dossierForm.clientTelephone} onChange={e => setDossierForm(f => ({ ...f, clientTelephone: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400 text-gray-900" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Titre du dossier</label>
                <input type="text" value={dossierForm.titre} onChange={e => setDossierForm(f => ({ ...f, titre: e.target.value }))} placeholder="Ex: Titre de sejour - OQTF..." className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400 text-gray-900" />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Categorie</label>
                <select value={dossierForm.categorie} onChange={e => setDossierForm(f => ({ ...f, categorie: e.target.value }))} className="w-full px-2.5 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-purple-400 text-gray-900">
                  <option value="sejour_titres">Titre de sejour</option>
                  <option value="contentieux_administratif">Contentieux administratif</option>
                  <option value="asile">Asile</option>
                  <option value="regroupement_familial">Regroupement familial</option>
                  <option value="nationalite_francaise">Nationalite francaise</option>
                  <option value="eloignement_urgence">Eloignement urgence</option>
                  <option value="constitution_societe">Constitution de societe</option>
                  <option value="autre">Autre</option>
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowDossierModal(false)} className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 text-gray-700">Annuler</button>
              <button onClick={handleCreateDossier} disabled={isCreatingDossier || !dossierForm.clientNom} className="px-4 py-2 text-sm text-white rounded-md disabled:opacity-50 flex items-center gap-2" style={{ background: '#7c3aed' }}>
                {isCreatingDossier ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <FolderPlus className="w-3.5 h-3.5" />}
                Creer le dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal : Enregistrer media dans le dossier ── */}
      {saveToDossierMsg && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div style={{ background: '#ffffff' }} className="rounded-lg shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-base flex items-center gap-2 text-gray-900">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-ds-primary">
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
                Enregistrer dans le dossier
              </h2>
              <button onClick={() => setSaveToDossierMsg(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1 text-gray-700">Nom du document</label>
                <input
                  type="text"
                  value={saveToDossierName}
                  onChange={(e) => setSaveToDossierName(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-ds-primary/40 text-gray-900"
                  placeholder="Nom du document"
                />
              </div>

              <div>
                <label className="text-sm font-medium block mb-1 text-gray-700">Categorie</label>
                <select
                  value={saveToDossierCategorie}
                  onChange={(e) => setSaveToDossierCategorie(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-ds-primary/40 text-gray-900"
                >
                  <option value="identite">Identite</option>
                  <option value="titre_sejour">Titre de sejour</option>
                  <option value="contrat">Contrat</option>
                  <option value="facture">Facture</option>
                  <option value="autre">Autre</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium block mb-1 text-gray-700">Dossier</label>
                {clientDossiers.length > 0 ? (
                  <select
                    value={saveToDossierDossierId}
                    onChange={(e) => setSaveToDossierDossierId(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-ds-primary/40 text-gray-900"
                  >
                    <option value="">-- Choisir un dossier --</option>
                    {clientDossiers.map((d: any) => (
                      <option key={d._id} value={d._id}>
                        {d.numero || d._id.slice(-6)} {d.titre ? `- ${d.titre}` : ''} {d.categorie ? `(${d.categorie})` : ''}
                      </option>
                    ))}
                  </select>
                ) : (
                  <p className="text-sm text-gray-500 italic">Aucun dossier lie a cette conversation. Liez d'abord un dossier via le bouton <svg width="12" height="12" className="inline" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>.</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setSaveToDossierMsg(null)}
                className="px-4 py-2 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors text-gray-700"
              >
                Annuler
              </button>
              <button
                onClick={handleSaveToDossier}
                disabled={isSavingToDossier || !saveToDossierDossierId || !saveToDossierName.trim()}
                className="px-4 py-2 text-sm text-white rounded-md disabled:opacity-50 transition-colors flex items-center gap-2"
                style={{ background: 'var(--ds-primary, #E96D2B)' }}
              >
                {isSavingToDossier ? <RefreshCw className="w-4 h-4 animate-spin" /> : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                    <polyline points="17 21 17 13 7 13 7 21"/>
                    <polyline points="7 3 7 8 15 8"/>
                  </svg>
                )}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
