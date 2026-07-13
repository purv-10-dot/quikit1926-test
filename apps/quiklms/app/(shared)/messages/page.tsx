'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  MessageSquare, Loader2, AlertCircle, Search, Plus, Send, X, Users, User,
  Check, Wifi, WifiOff, MoreVertical, Smile, Reply, Trash2, Pencil, Archive,
  Forward, Copy, Pin, UserPlus, LogOut, Shield, ChevronLeft, CheckCheck,
} from 'lucide-react';
import { api } from '@/lib/api';
import { getMessagesSocket } from '@/lib/socket';
import { useBranding } from '@/app/providers';

// ── Types ──────────────────────────────────────────────────────────────────────

interface UserRef {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
  role?: string;
  profilePicture?: string;
}

interface ConversationParticipant {
  userId: UserRef;
  joinedAt: string;
  lastReadAt: string;
  role?: string;
  isArchived?: boolean;
  isDeleted?: boolean;
  isMuted?: boolean;
}

interface Conversation {
  _id: string;
  orgId: string;
  type: 'direct' | 'group';
  title?: string;
  description?: string;
  groupIcon?: string;
  participants: ConversationParticipant[];
  lastMessageText?: string;
  lastMessageAt?: string;
  lastMessageBy?: UserRef;
  messageCount: number;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
}

interface Reaction {
  emoji: string;
  userId: string | { _id: string };
  createdAt?: string;
}

interface ReplyToMsg {
  _id: string;
  text: string;
  senderId: string | UserRef;
  createdAt?: string;
}

interface ChatMessage {
  _id: string;
  conversationId: string;
  senderId: string | UserRef;
  text: string;
  attachmentUrls?: string[];
  isEdited?: boolean;
  editedAt?: string;
  isDeleted?: boolean;
  replyTo?: ReplyToMsg;
  reactions?: Reaction[];
  forwardedFrom?: string;
  createdAt: string;
  updatedAt?: string;
}

interface SearchUser {
  _id: string;
  firstName: string;
  lastName: string;
  email?: string;
  role?: string;
  profilePicture?: string;
}

interface BatchOption {
  _id: string;
  name: string;
  grade?: string;
  subject?: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const getCurrentUserId = (): string => {
  if (typeof document === 'undefined') return 'dev-user-id';
  try {
    const match = document.cookie.match(/qs_uid=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : 'dev-user-id';
  } catch { return 'dev-user-id'; }
};

const getCurrentUserRole = (): string => {
  if (typeof document === 'undefined') return '';
  try {
    const match = document.cookie.match(/qs_role=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  } catch { return ''; }
};

const ROLE_FILTER_OPTIONS: Record<string, { value: string; label: string }[]> = {
  TEACHER:      [{ value: '', label: 'All' }, { value: 'LEARNER', label: 'Students' }, { value: 'PARENT', label: 'Parents' }, { value: 'TENANT_ADMIN', label: 'Admin' }],
  PARENT:       [{ value: '', label: 'All' }, { value: 'TEACHER', label: 'Teachers' }],
  LEARNER:      [{ value: '', label: 'All' }, { value: 'TEACHER', label: 'Teachers' }],
  TENANT_ADMIN: [{ value: '', label: 'All' }, { value: 'TEACHER', label: 'Teachers' }, { value: 'PARENT', label: 'Parents' }, { value: 'LEARNER', label: 'Students' }, { value: 'SUB_ADMIN', label: 'Sub Admins' }],
  SUB_ADMIN:    [{ value: '', label: 'All' }, { value: 'TEACHER', label: 'Teachers' }, { value: 'PARENT', label: 'Parents' }, { value: 'LEARNER', label: 'Students' }, { value: 'TENANT_ADMIN', label: 'Admin' }],
  SUPER_ADMIN:  [{ value: '', label: 'All' }, { value: 'TENANT_ADMIN', label: 'Admins' }, { value: 'TEACHER', label: 'Teachers' }, { value: 'PARENT', label: 'Parents' }, { value: 'LEARNER', label: 'Students' }],
};

const fullName = (u: UserRef | SearchUser | null | undefined): string => {
  if (!u) return 'Unknown';
  return `${u.firstName || ''} ${u.lastName || ''}`.trim() || 'Unknown';
};

const formatTime = (d: string | undefined) => {
  if (!d) return '';
  const date = new Date(d);
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (days === 0) return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (days === 1) return 'Yesterday';
  if (days < 7) return date.toLocaleDateString('en-US', { weekday: 'short' });
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatTimestamp = (d: string) =>
  !d ? '' : new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

const getInitials = (name: string) =>
  name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2);

const getSenderId = (sender: string | UserRef): string => {
  if (typeof sender === 'object' && sender?._id) return sender._id;
  return typeof sender === 'string' ? sender : '';
};

const getSenderName = (sender: string | UserRef): string => {
  if (typeof sender === 'object' && sender?.firstName) return fullName(sender);
  return 'Unknown';
};

const EMOJI_LIST = ['👍', '❤️', '😂', '😮', '😢', '🙏'];

// ── Component ──────────────────────────────────────────────────────────────────

const MessagesPage = () => {
  const { branding } = useBranding();
  const primaryColor = branding.primaryColor;
  const secondaryColor = branding.secondaryColor;
  const currentUserId = useRef(getCurrentUserId()).current;
  const currentUserRole = useRef(getCurrentUserRole()).current;
  const isCorporateTenant = false; // default school tenant

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [convLoading, setConvLoading] = useState(true);
  const [convError, setConvError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [convTab, setConvTab] = useState<'all' | 'archived'>('all');

  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const activeConvIdRef = useRef<string | null>(null);
  const [activeConv, setActiveConv] = useState<Conversation | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);

  const [newMessage, setNewMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<ChatMessage | null>(null);
  const [emojiPickerMsgId, setEmojiPickerMsgId] = useState<string | null>(null);
  const [forwardMsgId, setForwardMsgId] = useState<string | null>(null);
  const [convActionMenu, setConvActionMenu] = useState<string | null>(null);
  const [showGroupInfo, setShowGroupInfo] = useState(false);
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [groupEditTitle, setGroupEditTitle] = useState('');
  const [groupEditDescription, setGroupEditDescription] = useState('');
  const [savingGroupInfo, setSavingGroupInfo] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addMemberSearch, setAddMemberSearch] = useState('');
  const [addMemberResults, setAddMemberResults] = useState<SearchUser[]>([]);
  const [addMemberSearching, setAddMemberSearching] = useState(false);
  const [selectedAddMembers, setSelectedAddMembers] = useState<SearchUser[]>([]);
  const [addingMembers, setAddingMembers] = useState(false);
  const [addMemberError, setAddMemberError] = useState('');
  const [memberActionLoading, setMemberActionLoading] = useState<string | null>(null);

  const [showNewConvModal, setShowNewConvModal] = useState(false);
  const [participantSearch, setParticipantSearch] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [selectedParticipants, setSelectedParticipants] = useState<SearchUser[]>([]);
  const [newConvTitle, setNewConvTitle] = useState('');
  const [creatingConv, setCreatingConv] = useState(false);
  const [searching, setSearching] = useState(false);
  const [createConvError, setCreateConvError] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [batches, setBatches] = useState<BatchOption[]>([]);
  const [batchesLoading, setBatchesLoading] = useState(false);

  const [showThread, setShowThread] = useState(false);
  const [wsConnected, setWsConnected] = useState(false);
  const [typingUsers, setTypingUsers] = useState<Record<string, string[]>>({});
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { activeConvIdRef.current = activeConvId; }, [activeConvId]);

  // ── Fetch Conversations ────────────────────────────────────────────────────

  const fetchConversations = useCallback(async () => {
    try {
      setConvLoading(true);
      setConvError('');
      const endpoint = convTab === 'archived' ? '/messages/conversations/archived' : '/messages/conversations';
      const res = await api.get<any>(endpoint);
      setConversations(Array.isArray(res) ? res : res?.conversations ?? res?.data ?? []);
    } catch (err: any) {
      setConvError(err?.message || 'Failed to load conversations');
    } finally {
      setConvLoading(false);
    }
  }, [convTab]);

  useEffect(() => { fetchConversations(); }, [fetchConversations]);

  // ── Fetch Messages ─────────────────────────────────────────────────────────

  const fetchMessages = useCallback(async (convId: string) => {
    try {
      setMsgLoading(true);
      const [convRes, msgRes] = await Promise.all([
        api.get<any>(`/messages/conversations/${convId}`),
        api.get<any>(`/messages/conversations/${convId}/messages`),
      ]);
      setActiveConv(convRes?.conversation ?? convRes);
      const msgs = msgRes?.messages ?? (Array.isArray(msgRes) ? msgRes : msgRes?.data ?? []);
      setMessages(msgs);
      api.patch<any>(`/messages/conversations/${convId}/read`).catch(() => {});
    } catch {
      setMessages([]);
      setActiveConv(null);
    } finally {
      setMsgLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeConvId) fetchMessages(activeConvId);
    else { setMessages([]); setActiveConv(null); }
  }, [activeConvId, fetchMessages]);

  // ── WebSocket Setup ────────────────────────────────────────────────────────

  useEffect(() => {
    const socket = getMessagesSocket();

    const onConnect = () => {
      setWsConnected(true);
      const cid = activeConvIdRef.current;
      if (cid) socket.emit('joinConversation', { conversationId: cid });
    };
    const onDisconnect = () => setWsConnected(false);

    const onNewMessage = (data: { message: ChatMessage; conversationId: string }) => {
      if (!data?.message || !data?.conversationId) return;
      const isOwnMessage = getSenderId(data.message.senderId) === currentUserId;
      if (activeConvIdRef.current === data.conversationId) {
        setMessages((prev) => {
          if (prev.some((m) => m._id === data.message._id)) return prev;
          if (isOwnMessage) {
            const tempIdx = prev.findIndex((m) => m._id.startsWith('temp-') && m.text === data.message.text);
            if (tempIdx >= 0) { const updated = [...prev]; updated[tempIdx] = data.message; return updated; }
            return prev;
          }
          return [...prev, data.message];
        });
      }
      setConversations((prev) => {
        const exists = prev.some((c) => c._id === data.conversationId);
        if (!exists) { fetchConversations(); return prev; }
        return prev.map((c) => c._id === data.conversationId
          ? { ...c, lastMessageText: data.message.text?.substring(0, 100), lastMessageAt: data.message.createdAt || new Date().toISOString() }
          : c
        ).sort((a, b) => new Date(b.lastMessageAt || b.createdAt || 0).getTime() - new Date(a.lastMessageAt || a.createdAt || 0).getTime());
      });
    };

    const onConversationUpdated = (data: any) => {
      if (!data?.conversationId) return;
      setConversations((prev) =>
        prev.map((c) => c._id === data.conversationId ? { ...c, lastMessageText: data.lastMessageText, lastMessageAt: data.lastMessageAt } : c)
          .sort((a, b) => new Date(b.lastMessageAt || b.createdAt || 0).getTime() - new Date(a.lastMessageAt || a.createdAt || 0).getTime())
      );
    };

    const onNewConversation = (data: { conversation: Conversation }) => {
      if (!data?.conversation) return;
      setConversations((prev) => {
        if (prev.some((c) => c._id === data.conversation._id)) return prev;
        return [data.conversation, ...prev];
      });
      socket.emit('joinConversation', { conversationId: data.conversation._id });
    };

    const onMessageEdited = (data: { messageId: string; text: string; editedAt: string; conversationId: string }) => {
      if (activeConvIdRef.current === data.conversationId) {
        setMessages((prev) => prev.map((m) => m._id === data.messageId ? { ...m, text: data.text, isEdited: true, editedAt: data.editedAt } : m));
      }
    };

    const onMessageDeleted = (data: { messageId: string; conversationId: string }) => {
      if (activeConvIdRef.current === data.conversationId) {
        setMessages((prev) => prev.map((m) => m._id === data.messageId ? { ...m, isDeleted: true, text: 'This message was deleted' } : m));
      }
    };

    const onMessageReaction = (data: { messageId: string; reactions: Reaction[]; conversationId: string }) => {
      if (activeConvIdRef.current === data.conversationId) {
        setMessages((prev) => prev.map((m) => m._id === data.messageId ? { ...m, reactions: data.reactions } : m));
      }
    };

    const onUserTyping = (data: { conversationId: string; userId: string; isTyping: boolean }) => {
      if (!data?.conversationId) return;
      setTypingUsers((prev) => {
        const convTypers = prev[data.conversationId] || [];
        if (data.isTyping && !convTypers.includes(data.userId)) return { ...prev, [data.conversationId]: [...convTypers, data.userId] };
        if (!data.isTyping) return { ...prev, [data.conversationId]: convTypers.filter((id) => id !== data.userId) };
        return prev;
      });
    };

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('newMessage', onNewMessage);
    socket.on('conversationUpdated', onConversationUpdated);
    socket.on('newConversation', onNewConversation);
    socket.on('messageEdited', onMessageEdited);
    socket.on('messageDeleted', onMessageDeleted);
    socket.on('messageReaction', onMessageReaction);
    socket.on('userTyping', onUserTyping);

    if (socket.connected) setWsConnected(true);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('newMessage', onNewMessage);
      socket.off('conversationUpdated', onConversationUpdated);
      socket.off('newConversation', onNewConversation);
      socket.off('messageEdited', onMessageEdited);
      socket.off('messageDeleted', onMessageDeleted);
      socket.off('messageReaction', onMessageReaction);
      socket.off('userTyping', onUserTyping);
    };
  }, [currentUserId, fetchConversations]);

  useEffect(() => {
    if (!activeConvId) return;
    const socket = getMessagesSocket();
    if (socket.connected) {
      socket.emit('joinConversation', { conversationId: activeConvId });
      socket.emit('markRead', { conversationId: activeConvId });
    }
    return () => { if (activeConvId && socket.connected) socket.emit('leaveConversation', { conversationId: activeConvId }); };
  }, [activeConvId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    const handler = () => { setConvActionMenu(null); setEmojiPickerMsgId(null); };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // ── Send / Edit ────────────────────────────────────────────────────────────

  const handleSend = async () => {
    if (!newMessage.trim() || !activeConvId) return;
    const msgText = newMessage.trim();
    setNewMessage('');
    setSending(true);

    if (editingMsg) {
      try {
        await api.patch<any>(`/messages/msg/${editingMsg._id}`, { text: msgText });
        setMessages((prev) => prev.map((m) => m._id === editingMsg._id ? { ...m, text: msgText, isEdited: true, editedAt: new Date().toISOString() } : m));
      } catch (err: any) { alert(err?.message || 'Failed to edit message'); setNewMessage(msgText); }
      setEditingMsg(null);
      setSending(false);
      return;
    }

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessage = {
      _id: tempId, conversationId: activeConvId,
      senderId: { _id: currentUserId, firstName: '', lastName: '' } as UserRef,
      text: msgText,
      replyTo: replyTo ? { _id: replyTo._id, text: replyTo.text, senderId: replyTo.senderId } : undefined,
      createdAt: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimisticMsg]);
    setConversations((prev) =>
      prev.map((c) => c._id === activeConvId ? { ...c, lastMessageText: msgText, lastMessageAt: new Date().toISOString() } : c)
        .sort((a, b) => new Date(b.lastMessageAt || b.createdAt || 0).getTime() - new Date(a.lastMessageAt || a.createdAt || 0).getTime())
    );

    const replyToId = replyTo?._id;
    setReplyTo(null);

    try {
      const payload: any = { text: msgText };
      if (replyToId) payload.replyTo = replyToId;
      const res = await api.post<any>(`/messages/conversations/${activeConvId}/messages`, payload);
      const savedMsg = res?.message ?? res;
      setMessages((prev) => prev.map((m) => (m._id === tempId ? savedMsg : m)));
    } catch (err: any) {
      setMessages((prev) => prev.filter((m) => m._id !== tempId));
      alert(err?.message || 'Failed to send message');
      setNewMessage(msgText);
    } finally { setSending(false); }

    const socket = getMessagesSocket();
    if (socket.connected) socket.emit('typing', { conversationId: activeConvId, isTyping: false });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    if (e.key === 'Escape') { setEditingMsg(null); setReplyTo(null); setNewMessage(''); }
  };

  const handleMessageChange = (text: string) => {
    setNewMessage(text);
    if (!activeConvId) return;
    const socket = getMessagesSocket();
    if (socket.connected) {
      socket.emit('typing', { conversationId: activeConvId, isTyping: true });
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => { socket.emit('typing', { conversationId: activeConvId, isTyping: false }); }, 2000);
    }
  };

  // ── Message Actions ────────────────────────────────────────────────────────

  const handleDeleteMessage = async (msgId: string) => {
    try {
      await api.delete<any>(`/messages/msg/${msgId}`);
      setMessages((prev) => prev.map((m) => m._id === msgId ? { ...m, isDeleted: true, text: 'This message was deleted' } : m));
    } catch (err: any) { alert(err?.message || 'Failed to delete'); }
  };

  const handleEditMessage = (msg: ChatMessage) => { setEditingMsg(msg); setNewMessage(msg.text); setReplyTo(null); };

  const handleReact = async (msgId: string, emoji: string) => {
    try {
      const res = await api.post<any>(`/messages/msg/${msgId}/react`, { emoji });
      setMessages((prev) => prev.map((m) => m._id === msgId ? { ...m, reactions: res?.reactions } : m));
    } catch { /* silent */ }
    setEmojiPickerMsgId(null);
  };

  const handleForward = async (targetConvId: string) => {
    if (!forwardMsgId) return;
    try { await api.post<any>(`/messages/msg/${forwardMsgId}/forward`, { targetConversationId: targetConvId }); }
    catch (err: any) { alert(err?.message || 'Failed to forward'); }
    setForwardMsgId(null);
  };

  const handleCopyText = (text: string) => { navigator.clipboard.writeText(text).catch(() => {}); };

  // ── Conversation Actions ───────────────────────────────────────────────────

  const handleArchiveConv = async (convId: string) => {
    try { await api.patch<any>(`/messages/conversations/${convId}/archive`); setConversations((prev) => prev.filter((c) => c._id !== convId)); if (activeConvId === convId) setActiveConvId(null); }
    catch (err: any) { alert(err?.message || 'Failed to archive'); }
    setConvActionMenu(null);
  };

  const handleUnarchiveConv = async (convId: string) => {
    try { await api.patch<any>(`/messages/conversations/${convId}/unarchive`); fetchConversations(); }
    catch (err: any) { alert(err?.message || 'Failed to unarchive'); }
    setConvActionMenu(null);
  };

  const handleDeleteConv = async (convId: string) => {
    if (!confirm('Delete this conversation? It will be hidden from your list.')) return;
    try { await api.delete<any>(`/messages/conversations/${convId}`); setConversations((prev) => prev.filter((c) => c._id !== convId)); if (activeConvId === convId) setActiveConvId(null); }
    catch (err: any) { alert(err?.message || 'Failed to delete'); }
    setConvActionMenu(null);
  };

  const handleMuteConv = async (convId: string, muted: boolean) => {
    try { await api.patch<any>(`/messages/conversations/${convId}/${muted ? 'mute' : 'unmute'}`); fetchConversations(); }
    catch { /* silent */ }
    setConvActionMenu(null);
  };

  // ── Batches fetch ─────────────────────────────────────────────────────────

  useEffect(() => {
    if (!showNewConvModal) return;
    const fetchBatches = async () => {
      try {
        setBatchesLoading(true);
        const res = await api.get<any>('/batches');
        const data = Array.isArray(res) ? res : res?.data ?? res?.batches ?? [];
        setBatches(data.map((b: any) => ({ _id: b._id, name: b.name, grade: b.grade, subject: b.subject })));
      } catch { setBatches([]); } finally { setBatchesLoading(false); }
    };
    fetchBatches();
  }, [showNewConvModal]);

  // ── Search Participants ────────────────────────────────────────────────────

  useEffect(() => {
    const timeout = setTimeout(async () => {
      try {
        setSearching(true);
        const params: Record<string, string> = {};
        if (participantSearch.trim()) params.q = participantSearch.trim();
        if (filterRole) params.role = filterRole;
        if (selectedBatchId) params.batchId = selectedBatchId;
        if (!params.q && !params.role && !params.batchId) { setSearchResults([]); return; }
        const res = await api.get<any>('/messages/contacts', { params });
        const data: SearchUser[] = Array.isArray(res) ? res : res?.data ?? res?.users ?? [];
        setSearchResults(data.filter((u) => u._id !== currentUserId));
      } catch { setSearchResults([]); } finally { setSearching(false); }
    }, 300);
    return () => clearTimeout(timeout);
  }, [participantSearch, filterRole, selectedBatchId, currentUserId]);

  // ── Create Conversation ────────────────────────────────────────────────────

  const handleCreateConversation = async () => {
    if (selectedParticipants.length === 0) return;
    setCreateConvError('');
    try {
      setCreatingConv(true);
      const payload: any = { participantIds: selectedParticipants.map((p) => p._id) };
      if (newConvTitle.trim()) payload.title = newConvTitle.trim();
      if (selectedParticipants.length > 1) payload.type = 'group';
      const res = await api.post<any>('/messages/conversations', payload);
      const conv = res?.conversation ?? res;
      setConversations((prev) => prev.some((c) => c._id === conv._id) ? prev : [conv, ...prev]);
      setActiveConvId(conv._id);
      setShowThread(true);
      setShowNewConvModal(false);
      setSelectedParticipants([]);
      setNewConvTitle('');
      setParticipantSearch('');
      setFilterRole('');
      setSelectedBatchId('');
      const socket = getMessagesSocket();
      if (socket.connected) socket.emit('joinConversation', { conversationId: conv._id });
    } catch (err: any) {
      setCreateConvError(err?.message || 'Failed to create conversation');
    } finally { setCreatingConv(false); }
  };

  const handleSelectAllBatchMembers = () => {
    const toAdd = searchResults.filter((u) => !selectedParticipants.some((s) => s._id === u._id));
    setSelectedParticipants((prev) => [...prev, ...toAdd]);
  };

  const toggleParticipant = (p: SearchUser) => {
    setSelectedParticipants((prev) => prev.find((s) => s._id === p._id) ? prev.filter((s) => s._id !== p._id) : [...prev, p]);
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  const getOtherParticipants = useCallback((conv: Conversation): UserRef[] =>
    conv.participants.map((p) => p.userId).filter((u) => u && u._id !== currentUserId), [currentUserId]);

  const getConversationName = useCallback((conv: Conversation) => {
    if (conv.title) return conv.title;
    const others = getOtherParticipants(conv);
    return others.length === 0 ? 'You' : others.map((u) => fullName(u)).join(', ');
  }, [getOtherParticipants]);

  const getConversationAvatar = useCallback((conv: Conversation) => {
    if (conv.type === 'group' || conv.participants.length > 2) {
      return (
        <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center shrink-0">
          <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        </div>
      );
    }
    const others = getOtherParticipants(conv);
    const name = others[0] ? fullName(others[0]) : 'You';
    return (
      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-sm font-bold shrink-0">
        {name !== 'Unknown' && name !== 'You' ? getInitials(name) : <User className="w-5 h-5" />}
      </div>
    );
  }, [getOtherParticipants]);

  const filteredConversations = useMemo(() => {
    if (!searchTerm) return conversations;
    const q = searchTerm.toLowerCase();
    return conversations.filter((conv) => getConversationName(conv).toLowerCase().includes(q) || (conv.lastMessageText?.toLowerCase() || '').includes(q));
  }, [conversations, searchTerm, getConversationName]);

  const isGroupAdmin = activeConv?.participants.find((p) => p.userId?._id === currentUserId)?.role === 'admin';

  // ── Add Member search ─────────────────────────────────────────────────────

  useEffect(() => {
    if (!showAddMemberModal) return;
    const timeout = setTimeout(async () => {
      try {
        setAddMemberSearching(true);
        const params: Record<string, string> = {};
        if (addMemberSearch.trim()) params.q = addMemberSearch.trim();
        if (!params.q) { setAddMemberResults([]); return; }
        const res = await api.get<any>('/messages/contacts', { params });
        const data: SearchUser[] = Array.isArray(res) ? res : res?.data ?? [];
        const existingIds = new Set(activeConv?.participants.map((p) => p.userId?._id).filter(Boolean));
        setAddMemberResults(data.filter((u) => !existingIds.has(u._id) && u._id !== currentUserId));
      } catch { setAddMemberResults([]); } finally { setAddMemberSearching(false); }
    }, 300);
    return () => clearTimeout(timeout);
  }, [addMemberSearch, showAddMemberModal, activeConv, currentUserId]);

  const handleAddMembers = async () => {
    if (!activeConvId || selectedAddMembers.length === 0) return;
    setAddMemberError('');
    try {
      setAddingMembers(true);
      await api.post<any>(`/messages/conversations/${activeConvId}/participants`, { participantIds: selectedAddMembers.map((m) => m._id) });
      await fetchMessages(activeConvId);
      setShowAddMemberModal(false);
      setSelectedAddMembers([]);
      setAddMemberSearch('');
      setAddMemberResults([]);
    } catch (err: any) { setAddMemberError(err?.message || 'Failed to add members'); }
    finally { setAddingMembers(false); }
  };

  const handleRemoveMember = async (targetUserId: string) => {
    if (!activeConvId || !confirm('Remove this member from the group?')) return;
    try { setMemberActionLoading(targetUserId); await api.delete<any>(`/messages/conversations/${activeConvId}/participants/${targetUserId}`); await fetchMessages(activeConvId); }
    catch { /* silent */ } finally { setMemberActionLoading(null); }
  };

  const handleMakeAdmin = async (targetUserId: string) => {
    if (!activeConvId || !confirm('Promote this member to group admin?')) return;
    try { setMemberActionLoading(targetUserId); await api.patch<any>(`/messages/conversations/${activeConvId}/participants/${targetUserId}/admin`); await fetchMessages(activeConvId); }
    catch { /* silent */ } finally { setMemberActionLoading(null); }
  };

  const handleUpdateGroup = async () => {
    if (!activeConvId) return;
    try {
      setSavingGroupInfo(true);
      await api.patch<any>(`/messages/conversations/${activeConvId}/group`, { title: groupEditTitle.trim() || undefined, description: groupEditDescription.trim() || undefined });
      setEditingGroupName(false);
      await fetchConversations();
      if (activeConvId) fetchMessages(activeConvId);
    } catch { /* silent */ } finally { setSavingGroupInfo(false); }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 py-8 space-y-8 pb-20">
      {/* Header */}
      <div
        className="relative overflow-hidden rounded-2xl lg:rounded-3xl shadow-2xl p-4 sm:p-6 lg:p-8 text-white"
        style={{ background: `linear-gradient(135deg, ${primaryColor}, ${secondaryColor})` }}
      >
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")` }} />
        <div className="relative flex items-center gap-4 flex-wrap">
          <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-16 lg:h-16 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center border border-white/30">
            <MessageSquare className="w-5 h-5 sm:w-6 sm:h-6 lg:w-8 lg:h-8 text-white" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl lg:text-4xl font-extrabold tracking-tight">Messages</h1>
            <p className="opacity-90 text-sm sm:text-base lg:text-lg font-light mt-1">Connect and communicate with your team</p>
          </div>
        </div>
      </div>

      {/* Main Chat Layout */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-100 dark:border-gray-700 overflow-hidden" style={{ height: 'calc(100vh - 320px)', minHeight: '500px' }}>
        <div className="flex h-full">
          {/* Left Panel */}
          <div className={`w-full md:w-1/3 border-r border-gray-100 dark:border-gray-700 flex flex-col ${showThread ? 'hidden md:flex' : 'flex'}`}>
            <div className="p-4 border-b border-gray-100 dark:border-gray-700 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text" placeholder="Search conversations..." value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:border-transparent outline-none transition"
                  style={{ '--tw-ring-color': primaryColor } as any}
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setShowNewConvModal(true); setSelectedParticipants([]); setNewConvTitle(''); setParticipantSearch(''); }}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-white rounded-xl text-sm font-semibold transition hover:opacity-90 shadow-lg"
                  style={{ backgroundColor: primaryColor, boxShadow: `0 10px 15px -3px ${primaryColor}40` }}
                >
                  <Plus className="w-4 h-4" /> New Conversation
                </button>
              </div>
              <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
                {(['all', 'archived'] as const).map((tab) => (
                  <button key={tab} onClick={() => setConvTab(tab)}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition flex items-center justify-center gap-1 ${convTab === tab ? 'bg-white dark:bg-gray-600 shadow-sm' : 'text-gray-500 dark:text-gray-400'}`}
                    style={convTab === tab ? { color: primaryColor } : {}}>
                    {tab === 'archived' && <Archive className="w-3 h-3" />}
                    {tab === 'all' ? 'All Chats' : 'Archived'}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">
              {convLoading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
              ) : convError ? (
                <div className="p-6 text-center">
                  <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
                  <p className="text-sm text-red-600 dark:text-red-400">{convError}</p>
                  <button onClick={fetchConversations} className="mt-2 text-sm text-indigo-600 dark:text-indigo-400 hover:underline">Retry</button>
                </div>
              ) : filteredConversations.length === 0 ? (
                <div className="p-8 text-center">
                  <MessageSquare className="w-10 h-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    {conversations.length === 0 ? (convTab === 'archived' ? 'No archived conversations' : 'No conversations yet') : 'No matching conversations'}
                  </p>
                </div>
              ) : (
                filteredConversations.map((conv) => {
                  const lastMsgByMe = conv.lastMessageBy?._id === currentUserId;
                  return (
                    <div key={conv._id}
                      className={`relative flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition border-b border-gray-50 dark:border-gray-700/50 cursor-pointer ${activeConvId === conv._id ? 'bg-gray-50 dark:bg-gray-900 shadow-inner' : ''}`}
                      style={activeConvId === conv._id ? { borderLeft: `3px solid ${primaryColor}`, backgroundColor: `${primaryColor}08` } : {}}>
                      <div className="flex-1 flex items-center gap-3 min-w-0" onClick={() => { setActiveConvId(conv._id); setShowThread(true); }}>
                        {getConversationAvatar(conv)}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate">{getConversationName(conv)}</span>
                            {(conv.lastMessageAt || conv.createdAt) && (
                              <span className="text-xs text-gray-400 dark:text-gray-500 shrink-0">{formatTime(conv.lastMessageAt || conv.createdAt)}</span>
                            )}
                          </div>
                          {conv.lastMessageText && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">{lastMsgByMe ? 'You: ' : ''}{conv.lastMessageText}</p>
                          )}
                        </div>
                      </div>
                      <button onClick={(e) => { e.stopPropagation(); setConvActionMenu(convActionMenu === conv._id ? null : conv._id); }}
                        className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition shrink-0">
                        <MoreVertical className="w-4 h-4 text-gray-400" />
                      </button>
                      {convActionMenu === conv._id && (
                        <div className="absolute right-2 top-12 z-30 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[160px]"
                          onClick={(e) => e.stopPropagation()}>
                          {convTab === 'all'
                            ? <button onClick={() => handleArchiveConv(conv._id)} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"><Archive className="w-4 h-4" />Archive</button>
                            : <button onClick={() => handleUnarchiveConv(conv._id)} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"><Archive className="w-4 h-4" />Unarchive</button>
                          }
                          <button onClick={() => handleMuteConv(conv._id, true)} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"><Pin className="w-4 h-4" />Mute</button>
                          <button onClick={() => handleDeleteConv(conv._id)} className="w-full flex items-center gap-2 px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"><Trash2 className="w-4 h-4" />Delete Chat</button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Panel */}
          <div className={`w-full md:w-2/3 flex flex-col ${!showThread ? 'hidden md:flex' : 'flex'}`}>
            {!activeConvId ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <MessageSquare className="w-16 h-16 text-gray-200 dark:text-gray-700 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-gray-500 dark:text-gray-400 mb-1">Select a Conversation</h3>
                  <p className="text-sm text-gray-400 dark:text-gray-500">Choose from the list or start a new one</p>
                </div>
              </div>
            ) : (
              <>
                {/* Thread Header */}
                <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center gap-3">
                  <button onClick={() => setShowThread(false)} className="md:hidden p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                    <ChevronLeft className="w-5 h-5 text-gray-500" />
                  </button>
                  <div className="cursor-pointer flex items-center gap-3 flex-1 min-w-0" onClick={() => activeConv?.type === 'group' && setShowGroupInfo(true)}>
                    {activeConv && getConversationAvatar(activeConv)}
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100 truncate">{activeConv ? getConversationName(activeConv) : 'Loading...'}</h3>
                      {activeConv && (
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {activeConv.participants.length} participant{activeConv.participants.length !== 1 ? 's' : ''}{activeConv.type === 'group' ? ' · Group' : ''}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {wsConnected ? <Wifi className="w-3.5 h-3.5 text-emerald-500" /> : <WifiOff className="w-3.5 h-3.5 text-amber-500" />}
                    {activeConv?.type === 'group' && (
                      <button onClick={() => setShowGroupInfo(!showGroupInfo)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                        <Users className="w-4 h-4 text-gray-500" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-1 overflow-hidden">
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
                      {msgLoading ? (
                        <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
                      ) : messages.length === 0 ? (
                        <div className="flex items-center justify-center py-12"><p className="text-sm text-gray-400 dark:text-gray-500">No messages yet</p></div>
                      ) : (
                        messages.map((msg) => {
                          const isOwn = getSenderId(msg.senderId) === currentUserId;
                          const isOptimistic = msg._id.startsWith('temp-');
                          const isDeleted = msg.isDeleted;
                          return (
                            <div key={msg._id} className={`group flex gap-2.5 ${isOwn ? 'flex-row-reverse' : ''}`}>
                              {!isOwn && (
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-1">
                                  {typeof msg.senderId === 'object' && msg.senderId?.firstName ? getInitials(fullName(msg.senderId)) : '?'}
                                </div>
                              )}
                              <div className={`max-w-[70%] relative ${isOwn ? 'items-end' : 'items-start'}`}>
                                {!isOwn && !isDeleted && (
                                  <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1 px-1">{getSenderName(msg.senderId)}</p>
                                )}
                                {msg.replyTo && !isDeleted && (
                                  <div className={`px-3 py-1.5 mb-1 rounded-lg border-l-2 border-indigo-400 bg-gray-50 dark:bg-gray-700/50 text-xs ${isOwn ? 'text-right' : ''}`}>
                                    <span className="font-medium text-indigo-600 dark:text-indigo-400">{getSenderName(msg.replyTo.senderId)}</span>
                                    <p className="text-gray-500 dark:text-gray-400 truncate">{msg.replyTo.text}</p>
                                  </div>
                                )}
                                {msg.forwardedFrom && !isDeleted && (
                                  <p className="text-xs text-gray-400 dark:text-gray-500 mb-1 px-1 italic flex items-center gap-1"><Forward className="w-3 h-3" />Forwarded</p>
                                )}
                                <div className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${isDeleted ? 'bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500 italic' : isOwn ? 'bg-indigo-600 text-white rounded-br-md' : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-gray-100 rounded-bl-md'} ${isOptimistic ? 'opacity-70' : ''}`}>
                                  {msg.text}
                                </div>
                                {msg.reactions && msg.reactions.length > 0 && !isDeleted && (
                                  <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? 'justify-end' : ''}`}>
                                    {Object.entries(
                                      msg.reactions.reduce((acc: Record<string, number>, r: Reaction) => { acc[r.emoji] = (acc[r.emoji] || 0) + 1; return acc; }, {}),
                                    ).map(([emoji, count]) => (
                                      <button key={emoji} onClick={() => handleReact(msg._id, emoji)}
                                        className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded-full text-xs flex items-center gap-0.5 hover:bg-gray-200 dark:hover:bg-gray-600 transition border border-gray-200 dark:border-gray-600">
                                        <span>{emoji}</span><span className="text-gray-500 dark:text-gray-400">{count as number}</span>
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <div className={`flex items-center gap-1 mt-1 px-1 ${isOwn ? 'justify-end' : ''}`}>
                                  <p className="text-xs text-gray-400 dark:text-gray-500">
                                    {isOptimistic ? 'Sending...' : formatTimestamp(msg.createdAt)}
                                    {msg.isEdited && !isDeleted && <span className="ml-1 italic">· edited</span>}
                                  </p>
                                  {isOwn && !isOptimistic && <CheckCheck className="w-3 h-3 text-blue-400" />}
                                </div>
                                {!isDeleted && !isOptimistic && isOwn && (
                                  <div className="flex items-center gap-0.5 mt-0.5 justify-end">
                                    <button onClick={() => handleEditMessage(msg)}
                                      className="p-1 rounded transition text-gray-400"
                                      onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = `${primaryColor}20`; e.currentTarget.style.color = primaryColor; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = '#9ca3af'; }}>
                                      <Pencil className="w-3 h-3" />
                                    </button>
                                    <button onClick={() => handleDeleteMessage(msg._id)} className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 transition">
                                      <Trash2 className="w-3 h-3" />
                                    </button>
                                  </div>
                                )}
                                {!isDeleted && !isOptimistic && (
                                  <div className={`absolute ${isOwn ? 'left-0 -translate-x-full' : 'right-0 translate-x-full'} top-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-0.5 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 px-1 py-0.5`}>
                                    <button onClick={(e) => { e.stopPropagation(); setEmojiPickerMsgId(emojiPickerMsgId === msg._id ? null : msg._id); }} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"><Smile className="w-3.5 h-3.5 text-gray-400" /></button>
                                    <button onClick={() => { setReplyTo(msg); setEditingMsg(null); }} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"><Reply className="w-3.5 h-3.5 text-gray-400" /></button>
                                    <button onClick={() => setForwardMsgId(msg._id)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"><Forward className="w-3.5 h-3.5 text-gray-400" /></button>
                                    <button onClick={() => handleCopyText(msg.text)} className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700"><Copy className="w-3.5 h-3.5 text-gray-400" /></button>
                                  </div>
                                )}
                                {emojiPickerMsgId === msg._id && (
                                  <div className={`absolute ${isOwn ? 'right-0' : 'left-0'} top-0 -translate-y-full z-20 bg-white dark:bg-gray-800 rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 p-2 flex gap-1`} onClick={(e) => e.stopPropagation()}>
                                    {EMOJI_LIST.map((emoji) => (
                                      <button key={emoji} onClick={() => handleReact(msg._id, emoji)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-lg transition">{emoji}</button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    {/* Typing */}
                    {activeConvId && typingUsers[activeConvId]?.filter((id) => id !== currentUserId).length > 0 && (
                      <div className="px-6 py-1.5">
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1">
                            {[0, 150, 300].map((delay) => (
                              <span key={delay} className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                            ))}
                          </div>
                          <p className="text-xs text-gray-400 dark:text-gray-500 italic">typing...</p>
                        </div>
                      </div>
                    )}

                    {/* Reply/Edit bar */}
                    {(replyTo || editingMsg) && (
                      <div className="px-6 py-2 border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                          {replyTo && (
                            <div className="flex items-center gap-2">
                              <Reply className="w-4 h-4 shrink-0" style={{ color: primaryColor }} />
                              <div className="min-w-0">
                                <p className="text-xs font-medium" style={{ color: primaryColor }}>{getSenderName(replyTo.senderId)}</p>
                                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{replyTo.text}</p>
                              </div>
                            </div>
                          )}
                          {editingMsg && (
                            <div className="flex items-center gap-2">
                              <Pencil className="w-4 h-4 text-amber-500 shrink-0" />
                              <p className="text-xs text-amber-600 dark:text-amber-400">Editing message</p>
                            </div>
                          )}
                        </div>
                        <button onClick={() => { setReplyTo(null); setEditingMsg(null); setNewMessage(''); }} className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">
                          <X className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                    )}

                    {/* Input */}
                    <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700">
                      <div className="flex items-end gap-3">
                        <textarea
                          value={newMessage} onChange={(e) => handleMessageChange(e.target.value)} onKeyDown={handleKeyDown}
                          placeholder={editingMsg ? 'Edit your message...' : 'Type a message...'}
                          rows={1} style={{ maxHeight: '120px', '--tw-ring-color': primaryColor } as any}
                          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:border-transparent outline-none transition resize-none"
                          onInput={(e) => { const ta = e.target as HTMLTextAreaElement; ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 120) + 'px'; }}
                        />
                        <button onClick={handleSend} disabled={sending || !newMessage.trim()}
                          className="p-2.5 text-white rounded-xl transition shrink-0 hover:opacity-90 disabled:opacity-50"
                          style={{ backgroundColor: primaryColor }}>
                          {sending ? <Loader2 className="w-5 h-5 animate-spin" /> : editingMsg ? <Check className="w-5 h-5" /> : <Send className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Group Info Panel */}
                  {showGroupInfo && activeConv?.type === 'group' && (
                    <div className="w-72 border-l border-gray-100 dark:border-gray-700 overflow-y-auto bg-gray-50 dark:bg-gray-900/50 flex flex-col">
                      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between shrink-0">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">Group Info</h3>
                        <button onClick={() => { setShowGroupInfo(false); setEditingGroupName(false); }} className="p-1 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700">
                          <X className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                      <div className="p-4 text-center border-b border-gray-100 dark:border-gray-700 shrink-0">
                        <div className="w-16 h-16 mx-auto rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mb-3">
                          <Users className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        {editingGroupName ? (
                          <div className="space-y-2 text-left">
                            <input value={groupEditTitle} onChange={(e) => setGroupEditTitle(e.target.value)} placeholder="Group name"
                              className="w-full text-sm px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                            <textarea value={groupEditDescription} onChange={(e) => setGroupEditDescription(e.target.value)} placeholder="Description (optional)" rows={2}
                              className="w-full text-xs px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none" />
                            <div className="flex gap-2">
                              <button onClick={handleUpdateGroup} disabled={savingGroupInfo}
                                className="flex-1 flex items-center justify-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-medium rounded-lg transition disabled:opacity-60">
                                {savingGroupInfo ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />} Save
                              </button>
                              <button onClick={() => setEditingGroupName(false)} className="flex-1 px-3 py-1.5 border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 text-xs rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="flex items-center justify-center gap-1.5">
                              <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100">{activeConv.title || 'Group Chat'}</h4>
                              {isGroupAdmin && (
                                <button onClick={() => { setGroupEditTitle(activeConv.title || ''); setGroupEditDescription(activeConv.description || ''); setEditingGroupName(true); }}
                                  className="p-0.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-indigo-500 transition">
                                  <Pencil className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            {activeConv.description && <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{activeConv.description}</p>}
                            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{activeConv.participants.length} members</p>
                          </div>
                        )}
                      </div>
                      <div className="p-4 flex-1">
                        <div className="flex items-center justify-between mb-3">
                          <h5 className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Members ({activeConv.participants.length})</h5>
                          {isGroupAdmin && (
                            <button onClick={() => { setShowAddMemberModal(true); setAddMemberError(''); setSelectedAddMembers([]); setAddMemberSearch(''); setAddMemberResults([]); }}
                              className="flex items-center gap-1 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 px-2 py-1 rounded-lg transition">
                              <UserPlus className="w-3 h-3" />Add Members
                            </button>
                          )}
                        </div>
                        <div className="space-y-1.5">
                          {activeConv.participants.map((p) => {
                            const u = p.userId;
                            if (!u) return null;
                            const isSelf = u._id === currentUserId;
                            const isAdmin = p.role === 'admin';
                            const loading = memberActionLoading === u._id;
                            return (
                              <div key={u._id} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white dark:hover:bg-gray-800 transition">
                                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">
                                  {getInitials(fullName(u))}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-gray-900 dark:text-gray-100 truncate">{fullName(u)}{isSelf ? ' (You)' : ''}</p>
                                  <p className="text-xs text-gray-400 truncate capitalize">{(u.role || '').toLowerCase()}</p>
                                </div>
                                {isAdmin && (
                                  <span className="text-xs bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 shrink-0">
                                    <Shield className="w-2.5 h-2.5" />Admin
                                  </span>
                                )}
                                {isGroupAdmin && !isSelf && (
                                  <div className="flex items-center gap-0.5 shrink-0">
                                    {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" /> : (
                                      <>
                                        {!isAdmin && (
                                          <button onClick={() => handleMakeAdmin(u._id)} title="Make Admin" className="p-1 rounded hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-indigo-400 hover:text-indigo-600 transition">
                                            <Shield className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                        <button onClick={() => handleRemoveMember(u._id)} title="Remove from group" className="p-1 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-red-400 hover:text-red-600 transition">
                                          <X className="w-3.5 h-3.5" />
                                        </button>
                                      </>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {activeConv.participants.some((p) => p.userId?._id === currentUserId) && (
                          <button
                            onClick={async () => {
                              if (!confirm('Leave this group?')) return;
                              try { await api.delete<any>(`/messages/conversations/${activeConvId}/participants/${currentUserId}`); setActiveConvId(null); fetchConversations(); } catch { /* silent */ }
                            }}
                            className="mt-4 w-full flex items-center justify-center gap-2 px-4 py-2 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 rounded-xl text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition">
                            <LogOut className="w-4 h-4" />Leave Group
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Add Member Modal */}
      {showAddMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowAddMemberModal(false)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-md w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 sm:p-5 pb-3 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Add Members</h2>
              <button onClick={() => setShowAddMemberModal(false)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-4 sm:p-5 space-y-3 overflow-y-auto flex-1">
              {addMemberError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />{addMemberError}
                </div>
              )}
              {selectedAddMembers.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedAddMembers.map((m) => (
                    <span key={m._id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-medium">
                      {fullName(m)}
                      <button onClick={() => setSelectedAddMembers((prev) => prev.filter((s) => s._id !== m._id))} className="hover:text-indigo-900 ml-0.5"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input type="text" value={addMemberSearch} onChange={(e) => setAddMemberSearch(e.target.value)} placeholder="Search people to add..." autoFocus
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition" />
              </div>
              {addMemberSearching ? (
                <div className="flex items-center justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
              ) : addMemberResults.length > 0 ? (
                <div className="max-h-52 overflow-y-auto space-y-1 border border-gray-100 dark:border-gray-700 rounded-xl p-2">
                  {addMemberResults.map((user) => {
                    const isSelected = selectedAddMembers.some((s) => s._id === user._id);
                    const name = fullName(user);
                    const roleLabel = (user.role || '').replace('LEARNER', 'Student').replace('TENANT_ADMIN', 'Admin');
                    return (
                      <button key={user._id} onClick={() => setSelectedAddMembers((prev) => isSelected ? prev.filter((s) => s._id !== user._id) : [...prev, user])}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'}`}>
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">{getInitials(name)}</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium truncate">{name}</p>
                          <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${user.role === 'TEACHER' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : user.role === 'LEARNER' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : user.role === 'PARENT' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : 'bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-300'}`}>{roleLabel}</span>
                        </div>
                        {isSelected && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              ) : addMemberSearch.trim() && !addMemberSearching ? (
                <p className="text-xs text-gray-400 text-center py-4">No users found</p>
              ) : (
                <p className="text-xs text-gray-400 text-center py-4">Type a name to search</p>
              )}
            </div>
            <div className="p-4 sm:p-5 pt-3 border-t border-gray-100 dark:border-gray-700 flex gap-3">
              <button onClick={() => setShowAddMemberModal(false)} className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm">Cancel</button>
              <button onClick={handleAddMembers} disabled={addingMembers || selectedAddMembers.length === 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold transition text-sm">
                {addingMembers && <Loader2 className="w-4 h-4 animate-spin" />}
                Add {selectedAddMembers.length > 0 ? `(${selectedAddMembers.length})` : 'Members'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New Conversation Modal */}
      {showNewConvModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => { setShowNewConvModal(false); setCreateConvError(''); }} />
          <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-lg w-full max-h-[88vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 sm:p-5 pb-3 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">New Conversation</h2>
              <button onClick={() => { setShowNewConvModal(false); setCreateConvError(''); }} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto flex-1">
              {createConvError && (
                <div className="flex items-center gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-600 dark:text-red-400">
                  <AlertCircle className="w-4 h-4 shrink-0" />{createConvError}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Group Title <span className="text-gray-400 text-xs">(optional — for groups)</span></label>
                <input type="text" value={newConvTitle} onChange={(e) => setNewConvTitle(e.target.value)} placeholder="e.g. Class 10A Math Group"
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition" />
              </div>
              {(ROLE_FILTER_OPTIONS[currentUserRole] || []).length > 1 && (
                <div>
                  <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Filter by Role</label>
                  <div className="flex flex-wrap gap-1.5">
                    {(ROLE_FILTER_OPTIONS[currentUserRole] || [{ value: '', label: 'All' }]).map((opt) => (
                      <button key={opt.value} onClick={() => { setFilterRole(opt.value); setSelectedBatchId(''); setSearchResults([]); }}
                        className={`px-3 py-1 rounded-full text-xs font-medium transition ${filterRole === opt.value ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wide">Filter by Class / Batch</label>
                <select value={selectedBatchId} onChange={(e) => { setSelectedBatchId(e.target.value); setParticipantSearch(''); }} disabled={batchesLoading}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition">
                  <option value="">— All / Search by name —</option>
                  {batches.map((b) => (
                    <option key={b._id} value={b._id}>{b.name}{b.grade ? ` (Class ${b.grade})` : ''}{b.subject ? ` · ${b.subject}` : ''}</option>
                  ))}
                </select>
              </div>
              {selectedParticipants.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {selectedParticipants.map((p) => (
                    <span key={p._id} className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-full text-xs font-medium">
                      {fullName(p)} <span className="text-gray-400 text-xs capitalize">({(p.role || '').toLowerCase()})</span>
                      <button onClick={() => toggleParticipant(p)} className="hover:text-indigo-900 dark:hover:text-indigo-100 ml-0.5"><X className="w-3 h-3" /></button>
                    </span>
                  ))}
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Search & Add People <span className="text-red-500">*</span></label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input type="text" value={participantSearch} onChange={(e) => setParticipantSearch(e.target.value)}
                    placeholder={selectedBatchId ? 'Search within selected class...' : 'Type a name or select a batch above...'}
                    className="w-full pl-10 pr-4 py-2 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition" />
                </div>
                {searchResults.length > 0 && selectedBatchId && (
                  <button onClick={handleSelectAllBatchMembers} className="mt-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-medium">
                    + Select all {searchResults.length} {searchResults.length === 1 ? 'person' : 'people'}
                  </button>
                )}
                {searching ? (
                  <div className="flex items-center justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-indigo-500" /></div>
                ) : searchResults.length > 0 ? (
                  <div className="mt-2 max-h-48 overflow-y-auto space-y-1 border border-gray-100 dark:border-gray-700 rounded-xl p-2">
                    {searchResults.map((user) => {
                      const isSelected = selectedParticipants.some((s) => s._id === user._id);
                      const name = fullName(user);
                      const roleLabel = (user.role || '').replace('LEARNER', 'Student').replace('TENANT_ADMIN', 'Admin');
                      return (
                        <button key={user._id} onClick={() => toggleParticipant(user)}
                          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left text-sm transition ${isSelected ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 text-gray-700 dark:text-gray-300'}`}>
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center text-white text-xs font-bold shrink-0">{getInitials(name)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium truncate">{name}</p>
                            <div className="flex items-center gap-2">
                              {user.email && <p className="text-xs text-gray-400 truncate">{user.email}</p>}
                              {user.role && (
                                <span className={`text-xs px-1.5 py-0.5 rounded capitalize ${user.role === 'TEACHER' ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : user.role === 'LEARNER' ? 'bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400' : user.role === 'PARENT' ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400' : 'bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-300'}`}>
                                  {roleLabel}
                                </span>
                              )}
                            </div>
                          </div>
                          {isSelected && <Check className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                ) : (participantSearch.trim() || selectedBatchId) && !searching ? (
                  <p className="text-xs text-gray-400 mt-2 text-center py-2">No users found</p>
                ) : !selectedBatchId ? (
                  <p className="text-xs text-gray-400 mt-2 text-center py-2">Select a class above or type a name to search</p>
                ) : null}
              </div>
            </div>
            <div className="p-4 sm:p-5 pt-3 border-t border-gray-100 dark:border-gray-700 flex gap-3">
              <button onClick={() => { setShowNewConvModal(false); setCreateConvError(''); setFilterRole(''); setSelectedBatchId(''); setSelectedParticipants([]); setSearchResults([]); }}
                className="flex-1 px-4 py-2.5 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-xl font-medium hover:bg-gray-50 dark:hover:bg-gray-700 transition text-sm">Cancel</button>
              <button onClick={handleCreateConversation} disabled={creatingConv || selectedParticipants.length === 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-semibold transition text-sm">
                {creatingConv && <Loader2 className="w-4 h-4 animate-spin" />}
                {selectedParticipants.length > 1 ? `Create Group (${selectedParticipants.length})` : 'Start Chat'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Forward Modal */}
      {forwardMsgId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setForwardMsgId(null)} />
          <div className="relative bg-white dark:bg-gray-800 rounded-3xl shadow-2xl max-w-sm w-full max-h-[60vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-100 dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Forward to...</h2>
              <button onClick={() => setForwardMsgId(null)} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {conversations.filter((c) => c._id !== activeConvId).map((conv) => (
                <button key={conv._id} onClick={() => handleForward(conv._id)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition text-left">
                  {getConversationAvatar(conv)}
                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{getConversationName(conv)}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MessagesPage;
