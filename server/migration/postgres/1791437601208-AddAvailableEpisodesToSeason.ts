import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAvailableEpisodesToSeason1791437601208 implements MigrationInterface {
  name = 'AddAvailableEpisodesToSeason1791437601208';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "season" ADD "availableEpisodes" text`
    );
    await queryRunner.query(
      `ALTER TABLE "season" ADD "availableEpisodes4k" text`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "season" DROP COLUMN "availableEpisodes4k"`
    );
    await queryRunner.query(
      `ALTER TABLE "season" DROP COLUMN "availableEpisodes"`
    );
  }
}
