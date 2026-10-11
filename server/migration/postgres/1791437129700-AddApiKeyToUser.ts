import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddApiKeyToUser1791437129700 implements MigrationInterface {
  name = 'AddApiKeyToUser1791437129700';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user" ADD "apiKeyHash" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "user" ADD "apiKeyCreatedAt" TIMESTAMP WITH TIME ZONE`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dd64a292356555291de5d6635b" ON "user" ("apiKeyHash") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dd64a292356555291de5d6635b"`
    );
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "apiKeyCreatedAt"`);
    await queryRunner.query(`ALTER TABLE "user" DROP COLUMN "apiKeyHash"`);
  }
}
