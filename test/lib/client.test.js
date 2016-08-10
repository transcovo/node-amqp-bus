'use strict';

require('co-mocha')(require('mocha'));
require('should');
const amqplib = require('amqplib');

const createBusClient = require('../../lib/client');
const URL = 'amqp://guest:guest@localhost:5672';
const sinon = require('sinon');

/**
 * Wait for the queue to meet the condition; useful for waiting for messages to arrive, for example.
 *
 * @param {String} queue : the queue name
 * @param {Function} condition : condition handler
 * @credit https://github.com/squaremo/amqp.node/blob/master/test/channel_api.js
 * @returns {Promise} when condition match
 * @private
 */
function* waitForQueue(queue, condition) {
  const connection = yield amqplib.connect(URL);
  const channel = yield connection.createChannel();

  return new Promise(resolve => {
    /** @returns {void} */
    function check() {
      channel.checkQueue(queue).then(qok => {
        if (condition(qok)) {
          connection.close();
          return resolve(true);
        }
        process.nextTick(check);
      });
    }

    check();
  });
}


describe('Node AMQP Bus Client', function testBus() {
  describe('#createBusClient', () => {
    it('should return an object with connection and channel', function* testCreateBusClient() {
      const busClient = yield createBusClient(URL);
      (typeof(busClient.channel.publish)).should.equal('function');
      (typeof(busClient.connection.close)).should.equal('function');
    });
  });

  describe('#close', () => {
    it('should close the connection', function* it() {
      const busClient = yield createBusClient(URL);
      yield busClient.close();
      (busClient.connection === null).should.equal(true);
    });
  });

  describe('once the bus client is initialized', () => {
    const queue = 'test-queue';
    const exchange = 'test-exchange';
    const rootingKey = 'test-key';
    const messageContent = { toto: 'test' };
    let busClient;

    beforeEach(function* beforeEach() {
      const connection = yield amqplib.connect(URL);
      const channel = yield connection.createChannel();
      yield channel.deleteQueue(queue);
      yield channel.deleteExchange(exchange);
      yield connection.close();
      busClient = yield createBusClient(URL);
    });
    afterEach(function* afterEach() {
      busClient.close();
    });

    describe('#setupQueue', () => {
      it('should create an exchange, a queue and a binding', function*testCreateBusClient() {
        yield busClient.setupQueue(exchange, queue, rootingKey);

        const createdQueue = yield busClient.channel.checkQueue(queue);
        createdQueue.queue.should.equal(queue);
      });

      it('should bind queue to rootingKey', function* it() {
        yield busClient.setupQueue(exchange, queue, rootingKey);

        busClient.channel.publish(exchange, rootingKey, new Buffer('toto'));
        yield waitForQueue(queue, qok => qok.messageCount === 1);
        const message = yield busClient.channel.get(queue);
        message.content.toString().should.eql('toto');
      });
    });

    describe('#publish', () => {
      it('should publish a message to the queue bind with the rootingKey', function* it() {
        yield busClient.setupQueue(exchange, queue, rootingKey);

        const result = busClient.publish(exchange, rootingKey, messageContent);

        result.should.equal(true);
        yield waitForQueue(queue, qok => qok.messageCount === 1);
        const message = yield busClient.channel.get(queue);
        JSON.parse(message.content).should.eql(messageContent);
      });
    });

    describe('#consume', () => {
      let fakeHandler;
      const sandbox = sinon.sandbox.create();

      beforeEach(() => { fakeHandler = sandbox.spy(); });
      afterEach(() => { sandbox.restore(); });

      it('should consume previous events with the handler and acknowledge message', function* it() {
        yield busClient.setupQueue(exchange, queue, rootingKey);

        function* handler(content, fields) {
          fakeHandler(content, fields);
        }
        yield busClient.consume(queue, handler);

        busClient.publish(exchange, rootingKey, messageContent);
        yield waitForQueue(queue, qok => qok.messageCount === 0);
        fakeHandler.calledWith(messageContent).should.be.true();

        yield busClient.close();
        yield waitForQueue(queue, qok => qok.messageCount === 0);
      });

      it('should acknowledge message if handler calls callback without error', function* it() {
        yield busClient.setupQueue(exchange, queue, rootingKey);

        function* handler(content) { fakeHandler(content); }

        yield busClient.consume(queue, handler);

        busClient.publish(exchange, rootingKey, messageContent);
        yield waitForQueue(queue, qok => qok.messageCount === 0);
        fakeHandler.calledWith(messageContent).should.be.true();

        yield busClient.close();
        yield waitForQueue(queue, qok => qok.messageCount === 0);
      });

      it('should not acknowledge message if handling throws Error', function* it() {
        yield busClient.setupQueue(exchange, queue, rootingKey);

        function* handler(content) {
          fakeHandler(content);
          throw new Error('Bad handler');
        }

        yield busClient.consume(queue, handler);

        busClient.publish(exchange, rootingKey, messageContent);
        yield waitForQueue(queue, qok => qok.messageCount === 0);
        fakeHandler.calledWith(messageContent).should.be.true();

        yield busClient.close();
        yield waitForQueue(queue, qok => qok.messageCount === 1);
      });

      it('should not acknowledge message if handler calls callback with error', function* it() {
        yield busClient.setupQueue(exchange, queue, rootingKey);

        function* handler(content, fields, callback) {
          fakeHandler(content);
          callback(new Error());
        }

        yield busClient.consume(queue, handler);

        busClient.publish(exchange, rootingKey, messageContent);
        yield waitForQueue(queue, qok => qok.messageCount === 0);
        fakeHandler.calledWith(messageContent).should.be.true();

        yield busClient.close();
        yield waitForQueue(queue, qok => qok.messageCount === 1);
      });

      it('should acknowledge message if message is not JSON', function* it() {
        yield busClient.setupQueue(exchange, queue, rootingKey);
        const ackStub = sandbox.spy(busClient.channel, 'ack');

        function* handler(content, fields, callback) {
          fakeHandler(content);
          callback(new Error());
        }

        yield busClient.consume(queue, handler);
        // the client stringify the message, so we use the channel directly
        busClient.channel.publish(exchange, rootingKey, new Buffer('coucou'));
        yield waitForQueue(queue, qok => qok.messageCount === 0);

        ackStub.calledOnce.should.be.true();
        fakeHandler.called.should.be.false();
      });
    });

    describe('#listen', () => {
      let fakeHandler;

      beforeEach(() => { fakeHandler = sinon.spy(); });
      afterEach(() => { fakeHandler.reset(); });

      it('should setup queue and consume messages', function* it() {
        function* handler(content) { fakeHandler(content); }
        yield busClient.listen(exchange, queue, rootingKey, handler);
        busClient.publish(exchange, rootingKey, messageContent);

        yield busClient.consume(queue, handler);
        yield waitForQueue(queue, qok => qok.messageCount === 0);
        fakeHandler.calledWith(messageContent).should.be.true();

        yield busClient.close();
        yield waitForQueue(queue, qok => qok.messageCount === 0);
      });
    });
  });
});
