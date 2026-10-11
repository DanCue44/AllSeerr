import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFavorite1791438244921 implements MigrationInterface {
  name = 'AddFavorite1791438244921';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "favorite" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "tmdbId" integer NOT NULL, "mediaType" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "userId" integer, CONSTRAINT "UNIQUE_USER_FAVORITE" UNIQUE ("userId", "tmdbId", "mediaType"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ec2b0bc099797551e4518015e6" ON "favorite" ("tmdbId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_83b775fdebbe24c29b2b5831f2" ON "favorite" ("userId") `
    );
    await queryRunner.query(`DROP INDEX "IDX_ec2b0bc099797551e4518015e6"`);
    await queryRunner.query(`DROP INDEX "IDX_83b775fdebbe24c29b2b5831f2"`);
    await queryRunner.query(
      `CREATE TABLE "temporary_favorite" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "tmdbId" integer NOT NULL, "mediaType" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "userId" integer, CONSTRAINT "UNIQUE_USER_FAVORITE" UNIQUE ("userId", "tmdbId", "mediaType"), CONSTRAINT "FK_83b775fdebbe24c29b2b5831f2d" FOREIGN KEY ("userId") REFERENCES "user" ("id") ON DELETE CASCADE ON UPDATE NO ACTION)`
    );
    await queryRunner.query(
      `INSERT INTO "temporary_favorite"("id", "tmdbId", "mediaType", "createdAt", "userId") SELECT "id", "tmdbId", "mediaType", "createdAt", "userId" FROM "favorite"`
    );
    await queryRunner.query(`DROP TABLE "favorite"`);
    await queryRunner.query(
      `ALTER TABLE "temporary_favorite" RENAME TO "favorite"`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ec2b0bc099797551e4518015e6" ON "favorite" ("tmdbId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_83b775fdebbe24c29b2b5831f2" ON "favorite" ("userId") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_83b775fdebbe24c29b2b5831f2"`);
    await queryRunner.query(`DROP INDEX "IDX_ec2b0bc099797551e4518015e6"`);
    await queryRunner.query(
      `ALTER TABLE "favorite" RENAME TO "temporary_favorite"`
    );
    await queryRunner.query(
      `CREATE TABLE "favorite" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "tmdbId" integer NOT NULL, "mediaType" varchar NOT NULL, "createdAt" datetime NOT NULL DEFAULT (CURRENT_TIMESTAMP), "userId" integer, CONSTRAINT "UNIQUE_USER_FAVORITE" UNIQUE ("userId", "tmdbId", "mediaType"))`
    );
    await queryRunner.query(
      `INSERT INTO "favorite"("id", "tmdbId", "mediaType", "createdAt", "userId") SELECT "id", "tmdbId", "mediaType", "createdAt", "userId" FROM "temporary_favorite"`
    );
    await queryRunner.query(`DROP TABLE "temporary_favorite"`);
    await queryRunner.query(
      `CREATE INDEX "IDX_83b775fdebbe24c29b2b5831f2" ON "favorite" ("userId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ec2b0bc099797551e4518015e6" ON "favorite" ("tmdbId") `
    );
    await queryRunner.query(`DROP INDEX "IDX_83b775fdebbe24c29b2b5831f2"`);
    await queryRunner.query(`DROP INDEX "IDX_ec2b0bc099797551e4518015e6"`);
    await queryRunner.query(`DROP TABLE "favorite"`);
  }
}
