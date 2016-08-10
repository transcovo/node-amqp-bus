'use strict';

const co = require('co');
const EventEmitter = require('events');
const bus = require('./client');

/**
 * Return a bus listener with helper methods to register listeners and listen to the bus' messages
 * The instance inherits EventEmitter and can emit following events :
 * - connected : when the listener is connected to the bus, takes no arguments
 *
 * @return {Object} bus listener instance
 */
function* createBusListener(url) {
  const _queues = [];
  const _handlers = {};

  const instance = Object.create(EventEmitter.prototype);
  instance.use = use;
  instance.listen = listen;
  instance.connection = null;
  instance.client = null;
  return instance;

  /**
   * Register a new handler for a given queue and key
   * @param {String} queue Queue
   * @param {String} key Key
   * @param {Function} handler Handler
   */
  function use(queue, key, handler) {
    if (!_handlers[queue]) {
      _queues.push(queue);
      _handlers[queue] = {};
    }
    _handlers[queue][key] = handler;
  }

  /**
   * Start listening on registered handlers. Handlers that are registered later will not be listened
   * to
   *
   * @param {String} exchange Exchange name
   */
  function* listen(exchange) {
    if (instance.connection) return instance.connection;
    instance.connection = bus.createBusClient(url);
    instance.client = yield instance.connection;
    instance.emit('connected');

    for (const queue of _queues) {
      for (const key of Object.keys(_handlers[queue])) {
        yield instance.client.setupQueue(exchange, queue, key);
      }
      yield instance.client.consume(queue, createConsumeHandler(queue));
    }
  }

  function createConsumeHandler(queue) {
    return (message, fields) => {
      let handler = _handlers[queue][fields.routingKey];
      if (!handler) handler = () => Promise.resolve();
      return co.wrap(handler)(message, fields);
    };
  }
}

module.exports = co.wrap(createBusListener);
