import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InventoryAlertService } from "./inventory-alert.service.js";

@Injectable()
export class InventoryAlertSchedulerService {
  private readonly logger = new Logger(InventoryAlertSchedulerService.name);

  constructor(private readonly inventoryAlertService: InventoryAlertService) {}

  @Cron("0 2 * * *")
  async generateNightlyInventoryAlerts(): Promise<void> {
    this.logger.log("Starting scheduled inventory alert generation");
    const result = await this.inventoryAlertService.generateStockoutAlerts();
    this.logger.log(
      `Finished scheduled inventory alert generation stockRisk=${result.stockRiskCreated} outOfStock=${result.outOfStockCreated}`,
    );
  }
}
