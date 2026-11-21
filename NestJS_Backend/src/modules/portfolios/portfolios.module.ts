import { Module } from '@nestjs/common';
import { PortfolioController } from './portfolio.controller.js';
import { PortfolioService } from './portfolio.service.js';

/** Minimal portfolio list (system admins); PMO extends it with streams and leads. */
@Module({ controllers: [PortfolioController], providers: [PortfolioService] })
export class PortfoliosModule {}
