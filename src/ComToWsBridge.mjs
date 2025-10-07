import { SerialPort } from 'serialport';
import { WebSocketServer } from 'ws';
import { ReadlineParser } from '@serialport/parser-readline';
import { autoDetect } from '@serialport/bindings-cpp';

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

export default class ComToWsBridge {
  #portName;
  #baudRate;
  #webSocketPort;
  #wss;
  #port;
  #parser;
  #usePort;
  #events = [];

  constructor(portName, baudRate, webSocketPort, usePort = true) {
    this.#portName = portName;
    this.#baudRate = parseInt(baudRate);
    this.#webSocketPort = parseInt(webSocketPort);
    this.#usePort = usePort; // Добавлено свойство для использования порта
    this.initWebSocketServer();
    this.initSerialPort();
  }

  addListener(eventName, callback) {
    if (typeof callback === 'function') { // Проверяем, что callback - это функция
      this.#events.push({ eventName, callback });   
    }
  }

  removeListener(eventName, callback) {  
    this.#events = this.#events.filter(event => {
      return !(event.eventName === eventName && event.callback === callback);
    });
  }

  initSerialPort() {
    if (!this.#usePort) {
      console.log('Serial port usage is disabled. Skipping initialization.');   
    }else{
      this.#port = new SerialPort({ path: this.#portName, baudRate: this.#baudRate });
      this.#parser = this.#port.pipe(new ReadlineParser());

      this.#parser.on('data', data => {
        console.log(`Received data from serial port: ${data}`);
        this.#events.forEach(event => {
          if (event.eventName === 'data') {
            event.callback(data); // Вызываем коллбек для события 'data'
          }
        });
        if (this.#wss && this.#wss.clients.size > 0) {
          this.#wss.clients.forEach(client => {
            if (client.readyState === client.OPEN) {
              client.send(data);
              console.log(`Sent to client: ${data}`);
            }
          });
        }else{
          console.log('No WebSocket clients connected. Data not sent.');
          
        }
      });

      this.#port.on('close', () => {
        console.log('Serial port closed.');
      });

      this.#port.on('error', err => {
        console.error('Error on serial port:', err.message);
      });
    }
  }

  // reopenSerialPort() {
  //   if (this.#port) {
  //     this.#port.close(() => {
  //       console.log('Serial port closed. Reopening...');  
  //       this.initSerialPort(); // Повторно открываем порт
  //     });
  //   } else {
  //     console.log('Serial port is not initialized. Opening...');
  //     this.initSerialPort(); // Инициализируем порт, если он еще не открыт
  //   }
  // }

  // Функция для отключения всех клиентов
  closeAllClients() {
    for (let client of this.#wss.clients) { // Проходим по существующим клиентам
      if (client.readyState === WebSocket.OPEN) {
        client.close(); // Мягкое закрытие соединения
      }
    }
  }



  initWebSocketServer() {
    this.#wss = new WebSocketServer({ port: this.#webSocketPort });

    this.#wss.on('connection', ws => {
      console.log('New client connected!');

      ws.on('message', async message => {
        try {
          await this.#port.write(message + '\n');
          console.log(`Sent to serial port: ${message}`);
        } catch (err) {
          console.error('Error sending to serial port:', err.message);
        }
      });

      ws.on('close', () => {
        console.log('Client disconnected.');
      });
    });

    this.#wss.on('listening', () => {
      console.log(`WebSocket server started on port ${this.#webSocketPort}`);
    });
  }

  setWebSocketPort(newPort) {
    newPort = parseInt(newPort);
    if (newPort !== this.#webSocketPort) {
      this.#webSocketPort = newPort;
      this.stopWebSocketServer(); // Закрывает предыдущий сервер
      this.initWebSocketServer(); // Запускает новый сервер
    }
  }

  async stopWebSocketServer() {
    if (this.#wss) {
      this.closeAllClients(); // Закрываем всех клиентов
      await this.#wss.close()
      console.log(Date.now(),'WebSocket server stopped.');
      this.#wss = null; // Освобождаем память
    }
  }

  setBaudRate(newBaudRate) {
    newBaudRate = parseInt(newBaudRate);
    if (newBaudRate !== this.#baudRate) {
      this.#baudRate = newBaudRate;
      this.stopSerialPort(); // Закрывает текущий порт
      this.initSerialPort(); // Повторно открывает порт с новой скоростью
    }
  }

  setComPortAndBaudRate(newPortName, newBaudRate) {
    newBaudRate = parseInt(newBaudRate);
    if (newPortName !== this.#portName || newBaudRate !== this.#baudRate) {
      this.#portName = newPortName;
      this.setBaudRate(newBaudRate); // Используется ранее созданный метод
    }
  }

  async stopSerialPort() {
    if (this.#port) {
      await this.#port.close()
      console.log(Date.now(),'Serial port closed.');
      this.#port = null; // Освобождаем память
      this.#parser = null; // Освобождаем память    
    }
  }

  closeAll() {
    this.stopSerialPort();
    this.stopWebSocketServer();
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

// // Пример использования:
// (async function main() {
//   const bridge = new ComToWsBridge('COM5', 9600, 58081);

//   // Получить доступные порты
//   const ports = await bridge.getAvailablePorts();
//   console.log("Доступные порты:", ports);
// })();