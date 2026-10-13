import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAudiobookshelfItemIdsToMedia1791882575176 implements MigrationInterface {
  name = 'AddAudiobookshelfItemIdsToMedia1791882575176';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media" ADD "absEbookItemId" character varying`
    );
    await queryRunner.query(
      `ALTER TABLE "media" ADD "absAudiobookItemId" character varying`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8e0a0fda207f2d20fe2e73bf43" ON "media" ("absEbookItemId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_fbf53b3fe3fe042822c4f763a0" ON "media" ("absAudiobookItemId") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_fbf53b3fe3fe042822c4f763a0"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8e0a0fda207f2d20fe2e73bf43"`
    );
    await queryRunner.query(
      `ALTER TABLE "media" DROP COLUMN "absAudiobookItemId"`
    );
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "absEbookItemId"`);
  }
}
