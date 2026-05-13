import { Module } from "@nestjs/common";
import { DatabaseModule } from "../database/database.module.js";
import { InventoryAlertSchedulerService } from "./inventory-alert-scheduler.service.js";
import { InventoryAlertService } from "./inventory-alert.service.js";

@Module({
  imports: [DatabaseModule],
  providers: [InventoryAlertService, InventoryAlertSchedulerService],
  exports: [InventoryAlertService],
})
export class InventoryModule {}
