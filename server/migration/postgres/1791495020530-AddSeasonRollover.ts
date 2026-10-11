import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSeasonRollover1791495020530 implements MigrationInterface {
  name = 'AddSeasonRollover1791495020530';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "season_rollover" ("id" SERIAL NOT NULL, "status" integer NOT NULL DEFAULT '1', "is4k" boolean NOT NULL DEFAULT false, "currentSeason" integer NOT NULL, "seasons" text NOT NULL, "preexistingSeasons" text NOT NULL, "deletePreexisting" boolean NOT NULL DEFAULT false, "deleteAfter" TIMESTAMP WITH TIME ZONE NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "mediaId" integer, "modifiedById" integer, CONSTRAINT "PK_2078e2bf985a7f3a99e50426307" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_417e0e3247883de635429a81cf" ON "season_rollover" ("status") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_97f3a15ced10fd6de150e1b0ed" ON "season_rollover" ("mediaId") `
    );
    await queryRunner.query(
      `ALTER TABLE "media_request" ADD "preexistingSeasons" text`
    );
    await queryRunner.query(
      `ALTER TABLE "season_rollover" ADD CONSTRAINT "FK_97f3a15ced10fd6de150e1b0ed6" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "season_rollover" ADD CONSTRAINT "FK_31802ba479b56a5c5337b1bf3cd" FOREIGN KEY ("modifiedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "season_rollover" DROP CONSTRAINT "FK_31802ba479b56a5c5337b1bf3cd"`
    );
    await queryRunner.query(
      `ALTER TABLE "season_rollover" DROP CONSTRAINT "FK_97f3a15ced10fd6de150e1b0ed6"`
    );
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN "preexistingSeasons"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_97f3a15ced10fd6de150e1b0ed"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_417e0e3247883de635429a81cf"`
    );
    await queryRunner.query(`DROP TABLE "season_rollover"`);
  }
}
