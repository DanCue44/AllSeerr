import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBookSupport1791472303970 implements MigrationInterface {
  name = 'AddBookSupport1791472303970';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "media_request" ADD "isAudiobook" boolean NOT NULL DEFAULT false`
    );
    await queryRunner.query(`ALTER TABLE "media" ADD "olId" character varying`);
    await queryRunner.query(
      `ALTER TABLE "media" ADD "statusAudio" integer NOT NULL DEFAULT '1'`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_9cf45249a270fbec87f0f68ae4" ON "media" ("olId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_f846350532f381588e21025feb" ON "media" ("statusAudio") `
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_f846350532f381588e21025feb"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_9cf45249a270fbec87f0f68ae4"`
    );
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "statusAudio"`);
    await queryRunner.query(`ALTER TABLE "media" DROP COLUMN "olId"`);
    await queryRunner.query(
      `ALTER TABLE "media_request" DROP COLUMN "isAudiobook"`
    );
  }
}
