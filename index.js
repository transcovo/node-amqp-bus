'use strict';

const co = require('co');
const amqplib = require('amqplib');

const EXCHANGE = 'bus';
const EXCHANGE_TYPE = 'topic';

module.exports.createBusClient = co.wrap(function* createBusClient(url) {
  const connection = yield amqplib.connect(url);
  const channel = yield connection.createChannel();

  return {
    listen: (queue, routingKey, options, listener) => co(function* listen() {
      if (!listener) {
        listener = options;
        options = {};
      }
      yield channel.assertQueue(queue, options);
      yield channel.assertExchange(EXCHANGE, EXCHANGE_TYPE);
      yield channel.bindQueue(queue, EXCHANGE, routingKey);
      channel.consume(queue, message => {
        listener(JSON.parse(message.content), err => {
          return channel[err ? 'reject' : 'ack'](message);
        });
      });
    }),
    publish: (routingKey, message) => new Promise(resolve =>
      resolve(channel.publish(EXCHANGE, routingKey, new Buffer(JSON.stringify(message)))))
  };
});
