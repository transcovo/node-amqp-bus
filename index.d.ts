// Type definitions for node-amqp-bus 5.1.0
// Project: node-amqp-bus
// Definitions by: Chauffeur Privé
// TypeScript Version: 3.0.1

/// <reference types="node" />

import { EventEmitter } from 'events';
import { Connection, Channel } from 'amqplib';

export default Bus;

declare class Bus {
  static createClient(url: string, options?: Bus.BusOptions): BusClient;
}

export class BusClient extends EventEmitter {
  channel: Channel;
  connection: Connection;

  publish(exchange: string, routingKey: string, message: Object, options?: Bus.PublishOptions): Boolean;
}

declare namespace Bus {
  export interface BusOptions {
    heartbeat?: number;
    useConfirmChannel?: Boolean;
  }

  export interface PublishOptions {
    // publish options type not exported in the amqp types
    // https://github.com/DefinitelyTyped/DefinitelyTyped/blob/3ea5ad1/types/amqplib/properties.d.ts#L108
    [propName: string]: any;
  }
}
