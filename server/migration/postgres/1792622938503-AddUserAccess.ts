import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserAccess1792622938503 implements MigrationInterface {
  name = 'AddUserAccess1792622938503';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "access_invite" ("id" SERIAL NOT NULL, "tokenHash" character varying NOT NULL, "label" character varying, "apps" text NOT NULL, "ageLimit" character varying, "includeUnrated" boolean NOT NULL DEFAULT false, "expiresAt" TIMESTAMP WITH TIME ZONE NOT NULL, "redeemedAt" TIMESTAMP WITH TIME ZONE, "revokedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "createdById" integer, "redeemedById" integer, CONSTRAINT "PK_5e8354ae9d4ba3f6369b97bf0bb" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_7d45b41a79411cd18e1c8b0a8a" ON "access_invite" ("tokenHash") `
    );
    await queryRunner.query(
      `CREATE TABLE "oidc_payload" ("id" character varying NOT NULL, "model" character varying NOT NULL, "payload" text NOT NULL, "grantId" character varying, "uid" character varying, "userCode" character varying, "expiresAt" TIMESTAMP WITH TIME ZONE, "consumedAt" TIMESTAMP WITH TIME ZONE, CONSTRAINT "PK_f8bdb5be780a6c077e38bb78a98" PRIMARY KEY ("id", "model"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_b9cad997175eb354e1578fce0c" ON "oidc_payload" ("grantId") `
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_057f263a02526a21a3714216df" ON "oidc_payload" ("uid") `
    );
    await queryRunner.query(
      `CREATE TABLE "user_access_profile" ("id" SERIAL NOT NULL, "ageLimit" character varying, "includeUnrated" boolean NOT NULL DEFAULT false, "userId" integer NOT NULL, CONSTRAINT "REL_6fb36a351ba9182cf60065a917" UNIQUE ("userId"), CONSTRAINT "PK_f4517966729c8d7343629963a20" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE TABLE "user_app_account" ("id" SERIAL NOT NULL, "app" character varying NOT NULL, "enabled" boolean NOT NULL DEFAULT false, "libraryIds" text, "remoteUserId" character varying, "remoteUsername" character varying, "status" character varying NOT NULL DEFAULT 'none', "lastError" text, "syncedAt" TIMESTAMP WITH TIME ZONE, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "userId" integer NOT NULL, CONSTRAINT "UQ_user_app_account_user_app" UNIQUE ("userId", "app"), CONSTRAINT "PK_37a994af44334c88db5bb259bc6" PRIMARY KEY ("id"))`
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_992400114abae376819f55102a" ON "user_app_account" ("userId") `
    );
    await queryRunner.query(
      `ALTER TABLE "access_invite" ADD CONSTRAINT "FK_c0f39133b8d710c8ec8918b6cf3" FOREIGN KEY ("createdById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "access_invite" ADD CONSTRAINT "FK_064e630a8ca54e235a29e8ea4b5" FOREIGN KEY ("redeemedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "user_access_profile" ADD CONSTRAINT "FK_6fb36a351ba9182cf60065a917c" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
    await queryRunner.query(
      `ALTER TABLE "user_app_account" ADD CONSTRAINT "FK_992400114abae376819f55102a7" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE NO ACTION`
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_app_account" DROP CONSTRAINT "FK_992400114abae376819f55102a7"`
    );
    await queryRunner.query(
      `ALTER TABLE "user_access_profile" DROP CONSTRAINT "FK_6fb36a351ba9182cf60065a917c"`
    );
    await queryRunner.query(
      `ALTER TABLE "access_invite" DROP CONSTRAINT "FK_064e630a8ca54e235a29e8ea4b5"`
    );
    await queryRunner.query(
      `ALTER TABLE "access_invite" DROP CONSTRAINT "FK_c0f39133b8d710c8ec8918b6cf3"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_992400114abae376819f55102a"`
    );
    await queryRunner.query(`DROP TABLE "user_app_account"`);
    await queryRunner.query(`DROP TABLE "user_access_profile"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_057f263a02526a21a3714216df"`
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_b9cad997175eb354e1578fce0c"`
    );
    await queryRunner.query(`DROP TABLE "oidc_payload"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7d45b41a79411cd18e1c8b0a8a"`
    );
    await queryRunner.query(`DROP TABLE "access_invite"`);
  }
}
