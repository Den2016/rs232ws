// preload.js

const { contextBridge, ipcRenderer } = require('electron');

console.log('Preload script loaded!');
console.log('contextBridge:', contextBridge);
console.log('ipcRenderer:', ipcRenderer);



// Доступные каналы IPC
const validChannels = ['get-settings', 'update-settings', 'get-available-ports'];

// Безопасное взаимодействие между render-процессом и main-процессом
contextBridge.exposeInMainWorld('electronAPI', {
    // Отправляет сообщение в главный процесс
    send: (channel, data) => {
        if (validChannels.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },

    // Получает асинхронный ответ от главного процесса
    invoke: async (channel, data) => {
        if (validChannels.includes(channel)) {
            return await ipcRenderer.invoke(channel, data);
        }
    },

    // Прислушивается к событиям из основного процесса
    on: (channel, func) => {
        let validChannels = ['status-message'];        
        if (validChannels.includes(channel)) {
            ipcRenderer.on(channel, (_, ...args) => func(...args));
        }
    },

    // Получает текущие настройки
    getSettings: async () => {
        return await ipcRenderer.invoke('get-settings');
    },

    // Получает список доступных COM-портов
    getAvailablePorts: async () => {
        return await ipcRenderer.invoke('get-available-ports');
    },

    // Обновляет настройки
    updateSettings: async (settings) => {
        return await ipcRenderer.invoke('update-settings', settings);
    },

    closeSerialPort: async () => {
        return await ipcRenderer.invoke('close-serial-port');
    },    
    
});

console.log('Preload script loaded!');