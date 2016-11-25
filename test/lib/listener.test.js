'use strict';

const { expect } = require('chai');
const sinon = require('sinon');
const logger = require('chpr-logger');

const bus = require('../../index.js');

describe('Node AMQP Bus Listener', function testBus() {
  describe('#createListener()', function () {
    it('should create a listener', function () {
      let listener;
      let error;

      try {
        listener = bus.createListener();
      } catch (e) {
        error = e;
      }

      expect(error).to.not.exist();
      expect(listener).to.exist();
    });

    it('should create a listener with all the properties', function () {
      const listener = bus.createListener();

      expect(listener).to.have.property('queues');
      expect(listener).to.have.property('handlers');
      expect(listener).to.have.property('listen');
      expect(listener).to.have.property('addHandler');
      expect(listener).to.have.property('client');
    });
  });

  describe('#addHandler()', function () {
    it('should declare a handler', function () {
      let error;
      const listener = bus.createListener();

      try {
        listener.addHandler('my-queue', 'my-key', function myFunc() {});
      } catch (e) {
        error = e;
      }

      expect(error).to.not.exist();
    });

    it('should create relevant structs', function () {
      const listener = bus.createListener();

      listener.addHandler('my-queue-1', 'my-key-1', function myFunc1() {});
      listener.addHandler('my-queue-1', 'my-key-2', function myFunc2() {});
      listener.addHandler('my-queue-2', 'my-key-3', function myFunc3() {});
      listener.addHandler('my-queue-3', 'my-key-4', function myFunc4() {});

      expect(listener.handlers).to.have.deep.property('my-queue-1.my-key-1');
      expect(listener.handlers).to.have.deep.property('my-queue-1.my-key-2');
      expect(listener.handlers).to.have.deep.property('my-queue-2.my-key-3');
      expect(listener.handlers).to.have.deep.property('my-queue-3.my-key-4');
      expect(listener.queues).to.eql(['my-queue-1', 'my-queue-2', 'my-queue-3']);
    });
  });

  describe('listen()', function () {
    let sandbox;

    before(() => {
      sandbox = sinon.sandbox.create();
    });

    afterEach(() => {
      sandbox.restore();
    });

    it('should listen to the exchange (first call)', function*() {
      const client = {
        setupQueue: sandbox.stub().returns(Promise.resolve()),
        consume: sandbox.stub().returns(Promise.resolve()),
        on: sandbox.stub()
      };
      const service = bus.createListener('url', { client });

      const queue1 = 'MY_QUEUE_NAME_1';
      const key1 = 'SOME_EVENT_1';
      const handler1 = function* someHandler() {};
      const key2 = 'SOME_EVENT_2';
      const handler2 = function* anotherHandler() {};
      const queue2 = 'MY_QUEUE_NAME_2';

      service.addHandler(queue1, key1, handler1);
      service.addHandler(queue2, key2, handler2);

      yield service.listen('EXCHANGE');

      expect(client.setupQueue.callCount).to.equal(2);
      expect(client.consume.callCount).to.equal(2);
      expect(client.consume.getCall(0).args[0], 'MY_QUEUE_NAME_1');
      expect(client.consume.getCall(1).args[0], 'MY_QUEUE_NAME_2');
    });

    it('should call the right handler', function*() {
      const client = {
        setupQueue: sandbox.stub().returns(Promise.resolve()),
        consume: sandbox.stub().returns(Promise.resolve()),
        on: sandbox.stub()
      };
      const service = bus.createListener('url', { client });

      const queue1 = 'MY_QUEUE_NAME_1';
      const key1 = 'SOME_EVENT_1';
      const handler1 = function* someHandler() {};
      const key2 = 'SOME_EVENT_2';
      const handler2 = function* anotherHandler() {};
      const queue2 = 'MY_QUEUE_NAME_2';
      const handler3 = function* anotherAnotherHandler() {};

      service.addHandler(queue1, key1, handler1);
      service.addHandler(queue1, key2, handler2);
      service.addHandler(queue2, key1, handler3);

      sandbox.stub(logger, 'info');

      yield service.listen('EXCHANGE');

      let error;
      let response;
      try {
        response = client.consume.getCall(0).args[1]({}, { routingKey: 'SOME_EVENT_1' });
      } catch (e) {
        error = e;
      }
      try {
        yield response;
      } catch (e) {
        error = e;
      }
      try {
        response = client.consume.getCall(1).args[1]({}, { routingKey: 'SOME_EVENT_2' });
      } catch (e) {
        error = e;
      }
      try {
        yield response;
      } catch (e) {
        error = e;
      }
      expect(response).to.be.a('promise');
      expect(error).to.not.exist();
    });

    it('should call the right handler (unknown handler)', function*() {
      const client = {
        setupQueue: sandbox.stub().returns(Promise.resolve()),
        consume: sandbox.stub().returns(Promise.resolve()),
        on: sandbox.stub()
      };
      const service = bus.createListener('url', { client });

      const queue1 = 'MY_QUEUE_NAME_1';
      const key1 = 'SOME_EVENT_1';
      const handler1 = function* someHandler() {};

      service.addHandler(queue1, key1, handler1);

      sandbox.stub(logger, 'info');

      yield service.listen('EXCHANGE');

      const message = {};
      const fields = {};
      const callback1 = client.consume.getCall(0).args[1];
      let error;
      let response;
      try {
        response = callback1(message, fields);
      } catch (e) {
        error = e;
      }
      try {
        yield response;
      } catch (e) {
        error = e;
      }
      expect(response).to.be.a('promise');
      expect(error).to.not.exist();
    });

    it('should listen to the exchange (connection already exists)', function*() {
      const client = {
        setupQueue: sandbox.stub().returns(Promise.resolve()),
        consume: sandbox.stub().returns(Promise.resolve()),
        on: sandbox.stub()
      };
      const service = bus.createListener('url', { client });

      let error;

      try {
        yield service.listen('EXCHANGE');
      } catch (e) {
        error = e;
      }

      expect(error).to.not.exist();
    });

    it('should call client.setupQueue with all parameters', function*() {
      const client = {
        setupQueue: sandbox.stub().returns(Promise.resolve()),
        consume: sandbox.stub().returns(Promise.resolve()),
        on: sandbox.stub()
      };
      const service = bus.createListener('url', { client });
      const queue1 = 'MY_QUEUE_NAME_1';
      const key1 = 'SOME_EVENT_1';
      const handler1 = function* someHandler() {};
      service.addHandler(queue1, key1, handler1);

      yield service.listen('EXCHANGE', { exchangeType: 'fanout' });

      expect(client.setupQueue.args[0]).to.have.lengthOf(4);
      expect(client.setupQueue.args[0]).to.eql([
        'EXCHANGE',
        'MY_QUEUE_NAME_1',
        'SOME_EVENT_1',
        { exchangeType: 'fanout' }
      ]);
    });

    it('should not reconnect twice', function* test() {
      const service = bus.createListener('amqp://localhost');
      const connectStub = sandbox.stub();
      service.on('connect', connectStub);
      yield service.listen('EXCHANGE');
      yield service.listen('EXCHANGE');

      expect(connectStub.callCount).to.equal(1);
    });

    it('should emit an event when consume fail', function* test() {
      const service = bus.createListener('amqp://localhost');
      const errorStub = sandbox.stub();

      service.on('handle_error', errorStub);

      yield service.listen('EXCHANGE');

      const err = new Error();
      const metadata = {};
      service.client.emit('consume_error', err, metadata);
      expect(errorStub.calledOnce).to.be.true();
    });
  });
});
