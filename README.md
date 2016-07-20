node-amqb-bus
=====

[![Circle CI](https://circleci.com/gh/transcovo/node-amqp-bus.svg?style=shield)](https://circleci.com/gh/transcovo/node-amqp-bus)

Implements a simple bus client to exchange JSON message on queues using AMQP server.

## Install

    npm install node-amqp-bus --save

## Use

    const bus = require('node-amqp-bus');

## API

### bus.createBusClient(url)

Creates a client. Returns a `Promise` of the client.

    const client = yield bus.createBusClient(url);

### client.close()

Closes the client. Returns a `Promise`.

    client.close();

### client.publish(exchangeName, messageKey, message)

Publishes an event to the bus.

    client.publish('your-exchange', 'the-key', message);

### client.listen(exchangeName, queueName, messageKey, handler, options)

Listens on the bus, on the exchange / queue and to the key specified.

The handler parameter can be a function or a generator, called with the following arguments:

 - `message`: the message received,
 - `fields`: information about the message (primarily used by the `amqplib` library),
 - [DEPRECATED: YOU MUST NOT USE THIS API] `callback([error])`: a callback method.


If you use a generator just throw an error to `nack` the message.

    yield client.listen('your-exchange', 'the-queue', 'the-key', function* (message, fields) {
      yield ...
    });

### client.connection

Raw connection object.

### client.channel

Raw channel object.

## Developement system dependencies

To run the tests, you need a local RabbitMQ responding on 'amqp://guest:guest@localhost:5672'.
