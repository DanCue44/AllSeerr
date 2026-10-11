import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddMetadataBookAudio1791513958666 implements MigrationInterface {
  name = 'AddMetadataBookAudio1791513958666';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "metadata_book_audio" ("id" integer PRIMARY KEY AUTOINCREMENT NOT NULL, "olId" varchar NOT NULL, "region" varchar NOT NULL DEFAULT ('us'), "hasAudiobook" boolean NOT NULL, "asin" varchar, "checkedAt" datetime NOT NULL, "createdAt" datetime NOT NULL DEFAULT (datetime('now')), CONSTRAINT "UQ_b49f137c89f7d839d1d52fdf92d" UNIQUE ("olId"))`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "metadata_book_audio"`);
  }
}
