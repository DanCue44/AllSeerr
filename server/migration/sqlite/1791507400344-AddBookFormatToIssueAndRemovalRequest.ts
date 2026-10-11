import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookFormatToIssueAndRemovalRequest1791507400344 implements MigrationInterface {
  name = 'AddBookFormatToIssueAndRemovalRequest1791507400344';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_da88a1019c850d1a7b143ca02e"`);
    await queryRunner.query(`DROP INDEX "IDX_10b17b49d1ee77e7184216001e"`);
    await queryRunner.query(`DROP INDEX "IDX_276e20d053f3cff1645803c95d"`);
    await queryRunner.query(`DROP INDEX "IDX_53d04c07c3f4f54eae372ed665"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_issue" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "issueType" integer NOT NULL, "status" integer NOT NULL DEFAULT (1), "problemSeason" integer NOT NULL DEFAULT (0), "problemEpisode" integer NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "mediaId" integer, "createdById" integer, "modifiedById" integer, "bookFormat" varchar, CONSTRAINT "FK_276e20d053f3cff1645803c95d8" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_10b17b49d1ee77e7184216001e0" FOREIGN KEY ("createdById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_da88a1019c850d1a7b143ca02e5" FOREIGN KEY ("modifiedById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_issue"("id", "issueType", "status", "problemSeason", "problemEpisode", "createdAt", "updatedAt", "mediaId", "createdById", "modifiedById") SELECT "id", "issueType", "status", "problemSeason", "problemEpisode", "createdAt", "updatedAt", "mediaId", "createdById", "modifiedById" FROM "issue"`
    );
    await queryRunner.query(`DROP TABLE "issue"`);
    await queryRunner.query(`ALTER TABLE "temporary_issue" RENAME TO "issue"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_da88a1019c850d1a7b143ca02e" ON "issue" ("modifiedById") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_10b17b49d1ee77e7184216001e" ON "issue" ("createdById") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_276e20d053f3cff1645803c95d" ON "issue" ("mediaId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_53d04c07c3f4f54eae372ed665" ON "issue" ("issueType") `
    );
    await queryRunner.query(`DROP INDEX "IDX_d03f2118b536b25ab1a954c964"`);
    await queryRunner.query(`DROP INDEX "IDX_dd25ffdd037bf91c3ba8891811"`);
    await queryRunner.query(`DROP INDEX "IDX_619c474038afaa65800e7149b2"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_removal_request" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "status" integer NOT NULL DEFAULT (1), "is4k" boolean NOT NULL DEFAULT (0), "reason" text, "declineReason" text, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "mediaId" integer, "requestedById" integer, "modifiedById" integer, "bookFormat" varchar, CONSTRAINT "FK_3b5631914dc7c23ce821286c306" FOREIGN KEY ("modifiedById") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE NO ACTION, CONSTRAINT "FK_d03f2118b536b25ab1a954c964a" FOREIGN KEY ("requestedById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_dd25ffdd037bf91c3ba8891811f" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_removal_request"("id", "status", "is4k", "reason", "declineReason", "createdAt", "updatedAt", "mediaId", "requestedById", "modifiedById") SELECT "id", "status", "is4k", "reason", "declineReason", "createdAt", "updatedAt", "mediaId", "requestedById", "modifiedById" FROM "removal_request"`
    );
    await queryRunner.query(`DROP TABLE "removal_request"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_removal_request" RENAME TO "removal_request"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d03f2118b536b25ab1a954c964" ON "removal_request" ("requestedById") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dd25ffdd037bf91c3ba8891811" ON "removal_request" ("mediaId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_619c474038afaa65800e7149b2" ON "removal_request" ("status") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_619c474038afaa65800e7149b2"`);
    await queryRunner.query(`DROP INDEX "IDX_dd25ffdd037bf91c3ba8891811"`);
    await queryRunner.query(`DROP INDEX "IDX_d03f2118b536b25ab1a954c964"`);
    await queryRunner.query(
      `ALTER TABLE "removal_request" RENAME TO "temporary_removal_request"`
    );
    await queryRunner.query(
      `CREATE TABLE "removal_request" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "status" integer NOT NULL DEFAULT (1), "is4k" boolean NOT NULL DEFAULT (0), "reason" text, "declineReason" text, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "mediaId" integer, "requestedById" integer, "modifiedById" integer, CONSTRAINT "FK_3b5631914dc7c23ce821286c306" FOREIGN KEY ("modifiedById") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE NO ACTION, CONSTRAINT "FK_d03f2118b536b25ab1a954c964a" FOREIGN KEY ("requestedById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_dd25ffdd037bf91c3ba8891811f" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "removal_request"("id", "status", "is4k", "reason", "declineReason", "createdAt", "updatedAt", "mediaId", "requestedById", "modifiedById") SELECT "id", "status", "is4k", "reason", "declineReason", "createdAt", "updatedAt", "mediaId", "requestedById", "modifiedById" FROM "temporary_removal_request"`
    );
    await queryRunner.query(`DROP TABLE "temporary_removal_request"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_619c474038afaa65800e7149b2" ON "removal_request" ("status") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dd25ffdd037bf91c3ba8891811" ON "removal_request" ("mediaId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d03f2118b536b25ab1a954c964" ON "removal_request" ("requestedById") `
    );
    await queryRunner.query(`DROP INDEX "IDX_53d04c07c3f4f54eae372ed665"`);
    await queryRunner.query(`DROP INDEX "IDX_276e20d053f3cff1645803c95d"`);
    await queryRunner.query(`DROP INDEX "IDX_10b17b49d1ee77e7184216001e"`);
    await queryRunner.query(`DROP INDEX "IDX_da88a1019c850d1a7b143ca02e"`);
    await queryRunner.query(`ALTER TABLE "issue" RENAME TO "temporary_issue"`);
    await queryRunner.query(
      `CREATE TABLE "issue" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "issueType" integer NOT NULL, "status" integer NOT NULL DEFAULT (1), "problemSeason" integer NOT NULL DEFAULT (0), "problemEpisode" integer NOT NULL DEFAULT (0), "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "mediaId" integer, "createdById" integer, "modifiedById" integer, CONSTRAINT "FK_276e20d053f3cff1645803c95d8" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_10b17b49d1ee77e7184216001e0" FOREIGN KEY ("createdById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_da88a1019c850d1a7b143ca02e5" FOREIGN KEY ("modifiedById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "issue"("id", "issueType", "status", "problemSeason", "problemEpisode", "createdAt", "updatedAt", "mediaId", "createdById", "modifiedById") SELECT "id", "issueType", "status", "problemSeason", "problemEpisode", "createdAt", "updatedAt", "mediaId", "createdById", "modifiedById" FROM "temporary_issue"`
    );
    await queryRunner.query(`DROP TABLE "temporary_issue"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_53d04c07c3f4f54eae372ed665" ON "issue" ("issueType") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_276e20d053f3cff1645803c95d" ON "issue" ("mediaId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_10b17b49d1ee77e7184216001e" ON "issue" ("createdById") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_da88a1019c850d1a7b143ca02e" ON "issue" ("modifiedById") `
    );
  }
}
