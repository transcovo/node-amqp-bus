'use strict';

const co = require('co');
const EventEmitter = require('events');
const createClient = require('./client');

/**
 * Return a bus listener with helper methods to register listeners and listen to the bus' messages
 * The instance inherits EventEmitter and can emit following events :
 * - connected : when the listener is connected to the bus, takes no arguments
 *
 * @param {String} url Bus AMQP url
 * @param {Object} [options] options
 * @param {Object} [options.client] client to use
 * @return {Object} bus listener instance
 */
function createListener(url, options) {
  options = options || {};
  const queues = [];
  const handlers = {};

  const instance = Object.assign(Object.create(EventEmitter.prototype), {
    queues,
    handlers,
    addHandler,
    listen: co.wrap(listen),
    client: null
  });
  return instance;

  /**
   * Register a new handler for a given queue and key
   * @param {String} queue Queue
   * @param {String} key Key
   * @param {Function} handler Handler
   */
  function addHandler(queue, key, handler) {
    if (!handlers[queue]) {
      queues.push(queue);
      handlers[queue] = {};
    }
    handlers[queue][key] = handler;
  }

  /**
   * Start listening on registered handlers.
   * You should not override an existing handler after listen
   *
   * @param {String} exchange Exchange name
   * @param {Object} opts A set of options passed to `client.setupQueue`
   */
  function* listen(exchange, opts) {
    if (instance.client) return;
    instance.client = options.client || (yield createClient(url));
    instance.emit('connect');

    instance.client.on('consume_error', (err, metadata) => instance.emit('handle_error', err, metadata));

    for (const queue of queues) {
      for (const key of Object.keys(handlers[queue])) {
        yield instance.client.setupQueue(exchange, queue, key, opts);
      }
      yield instance.client.consume(queue, createConsumeHandler(queue));
    }
  }

  function createConsumeHandler(queue) {
    return (message, fields) => {
      let handler = handlers[queue][fields.routingKey];
      if (!handler) {
        handler = () => Promise.resolve();
        instance.emit('unhandle', queue, message, fields);
      }
      return co.wrap(handler)(message, fields);
    };
  }
}

module.exports = createListener;
