import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';

const API_BASE = '/api';

const TaskList: React.FC = () => {
  const [tasks, setTasks] = useState<Array<{
    id: string;
    title: string;
    goal: string;
    lane: string;
    status: string;
  }>>([]);
  const [newTask, setNewTask] = useState({ title: '', goal: '', lane: 'lane1' });

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const response = await axios.get(`${API_BASE}/tasks/`);
      setTasks(response.data.tasks);
    } catch (error) {
      console.error('Error fetching tasks:', error);
    }
  };

  const createTask = async () => {
    try {
      await axios.post(`${API_BASE}/tasks/`, newTask);
      setNewTask({ title: '', goal: '', lane: 'lane1' });
      fetchTasks();
    } catch (error) {
      console.error('Error creating task:', error);
    }
  };

  return (
    <div className="task-list">
      <h2>Tasks</h2>
      
      <div className="task-form">
        <input
          type="text"
          placeholder="Task title"
          value={newTask.title}
          onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
        />
        <textarea
          placeholder="Task goal"
          value={newTask.goal}
          onChange={(e) => setNewTask({ ...newTask, goal: e.target.value })}
        />
        <select
          value={newTask.lane}
          onChange={(e) => setNewTask({ ...newTask, lane: e.target.value })}
        >
          <option value="lane1">Lane 1 (Marcus)</option>
          <option value="lane2">Lane 2 (ECHELON)</option>
          <option value="lane3">Lane 3 (Victor)</option>
        </select>
        <button onClick={createTask}>Add Task</button>
      </div>
      
      <div className="lanes">
        <div className="lane">
          <h3>📌 Lane 1 (Marcus)</h3>
          {tasks.filter(t => t.lane === 'lane1').map(task => (
            <div key={task.id} className="task">
              <h4>{task.title}</h4>
              <p>{task.goal}</p>
              <span className={`status ${task.status}`}>{task.status}</span>
            </div>
          ))}
        </div>
        <div className="lane">
          <h3>🤖 Lane 2 (ECHELON)</h3>
          {tasks.filter(t => t.lane === 'lane2').map(task => (
            <div key={task.id} className="task">
              <h4>{task.title}</h4>
              <p>{task.goal}</p>
              <span className={`status ${task.status}`}>{task.status}</span>
            </div>
          ))}
        </div>
        <div className="lane">
          <h3>👤 Lane 3 (Victor)</h3>
          {tasks.filter(t => t.lane === 'lane3').map(task => (
            <div key={task.id} className="task">
              <h4>{task.title}</h4>
              <p>{task.goal}</p>
              <span className={`status ${task.status}`}>{task.status}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default TaskList;
