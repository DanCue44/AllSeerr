import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSeasonRollover1791495020443 implements MigrationInterface {
  name = 'AddSeasonRollover1791495020443';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "season_rollover" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "status" integer NOT NULL DEFAULT (1), "is4k" boolean NOT NULL DEFAULT (0), "currentSeason" integer NOT NULL, "seasons" text NOT NULL, "preexistingSeasons" text NOT NULL, "deletePreexisting" boolean NOT NULL DEFAULT (0), "deleteAfter" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "mediaId" integer, "modifiedById" integer)`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_417e0e3247883de635429a81cf" ON "season_rollover" ("status") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_97f3a15ced10fd6de150e1b0ed" ON "season_rollover" ("mediaId") `
    );
    await queryRunner.query(`DROP INDEX "IDX_f4fc4efa14c3ba2b29c4525fa1"`);
    await queryRunner.query(`DROP INDEX "IDX_6997bee94720f1ecb7f3113709"`);
    await queryRunner.query(`DROP INDEX "IDX_a1aa713f41c99e9d10c48da75a"`);
    await queryRunner.query(`DROP INDEX "IDX_4c696e8ed36ae34fe18abe59d2"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_media_request" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "status" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "type" varchar NOT NULL, "mediaId" integer, "requestedById" integer, "modifiedById" integer, "is4k" boolean NOT NULL DEFAULT (0), "serverId" integer, "profileId" integer, "rootFolder" varchar, "languageProfileId" integer, "tags" text, "isAutoRequest" boolean NOT NULL DEFAULT (0), "ignoreQuota" boolean NOT NULL DEFAULT (0), "declineReason" text, "monitorMode" varchar, "isAudiobook" boolean NOT NULL DEFAULT (0), "preexistingSeasons" text, CONSTRAINT "FK_a1aa713f41c99e9d10c48da75a0" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_6997bee94720f1ecb7f31137095" FOREIGN KEY ("requestedById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_f4fc4efa14c3ba2b29c4525fa15" FOREIGN KEY ("modifiedById") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_media_request"("id", "status", "createdAt", "updatedAt", "type", "mediaId", "requestedById", "modifiedById", "is4k", "serverId", "profileId", "rootFolder", "languageProfileId", "tags", "isAutoRequest", "ignoreQuota", "declineReason", "monitorMode", "isAudiobook") SELECT "id", "status", "createdAt", "updatedAt", "type", "mediaId", "requestedById", "modifiedById", "is4k", "serverId", "profileId", "rootFolder", "languageProfileId", "tags", "isAutoRequest", "ignoreQuota", "declineReason", "monitorMode", "isAudiobook" FROM "media_request"`
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
    await queryRunner.query(`DROP INDEX "IDX_417e0e3247883de635429a81cf"`);
    await queryRunner.query(`DROP INDEX "IDX_97f3a15ced10fd6de150e1b0ed"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_season_rollover" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "status" integer NOT NULL DEFAULT (1), "is4k" boolean NOT NULL DEFAULT (0), "currentSeason" integer NOT NULL, "seasons" text NOT NULL, "preexistingSeasons" text NOT NULL, "deletePreexisting" boolean NOT NULL DEFAULT (0), "deleteAfter" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "mediaId" integer, "modifiedById" integer, CONSTRAINT "FK_97f3a15ced10fd6de150e1b0ed6" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_31802ba479b56a5c5337b1bf3cd" FOREIGN KEY ("modifiedById") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_season_rollover"("id", "status", "is4k", "currentSeason", "seasons", "preexistingSeasons", "deletePreexisting", "deleteAfter", "createdAt", "updatedAt", "mediaId", "modifiedById") SELECT "id", "status", "is4k", "currentSeason", "seasons", "preexistingSeasons", "deletePreexisting", "deleteAfter", "createdAt", "updatedAt", "mediaId", "modifiedById" FROM "season_rollover"`
    );
    await queryRunner.query(`DROP TABLE "season_rollover"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_season_rollover" RENAME TO "season_rollover"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_417e0e3247883de635429a81cf" ON "season_rollover" ("status") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_97f3a15ced10fd6de150e1b0ed" ON "season_rollover" ("mediaId") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_97f3a15ced10fd6de150e1b0ed"`);
    await queryRunner.query(`DROP INDEX "IDX_417e0e3247883de635429a81cf"`);
    await queryRunner.query(
      `ALTER TABLE "season_rollover" RENAME TO "temporary_season_rollover"`
    );
    await queryRunner.query(
      `CREATE TABLE "season_rollover" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "status" integer NOT NULL DEFAULT (1), "is4k" boolean NOT NULL DEFAULT (0), "currentSeason" integer NOT NULL, "seasons" text NOT NULL, "preexistingSeasons" text NOT NULL, "deletePreexisting" boolean NOT NULL DEFAULT (0), "deleteAfter" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "mediaId" integer, "modifiedById" integer)`
    );
    await queryRunner.query(
      `INSERT INTO "season_rollover"("id", "status", "is4k", "currentSeason", "seasons", "preexistingSeasons", "deletePreexisting", "deleteAfter", "createdAt", "updatedAt", "mediaId", "modifiedById") SELECT "id", "status", "is4k", "currentSeason", "seasons", "preexistingSeasons", "deletePreexisting", "deleteAfter", "createdAt", "updatedAt", "mediaId", "modifiedById" FROM "temporary_season_rollover"`
    );
    await queryRunner.query(`DROP TABLE "temporary_season_rollover"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_97f3a15ced10fd6de150e1b0ed" ON "season_rollover" ("mediaId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_417e0e3247883de635429a81cf" ON "season_rollover" ("status") `
    );
    await queryRunner.query(`DROP INDEX "IDX_4c696e8ed36ae34fe18abe59d2"`);
    await queryRunner.query(`DROP INDEX "IDX_a1aa713f41c99e9d10c48da75a"`);
    await queryRunner.query(`DROP INDEX "IDX_6997bee94720f1ecb7f3113709"`);
    await queryRunner.query(`DROP INDEX "IDX_f4fc4efa14c3ba2b29c4525fa1"`);
    await queryRunner.query(
      `ALTER TABLE "media_request" RENAME TO "temporary_media_request"`
    );
    await queryRunner.query(
      `CREATE TABLE "media_request" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "status" integer NOT NULL, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "type" varchar NOT NULL, "mediaId" integer, "requestedById" integer, "modifiedById" integer, "is4k" boolean NOT NULL DEFAULT (0), "serverId" integer, "profileId" integer, "rootFolder" varchar, "languageProfileId" integer, "tags" text, "isAutoRequest" boolean NOT NULL DEFAULT (0), "ignoreQuota" boolean NOT NULL DEFAULT (0), "declineReason" text, "monitorMode" varchar, "isAudiobook" boolean NOT NULL DEFAULT (0), CONSTRAINT "FK_a1aa713f41c99e9d10c48da75a0" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_6997bee94720f1ecb7f31137095" FOREIGN KEY ("requestedById") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION, CONSTRAINT "FK_f4fc4efa14c3ba2b29c4525fa15" FOREIGN KEY ("modifiedById") REFERENCES "user" ("id") ON DELETE SET NULL ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "media_request"("id", "status", "createdAt", "updatedAt", "type", "mediaId", "requestedById", "modifiedById", "is4k", "serverId", "profileId", "rootFolder", "languageProfileId", "tags", "isAutoRequest", "ignoreQuota", "declineReason", "monitorMode", "isAudiobook") SELECT "id", "status", "createdAt", "updatedAt", "type", "mediaId", "requestedById", "modifiedById", "is4k", "serverId", "profileId", "rootFolder", "languageProfileId", "tags", "isAutoRequest", "ignoreQuota", "declineReason", "monitorMode", "isAudiobook" FROM "temporary_media_request"`
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
    await queryRunner.query(`DROP INDEX "IDX_97f3a15ced10fd6de150e1b0ed"`);
    await queryRunner.query(`DROP INDEX "IDX_417e0e3247883de635429a81cf"`);
    await queryRunner.query(`DROP TABLE "season_rollover"`);
  }
}
