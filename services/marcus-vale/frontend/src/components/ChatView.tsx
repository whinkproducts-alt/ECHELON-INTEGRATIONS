import React from 'react';

interface Message {
  text: string;
  isUser: boolean;
}

interface ChatViewProps {
  messages: Message[];
}

const ChatView: React.FC<ChatViewProps> = ({ messages }) => {
  return (
    <div className="chat-view">
      {messages.length === 0 ? (
        <div className="chat-welcome">
          <h2>Welcome, Victor</h2>
          <p>Hold the microphone button to speak to Marcus.</p>
        </div>
      ) : (
        messages.map((message, index) => (
          <div
            key={index}
            className={`message ${message.isUser ? 'user' : 'assistant'}`}
          >
            <p>{message.text}</p>
          </div>
        ))
      )}
    </div>
  );
};

export default ChatView;
