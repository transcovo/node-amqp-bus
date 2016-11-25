node-amqb-bus
=====

[![Circle CI](https://circleci.com/gh/transcovo/node-amqp-bus.svg?style=shield)](https://circleci.com/gh/transcovo/node-amqp-bus)

Implements a simple bus client to exchange JSON message on queues using AMQP server.

## Install

    npm install node-amqp-bus --save

## Use

    const bus = require('node-amqp-bus');

## Listener API

### bus.createBusListener(url, [options])

Creates a listener, returns a `Listener` instance. the `options` parameter can contain a `client`
that is a node-amqp-bus client.

```
const listener = bus.createBusListener(url);
```

or

```
const client = yield bus.createBusClient(url);
const listener = yield bus.createBusListener(url, { client });
```

Note: in this case, `url` is ignored in the createBusListener call.

### listener.addHandler(queue, key, handler, options)

Add a new handler to the listener. If you add two handlers with the same queue and key

`options` will be passed to `client.createQueue`.

### EventEmitter interface

You can use `listener` as an EventEmitter. It emits the following events =

  - `connect()` : emitted once, when the first call to listen() is made
  - `handle_error(err, { err, queue, message })` : emitted when a message cannot be consumed
    correctly by the client (not a JSON, handler failed)

## Client API

### bus.createBusClient(url)

Creates a client. Returns a `Promise` of the client.

    const client = yield bus.createBusClient(url);

### client.close()

Closes the client. Returns a `Promise`.

    client.close();

### client.publish(exchangeName, messageKey, message)

Publishes an event to the bus.

    client.publish('your-exchange', 'the-key', message);

The message needs to be in JSON format otherwise an error will be thrown.

### client.listen(exchangeName, queueName, messageKey, handler, options)

DANGER: READ THE CODE TO UNDERSTAND HOW LISTEN WORKS:

`messageKey` SHOULD ONLY BE USED TO DO AMQP ROUTING, NOT APPLICATION ROUTING.

IF YOU WANT APPLICATION ROUTING, DO IT YOURSELF.

Listens on the bus, on the exchange / queue and to the key specified.

The handler parameter must be a yieldable, called with the following arguments:

 - `message`: the message received
 - `fields`: information about the message (primarily used by the `amqplib` library)


If you use a generator just throw an error to `nack` the message.
Be careful, a throw nack the message. Thus the message is re-inserted in the queue. You need to
handle the number of times a message can be queued before being dismissed. For example, a message with a bas format will always throw. So there is a risk to be in a infinite loop.

    yield client.listen('your-exchange', 'the-queue', 'the-key', function* (message, fields) {
      yield ...
    });

### client.connection

Raw connection object.

### client.channel

Raw channel object.

## Developement system dependencies

To run the tests, you need a local RabbitMQ responding on 'amqp://guest:guest@localhost:5672'.
