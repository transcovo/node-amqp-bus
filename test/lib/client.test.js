'use strict';

require('co-mocha')(require('mocha'));
require('should');
const amqplib = require('amqplib');
const { expect } = require('chai');

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
    let sandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should return an object with connection and channel', function* testCreateBusClient() {
      const busClient = yield createBusClient(URL);
      (typeof(busClient.channel.publish)).should.equal('function');
      (typeof(busClient.connection.close)).should.equal('function');

      expect(busClient.connection.listenerCount('close')).to.equal(1);
      expect(busClient.connection.listeners('close')[0].name).to.deep.equal('handleExitOnConnectionClose');
    });

    it('should create a client using a confirm channel', function* it() {
      const busClient = yield createBusClient(URL, { useConfirmChannel: true });

      expect(busClient.channel).to.respondTo('publish');
      expect(busClient.channel).to.respondTo('waitForConfirms');
    });

    it('Should exit gracefully when the connection close event is sent', function *it() {
      const processExitStub = sandbox.stub(process, 'exit');
      processExitStub
        .withArgs(1)
        .onFirstCall()
        .returns(1);

      const busClient = yield createBusClient(URL, { processExitCleanupTimeout: 1 });
      const busClientCloseSpy = sandbox.spy(busClient, 'close');

      busClient.connection.emit('close');
      yield cb => setTimeout(cb, 20);

      expect(busClientCloseSpy.calledOnce).to.equal(true);
      expect(processExitStub.calledOnce).to.equal(true);
    });

    it('Should emit a close_cleanup event, then exit gracefully when the connection close event is sent', function* it() {
      const processExitStub = sandbox.stub(process, 'exit');
      processExitStub
        .withArgs(1)
        .onFirstCall()
        .returns(1);

      const busClient = yield createBusClient(URL, { processExitCleanupTimeout: 1 });
      const busClientCloseSpy = sandbox.spy(busClient, 'close');
      let closeCleanupEventEmitted = false;

      busClient.on('close_cleanup', () => {
        closeCleanupEventEmitted = true;
      });

      busClient.connection.emit('close');
      yield cb => setTimeout(cb, 20);

      expect(closeCleanupEventEmitted).to.equal(true);
      expect(busClientCloseSpy.calledOnce).to.equal(true);
      expect(processExitStub.calledOnce).to.equal(true);
    });

    it('Should complete the cleanup operation, then exit gracefully when the connection close event is sent', function* it() {
      const processExitStub = sandbox.stub(process, 'exit');
      processExitStub
        .withArgs(1)
        .onFirstCall()
        .returns(1);

      const busClient = yield createBusClient(URL, { processExitCleanupTimeout: 10 });
      const busClientCloseSpy = sandbox.spy(busClient, 'close');
      let closeCleanupEventDone = false;

      busClient.on('close_cleanup', () => {
        setTimeout(() => {
          closeCleanupEventDone = true;
        }, 5);
      });

      busClient.connection.emit('close');
      yield cb => setTimeout(cb, 30);

      expect(closeCleanupEventDone).to.equal(true);
      expect(busClientCloseSpy.calledOnce).to.equal(true);
      expect(processExitStub.calledOnce).to.equal(true);
    });

    it('Should interrupt the cleanup operation when it exceeds the defined timeout, by exiting gracefully when the connection close event is sent', function* it() {
      const processExitStub = sandbox.stub(process, 'exit');
      processExitStub
        .withArgs(1)
        .onFirstCall()
        .returns(1);

      const busClient = yield createBusClient(URL, { processExitCleanupTimeout: 1 });
      const busClientCloseSpy = sandbox.spy(busClient, 'close');
      let forceCloseCleanupEventDone = false;

      busClient.on('close_cleanup', () => {
        setTimeout(() => {
          forceCloseCleanupEventDone = true;
        }, 20);
      });

      busClient.connection.emit('close');
      yield cb => setTimeout(cb, 10);

      expect(forceCloseCleanupEventDone).to.equal(false);
      expect(busClientCloseSpy.calledOnce).to.equal(true);
      expect(processExitStub.calledOnce).to.equal(true);
    });
  });

  describe('#close', () => {
    let sandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should close the connection (& exit process)', function* it() {
      const processExitStub = sandbox.stub(process, 'exit');
      processExitStub
        .withArgs(1)
        .onFirstCall()
        .returns(1);

      const busClient = yield createBusClient(URL);
      yield busClient.close(true);
      (busClient.connection === null).should.equal(true);
      expect(processExitStub.calledOnce).to.equal(true);
    });

    it('should close the connection (without exiting process)', function* it() {
      const processExitStub = sandbox.stub(process, 'exit');
      processExitStub
        .withArgs(1)
        .onFirstCall()
        .returns(1);

      const busClient = yield createBusClient(URL);
      yield busClient.close();
      (busClient.connection === null).should.equal(true);
      expect(processExitStub.notCalled).to.equal(true);
    });

    it('should be idempotent', function* it() {
      const busClient = yield createBusClient(URL);
      yield busClient.close();
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
      const sandbox = sinon.createSandbox();

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
