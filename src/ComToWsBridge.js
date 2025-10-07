const { SerialPort } = require('serialport');
const { WebSocketServer } = require('ws');
const { ReadlineParser } = require('@serialport/parser-readline');
const { autoDetect } = require('@serialport/bindings-cpp');

/**
 * @module ComToWsBridge
 * Этот модуль реализует класс для организации моста между COM-портом и WebSocket сервером.
 *
 * ### Методы:
 * - **constructor(portName, baudRate, webSocketPort)** - конструктор класса, принимает имя порта, скорость обмена и порт WebSocket сервера.
 * - **initSerialPort()** - настройка и инициализация последовательного порта.
 * - **closeAllClients()** - отключение всех клиентов WebSocket.
 * - **initWebSocketServer()** - инициализация и запуск WebSocket сервера.
 * - **setWebSocketPort(newPort)** - смена номера порта WebSocket сервера и последующий перезапуск.
 * - **stopWebSocketServer()** - остановка текущего WebSocket сервера.
 * - **setBaudRate(newBaudRate)** - установка новой скорости обмена данными и повторное открытие порта.
 * - **setComPortAndBaudRate(newPortName, newBaudRate)** - одновременная замена имени порта и скорости.
 * - **stopSerialPort()** - закрытие активного последовательного порта.
 * - **closeAll()** - полная очистка ресурсов (закрытие порта и останов WebSocket сервера).
 * - **getAvailablePorts()** - получение списка доступных COM-портов.
 */

class ComToWsBridge {
  constructor(portName, baudRate, webSocketPort, usePort = true) {
    this._portName = portName;
    this._baudRate = parseInt(baudRate, 10);
    this._webSocketPort = parseInt(webSocketPort, 10);
    this._usePort = usePort;
    this._wss = null;
    this._port = null;
    this._parser = null;
    this._events = [];

    this.initWebSocketServer();
    this.initSerialPort();
  }

  addListener(eventName, callback) {
    if (typeof callback === 'function') {
      this._events.push({ eventName, callback });
    }
  }

  removeListener(eventName, callback) {
    this._events = this._events.filter(event => {
      return !(event.eventName === eventName && event.callback === callback);
    });
  }

  initSerialPort() {
    if (!this._usePort) {
      console.log('Serial port usage is disabled. Skipping initialization.');
      return;
    }

    try {
      this._port = new SerialPort({ path: this._portName, baudRate: this._baudRate });
      this._parser = this._port.pipe(new ReadlineParser());

      this._parser.on('data', data => {
        console.log(`Received data from serial port: ${data}`);
        this._events.forEach(event => {
          if (event.eventName === 'data') {
            event.callback(data);
          }
        });

        if (this._wss && this._wss.clients.size > 0) {
          this._wss.clients.forEach(client => {
            if (client.readyState === client.OPEN) {
              client.send(data);
              console.log(`Sent to client: ${data}`);
            }
          });
        } else {
          console.log('No WebSocket clients connected. Data not sent.');
        }
      });

      this._port.on('close', () => {
        console.log('Serial port closed.');
      });

      this._port.on('error', err => {
        console.error('Error on serial port:', err.message);
      });
    } catch (err) {
      console.error('Failed to initialize serial port:', err);
    }
  }

  closeAllClients() {
    if (!this._wss) return;
    for (const client of this._wss.clients) {
      if (client.readyState === client.OPEN) {
        client.close();
      }
    }
  }

  initWebSocketServer() {
    this._wss = new WebSocketServer({ port: this._webSocketPort });

    this._wss.on('connection', ws => {
      console.log('New client connected!');

      ws.on('message', async message => {
        if (!this._port || !this._port.isOpen) {
          console.warn('Serial port not open. Cannot send message.');
          return;
        }
        try {
          await this._port.write(Buffer.from(message + '\n'));
          console.log(`Sent to serial port: ${message}`);
        } catch (err) {
          console.error('Error sending to serial port:', err.message);
        }
      });

      ws.on('close', () => {
        console.log('Client disconnected.');
      });
    });

    this._wss.on('listening', () => {
      console.log(`WebSocket server started on port ${this._webSocketPort}`);
    });
  }

  setWebSocketPort(newPort) {
    newPort = parseInt(newPort, 10);
    if (newPort !== this._webSocketPort) {
      this._webSocketPort = newPort;
      this.stopWebSocketServer().then(() => {
        this.initWebSocketServer();
      }).catch(console.error);
    }
  }

  async stopWebSocketServer() {
    if (this._wss) {
      this.closeAllClients();
      await new Promise((resolve, reject) => {
        this._wss.close(err => {
          if (err) reject(err);
          else resolve();
        });
      });
      console.log(Date.now(), 'WebSocket server stopped.');
      this._wss = null;
    }
  }

  setBaudRate(newBaudRate) {
    newBaudRate = parseInt(newBaudRate, 10);
    if (newBaudRate !== this._baudRate) {
      this._baudRate = newBaudRate;
      this.stopSerialPort().then(() => {
        this.initSerialPort();
      }).catch(console.error);
    }
  }

  setComPortAndBaudRate(newPortName, newBaudRate) {
    newBaudRate = parseInt(newBaudRate, 10);
    if (newPortName !== this._portName || newBaudRate !== this._baudRate) {
      this._portName = newPortName;
      this.setBaudRate(newBaudRate);
    }
  }

  async stopSerialPort() {
    if (this._port) {
      await new Promise((resolve, reject) => {
        this._port.close(err => {
          if (err) reject(err);
          else resolve();
        });
      });
      console.log(Date.now(), 'Serial port closed.');
      this._port = null;
      this._parser = null;
    }
  }

  closeAll() {
    this.stopSerialPort().catch(console.error);
    this.stopWebSocketServer().catch(console.error);
  }

  /**
   * Получает список доступных COM-портов.
   *
   * Возвращает список объектов PortInfo, содержащий информацию о доступных последовательных портах.
   *
   * @returns {Promise<Array<PortInfo>>} Список доступных COM-портов.
   */
  async getAvailablePorts() {
    const binding = autoDetect();
    return await binding.list();
  }
}

module.exports = ComToWsBridge;