import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEpisodeRequests1791439384331 implements MigrationInterface {
  name = 'AddEpisodeRequests1791439384331';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_6f14737e346d6b27d8e50d2157"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_season_request" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "seasonNumber" integer NOT NULL, "status" integer NOT NULL DEFAULT (1), "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "requestId" integer, "episodes" text, CONSTRAINT "FK_6f14737e346d6b27d8e50d2157a" FOREIGN KEY ("requestId") REFERENCES "media_request" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_season_request"("id", "seasonNumber", "status", "createdAt", "updatedAt", "requestId") SELECT "id", "seasonNumber", "status", "createdAt", "updatedAt", "requestId" FROM "season_request"`
    );
    await queryRunner.query(`DROP TABLE "season_request"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_season_request" RENAME TO "season_request"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6f14737e346d6b27d8e50d2157" ON "season_request" ("requestId") `
    );
    await queryRunner.query(`DROP INDEX "IDX_f4fc4efa14c3ba2b29c4525fa1"`);
    await queryRunner.query(`DROP INDEX "IDX_6997bee94720f1ecb7f3113709"`);
    await queryRunner.query(`DROP INDEX "IDX_a1aa713f41c99e9d10c48da75a"`);
    await queryRunner.query(`DROP INDEX "IDX_4c696e8ed36ae34fe18abe59d2"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_media_request" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "status" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "type" varchar NOT NULL, "mediaId" integer, "requestedById" integer, "modifiedById" integer, "is4k" boolean NOT NULL DEFAULT (0), "serverId" integer, "profileId" integer, "rootFolder" varchar, "languageProfileId" integer, "tags" text, "isAutoRequest" boolean NOT NULL DEFAULT (0), "ignoreQuota" boolean NOT NULL DEFAULT (0), "declineReason" text, "monitorMode" varchar, CONSTRAINT "FK_a1aa713f41c99e9d10c48da75a0" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_6997bee94720f1ecb7f31137095" FOREIGN KEY ("requestedById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_f4fc4efa14c3ba2b29c4525fa15" FOREIGN KEY ("modifiedById") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_media_request"("id", "status", "createdAt", "updatedAt", "type", "mediaId", "requestedById", "modifiedById", "is4k", "serverId", "profileId", "rootFolder", "languageProfileId", "tags", "isAutoRequest", "ignoreQuota", "declineReason") SELECT "id", "status", "createdAt", "updatedAt", "type", "mediaId", "requestedById", "modifiedById", "is4k", "serverId", "profileId", "rootFolder", "languageProfileId", "tags", "isAutoRequest", "ignoreQuota", "declineReason" FROM "media_request"`
    );
    await queryRunner.query(`DROP TABLE "media_request"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_media_request" RENAME TO "media_request"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f4fc4efa14c3ba2b29c4525fa1" ON "media_request" ("modifiedById") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6997bee94720f1ecb7f3113709" ON "media_request" ("requestedById") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a1aa713f41c99e9d10c48da75a" ON "media_request" ("mediaId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_4c696e8ed36ae34fe18abe59d2" ON "media_request" ("status") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_4c696e8ed36ae34fe18abe59d2"`);
    await queryRunner.query(`DROP INDEX "IDX_a1aa713f41c99e9d10c48da75a"`);
    await queryRunner.query(`DROP INDEX "IDX_6997bee94720f1ecb7f3113709"`);
    await queryRunner.query(`DROP INDEX "IDX_f4fc4efa14c3ba2b29c4525fa1"`);
    await queryRunner.query(
      `ALTER TABLE "media_request" RENAME TO "temporary_media_request"`
    );
    await queryRunner.query(
      `CREATE TABLE "media_request" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "status" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "type" varchar NOT NULL, "mediaId" integer, "requestedById" integer, "modifiedById" integer, "is4k" boolean NOT NULL DEFAULT (0), "serverId" integer, "profileId" integer, "rootFolder" varchar, "languageProfileId" integer, "tags" text, "isAutoRequest" boolean NOT NULL DEFAULT (0), "ignoreQuota" boolean NOT NULL DEFAULT (0), "declineReason" text, CONSTRAINT "FK_a1aa713f41c99e9d10c48da75a0" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_6997bee94720f1ecb7f31137095" FOREIGN KEY ("requestedById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_f4fc4efa14c3ba2b29c4525fa15" FOREIGN KEY ("modifiedById") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "media_request"("id", "status", "createdAt", "updatedAt", "type", "mediaId", "requestedById", "modifiedById", "is4k", "serverId", "profileId", "rootFolder", "languageProfileId", "tags", "isAutoRequest", "ignoreQuota", "declineReason") SELECT "id", "status", "createdAt", "updatedAt", "type", "mediaId", "requestedById", "modifiedById", "is4k", "serverId", "profileId", "rootFolder", "languageProfileId", "tags", "isAutoRequest", "ignoreQuota", "declineReason" FROM "temporary_media_request"`
    );
    await queryRunner.query(`DROP TABLE "temporary_media_request"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_4c696e8ed36ae34fe18abe59d2" ON "media_request" ("status") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a1aa713f41c99e9d10c48da75a" ON "media_request" ("mediaId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_6997bee94720f1ecb7f3113709" ON "media_request" ("requestedById") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f4fc4efa14c3ba2b29c4525fa1" ON "media_request" ("modifiedById") `
    );
    await queryRunner.query(`DROP INDEX "IDX_6f14737e346d6b27d8e50d2157"`);
    await queryRunner.query(
      `ALTER TABLE "season_request" RENAME TO "temporary_season_request"`
    );
    await queryRunner.query(
      `CREATE TABLE "season_request" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "seasonNumber" integer NOT NULL, "status" integer NOT NULL DEFAULT (1), "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "requestId" integer, CONSTRAINT "FK_6f14737e346d6b27d8e50d2157a" FOREIGN KEY ("requestId") REFERENCES "media_request" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "season_request"("id", "seasonNumber", "status", "createdAt", "updatedAt", "requestId") SELECT "id", "seasonNumber", "status", "createdAt", "updatedAt", "requestId" FROM "temporary_season_request"`
    );
    await queryRunner.query(`DROP TABLE "temporary_season_request"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_6f14737e346d6b27d8e50d2157" ON "season_request" ("requestId") `
    );
  }
}
