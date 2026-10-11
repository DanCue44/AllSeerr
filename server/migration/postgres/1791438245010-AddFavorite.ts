import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFavorite1791438245010 implements MigrationInterface {
  name = 'AddFavorite1791438245010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "favorite" ("id" SERIAL NOT NULL, "tmdbId" integer NOT NULL, "mediaType" character varying NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" integer, CONSTRAINT "UNIQUE_USER_FAVORITE" UNIQUE ("userId", "tmdbId", "mediaType"), CONSTRAINT "PK_495675cec4fb09666704e4f610f" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_ec2b0bc099797551e4518015e6" ON "favorite" ("tmdbId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_83b775fdebbe24c29b2b5831f2" ON "favorite" ("userId") `
    );
    await queryRunner.query(
      `ALTER TABLE "favorite" ADD CONSTRAINT "FK_83b775fdebbe24c29b2b5831f2d" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "favorite" DROP CONSTRAINT "FK_83b775fdebbe24c29b2b5831f2d"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_83b775fdebbe24c29b2b5831f2"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_ec2b0bc099797551e4518015e6"`
    );
    await queryRunner.query(`DROP TABLE "favorite"`);
  }
}
