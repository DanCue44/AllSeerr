import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRemovalRequest1791437591862 implements MigrationInterface {
  name = 'AddRemovalRequest1791437591862';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "removal_request" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "status" integer NOT NULL DEFAULT (1), "is4k" boolean NOT NULL DEFAULT (0), "reason" text, "declineReason" text, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "mediaId" integer, "requestedById" integer, "modifiedById" integer)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_619c474038afaa65800e7149b2" ON "removal_request" ("status") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dd25ffdd037bf91c3ba8891811" ON "removal_request" ("mediaId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d03f2118b536b25ab1a954c964" ON "removal_request" ("requestedById") `
    );
    await queryRunner.query(`DROP INDEX "IDX_619c474038afaa65800e7149b2"`);
    await queryRunner.query(`DROP INDEX "IDX_dd25ffdd037bf91c3ba8891811"`);
    await queryRunner.query(`DROP INDEX "IDX_d03f2118b536b25ab1a954c964"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_removal_request" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "status" integer NOT NULL DEFAULT (1), "is4k" boolean NOT NULL DEFAULT (0), "reason" text, "declineReason" text, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "mediaId" integer, "requestedById" integer, "modifiedById" integer, CONSTRAINT "FK_dd25ffdd037bf91c3ba8891811f" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_d03f2118b536b25ab1a954c964a" FOREIGN KEY ("requestedById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_3b5631914dc7c23ce821286c306" FOREIGN KEY ("modifiedById") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_removal_request"("id", "status", "is4k", "reason", "declineReason", "createdAt", "updatedAt", "mediaId", "requestedById", "modifiedById") SELECT "id", "status", "is4k", "reason", "declineReason", "createdAt", "updatedAt", "mediaId", "requestedById", "modifiedById" FROM "removal_request"`
    );
    await queryRunner.query(`DROP TABLE "removal_request"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_removal_request" RENAME TO "removal_request"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_619c474038afaa65800e7149b2" ON "removal_request" ("status") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dd25ffdd037bf91c3ba8891811" ON "removal_request" ("mediaId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d03f2118b536b25ab1a954c964" ON "removal_request" ("requestedById") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_d03f2118b536b25ab1a954c964"`);
    await queryRunner.query(`DROP INDEX "IDX_dd25ffdd037bf91c3ba8891811"`);
    await queryRunner.query(`DROP INDEX "IDX_619c474038afaa65800e7149b2"`);
    await queryRunner.query(
      `ALTER TABLE "removal_request" RENAME TO "temporary_removal_request"`
    );
    await queryRunner.query(
      `CREATE TABLE "removal_request" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "status" integer NOT NULL DEFAULT (1), "is4k" boolean NOT NULL DEFAULT (0), "reason" text, "declineReason" text, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "mediaId" integer, "requestedById" integer, "modifiedById" integer)`
    );
    await queryRunner.query(
      `INSERT INTO "removal_request"("id", "status", "is4k", "reason", "declineReason", "createdAt", "updatedAt", "mediaId", "requestedById", "modifiedById") SELECT "id", "status", "is4k", "reason", "declineReason", "createdAt", "updatedAt", "mediaId", "requestedById", "modifiedById" FROM "temporary_removal_request"`
    );
    await queryRunner.query(`DROP TABLE "temporary_removal_request"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_d03f2118b536b25ab1a954c964" ON "removal_request" ("requestedById") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dd25ffdd037bf91c3ba8891811" ON "removal_request" ("mediaId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_619c474038afaa65800e7149b2" ON "removal_request" ("status") `
    );
    await queryRunner.query(`DROP INDEX "IDX_d03f2118b536b25ab1a954c964"`);
    await queryRunner.query(`DROP INDEX "IDX_dd25ffdd037bf91c3ba8891811"`);
    await queryRunner.query(`DROP INDEX "IDX_619c474038afaa65800e7149b2"`);
    await queryRunner.query(`DROP TABLE "removal_request"`);
  }
}
