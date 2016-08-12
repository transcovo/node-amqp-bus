'use strict';

const { expect } = require('chai');
const sinon = require('sinon');

const bus = require('../../index.js');

describe.only('Node AMQP Bus Listener', function testBus() {
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
      expect(listener).to.have.property('on');
      expect(listener).to.have.property('listen');
      expect(listener).to.have.property('connection');
      expect(listener).to.have.property('client');
    });
  });

  describe('#on()', function () {
    it('should declare a handler', function () {
      let error;
      const listener = bus.createListener();

      try {
        listener.on('my-queue', 'my-key', function myFunc() {});
      } catch (e) {
        error = e;
      }

      expect(error).to.not.exist();
    });

    it('should create relevant structs', function () {
      const listener = bus.createListener();

      listener.on('my-queue-1', 'my-key-1', function myFunc1() {});
      listener.on('my-queue-1', 'my-key-2', function myFunc2() {});
      listener.on('my-queue-2', 'my-key-3', function myFunc3() {});
      listener.on('my-queue-3', 'my-key-4', function myFunc4() {});

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
      const service = bus.createListener();

      const queue1 = 'MY_QUEUE_NAME_1';
      const key1 = 'SOME_EVENT_1';
      const handler1 = function* someHandler() {};
      const key2 = 'SOME_EVENT_2';
      const handler2 = function* anotherHandler() {};
      const queue2 = 'MY_QUEUE_NAME_2';
      const handler3 = function* anotherAnotherHandler() {};

      service.on(queue1, key1, handler1);
      service.on(queue1, key2, handler2);
      service.on(queue2, key1, handler3);

      const client = {
        setupQueue: () => null,
        consume: () => null
      };
      sandbox.stub(bus, 'createListener', () => Promise.resolve(client));

      const thingy = service.listen('EXCHANGE');
      console.log(thingy, thingy instanceof Promise);
      yield thingy;

      expect(bus.createservice.callCount).to.equal(1);
      expect(service.client.setupQueue.callCount).to.equal(3);
      expect(service.client.consume.callCount).to.equal(2);
      expect(service.client.consume.getCall(0).args[0], 'MY_QUEUE_NAME_1');
      expect(service.client.consume.getCall(1).args[0], 'MY_QUEUE_NAME_2');
    });

    it('should call the right handler', function*() {
      const service = bus.createListener();

      const queue1 = 'MY_QUEUE_NAME_1';
      const key1 = 'SOME_EVENT_1';
      const handler1 = function* someHandler() {};
      const key2 = 'SOME_EVENT_2';
      const handler2 = function* anotherHandler() {};
      const queue2 = 'MY_QUEUE_NAME_2';
      const handler3 = function* anotherAnotherHandler() {};

      service.on(queue1, key1, handler1);
      service.on(queue1, key2, handler2);
      service.on(queue2, key1, handler3);

      const client = {
        setupQueue: () => null,
        consume: () => null
      };
      sandbox.stub(client, 'setupQueue', () => Promise.resolve());
      sandbox.stub(client, 'consume', () => Promise.resolve());
      sandbox.stub(bus, 'createBusClient', () => Promise.resolve(client));
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
      const queue1 = 'MY_QUEUE_NAME_1';
      const key1 = 'SOME_EVENT_1';
      const handler1 = function* someHandler() {};

      service.on(queue1, key1, handler1);

      const client = {
        setupQueue: () => null,
        consume: () => null
      };
      sandbox.stub(client, 'setupQueue', () => Promise.resolve());
      sandbox.stub(client, 'consume', () => Promise.resolve());
      sandbox.stub(bus, 'createBusClient', () => Promise.resolve(client));
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
      let error;

      try {
        yield service.listen('EXCHANGE');
      } catch (e) {
        error = e;
      }

      expect(error).to.not.exist();
    });
  });
});
