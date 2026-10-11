import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFollowedReleaseChecks1791603129327 implements MigrationInterface {
  name = 'AddFollowedReleaseChecks1791603129327';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "watchlist" ADD "releasesCheckedAt" TIMESTAMP WITH TIME ZONE`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" ADD "knownReleaseIds" text`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Followed artists and authors are unknown before this migration
    await queryRunner.query(
      `DELETE FROM "watchlist" WHERE "mediaType" IN ('artist', 'author')`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" DROP COLUMN "knownReleaseIds"`
    );
    await queryRunner.query(
      `ALTER TABLE "watchlist" DROP COLUMN "releasesCheckedAt"`
    );
  }
}
