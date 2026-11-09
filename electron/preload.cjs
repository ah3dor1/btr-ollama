'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('btr', {
  platform: process.platform,
  loadStore: () => ipcRenderer.invoke('store:load'),
  saveStore: (payload) => ipcRenderer.invoke('store:save', payload),
  listModels: (baseUrl) => ipcRenderer.invoke('ollama:models', baseUrl),
  getVersion: (baseUrl) => ipcRenderer.invoke('ollama:version', baseUrl),
  showModel: (baseUrl, model) => ipcRenderer.invoke('ollama:show', { baseUrl, model }),
  searchModels: (provider, query) => ipcRenderer.invoke('hub:search', { provider, query }),
  zoom: (direction) => ipcRenderer.invoke('window:zoom', direction),
  pullModel: (payload) => ipcRenderer.invoke('models:pull', payload),
  abortPull: (pullId) => ipcRenderer.invoke('models:pull-abort', pullId),
  onModelPull: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('model:pull', handler);
    return () => ipcRenderer.removeListener('model:pull', handler);
  },
  startChat: (payload) => ipcRenderer.invoke('chat:start', payload),
  abortChat: (requestId) => ipcRenderer.invoke('chat:abort', requestId),
  exportChat: (name, content) => ipcRenderer.invoke('dialog:export', { name, content }),
  openExternal: (url) => ipcRenderer.invoke('shell:open', url),
  pickProject: () => ipcRenderer.invoke('agent:pick-project'),
  agentChat: (payload) => ipcRenderer.invoke('agent:chat', payload),
  abortAgent: (requestId) => ipcRenderer.invoke('agent:abort', requestId),
  runAgentTool: (payload) => ipcRenderer.invoke('agent:tool', payload),
  onChatEvent: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on('chat:event', handler);
    return () => ipcRenderer.removeListener('chat:event', handler);
  },
});
