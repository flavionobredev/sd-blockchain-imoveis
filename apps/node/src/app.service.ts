import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getInfo() {
    return {
      service: 'node',
      role: process.env.ROLE ?? 'unknown',
      nodeId: process.env.NODE_ID ?? 'unknown',
    };
  }
}