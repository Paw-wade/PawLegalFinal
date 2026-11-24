'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { whatsappAdminAPI, dossiersAPI, userAPI } from '@/lib/api';
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
  if (conv.dossierId?.user?.prenom || conv.dossierId?.user?.nom) {
    return `${conv.dossierId.user.prenom || ''} ${conv.dossierId.user.nom || ''}`.trim();
  }
  if (conv.dossierId?.clientPrenom || conv.dossierId?.clientNom) {
    return `${conv.dossierId.clientPrenom || ''} ${conv.dossierId.clientNom || ''}`.trim();
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
  const [linkDossierId, setLinkDossierId] = useState('');
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
  const [showStatusDropdown, setShowStatusDropdown] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [showMobileMore, setShowMobileMore] = useState(false);
  const qrMenuRef = useRef<HTMLDivElement>(null);
  const statusDropdownRef = useRef<HTMLDivElement>(null);
  const mobileMoreRef = useRef<HTMLDivElement>(null);

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
      setIsRenamingContact(false);
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
    setLinkDossierId(selectedConv?.dossierId?._id || selectedConv?.dossierId || '');
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
        dossierId: linkDossierId || null,
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
                      {(conv.dossierId || conv.humanMode || conv.assignedTo) && (
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
                          {conv.dossierId && (
                            <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded truncate max-w-[100px]">
                              <FileText className="w-2.5 h-2.5 inline mr-0.5" />
                              {conv.dossierId.titre || conv.dossierId.reference || 'Dossier'}
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
        <div className="flex-1 flex flex-col min-w-0 w-full">
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
                    background: 'var(--background, #fff)', border: '1px solid #e5e7eb',
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
                    background: 'var(--background, #fff)', border: '1px solid #e5e7eb',
                    borderRadius: '0.5rem', boxShadow: '0 4px 16px rgba(0,0,0,0.12)', overflow: 'hidden',
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

              <button
                onClick={openLinkModal}
                className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                title="Lier à un dossier / client"
              >
                <Link2 className="w-4 h-4" />
              </button>
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
                    background: 'var(--background, #fff)', border: '1px solid #e5e7eb',
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
          <div className="flex-1 overflow-y-auto bg-[#e5ddd5] dark:bg-[#0d1117] flex flex-col">
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

            {/* Messages epingles */}
            {(() => {
              const pinned = (selectedConv.messages || []).filter((m: any) => m.pinned);
              if (!pinned.length) return null;
              return (
                <div className="mx-3 mt-3 rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-900/20 overflow-hidden">
                  <button
                    onClick={() => setShowPinned((v) => !v)}
                    className="w-full flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-800/30 transition-colors"
                  >
                    <Pin className="w-3 h-3" />
                    {pinned.length} message{pinned.length > 1 ? 's' : ''} épinglé{pinned.length > 1 ? 's' : ''}
                    <ChevronDown className={`w-3 h-3 ml-auto transition-transform ${showPinned ? '' : '-rotate-90'}`} />
                  </button>
                  {showPinned && pinned.map((m: any, i: number) => (
                    <div key={i} className="px-3 py-1 border-t border-amber-100 dark:border-amber-800/30 text-xs text-amber-800 dark:text-amber-200 flex items-center gap-2">
                      <span className="opacity-60">{m.direction === 'outbound' ? 'Vous' : formatPhone(selectedConv.phone)}</span>
                      <span className="flex-1 truncate">{m.content || `(${m.type})`}</span>
                      <button onClick={() => handlePinMessage(m)} className="shrink-0 opacity-50 hover:opacity-100" title="Désépingler">
                        <X className="w-3 h-3" />
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

            <div className="flex gap-2 items-end p-3">
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
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={isSendingFile || isRecording}
                title="Joindre un fichier"
                className="p-2.5 rounded-md border border-input text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {isSendingFile ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Paperclip className="w-4 h-4" />
                )}
              </button>
              {isRecording ? (
                <button
                  onClick={stopRecording}
                  title="Arreter l'enregistrement"
                  className="flex items-center gap-1.5 px-2.5 py-2 rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors shrink-0 animate-pulse"
                >
                  <Square className="w-3.5 h-3.5 fill-current" />
                  <span className="text-xs font-mono tabular-nums">
                    {String(Math.floor(recordingSeconds / 60)).padStart(2, '0')}:{String(recordingSeconds % 60).padStart(2, '0')}
                  </span>
                </button>
              ) : (
                <button
                  onClick={startRecording}
                  disabled={isSendingFile || micPermission === 'denied'}
                  title={
                    micPermission === 'denied'
                      ? "Microphone bloque - autorisez l'acces dans les reglages du navigateur"
                      : "Enregistrer un message vocal"
                  }
                  className={[
                    'relative p-2.5 rounded-md border transition-colors shrink-0',
                    micPermission === 'denied'
                      ? 'border-red-300 text-red-400 cursor-not-allowed bg-red-50'
                      : 'border-input text-muted-foreground hover:text-green-600 hover:border-green-400 hover:bg-green-50 disabled:opacity-50 disabled:cursor-not-allowed',
                  ].join(' ')}
                >
                  <Mic className="w-4 h-4" />
                  {micPermission === 'denied' && (
                    <span
                      style={{
                        position: 'absolute', top: '-4px', right: '-4px',
                        width: '10px', height: '10px', borderRadius: '50%',
                        background: '#ef4444', border: '1.5px solid white',
                        display: 'block',
                      }}
                    />
                  )}
                </button>
              )}
              {/* Bouton note interne */}
              <button
                onClick={() => { setShowNoteInput((v) => !v); setReplyingTo(null); }}
                title="Note interne"
                className={[
                  'p-2.5 rounded-md border transition-colors shrink-0',
                  showNoteInput
                    ? 'border-yellow-300 text-yellow-600 bg-yellow-50'
                    : 'border-input text-muted-foreground hover:text-yellow-600 hover:border-yellow-300 hover:bg-yellow-50',
                ].join(' ')}
              >
                <StickyNote className="w-4 h-4" />
              </button>

              {/* Textarea + dropdown réponses rapides */}
              <div ref={qrMenuRef} className="relative flex-1">
                {showQRMenu && (
                  <div style={{
                    position: 'absolute', bottom: '110%', left: 0, right: 0, zIndex: 50,
                    background: 'var(--background, #fff)', border: '1px solid #e5e7eb',
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
                  placeholder="Votre message… (/ pour réponses rapides, Entrée pour envoyer)"
                  rows={2}
                  className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <button
                onClick={sendReply}
                disabled={isSending || !replyText.trim()}
                className="p-2.5 rounded-md bg-green-500 text-white hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
              >
                {isSending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
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

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium block mb-1">Client</label>
                <select
                  value={linkClientId}
                  onChange={(e) => setLinkClientId(e.target.value)}
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
                <label className="text-sm font-medium block mb-1">Dossier</label>
                <select
                  value={linkDossierId}
                  onChange={(e) => setLinkDossierId(e.target.value)}
                  className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Aucun</option>
                  {dossiers.map((d: any) => (
                    <option key={d._id} value={d._id}>
                      {d.titre || d.reference || d._id} — {d.statut}
                    </option>
                  ))}
                </select>
              </div>
            </div>

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
    </div>
  );
}
