import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNoBookEndsKeyToUser1791873052943 implements MigrationInterface {
  name = 'AddNoBookEndsKeyToUser1791873052943';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "nobookendsKeyHash" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "nobookendsKeyCreatedAt" TIMESTAMP WITH TIME ZONE`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_0a45163b28e7eaf2b3b447272d" ON "user" ("nobookendsKeyHash") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_0a45163b28e7eaf2b3b447272d"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "nobookendsKeyCreatedAt"`
    );
    await queryRunner.query(
      `ALTER TABLE "user" DROP COLUMN "nobookendsKeyHash"`
    );
  }
}
