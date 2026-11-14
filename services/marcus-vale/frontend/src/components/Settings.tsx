import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = '/api';

const Settings: React.FC = () => {
  const [spendStatus, setSpendStatus] = useState<{
    total_spend: number;
    cap: number;
    warning_threshold: number;
    is_warning: boolean;
    is_blocked: boolean;
  } | null>(null);

  useEffect(() => {
    fetchSpendStatus();
  }, []);

  const fetchSpendStatus = async () => {
    try {
      const response = await axios.get(`${API_BASE}/spend/status`);
      setSpendStatus(response.data);
    } catch (error) {
      console.error('Error fetching spend status:', error);
    }
  };

  return (
    <div className="settings">
      <h2>⚙️ Settings</h2>
      
      <div className="section">
        <h3>💰 Spend Cap</h3>
        {spendStatus && (
          <div className="spend-status">
            <p>Total Spend: ${spendStatus.total_spend.toFixed(2)}</p>
            <p>Cap: ${spendStatus.cap.toFixed(2)}</p>
            <p>Warning Threshold: ${spendStatus.warning_threshold.toFixed(2)}</p>
            <p className={spendStatus.is_warning ? 'warning' : spendStatus.is_blocked ? 'error' : ''}>
              Status: {spendStatus.is_blocked ? 'BLOCKED' : spendStatus.is_warning ? 'WARNING' : 'OK'}
            </p>
          </div>
        )}
      </div>
      
      <div className="section">
        <h3>🔊 Voice Settings</h3>
        <p>STT: Whisper (via OmniRoute)</p>
        <p>TTS: Kokoro (via OmniRoute)</p>
      </div>
      
      <div className="section">
        <h3>🤖 ECHELON Integration</h3>
        <p>Status: Connected</p>
      </div>
    </div>
  );
};

export default Settings;
