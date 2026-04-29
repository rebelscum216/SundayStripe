import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

const port = Number(process.env.PORT ?? 3001);

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.setGlobalPrefix("api");
  app.enableCors({
    origin: process.env.WEB_APP_URL ?? "http://localhost:3000"
  });

  await app.listen(port);
  console.log(`API listening on http://localhost:${port}`);
}

void bootstrap();
