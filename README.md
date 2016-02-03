node-amqb-bus
=====

[![Circle CI](https://circleci.com/gh/transcovo/node-amqp-bus.svg?style=svg)](https://circleci.com/gh/transcovo/node-amqp-bus)

Implements a simple bus client to exchange JSON message on queues using AMQP server.

## System dependencies

To run the tests, you need a local RabbitMQ. The simplest way to do this with the 
exact versions used in production is to use the Dockerfile available here: https://github.com/transcovo/environments-tech/tree/master/docker

## Example

Create a client:

    const client = yield bus.createBusClient(URL);

Publish an event to the bus:

    yield client.publish('the-key', message);

Use the client to listen to the bus:

    yield client.listen('the-queue', 'the-key', (message, callback) => {
    
      // ... process message ...

      callback();
    });

If you need to pass additionnal options to AMQP:

    yield client.listen('the-queue', 'the-key', options, (message, callback) => {
    
      // ... process message ...

      callback();
    });

If you want to message to be reinjected in the queue because you failed:

    yield client.listen('the-queue', 'the-key', options, (message, callback) => {
    
      // ... process message ...

      callback(new Error('Epic fail'));
    });

