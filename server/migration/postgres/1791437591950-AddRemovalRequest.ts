import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRemovalRequest1791437591950 implements MigrationInterface {
  name = 'AddRemovalRequest1791437591950';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "removal_request" ("id" SERIAL NOT NULL, "status" integer NOT NULL DEFAULT '1', "is4k" boolean NOT NULL DEFAULT false, "reason" text, "declineReason" text, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "mediaId" integer, "requestedById" integer, "modifiedById" integer, CONSTRAINT "PK_83015d29675de909710e9586767" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_619c474038afaa65800e7149b2" ON "removal_request" ("status") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_dd25ffdd037bf91c3ba8891811" ON "removal_request" ("mediaId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d03f2118b536b25ab1a954c964" ON "removal_request" ("requestedById") `
    );
    await queryRunner.query(
      `ALTER TABLE "removal_request" ADD CONSTRAINT "FK_dd25ffdd037bf91c3ba8891811f" FOREIGN KEY ("mediaId") REFERENCES "media"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "removal_request" ADD CONSTRAINT "FK_d03f2118b536b25ab1a954c964a" FOREIGN KEY ("requestedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "removal_request" ADD CONSTRAINT "FK_3b5631914dc7c23ce821286c306" FOREIGN KEY ("modifiedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "removal_request" DROP CONSTRAINT "FK_3b5631914dc7c23ce821286c306"`
    );
    await queryRunner.query(
      `ALTER TABLE "removal_request" DROP CONSTRAINT "FK_d03f2118b536b25ab1a954c964a"`
    );
    await queryRunner.query(
      `ALTER TABLE "removal_request" DROP CONSTRAINT "FK_dd25ffdd037bf91c3ba8891811f"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d03f2118b536b25ab1a954c964"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_dd25ffdd037bf91c3ba8891811"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_619c474038afaa65800e7149b2"`
    );
    await queryRunner.query(`DROP TABLE "removal_request"`);
  }
}
