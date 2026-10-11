import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChaptarrBookIds1791565534900 implements MigrationInterface {
  name = 'AddChaptarrBookIds1791565534900';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media" ADD "externalServiceIdAudio" integer`
    );
    await queryRunner.query(
      `ALTER TABLE "media" ADD "foreignBookId" character varying`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_aa35cc0215967588260f258995" ON "media" ("foreignBookId") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_aa35cc0215967588260f258995"`
    );
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "foreignBookId"`);
    await queryRunner.query(
      `ALTER TABLE "media" DROP COLUMN "externalServiceIdAudio"`
    );
  }
}
