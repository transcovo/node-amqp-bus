/* eslint space-infix-ops: 1 */
'use strict';

const EventEmitter = require('events');
const amqplib = require('amqplib');
const co = require('co');

const DEFAULT_EXCHANGE_TYPE = 'topic';
const DEFAULT_HEARTBEAT = 10;
const DEFAULT_RECONNECT_TIMEOUT = 1000;

/**
 * Return a bus client with helper methods to communicate with an amqp server.
 *
 * @name  createClient.
 * @param {String} url : The url of your amqp server.
 * @param {Object} [options]
 * @param {Number} [options.heartbeat=10] : the heartbeat that you want to use.
 * @param {Number} [options.reconnectTimeout=1000] : delay to reconnect broken connections
 */
function* createClient(url, options) {
  options = options || {};
  options.heartbeat = options.heartbeat || DEFAULT_HEARTBEAT;
  options.reconnectTimeout = options.reconnectTimeout || DEFAULT_RECONNECT_TIMEOUT;

  const _reconnect = co.wrap(_connect);

  const busClient = Object.assign(Object.create(EventEmitter.prototype), {
    connection: null,
    channel: null,
    setupQueue,
    consume,
    listen,
    publish,
    close: function* close() {
      yield this.connection.close();
      this.connection = null;
      this.channel = null;
    }
  });
  yield _connect();
  _onDisconnection(busClient);
  return busClient;

  /**
   * Check that exchange and queue are created and bind exchange to queue with rooting key.
   *
   * @name  setupQueue
   * @param {String} exchange : the name of the exchange on which you want to connect.
   * @param {String} queue : the queue name
   * @param {String} rootingKey : the rooting that you want to bind.
   * @param {Object} [opts] : various options
   * @param {Object} [opts.exchangeType] : the type of exchange you want to use, default to
   * 'topic'
   * @param {Object} [opts.queueOptions] : options that you want to pass to your queue when
   * creating it.
   */
  function* setupQueue(exchange, queue, rootingKey, opts) {
    opts = opts || {};
    yield busClient.channel.assertExchange(exchange, opts.exchangeType || DEFAULT_EXCHANGE_TYPE);
    yield busClient.channel.assertQueue(queue, opts.queueOptions || {});
    yield busClient.channel.bindQueue(queue, exchange, rootingKey);
  }

  /**
   * Pass message content from messages received on queue to handler.
   * Acknowledge message if handling is succesfull.
   * Requeue message if handling throws an error.
   *
   * @name  consume
   * @param {String} queue : the queue name
   * @param {Function} handler : should be yieldable,
   * will be called with message.content and message.fields.
   * It should wrap its logic within a try...catch to treat errors that are thrown
   * and should only throw error when the message needs to be requeued.
   */
  function* consume(queue, handler) {
    yield busClient.channel.consume(queue, co.wrap(function* _consumeMessage(message) {
      const contentString = message.content.toString();
      let content;

      try {
        content = JSON.parse(contentString);
      } catch (err) {
        // https://nodejs.org/api/events.html#events_error_events
        busClient.emit('consume_error', new Error('Content is not a valid JSON'), { err, queue, message });
        return busClient.channel.ack(message);
      }

      try {
        yield handler(content, message.fields);
      } catch (err) {
        busClient.emit('consume_error', new Error('Consumer handler failed'), { err, queue, message });
        return busClient.channel.nack(message);
      }
      return busClient.channel.ack(message);
    }));
  }

  /**
   * Setup a queue and start consuming on it.
   * This method is a wrapper around the setupQueue and consume function.
   *
   * @name  listen
   * @param {String} exchange : the name of the exchange on which you want to connect.
   * @param {String} queue : the queue name
   * @param {String} rootingKey : the rooting that you want to bind.
   * @param {Function} handler : should be yieldable,
   * @param {Object} [opts] : various options that will be passed to the setupQueue method
   */
  function* listen(exchange, queue, rootingKey, handler, opts) {
    yield setupQueue(exchange, queue, rootingKey, opts);
    yield consume(queue, handler);
  }

  /**
   * Publish a message to an exchange with the given rooting key.
   *
   * @param  {String} exchange: The exchange on which you want to publish.
   * @param  {queue} rootingKey: The rooting key for your message.
   * @param  {Object} message: Your message.
   * @param  {Object} opts: options passsed to the publish function.
   * @return {Boolean} true if the message was written, false else
   */
  function publish(exchange, rootingKey, message, opts) {
    return busClient.channel.publish(exchange, rootingKey, new Buffer(JSON.stringify(message)), opts);
  }

  function* _connect() {
    busClient.connection = yield amqplib.connect(url, options);
    busClient.channel = yield busClient.connection.createChannel();
    // see error handling and reconnection https://www.cloudamqp.com/docs/nodejs.html
    // http://www.squaremobius.net/amqp.node/channel_api.html#failure
    busClient.connection.on('error', _onDisconnection);
    busClient.emit('connected');
  }

  /**
   * @return {void}
   */
  function _onDisconnection(err) {
    // for some reason the on('error') event is called twice
    // - once with an event emitter (ignored)
    // - once with an error (what we want)
    if (err.constructor === EventEmitter) return;
    busClient.emit('connection_error', new Error('Connection failed'), { err });
    setTimeout(_reconnect, options.reconnectTimeout);
  }
}

module.exports = co.wrap(createClient);
