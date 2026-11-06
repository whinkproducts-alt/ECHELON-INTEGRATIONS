'use client';

import { createContext, useContext, useState, type Dispatch, type SetStateAction } from 'react';

type Setter<T> = Dispatch<SetStateAction<T>>;
interface Workspace {
  input:string; setInput:Setter<string>;
  activeConvId:string|null; setActiveConvId:Setter<string|null>;
  selectedProject:string|null; setSelectedProject:Setter<string|null>;
}
const Context = createContext<Workspace|null>(null);
/** In-memory only; follows the authenticated shell lifetime and never persists messages or credentials. */
export function ConversationWorkspaceProvider({children}: {children:React.ReactNode}) {
  const [input,setInput] = useState('');
  const [activeConvId,setActiveConvId] = useState<string|null>(null);
  const [selectedProject,setSelectedProject] = useState<string|null>(null);
  return <Context.Provider value={{input,setInput,activeConvId,setActiveConvId,selectedProject,setSelectedProject}}>{children}</Context.Provider>;
}
export function useConversationWorkspace() {
  const context=useContext(Context);
  if(!context) throw new Error('Conversation workspace requires the authenticated shell.');
  return context;
}
