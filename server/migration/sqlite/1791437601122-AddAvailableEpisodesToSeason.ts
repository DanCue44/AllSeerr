import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAvailableEpisodesToSeason1791437601122 implements MigrationInterface {
  name = 'AddAvailableEpisodesToSeason1791437601122';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_087099b39600be695591da9a49"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_season" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "seasonNumber" integer NOT NULL, "status" integer NOT NULL DEFAULT (1), "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "mediaId" integer, "status4k" integer NOT NULL DEFAULT (1), "availableEpisodes" text, "availableEpisodes4k" text, CONSTRAINT "FK_087099b39600be695591da9a49c" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_season"("id", "seasonNumber", "status", "createdAt", "updatedAt", "mediaId", "status4k") SELECT "id", "seasonNumber", "status", "createdAt", "updatedAt", "mediaId", "status4k" FROM "season"`
    );
    await queryRunner.query(`DROP TABLE "season"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_season" RENAME TO "season"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_087099b39600be695591da9a49" ON "season" ("mediaId") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_087099b39600be695591da9a49"`);
    await queryRunner.query(
      `ALTER TABLE "season" RENAME TO "temporary_season"`
    );
    await queryRunner.query(
      `CREATE TABLE "season" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "seasonNumber" integer NOT NULL, "status" integer NOT NULL DEFAULT (1), "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "updatedAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "mediaId" integer, "status4k" integer NOT NULL DEFAULT (1), CONSTRAINT "FK_087099b39600be695591da9a49c" FOREIGN KEY ("mediaId") REFERENCES "media" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "season"("id", "seasonNumber", "status", "createdAt", "updatedAt", "mediaId", "status4k") SELECT "id", "seasonNumber", "status", "createdAt", "updatedAt", "mediaId", "status4k" FROM "temporary_season"`
    );
    await queryRunner.query(`DROP TABLE "temporary_season"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_087099b39600be695591da9a49" ON "season" ("mediaId") `
    );
  }
}
