import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { db } from '../../lib/firebase';
import { 
  collection, 
  query, 
  onSnapshot, 
  addDoc, 
  setDoc, 
  getDocs, 
  doc, 
  orderBy, 
  where,
  serverTimestamp,
  updateDoc
} from 'firebase/firestore';
import { 
  Send, 
  Hash, 
  User as UserIcon, 
  MessageSquare, 
  Search, 
  Clock, 
  ArrowLeft,
  Users,
  ShieldAlert,
  HelpCircle,
  Sparkles,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../../lib/utils';
import { User, ChatRoom, ChatMessage } from '../../types';

export default function ChatManager() {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [activeRoom, setActiveRoom] = useState<ChatRoom | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessageText, setNewMessageText] = useState('');
  const [userSearchText, setUserSearchText] = useState('');
  const [viewMode, setViewMode] = useState<'list' | 'chat'>('list'); // helpful for mobile responsiveness
  const [loadingRooms, setLoadingRooms] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Ref to track if we've completed initial rooms fetch to prevent alert spam on startup
  const isRoomsInitialDocChangesRef = useRef(true);

  const playNotificationSound = () => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      
      // First high chime (soft & pleasant)
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(587.33, ctx.currentTime); // D5
      gain1.gain.setValueAtTime(0.08, ctx.currentTime);
      gain1.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 0.3);
      
      // Second high chime shortly after
      setTimeout(() => {
        try {
          const osc2 = ctx.createOscillator();
          const gain2 = ctx.createGain();
          osc2.type = 'sine';
          osc2.frequency.setValueAtTime(880, ctx.currentTime); // A5
          gain2.gain.setValueAtTime(0.12, ctx.currentTime);
          gain2.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
          
          osc2.connect(gain2);
          gain2.connect(ctx.destination);
          osc2.start(ctx.currentTime);
          osc2.stop(ctx.currentTime + 0.4);
        } catch (e) {
          console.error(e);
        }
      }, 120);

      // Brief flash browser tab title for visual interest
      const originalTitle = document.title;
      let count = 0;
      const interval = setInterval(() => {
        if (count > 5) {
          clearInterval(interval);
          document.title = originalTitle;
          return;
        }
        document.title = count % 2 === 0 ? "💬 Nova Mensagem!" : originalTitle;
        count++;
      }, 800);
    } catch (err) {
      console.error("Audio alert error", err);
    }
  };

  // 1. Fetch active users (to start new chats)
  useEffect(() => {
    if (!user) return;
    const fetchUsers = async () => {
      try {
        const uQuery = query(collection(db, 'users'));
        const uSnap = await getDocs(uQuery);
        const list: User[] = [];
        uSnap.forEach(docSnap => {
          const uData = docSnap.data() as User;
          // Don't list oneself, and only list active users
          if (docSnap.id !== user.uid && uData.active !== false) {
            list.push({ uid: docSnap.id, ...uData });
          }
        });
        setUsers(list);
      } catch (err) {
        console.error("Error loading chat users directory:", err);
      }
    };
    fetchUsers();
  }, [user]);

  // 2. Setup standard channels on mount
  useEffect(() => {
    if (!user) return;
    const ensureChannelsExist = async () => {
      const standardChannels = [
        { id: 'channel_geral', type: 'channel' as const, name: '🌍 Geral', department: 'geral', createdAt: new Date() },
        { id: 'channel_rh', type: 'channel' as const, name: '🤝 Recursos Humanos', department: 'rh', createdAt: new Date() },
        { id: 'channel_financeiro', type: 'channel' as const, name: '💰 Financeiro', department: 'financeiro', createdAt: new Date() },
        { id: 'channel_suporte', type: 'channel' as const, name: '👨‍💻 Suporte & TI', department: 'suporte', createdAt: new Date() }
      ];

      for (const channel of standardChannels) {
        try {
          const channelRef = doc(db, 'chatRooms', channel.id);
          await setDoc(channelRef, channel, { merge: true });
        } catch (err) {
          console.error(`Error initializing channel ${channel.id}:`, err);
        }
      }
    };
    ensureChannelsExist();
  }, [user]);

  // 3. Keep chat rooms synced via snapshot
  useEffect(() => {
    if (!user) return;
    setLoadingRooms(true);

    const roomsQuery = query(
      collection(db, 'chatRooms'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(roomsQuery, (snapshot) => {
      const allRooms: ChatRoom[] = [];
      let shouldPlayAlert = false;

      snapshot.docChanges().forEach(change => {
        if (!isRoomsInitialDocChangesRef.current && (change.type === 'added' || change.type === 'modified')) {
          const data = change.doc.data() as ChatRoom;
          
          // Check room visibility
          const isVisible = data.type === 'channel' || 
            (data.type === 'dm' && (user.role === 'admin' || data.participants?.includes(user.uid)));

          if (isVisible && data.lastMessage && data.lastMessage.senderId !== user.uid) {
            shouldPlayAlert = true;
          }
        }
      });

      isRoomsInitialDocChangesRef.current = false;

      snapshot.forEach(docSnap => {
        const data = docSnap.data() as ChatRoom;
        data.id = docSnap.id;
        
        // Filter room visibility:
        // - if type is 'channel': visible for all signed-in users (department restriction is soft-guided in UI)
        // - if type is 'dm': visible only to participants or admin
        if (data.type === 'channel') {
          allRooms.push(data);
        } else if (data.type === 'dm') {
          if (user.role === 'admin' || data.participants?.includes(user.uid)) {
            allRooms.push(data);
          }
        }
      });
      setRooms(allRooms);
      setLoadingRooms(false);

      if (shouldPlayAlert) {
        playNotificationSound();
      }
    }, (err) => {
      console.error("Error loading rooms snapshot:", err);
      setLoadingRooms(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 4. Load messages of the active room via snapshot
  useEffect(() => {
    if (!activeRoom || !user) {
      setMessages([]);
      return;
    }
    setLoadingMessages(true);

    const msgQuery = query(
      collection(db, 'chatRooms', activeRoom.id, 'messages'),
      orderBy('timestamp', 'asc')
    );

    const unsubscribe = onSnapshot(msgQuery, (snapshot) => {
      const lists: ChatMessage[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as ChatMessage;
        data.id = docSnap.id;
        lists.push(data);
      });
      setMessages(lists);
      setLoadingMessages(false);
      // Scroll to bottom
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }, (err) => {
      console.error("Error loading messages snapshot:", err);
      setLoadingMessages(false);
    });

    return () => unsubscribe();
  }, [activeRoom, user]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 5. Send message action
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom || !user || !newMessageText.trim()) return;

    const messageText = newMessageText.trim();
    setNewMessageText(''); // Clear input

    try {
      const messageColRef = collection(db, 'chatRooms', activeRoom.id, 'messages');
      const timeServer = serverTimestamp();
      
      const payload = {
        text: messageText,
        senderId: user.uid,
        senderName: user.name || 'Sem nome',
        senderPhotoURL: user.photoURL || '',
        timestamp: timeServer
      };

      // 1. Add message document
      await addDoc(messageColRef, payload);

      // 2. Update room's last message & time
      const roomDocRef = doc(db, 'chatRooms', activeRoom.id);
      await updateDoc(roomDocRef, {
        lastMessage: {
          text: messageText,
          senderId: user.uid,
          senderName: user.name,
          timestamp: timeServer
        },
        createdAt: timeServer // Keep active rooms at the top of lists
      });
    } catch (err) {
      console.error("Error sending chat message:", err);
    }
  };

  // 6. Open or create DM chat with another professional
  const startDMChat = async (targetUser: User) => {
    if (!user) return;

    // Check if DM room already exists between user and targetUser
    const sortedParticipants = [user.uid, targetUser.uid].sort();
    const existingDMRoom = rooms.find(r => 
      r.type === 'dm' && 
      r.participants?.includes(user.uid) && 
      r.participants?.includes(targetUser.uid)
    );

    if (existingDMRoom) {
      setActiveRoom(existingDMRoom);
      setViewMode('chat');
      return;
    }

    // Creating new DM Room
    const customRoomId = `dm_${sortedParticipants[0]}_${sortedParticipants[1]}`;
    const newRoom: ChatRoom = {
      id: customRoomId,
      type: 'dm',
      name: `${user.name} & ${targetUser.name}`,
      participants: sortedParticipants,
      createdAt: new Date()
    };

    try {
      await setDoc(doc(db, 'chatRooms', customRoomId), newRoom);
      setActiveRoom(newRoom);
      setViewMode('chat');
    } catch (err) {
      console.error("Error starting DM transaction:", err);
    }
  };

  // Filter lists based on searches
  const filteredUsers = users.filter(u => 
    u.name?.toLowerCase().includes(userSearchText.toLowerCase()) ||
    u.department?.toLowerCase().includes(userSearchText.toLowerCase())
  );

  const channelsOnly = rooms.filter(r => r.type === 'channel');
  const dmsOnly = rooms.filter(r => r.type === 'dm');

  // Format dates elegantly
  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    try {
      const date = timestamp.seconds ? new Date(timestamp.seconds * 1000) : new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/50 overflow-hidden flex flex-col h-[calc(100vh-140px)] min-h-[500px]">
      
      {/* Header Panel */}
      <div className="p-6 md:p-8 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-600/10 text-blue-400 rounded-2xl">
            <MessageSquare className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white leading-tight">Chat Interno</h2>
            <p className="text-xs text-slate-400">Canal de comunicação instantânea e esclarecimento de dúvidas corporativas</p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-800 rounded-xl">
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="text-xs text-slate-300 font-bold">Colaboração em Tempo Real</span>
        </div>
      </div>

      {/* Main Body Grid */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Left Side: Directory / Conversation Room index list */}
        <div className={cn(
          "w-full md:w-80 border-r border-slate-100 flex flex-col bg-slate-50 shrink-0",
          viewMode === 'chat' ? 'hidden md:flex' : 'flex'
        )}>
          
          {/* Inner Search Field */}
          <div className="p-4 bg-white border-b border-slate-100 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar colega ou setor..."
                className="w-full pl-9 pr-4 py-3 bg-slate-50 border border-slate-150 rounded-xl outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium"
                value={userSearchText}
                onChange={e => setUserSearchText(e.target.value)}
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-5">
            {/* 1. Canais / Canais de Departamento */}
            <div>
              <div className="flex items-center justify-between px-3 mb-2">
                <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">Canais de Discussão</span>
                <Users className="w-3.5 h-3.5 text-slate-400" />
              </div>
              <div className="space-y-1">
                {channelsOnly.map(room => {
                  const isActive = activeRoom?.id === room.id;
                  const isUserDepartment = room.department === 'geral' || room.department === user?.department?.toLowerCase();
                  
                  return (
                    <button
                      key={room.id}
                      onClick={() => {
                        setActiveRoom(room);
                        setViewMode('chat');
                      }}
                      className={cn(
                        "w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-left",
                        isActive 
                          ? "bg-blue-600 text-white shadow-md shadow-blue-600/10" 
                          : "text-slate-700 hover:bg-slate-200/60"
                      )}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <Hash className={cn("w-4 h-4 shrink-0", isActive ? "text-blue-200" : "text-blue-500")} />
                        <span className="font-bold text-sm truncate">{room.name}</span>
                        {room.department !== 'geral' && (
                          <span className={cn(
                            "text-[10px] px-1.5 py-0.5 rounded-md font-bold uppercase",
                            isActive ? "bg-blue-700 text-white border border-blue-500" : "bg-slate-200 text-slate-600"
                          )}>
                            {room.department}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Chat with Colleagues */}
            <div>
              <div className="px-3 mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold tracking-wider text-slate-400 uppercase">Lista de Contatos</span>
                <UserIcon className="w-3.5 h-3.5 text-slate-400" />
              </div>
              
              {/* Active chats index */}
              <div className="space-y-1 mb-4">
                {filteredUsers.length === 0 ? (
                  <p className="text-center text-xs text-slate-400 py-4">Nenhum colega encontrado.</p>
                ) : (
                  filteredUsers.map(colleague => {
                    // Check if there is an active room
                    const matchedRoom = dmsOnly.find(r => r.participants?.includes(colleague.uid));
                    const isActive = activeRoom?.id === matchedRoom?.id;

                    return (
                      <button
                        key={colleague.uid}
                        onClick={() => startDMChat(colleague)}
                        className={cn(
                          "w-full flex items-center gap-3 p-2.5 rounded-xl transition-all text-left group",
                          isActive 
                            ? "bg-white border border-slate-200/80 shadow-md ring-1 ring-slate-100" 
                            : "hover:bg-slate-200/50"
                        )}
                      >
                        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-slate-200 to-slate-100 font-bold flex items-center justify-center text-slate-700 uppercase relative shrink-0 border border-slate-300/30">
                          {colleague.photoURL ? (
                            <img src={colleague.photoURL} alt={colleague.name} className="w-full h-full object-cover rounded-xl" />
                          ) : (
                            colleague.name?.charAt(0)
                          )}
                          <span className={cn(
                            "absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-slate-50",
                            colleague.active !== false ? "bg-emerald-500" : "bg-slate-300"
                          )} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <h4 className="font-bold text-slate-800 text-xs truncate group-hover:text-blue-600 transition-colors">
                              {colleague.name}
                            </h4>
                            {matchedRoom?.lastMessage && (
                              <span className="text-[9px] text-slate-400 whitespace-nowrap">
                                {formatTime(matchedRoom.lastMessage.timestamp)}
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tighter truncate mt-0.5">
                            {colleague.department || 'Operacional'}
                          </p>
                          {matchedRoom?.lastMessage && (
                            <p className="text-[10px] text-slate-400 truncate mt-0.5 mt-1 font-medium bg-slate-100/50 p-1 rounded">
                              {matchedRoom.lastMessage.text}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side: Message stream Area */}
        <div className={cn(
          "flex-1 flex flex-col bg-white overflow-hidden relative",
          viewMode === 'list' ? 'hidden md:flex' : 'flex'
        )}>
          {activeRoom ? (
            <>
              {/* Chat Sub-Header */}
              <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between select-none">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setViewMode('list')} 
                    className="md:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 transition-all rounded-lg hover:bg-slate-200"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      {activeRoom.type === 'channel' ? (
                        <Hash className="w-4 h-4 text-blue-500" />
                      ) : (
                        <UserIcon className="w-4 h-4 text-blue-500" />
                      )}
                      <h3 className="font-bold text-slate-800 text-sm">
                        {activeRoom.type === 'channel' ? activeRoom.name : activeRoom.name.replace(user?.name || '', '').replace('&', '').trim()}
                      </h3>
                    </div>
                    <span className="text-[10px] text-teal-600 font-bold flex items-center gap-1 mt-0.5">
                      <span className="inline-block w-1.5 h-1.5 bg-teal-500 rounded-full animate-ping" />
                      Mensagens Criptografadas
                    </span>
                  </div>
                </div>

                {activeRoom.type === 'channel' && (
                  <div className="text-[10px] text-slate-400 font-bold bg-white border px-3 py-1.5 rounded-xl flex items-center gap-1.5">
                    <Info className="w-3.5 h-3.5 text-blue-500" />
                    <span>Acesso geral de departamentos</span>
                  </div>
                )}
              </div>

              {/* Chat Messages Body Stream */}
              <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-slate-50/30">
                {loadingMessages ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="w-8 h-8 border-2 border-blue-600/20 border-t-blue-600 rounded-full animate-spin" />
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-center max-w-xs mx-auto space-y-2 opacity-60">
                    <div className="p-4 bg-blue-50 text-blue-600 rounded-full">
                      <MessageSquare className="w-8 h-8" />
                    </div>
                    <h4 className="font-bold text-slate-800 text-sm">Nenhuma Mensagem Ainda</h4>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Envie uma mensagem para dar início ao assunto. Seja cordial e mantenha a comunicação focada em trabalho.
                    </p>
                  </div>
                ) : (
                  messages.map((message, idx) => {
                    const isMe = message.senderId === user?.uid;
                    
                    return (
                      <div 
                        key={message.id || idx}
                        className={cn(
                          "flex gap-3 max-w-[80%]",
                          isMe ? "ml-auto flex-row-reverse" : "mr-auto"
                        )}
                      >
                        {/* Sender avatar picture */}
                        <div className="w-8 h-8 rounded-lg bg-slate-200 flex items-center justify-center font-bold text-slate-700 text-xs shrink-0 select-none overflow-hidden object-cover border border-slate-300/30">
                          {message.senderPhotoURL ? (
                            <img src={message.senderPhotoURL} alt={message.senderName} className="w-full h-full object-cover" />
                          ) : (
                            message.senderName?.charAt(0)
                          )}
                        </div>

                        {/* Bubble */}
                        <div className="space-y-1">
                          <div className={cn(
                            "flex items-center gap-2 text-[10px]",
                            isMe ? "justify-end flex-row-reverse" : "justify-start"
                          )}>
                            <span className="font-bold text-slate-700">{isMe ? 'Você' : message.senderName}</span>
                            <span className="text-slate-400 font-medium">{formatTime(message.timestamp)}</span>
                          </div>
                          
                          <div className={cn(
                            "p-3 rounded-2xl shadow-sm text-sm break-words border",
                            isMe 
                              ? "bg-blue-600 text-white rounded-tr-none border-blue-700" 
                              : "bg-white text-slate-800 rounded-tl-none border-slate-100"
                          )}>
                            <p className="whitespace-pre-line font-medium leading-relaxed">{message.text}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Footer Form Entry */}
              <form onSubmit={handleSendMessage} className="p-4 border-t border-slate-100 bg-white flex items-center gap-3">
                <input 
                  type="text"
                  required
                  placeholder="Escreva sua mensagem profissional..."
                  className="flex-1 px-4 py-3 bg-slate-50 border border-slate-150 rounded-2xl outline-none focus:ring-2 focus:ring-blue-500 font-medium text-sm transition-all text-slate-800"
                  value={newMessageText}
                  onChange={e => setNewMessageText(e.target.value)}
                />
                <button 
                  type="submit"
                  className="p-3.5 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 shadow-md shadow-blue-600/10 transition-all font-bold shrink-0 flex items-center justify-center active:scale-95"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center flex-1 text-center p-8 bg-slate-50/50">
              <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center mb-4 border border-blue-100 shadow-sm animate-bounce">
                <MessageSquare className="w-8 h-8" />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-1">Selecione uma Conversa</h3>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed mb-6">
                Escolha um canal de departamento ou clique em um colega de trabalho na lista ao lado para iniciar um bate-papo.
              </p>
              
              <div className="p-4 bg-blue-50/80 border border-blue-150/40 rounded-2xl max-w-sm text-left flex gap-3">
                <ShieldAlert className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-blue-900 text-xs">Comunicado da Organização</h4>
                  <p className="text-[10px] text-blue-700 leading-relaxed mt-0.5">
                    Utilize o chat interno apenas para assuntos de cooperação, registros de ponto, rotinas administrativas e esclarecimento de folgas. Todas as conversas são corporativas.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
