import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNoBookEndsDevices1792445842672 implements MigrationInterface {
  name = 'AddNoBookEndsDevices1792445842672';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "nobookends_device" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "keyHash" varchar NOT NULL, "label" varchar, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "lastUsedAt" datetime, "userId" integer NOT NULL, CONSTRAINT "FK_a486fc747fdf13986d493b453ce" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a486fc747fdf13986d493b453c" ON "nobookends_device" ("userId") `
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d554d6484b7c11b84352b9ae2b" ON "nobookends_device" ("keyHash") `
    );
    // The one NoBookEnds key a user could have before becomes their first
    // device, so the app it was given to stays connected and can be removed
    await queryRunner.query(
      `INSERT INTO "nobookends_device" ("keyHash", "createdAt", "userId") SELECT "nobookendsKeyHash", COALESCE("nobookendsKeyCreatedAt", CURRENT_TIMESTAMP), "id" FROM "user" WHERE "nobookendsKeyHash" IS NOT NULL`
    );
    await queryRunner.query(
      `UPDATE "user" SET "nobookendsKeyHash" = NULL, "nobookendsKeyCreatedAt" = NULL WHERE "nobookendsKeyHash" IS NOT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_d554d6484b7c11b84352b9ae2b"`);
    await queryRunner.query(`DROP INDEX "IDX_a486fc747fdf13986d493b453c"`);
    await queryRunner.query(`DROP TABLE "nobookends_device"`);
  }
}
