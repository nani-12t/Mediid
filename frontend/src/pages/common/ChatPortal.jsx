import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Send, User, MessageSquare } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import PatientLayout from '../../components/common/PatientLayout';
import BuyerLayout from '../../components/common/BuyerLayout';
import { marketplaceAPI } from '../../utils/api';
import toast from 'react-hot-toast';

function ChatPortalContent() {
  const { user } = useAuth();
  const location = useLocation();
  const initialTargetUserId = location.state?.targetUserId || null;

  const [conversations, setConversations] = useState([]);
  const [activeChatId, setActiveChatId] = useState(initialTargetUserId);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  
  const messagesEndRef = useRef(null);

  useEffect(() => {
    fetchConversations();
  }, []);

  useEffect(() => {
    if (activeChatId) {
      fetchMessages(activeChatId);
    }
  }, [activeChatId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const fetchConversations = async () => {
    try {
      const { data } = await marketplaceAPI.getConversations();
      setConversations(data);
      if (data.length > 0 && !activeChatId) {
        setActiveChatId(data[0].otherUserId);
      }
    } catch (err) {
      toast.error('Failed to load conversations');
    } finally {
      setLoading(false);
    }
  };

  const fetchMessages = async (userId) => {
    try {
      const { data } = await marketplaceAPI.getMessages(userId);
      setMessages(data);
    } catch (err) {
      toast.error('Failed to load messages');
    }
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChatId) return;

    try {
      const { data } = await marketplaceAPI.sendMessage({
        receiverId: activeChatId,
        content: newMessage.trim(),
        // Just picking the requirement from the active conversation target
        requirementId: conversations.find(c => c.otherUserId === activeChatId)?.requirementId
      });

      setMessages([...messages, data]);
      setNewMessage('');
      fetchConversations(); // refresh latest messages in sidebar
    } catch (err) {
      toast.error('Failed to send message');
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" /></div>;
  }

  return (
    <div className="card" style={{ padding: 0, display: 'flex', height: 'calc(100vh - 140px)', overflow: 'hidden' }}>
      
      {/* Sidebar - Conversations List */}
      <div style={{ width: 300, borderRight: '1px solid var(--gray-200)', display: 'flex', flexDirection: 'column', background: 'var(--gray-50)' }}>
        <div style={{ padding: '20px', borderBottom: '1px solid var(--gray-200)', background: '#fff' }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--gray-800)' }}>Messages</h3>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {conversations.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: 'var(--gray-400)' }}>
              <MessageSquare size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
              <p style={{ fontSize: 13 }}>No active conversations</p>
            </div>
          ) : (
            conversations.map((conv) => (
              <div 
                key={conv.otherUserId}
                onClick={() => setActiveChatId(conv.otherUserId)}
                style={{ 
                  padding: '16px 20px', 
                  borderBottom: '1px solid var(--gray-200)', 
                  cursor: 'pointer',
                  background: activeChatId === conv.otherUserId ? '#fff' : 'transparent',
                  borderLeft: activeChatId === conv.otherUserId ? '4px solid var(--teal)' : '4px solid transparent',
                  transition: 'background 0.2s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--gray-200)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-600)' }}>
                    <User size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-800)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        User
                      </span>
                      {conv.unreadCount > 0 && (
                        <span style={{ background: 'var(--teal)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 10 }}>
                          {conv.unreadCount}
                        </span>
                      )}
                    </div>
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--gray-500)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {conv.lastMessage?.content}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#fff' }}>
        {activeChatId ? (
          <>
            {/* Chat header */}
            <div style={{ padding: '20px', borderBottom: '1px solid var(--gray-200)', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--teal)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
                <User size={16} />
              </div>
              <div>
                <h3 style={{ fontSize: 15, fontWeight: 600, margin: 0, color: 'var(--gray-900)' }}>Partner</h3>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--gray-500)' }}>Marketplace Discussion</p>
              </div>
            </div>

            {/* Chat Messages */}
            <div style={{ flex: 1, padding: '20px', overflowY: 'auto', background: 'var(--off-white)' }}>
              {messages.map((msg, idx) => {
                const isMine = msg.sender === user.id;
                return (
                  <div key={idx} style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', marginBottom: 16 }}>
                    <div style={{ 
                      maxWidth: '70%', 
                      padding: '12px 16px', 
                      borderRadius: 16,
                      background: isMine ? 'var(--teal)' : '#fff',
                      color: isMine ? '#fff' : 'var(--gray-800)',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                      borderBottomRightRadius: isMine ? 4 : 16,
                      borderBottomLeftRadius: isMine ? 16 : 4,
                    }}>
                      <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>{msg.content}</p>
                      <p style={{ margin: '4px 0 0', fontSize: 10, opacity: 0.7, textAlign: 'right' }}>
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* Message Input Form */}
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--gray-200)' }}>
              <form onSubmit={handleSendMessage} style={{ display: 'flex', gap: 12 }}>
                <input 
                  type="text" 
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type your message..."
                  style={{ flex: 1, padding: '12px 16px', borderRadius: 24, border: '1px solid var(--gray-300)', fontSize: 14, outline: 'none' }}
                />
                <button 
                  type="submit" 
                  disabled={!newMessage.trim()}
                  style={{ 
                    width: 44, height: 44, borderRadius: '50%', background: 'var(--teal)', 
                    color: '#fff', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    cursor: newMessage.trim() ? 'pointer' : 'not-allowed', opacity: newMessage.trim() ? 1 : 0.6
                  }}
                >
                  <Send size={18} />
                </button>
              </form>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--gray-400)' }}>
            <MessageSquare size={48} style={{ opacity: 0.2, marginBottom: 16 }} />
            <p style={{ fontSize: 15 }}>Select a conversation to start messaging</p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatPortal() {
  const { user } = useAuth();
  
  if (user.role === 'buyer') {
    return <BuyerLayout title="Messages"><ChatPortalContent /></BuyerLayout>;
  }
  
  return <PatientLayout title="Messages"><ChatPortalContent /></PatientLayout>;
}
