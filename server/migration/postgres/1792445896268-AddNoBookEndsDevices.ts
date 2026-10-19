import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNoBookEndsDevices1792445896268 implements MigrationInterface {
  name = 'AddNoBookEndsDevices1792445896268';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "nobookends_device" ("id" SERIAL NOT NULL, "keyHash" character varying NOT NULL, "label" character varying, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "lastUsedAt" TIMESTAMP WITH TIME ZONE, "userId" integer NOT NULL, CONSTRAINT "PK_2d2b5eaa4eca816df83032ee10c" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_a486fc747fdf13986d493b453c" ON "nobookends_device" ("userId") `
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_d554d6484b7c11b84352b9ae2b" ON "nobookends_device" ("keyHash") `
    );
    await queryRunner.query(
      `ALTER TABLE "nobookends_device" ADD CONSTRAINT "FK_a486fc747fdf13986d493b453ce" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    // The one NoBookEnds key a user could have before becomes their first
    // device, so the app it was given to stays connected and can be removed
    await queryRunner.query(
      `INSERT INTO "nobookends_device" ("keyHash", "createdAt", "userId") SELECT "nobookendsKeyHash", COALESCE("nobookendsKeyCreatedAt", now()), "id" FROM "user" WHERE "nobookendsKeyHash" IS NOT NULL`
    );
    await queryRunner.query(
      `UPDATE "user" SET "nobookendsKeyHash" = NULL, "nobookendsKeyCreatedAt" = NULL WHERE "nobookendsKeyHash" IS NOT NULL`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "nobookends_device" DROP CONSTRAINT "FK_a486fc747fdf13986d493b453ce"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d554d6484b7c11b84352b9ae2b"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_a486fc747fdf13986d493b453c"`
    );
    await queryRunner.query(`DROP TABLE "nobookends_device"`);
  }
}
