'use strict';

require('co-mocha')(require('mocha'));
require('should');

const Promise = require('bluebird');
const bus = require('../index');
const URL = 'amqp://guest:guest@localhost:5672';

describe('Node AMQP Bus', function testBus() {
  it('Should broadcast on all listening queues', function* testBroadcastDifferentQueues() {
    const client = yield bus.createBusClient(URL);

    let resolve1;
    const p1 = new Promise(_resolve => resolve1 = _resolve);

    yield client.listen('testBroadcastDifferentQueues-1', 'key', (message, callback) => {
      resolve1(message);
      callback();
    });

    let resolve2;
    const p2 = new Promise(_resolve => resolve2 = _resolve);

    yield client.listen('testBroadcastDifferentQueues-2', 'key', {}, (message, callback) => {
      resolve2(message);
      callback();
    });

    client.publish('key', { test: 'message' });

    const message1 = yield p1;
    message1.should.eql({ test: 'message' });

    const message2 = yield p2;
    message2.should.eql({ test: 'message' });

    yield client.close();
  });

  it('Should pass a message only once on a give queue', function* testQueueBehavior() {
    const client = yield bus.createBusClient(URL);

    let resolve1;
    const p1 = new Promise(_resolve => resolve1 = _resolve);

    yield client.listen('testQueueBehavior', 'key', (message, callback) => {
      resolve1(message);
      callback();
    });

    let resolve2;
    const p2 = new Promise(_resolve => resolve2 = _resolve);

    yield client.listen('testQueueBehavior', 'key', (message, callback) => {
      resolve2(message);
      callback();
    });

    client.publish('key', { test: 'message' });

    yield Promise.race([p1, p2]);

    (p1.isResolved() && !p2.isResolved() || !p1.isResolved() && p2.isResolved()).should.be.true();
  });

  it('Should pass a message to another queue if a given queue fails', function* testFallbackOtherQueue() {
    const client = yield bus.createBusClient(URL);

    yield client.listen('testFallbackOtherQueue-fail', 'key', (message, callback) => {
      callback(new Error('Fail'));
    });

    let resolve2;
    const p2 = new Promise(_resolve => resolve2 = _resolve);

    yield client.listen('testFallbackOtherQueue-ok', 'key', (message, callback) => {
      resolve2(message);
      callback();
    });

    client.publish('key', { test: 'message' });

    yield p2;

    p2.isResolved().should.be.true();

    yield client.close();
  });
});
