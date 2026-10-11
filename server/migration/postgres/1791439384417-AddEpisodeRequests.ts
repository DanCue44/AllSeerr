import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddEpisodeRequests1791439384417 implements MigrationInterface {
  name = 'AddEpisodeRequests1791439384417';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "season_request" ADD "episodes" text`);
    await queryRunner.query(
      `ALTER TABLE "media_request" ADD "monitorMode" character varying`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN "monitorMode"`
    );
    await queryRunner.query(
      `ALTER TABLE "season_request" DROP COLUMN "episodes"`
    );
  }
}
