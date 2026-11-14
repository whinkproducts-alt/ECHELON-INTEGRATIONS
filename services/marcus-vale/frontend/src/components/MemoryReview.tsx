import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = '/api';

const MemoryReview: React.FC = () => {
  const [memories, setMemories] = useState<Array<{
    id: string;
    content: string;
    layer: string;
    source: string;
    timestamp: string;
  }>>([]);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchMemories();
  }, []);

  const fetchMemories = async () => {
    try {
      const response = await axios.get(`${API_BASE}/memory/`);
      setMemories(response.data.memories);
    } catch (error) {
      console.error('Error fetching memories:', error);
    }
  };

  const searchMemories = async () => {
    try {
      const response = await axios.get(`${API_BASE}/memory/search`, { params: { query: searchQuery } });
      setMemories(response.data.memories);
    } catch (error) {
      console.error('Error searching memories:', error);
    }
  };

  return (
    <div className="memory-review">
      <h2>🧠 Memory Review</h2>
      
      <div className="memory-search">
        <input
          type="text"
          placeholder="Search memories..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <button onClick={searchMemories}>Search</button>
      </div>
      
      <div className="layers">
        <div className="layer">
          <h3>📜 Layer 1 (Immutable Transcript)</h3>
          {memories.filter(m => m.layer === 'layer1').map(memory => (
            <div key={memory.id} className="memory">
              <p>{memory.content}</p>
              <small>{new Date(memory.timestamp).toLocaleString()} | {memory.source}</small>
            </div>
          ))}
        </div>
        <div className="layer">
          <h3>📌 Layer 2 (Core Facts)</h3>
          {memories.filter(m => m.layer === 'layer2').map(memory => (
            <div key={memory.id} className="memory">
              <p>{memory.content}</p>
              <small>{new Date(memory.timestamp).toLocaleString()} | {memory.source}</small>
            </div>
          ))}
        </div>
        <div className="layer">
          <h3>🔍 Layer 3 (Searchable Store)</h3>
          {memories.filter(m => m.layer === 'layer3').map(memory => (
            <div key={memory.id} className="memory">
              <p>{memory.content}</p>
              <small>{new Date(memory.timestamp).toLocaleString()} | {memory.source}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MemoryReview;
