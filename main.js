// main.js
//import { app, BrowserWindow, Tray, Menu, dialog, session } from 'electron';
//import path from 'path';
//import Store from 'electron-store';
//import { ipcMain } from 'electron';
//import { URL } from 'url';
//import { fileURLToPath } from 'url';
//import ComToWsBridge from './src/ComToWsBridge.mjs';

const { app, BrowserWindow, ipcMain, Tray, Menu, dialog, session } = require('electron');
const { SerialPort } = require('serialport');
const Store = require('electron-store');
const WebSocket = require('ws');
const path = require('path');
const ComToWsBridge = require('./src/ComToWsBridge');

// ... остальной код без изменений

// Получить путь к файлу (__filename) и директорию (__dirname)
//const __filename = fileURLToPath(import.meta.url);
//const __dirname = path.dirname(__filename);
let bridge = null;




// Настройки хранилища
const store = new Store({
    schema: {
        wsPort: {
            type: 'string',
            default: '58081',
        },
        port: {
            type: 'string',
            default: 'COM1',
        },
        baudRate: {
            type: 'string',
            default: '9600',
        },
        usePort: { // добавляем новое свойство
            type: 'boolean',
            default: true, // включено по умолчанию
        },
    },
});


// Обновление настроек и перезагрузка библиотеки
async function updateSettings(settings) {
    store.set(settings);
    console.log('Updated', settings);
    if (bridge) {
        await bridge.stopSerialPort();
        await bridge.stopWebSocketServer();
        console.log('Bridge stopped. Reinitializing...');
        bridge = null;
        setTimeout(createBridge, 1000); // Задержка перед повторной инициализацией

    }
}

// Создание главного окна приложения
let mainWindow;
let trayIcon;

async function createWindow() {
    const preloadUrl = path.join(__dirname, 'preload.js');
    console.log('Preload URL:', preloadUrl);

    mainWindow = new BrowserWindow({
        width: 800,
        height: 700,
        show: false,
        icon: path.join(__dirname, 'tray-icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            cache: false,
            preload: preloadUrl,
              devTools: true 
        }
    });

    // mainWindow.webContents.openDevTools();
    await mainWindow.loadFile('src/renderer.html');
    mainWindow.on('close', event => {
        if (!app.isQuitting) {
            event.preventDefault();
            mainWindow.hide();
        }
    });
}

// Создать иконку трея
function createTray() {
    trayIcon = new Tray(path.join(__dirname, 'tray-icon.png'));

    const contextMenu = Menu.buildFromTemplate([
        { label: 'Show App', click: () => mainWindow.show() },
        { label: 'Exit', click: () => {
            app.isQuitting = true;
            app.quit();
        } }
    ]);

    trayIcon.setToolTip('RS232WS Bridge');
    trayIcon.setContextMenu(contextMenu);

    trayIcon.on('click', () => {
        mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    });
}

function createBridge() {
    if (bridge === null) {
        bridge = new ComToWsBridge(store.get('port'), store.get('baudRate'), store.get('wsPort'), store.get('usePort'));
        bridge.addListener('data', (data) => {
            console.log(`Received data: ${data}`);
            sendStatusMessage(data);
        });
        bridge.addListener('status', (status) => {
            console.log(`Port status: ${status}`);
            sendPortStatus(status);
        });
    } else {
        console.log('Bridge already exists!');
    }   
}

function sendStatusMessage(msg) {
    if (mainWindow) {
        console.log('Sending status message:', msg);
        // Отправляем сообщение в рендер-процесс    
        mainWindow.webContents.send('status-message', { msg });
    } else {
        console.error('Main window is not available to send status message.');
    }
}

function sendPortStatus(status) {
    if (mainWindow) {
        mainWindow.webContents.send('port-status', { status });
    }
}

// Основная логика приложения
app.whenReady().then(async () => {
    const ses = session.defaultSession || session.fromPartition('persist:name');
    ses.webRequest.onBeforeSendHeaders((details, callback) => {
        details.requestHeaders['Cache-Control'] = 'no-cache';
        delete details.requestHeaders['If-Modified-Since'];
        delete details.requestHeaders['If-Match'];
        delete details.requestHeaders['If-None-Match'];
        delete details.requestHeaders['If-Range'];
        callback({ cancel: false, requestHeaders: details.requestHeaders });
    });

    createTray();
    await createWindow();
    createBridge();
});

// Логика IPC (Inter Process Communication)
ipcMain.on('get-settings', (event, arg) => {
    console.log(arg.text);
    event.reply('reply-from-main', store.get('libraryPath'));
});

ipcMain.on('update-settings', (event, arg) => {
    console.log('update-settings');
    console.log(arg);
    updateSettings(arg);
});

// Регистрация обработчиков запросов
ipcMain.handle('get-settings', async (_event) => {
    return store.get();
});

ipcMain.handle('get-available-ports', async (_event) => {
    if(bridge!==null){
        return bridge.getAvailablePorts();
    }else{
        return '';
    }
});

ipcMain.handle('get-port-status', async (_event) => {
    if (bridge !== null) {
        return bridge.getPortStatus();
    }
    return 'disconnected';
});

// Добавляем обработчик для закрытия порта
ipcMain.handle('close-serial-port', async (_event) => {
    if (bridge) {
        bridge.stopSerialPort();
    }
});

// Основной цикл обновления настроек
function handleUpdateSettings(_, settings) {
    updateSettings(settings);
}

ipcMain.handle('update-settings', handleUpdateSettings);


// Завершение работы приложений при закрытии окон
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

// Реакция на активацию приложения (macOS Dock Click)
app.on('activate', () => {
    if (!mainWindow) {
        createWindow();
    }
});